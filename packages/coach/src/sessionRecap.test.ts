import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'

import type { DecisionVerdict } from './verdict.js'
import type { PreflopVerdict } from './preflop.js'
import {
  synthesizeSession,
  MIN_GRADED_DECISIONS,
  MAX_TAKEAWAYS,
  MAX_EXEMPLARS_PER_TAKEAWAY,
  THEME_PHRASE,
  type GradedSessionDecision,
  type RecapThemeKey,
} from './sessionRecap.js'

/** Parse a glued two-card string into a hole-card tuple, e.g. "AhKh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/**
 * A minimal {@link DecisionContext} carrying only the field synthesis reads — `holeCards`. Everything
 * else is irrelevant to {@link synthesizeSession} (it recomputes nothing), so we cast a one-field
 * object rather than fabricate a full engine spot; this exactly mirrors what the function consumes.
 */
function ctx(holeCards: readonly [Card, Card]): DecisionContext {
  return { holeCards } as unknown as DecisionContext
}

const FOLD: Action = { type: 'fold' }
const CALL: Action = { type: 'call' }

/** Build a postflop graded entry with a chosen concept, verdict, callEv, and hole cards. */
function postflop(args: {
  handNumber: number
  holeCards: readonly [Card, Card]
  concept?: DecisionVerdict['concept']
  verdict?: DecisionVerdict['verdict']
  callEv?: number
}): GradedSessionDecision {
  const verdict: DecisionVerdict = {
    equity: 0.3,
    potOddsThreshold: 0.33,
    callEv: args.callEv ?? -5,
    correctDecision: 'fold',
    heroContinued: true,
    verdict: args.verdict ?? 'leak',
    missedValueBet: false,
    heroBet: false,
    concept: args.concept ?? 'equity-vs-price',
    trace: {
      assumedRange: 'tight',
      lineReason: 'facing-bet',
      betFraction: 0.5,
      polarized: null,
    },
    shortAllIn: null,
    sizing: null,
  }
  return {
    handNumber: args.handNumber,
    ruling: { kind: 'verdict', verdict, ctx: ctx(args.holeCards), action: CALL },
  }
}

/** Build a preflop graded entry with a chosen advice, heroContinued, verdict, and hole cards. */
function preflop(args: {
  handNumber: number
  holeCards: readonly [Card, Card]
  advice?: PreflopVerdict['advice']
  heroContinued?: boolean
  verdict?: PreflopVerdict['verdict']
}): GradedSessionDecision {
  const advice = args.advice ?? 'fold'
  const heroContinued = args.heroContinued ?? advice === 'open'
  const verdict: PreflopVerdict = {
    tier: 'trash',
    rationale: 'test',
    advice,
    heroContinued,
    verdict: args.verdict ?? 'leak',
    concept: 'ranges',
    trace: {
      position: 'middle',
      facingRaise: false,
      raiseBb: 1,
      band: 'unraised',
      mode: 'open',
      stealSpot: false,
    },
  }
  return {
    handNumber: args.handNumber,
    ruling: {
      kind: 'preflop',
      verdict,
      ctx: ctx(args.holeCards),
      action: heroContinued ? CALL : FOLD,
    },
  }
}

/** A clean (non-leak) postflop entry, to pad a session past the sample gate. */
function clean(handNumber: number): GradedSessionDecision {
  return postflop({
    handNumber,
    holeCards: hole('AsKs'),
    verdict: 'good',
    concept: 'equity-vs-price',
  })
}

describe('synthesizeSession — too-few branch', () => {
  it('returns too-few for an empty log, with no takeaways', () => {
    const recap = synthesizeSession([])
    expect(recap.status).toBe('too-few')
    expect(recap.takeaways).toEqual([])
    expect(recap.gradedCount).toBe(0)
    expect(recap.headline).toMatch(/No graded decisions/i)
  })

  it('returns too-few below the sample gate even when a leak is present', () => {
    // A short session that DOES contain a leak still gets the honest low-sample line, never a
    // crowned "pattern" — the too-few gate is checked first, on the total count.
    const log = [postflop({ handNumber: 1, holeCards: hole('7c2d') })]
    expect(log.length).toBeLessThan(MIN_GRADED_DECISIONS)
    const recap = synthesizeSession(log)
    expect(recap.status).toBe('too-few')
    expect(recap.takeaways).toEqual([])
    expect(recap.headline).toMatch(/too few hands/i)
  })

  it('treats exactly one-below-threshold as too-few', () => {
    const log = Array.from({ length: MIN_GRADED_DECISIONS - 1 }, (_, i) => clean(i + 1))
    expect(synthesizeSession(log).status).toBe('too-few')
  })
})

describe('synthesizeSession — clean branch', () => {
  it('returns clean for enough decisions with zero leaks (positive, truthful, no takeaways)', () => {
    const log = Array.from({ length: MIN_GRADED_DECISIONS }, (_, i) => clean(i + 1))
    const recap = synthesizeSession(log)
    expect(recap.status).toBe('clean')
    expect(recap.takeaways).toEqual([])
    expect(recap.gradedCount).toBe(MIN_GRADED_DECISIONS)
    expect(recap.headline).toMatch(/nothing stood out as a leak/i)
  })

  it('distinguishes clean (had the sample) from too-few (did not)', () => {
    const enough = Array.from({ length: MIN_GRADED_DECISIONS }, (_, i) => clean(i + 1))
    const tooFew = enough.slice(0, MIN_GRADED_DECISIONS - 1)
    expect(synthesizeSession(enough).status).toBe('clean')
    expect(synthesizeSession(tooFew).status).toBe('too-few')
  })
})

describe('synthesizeSession — has-takeaways: dominant theme selection', () => {
  it('surfaces the theme leaked on most as the dominant takeaway', () => {
    // 4 equity-vs-price leaks, 2 preflop-too-loose leaks, rest clean → dominant is equity-vs-price.
    const log: GradedSessionDecision[] = [
      postflop({ handNumber: 1, holeCards: hole('Ah2c'), concept: 'equity-vs-price' }),
      postflop({ handNumber: 2, holeCards: hole('Kh3c'), concept: 'equity-vs-price' }),
      postflop({ handNumber: 3, holeCards: hole('Qh4c'), concept: 'equity-vs-price' }),
      postflop({ handNumber: 4, holeCards: hole('Jh5c'), concept: 'equity-vs-price' }),
      preflop({ handNumber: 5, holeCards: hole('7c2d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 6, holeCards: hole('8c3d'), advice: 'fold', heroContinued: true }),
      clean(7),
      clean(8),
    ]
    const recap = synthesizeSession(log)
    expect(recap.status).toBe('has-takeaways')
    expect(recap.takeaways[0]!.theme).toBe<RecapThemeKey>('equity-vs-price')
    expect(recap.takeaways[0]!.count).toBe(4)
    expect(recap.headline).toContain(THEME_PHRASE['equity-vs-price'])
  })

  it('caps takeaways at MAX_TAKEAWAYS even with three distinct leak themes', () => {
    const log: GradedSessionDecision[] = [
      // equity-vs-price x3 (dominant)
      postflop({ handNumber: 1, holeCards: hole('Ah2c'), concept: 'equity-vs-price' }),
      postflop({ handNumber: 2, holeCards: hole('Kh3c'), concept: 'equity-vs-price' }),
      postflop({ handNumber: 3, holeCards: hole('Qh4c'), concept: 'equity-vs-price' }),
      // ev x2 (runner-up)
      postflop({ handNumber: 4, holeCards: hole('Jh5c'), concept: 'ev' }),
      postflop({ handNumber: 5, holeCards: hole('Th6c'), concept: 'ev' }),
      // preflop-too-tight x1 (should be dropped by the cap)
      preflop({ handNumber: 6, holeCards: hole('AsQs'), advice: 'open', heroContinued: false }),
      clean(7),
      clean(8),
    ]
    const recap = synthesizeSession(log)
    expect(recap.takeaways.length).toBe(MAX_TAKEAWAYS)
    expect(recap.takeaways.map((t) => t.theme)).toEqual<RecapThemeKey[]>(['equity-vs-price', 'ev'])
    expect(recap.headline).toMatch(/and 1 more to watch/i)
  })

  it('distinguishes the two preflop leak shapes as separate themes', () => {
    const log: GradedSessionDecision[] = [
      // too-loose: chart says fold, hero continued (x3 → dominant)
      preflop({ handNumber: 1, holeCards: hole('7c2d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 2, holeCards: hole('8c3d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 3, holeCards: hole('9c4d'), advice: 'fold', heroContinued: true }),
      // too-tight: chart says open, hero folded (x1)
      preflop({ handNumber: 4, holeCards: hole('AsKs'), advice: 'open', heroContinued: false }),
      clean(5),
      clean(6),
      clean(7),
      clean(8),
    ]
    const recap = synthesizeSession(log)
    const themes = recap.takeaways.map((t) => t.theme)
    expect(themes[0]).toBe<RecapThemeKey>('preflop-too-loose')
    expect(themes).toContain<RecapThemeKey>('preflop-too-tight')
  })
})

describe('synthesizeSession — exemplar anchoring & ordering', () => {
  it('anchors exemplars by handNumber and hole-card class, sharpest (|callEv|) first', () => {
    const log: GradedSessionDecision[] = [
      postflop({ handNumber: 3, holeCards: hole('AhKh'), concept: 'equity-vs-price', callEv: -2 }),
      postflop({ handNumber: 7, holeCards: hole('QdQc'), concept: 'equity-vs-price', callEv: -20 }),
      postflop({ handNumber: 11, holeCards: hole('5s4s'), concept: 'equity-vs-price', callEv: -9 }),
      clean(1),
      clean(2),
      clean(4),
      clean(5),
      clean(6),
    ]
    const recap = synthesizeSession(log)
    const ex = recap.takeaways[0]!.exemplars
    // Descending |callEv|: hand 7 (-20) > hand 11 (-9) > hand 3 (-2).
    expect(ex.map((e) => e.handNumber)).toEqual([7, 11, 3])
    expect(ex[0]!.label).toBe('QQ')
    expect(ex[0]!.description).toBe('pair of Queens')
    expect(ex[0]!.line).toContain('hand #7')
    expect(ex[0]!.line).toContain('pair of Queens')
    // The takeaway line folds in the anchored hands.
    expect(recap.takeaways[0]!.line).toContain('#7')
    expect(recap.takeaways[0]!.line).toContain('pair of Queens')
  })

  it('caps exemplars per takeaway and breaks severity ties by ascending handNumber', () => {
    // Five preflop leaks (all severity 0 — no EV gradient) → exemplars fall to handNumber order,
    // capped at MAX_EXEMPLARS_PER_TAKEAWAY.
    const log: GradedSessionDecision[] = [
      preflop({ handNumber: 12, holeCards: hole('7c2d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 3, holeCards: hole('8c3d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 9, holeCards: hole('9c4d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 1, holeCards: hole('Tc5d'), advice: 'fold', heroContinued: true }),
      preflop({ handNumber: 6, holeCards: hole('Jc6d'), advice: 'fold', heroContinued: true }),
      clean(13),
      clean(14),
      clean(15),
    ]
    const recap = synthesizeSession(log)
    const ex = recap.takeaways[0]!.exemplars
    expect(ex.length).toBe(MAX_EXEMPLARS_PER_TAKEAWAY)
    expect(ex.map((e) => e.handNumber)).toEqual([1, 3, 6]) // ascending handNumber tiebreak
    expect(recap.takeaways[0]!.count).toBe(5) // count reflects ALL leaked decisions, not just shown
    expect(recap.takeaways[0]!.line).toMatch(/across 5 spots/i)
  })
})

describe('synthesizeSession — determinism & honesty', () => {
  it('is deterministic: same log → byte-identical recap', () => {
    const build = (): GradedSessionDecision[] => [
      postflop({ handNumber: 1, holeCards: hole('Ah2c'), concept: 'equity-vs-price', callEv: -7 }),
      postflop({ handNumber: 2, holeCards: hole('Kh3c'), concept: 'equity-vs-price', callEv: -3 }),
      preflop({ handNumber: 3, holeCards: hole('7c2d'), advice: 'fold', heroContinued: true }),
      clean(4),
      clean(5),
      clean(6),
      clean(7),
      clean(8),
    ]
    const a = synthesizeSession(build())
    const b = synthesizeSession(build())
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it('does not let good/breakEven decisions feed a theme', () => {
    const log: GradedSessionDecision[] = [
      postflop({
        handNumber: 1,
        holeCards: hole('Ah2c'),
        verdict: 'good',
        concept: 'equity-vs-price',
      }),
      postflop({ handNumber: 2, holeCards: hole('Kh3c'), verdict: 'breakEven', concept: 'ev' }),
      ...Array.from({ length: MIN_GRADED_DECISIONS }, (_, i) => clean(i + 3)),
    ]
    // All non-leak → clean, no takeaways.
    expect(synthesizeSession(log).status).toBe('clean')
  })

  it('orders equal-count themes by a stable theme-key tiebreak', () => {
    // ev (1) and position (1) tie on count; the key tiebreak ('ev' < 'position') puts ev first.
    const log: GradedSessionDecision[] = [
      postflop({ handNumber: 1, holeCards: hole('Ah2c'), concept: 'position' }),
      postflop({ handNumber: 2, holeCards: hole('Kh3c'), concept: 'ev' }),
      ...Array.from({ length: MIN_GRADED_DECISIONS }, (_, i) => clean(i + 3)),
    ]
    const recap = synthesizeSession(log)
    expect(recap.takeaways.map((t) => t.theme)).toEqual<RecapThemeKey[]>(['ev', 'position'])
  })
})
