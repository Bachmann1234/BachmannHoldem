import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'

import {
  classifyStartingHand,
  gradePreflop,
  PREFLOP_CHART,
  CHART_RANKS,
  LARGE_RAISE_MIN_BB,
  THREE_BET_MIN_BB,
  startingHandChart,
  handClassLabel,
  type PreflopTier,
  type StartingHandVerdict,
} from './preflop.js'

/** Parse a glued two-card string into a hole-card tuple, e.g. "AsKh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/**
 * Build a preflop {@link DecisionContext} for grading. Only the fields {@link gradePreflop} reads —
 * `holeCards` and the seat geometry that determines late position (`seat` / `buttonIndex` /
 * `numPlayers`) — matter; the rest are plausible filler so the context type-checks.
 */
function preflopCtx(over: {
  holeCards: readonly [Card, Card]
  seat?: number
  buttonIndex?: number
  numPlayers?: number
  /**
   * The raise faced, as a multiple of the big blind. Omitted / `1` is an unraised pot (the
   * opening-chart standard); `> 1` is a raise of that many BB (the defend standard, 0053), so e.g.
   * `raiseBb: 6` models a 6x open the hero is calling.
   */
  raiseBb?: number
}): DecisionContext {
  const seat = over.seat ?? 0
  const numPlayers = over.numPlayers ?? 2
  const buttonIndex = over.buttonIndex ?? 0
  const bigBlind = 2
  // currentBet is the highest committed this street: the BB on an unraised pot, or the raise's "to"
  // total (raiseBb * bigBlind) when facing a raise. toCall is what the hero adds to match it.
  const currentBet = (over.raiseBb ?? 1) * bigBlind
  const legal: LegalActions = {
    fold: true,
    check: false,
    call: { amount: currentBet - bigBlind || bigBlind },
    bet: null,
    raise: null,
  }
  return {
    seat,
    holeCards: over.holeCards,
    board: [],
    street: 'preflop',
    legalActions: legal,
    pot: 3 + currentBet,
    currentBet,
    toCall: legal.call!.amount,
    stack: 1000,
    committed: 0,
    smallBlind: 1,
    bigBlind,
    buttonIndex,
    isButton: seat === buttonIndex,
    numPlayers,
    numActive: numPlayers,
    opponents: [],
  }
}

const FOLD: Action = { type: 'fold' }
const CALL: Action = { type: 'call' }
const RAISE: Action = { type: 'raise', amount: 6 }
const CHECK: Action = { type: 'check' }

/** Classify a glued two-card string and return just the tier. */
function tierOf(cards: string): PreflopTier {
  return classifyStartingHand(hole(cards)).tier
}

describe('classifyStartingHand — premium', () => {
  it('big pairs are premium', () => {
    expect(tierOf('AsAh')).toBe('premium')
    expect(tierOf('KsKh')).toBe('premium')
    expect(tierOf('QdQc')).toBe('premium')
    expect(tierOf('JhJs')).toBe('premium')
  })

  it('AK suited and offsuit are premium', () => {
    expect(tierOf('AsKs')).toBe('premium')
    expect(tierOf('AsKh')).toBe('premium')
  })

  it('classifies AA to its single strongest tier (premium, not strong)', () => {
    // AA appears only in the premium token, but the strongest-first scan is what
    // guarantees a hand that *could* match a weaker tier still resolves to its strongest.
    expect(tierOf('AsAh')).toBe('premium')
  })
})

describe('classifyStartingHand — strong', () => {
  it('TT/99 and the suited/strong broadways are strong', () => {
    expect(tierOf('TsTh')).toBe('strong')
    expect(tierOf('9d9c')).toBe('strong')
    expect(tierOf('AsQs')).toBe('strong') // AQs
    expect(tierOf('AsQh')).toBe('strong') // AQo
    expect(tierOf('AsJs')).toBe('strong') // AJs
    expect(tierOf('AsTs')).toBe('strong') // ATs
    expect(tierOf('KsQs')).toBe('strong') // KQs
  })
})

describe('classifyStartingHand — playable', () => {
  it('small/medium pairs are playable', () => {
    expect(tierOf('8s8h')).toBe('playable')
    expect(tierOf('2s2h')).toBe('playable')
  })

  it('suited connectors are playable', () => {
    expect(tierOf('7h6h')).toBe('playable') // 76s
    expect(tierOf('9s8s')).toBe('playable') // 98s
    expect(tierOf('5d4d')).toBe('playable') // 54s
  })

  it('weaker suited aces and suited broadways are playable', () => {
    expect(tierOf('As5s')).toBe('playable') // A5s
    expect(tierOf('As2s')).toBe('playable') // A2s
    expect(tierOf('KsJs')).toBe('playable') // KJs
    expect(tierOf('QsJs')).toBe('playable') // QJs
    expect(tierOf('JsTs')).toBe('playable') // JTs
    expect(tierOf('KsQh')).toBe('playable') // KQo
    expect(tierOf('AhJc')).toBe('playable') // AJo
  })
})

describe('classifyStartingHand — marginal', () => {
  it('offsuit broadways and suited gappers are marginal', () => {
    expect(tierOf('KsJh')).toBe('marginal') // KJo
    expect(tierOf('QsJh')).toBe('marginal') // QJo
    expect(tierOf('JsTh')).toBe('marginal') // JTo
    expect(tierOf('Js9s')).toBe('marginal') // J9s
    expect(tierOf('7s5s')).toBe('marginal') // 75s
    expect(tierOf('4s3s')).toBe('marginal') // 43s
  })
})

describe('classifyStartingHand — trash (the long tail)', () => {
  it('the canonical junk hand 72o is trash', () => {
    expect(tierOf('7h2c')).toBe('trash')
  })

  it('unconnected offsuit junk is trash', () => {
    expect(tierOf('9s4d')).toBe('trash') // 94o
    expect(tierOf('Ts3c')).toBe('trash') // T3o
    expect(tierOf('8h3d')).toBe('trash') // 83o
  })

  it('a weak offsuit ace is trash (only suited weak aces are playable)', () => {
    expect(tierOf('As2h')).toBe('trash') // A2o — A2s is playable, A2o is not
  })

  it('a low offsuit pairing-less holding is trash', () => {
    expect(tierOf('6s2d')).toBe('trash') // 62o
  })
})

describe('classifyStartingHand — suited vs offsuit distinction', () => {
  it('the same ranks classify differently by suitedness', () => {
    expect(tierOf('Ts9s')).toBe('playable') // T9s
    expect(tierOf('Ts9h')).toBe('trash') // T9o is not on the chart
  })

  it('order of the two cards does not matter', () => {
    expect(tierOf('KsAs')).toBe(tierOf('AsKs'))
    expect(tierOf('6h7h')).toBe(tierOf('7h6h'))
  })
})

describe('classifyStartingHand — rationale strings', () => {
  it('returns a tier-specific, human-readable rationale for every tier', () => {
    const cases: ReadonlyArray<readonly [string, PreflopTier, string]> = [
      ['AsAh', 'premium', 'raise'],
      ['TsTh', 'strong', 'value'],
      ['7h6h', 'playable', 'position'],
      ['KsJh', 'marginal', 'late position'],
      ['7h2c', 'trash', 'Trash'],
    ]
    for (const [cards, tier, needle] of cases) {
      const v: StartingHandVerdict = classifyStartingHand(hole(cards))
      expect(v.tier).toBe(tier)
      expect(v.rationale.length).toBeGreaterThan(0)
      expect(v.rationale).toContain(needle)
    }
  })
})

describe('classifyStartingHand — input validation (RangeError idiom)', () => {
  it('throws on the wrong number of hole cards', () => {
    const one = parseCards('As') as unknown as readonly [Card, Card]
    expect(() => classifyStartingHand(one)).toThrow(RangeError)
  })

  it('throws on two copies of the same card', () => {
    const dup = parseCards('As As') as [Card, Card]
    expect(() => classifyStartingHand(dup)).toThrow(RangeError)
  })
})

describe('PREFLOP_CHART — the declared teaching artifact', () => {
  it('lists each non-trash tier as a non-empty range string', () => {
    for (const tier of ['premium', 'strong', 'playable', 'marginal'] as const) {
      expect(PREFLOP_CHART[tier].length).toBeGreaterThan(0)
    }
  })

  it('every hand in the chart classifies into a non-trash tier', () => {
    // Sanity-check the chart against its own classifier: nothing declared falls through to
    // trash, and a representative token from each tier resolves there.
    expect(tierOf('AsAh')).not.toBe('trash')
    expect(tierOf('TsTh')).not.toBe('trash')
    expect(tierOf('7h6h')).not.toBe('trash')
    expect(tierOf('KsJh')).not.toBe('trash')
  })
})

describe('gradePreflop — chart-driven verdict (BUG-0001)', () => {
  it('opening a charted hand is GOOD; folding it is a LEAK (the bug: AJs on the button)', () => {
    // The exact spot in the ticket: AJs folded to the button is a clear open, not a fold.
    const ctx = preflopCtx({ holeCards: hole('AhJh') })
    expect(gradePreflop(ctx, CALL).verdict).toBe('good')
    expect(gradePreflop(ctx, RAISE).verdict).toBe('good')
    expect(gradePreflop(ctx, FOLD).verdict).toBe('leak')
  })

  it('premium / strong / playable are all "open" regardless of position', () => {
    // Even in early position (seat 1 of 3, button on seat 0), the chart opens these tiers.
    const early = { seat: 1, buttonIndex: 0, numPlayers: 3 }
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh'), ...early }), CALL).advice).toBe(
      'open',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('KsQs'), ...early }), CALL).advice).toBe(
      'open',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h6h'), ...early }), CALL).advice).toBe(
      'open',
    )
  })

  it('a free check (big-blind option) is GOOD for ANY hand — never a leak (BUG-0003)', () => {
    // The bug: in the BB with no raise to call, checking trash was graded a leak because the chart
    // says "fold". But a free check strictly dominates folding — you see a free flop. Checking is
    // never a mistake regardless of tier, and folding away a free look would be the pathological
    // leak.
    const trash = preflopCtx({ holeCards: hole('Kh8h'), seat: 1, buttonIndex: 0, numPlayers: 2 })
    expect(gradePreflop(trash, CHECK).verdict).toBe('good')
    // True across the ladder — checking premium/marginal in the BB is also fine (not maximally
    // aggressive, but not a leak; the coach grades continue-vs-fold, not raise sizing).
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh'), seat: 1 }), CHECK).verdict).toBe(
      'good',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('7c2d'), seat: 1 }), CHECK).verdict).toBe(
      'good',
    )
    // The rationale explains the free flop rather than contradicting the "Good" grade with "fold".
    expect(gradePreflop(trash, CHECK).rationale).toMatch(/free flop/i)
  })

  it('trash is "fold": folding is GOOD, entering is a LEAK', () => {
    const ctx = preflopCtx({ holeCards: hole('7h2c') })
    expect(gradePreflop(ctx, FOLD).verdict).toBe('good')
    expect(gradePreflop(ctx, CALL).verdict).toBe('leak')
  })

  it('marginal opens only in late position (button/cutoff), folds in early position', () => {
    const marginal = hole('KsJd') // KJo — marginal tier
    // Button (seat 0) and cutoff (seat 2) of a 3-handed table are late position → open.
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 0, buttonIndex: 0, numPlayers: 3 }),
        CALL,
      ).advice,
    ).toBe('open')
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 2, buttonIndex: 0, numPlayers: 3 }),
        CALL,
      ).advice,
    ).toBe('open')
    // Early position (seat 1) → the chart folds it.
    const early = preflopCtx({ holeCards: marginal, seat: 1, buttonIndex: 0, numPlayers: 3 })
    expect(gradePreflop(early, CALL).advice).toBe('fold')
    expect(gradePreflop(early, CALL).verdict).toBe('leak') // opening it early is the leak
    expect(gradePreflop(early, FOLD).verdict).toBe('good') // folding it early is correct
  })

  it('carries the tier and rationale through from the chart', () => {
    const v = gradePreflop(preflopCtx({ holeCards: hole('AsAh') }), CALL)
    const chart = classifyStartingHand(hole('AsAh'))
    expect(v.tier).toBe(chart.tier)
    expect(v.rationale).toBe(chart.rationale)
    expect(v.heroContinued).toBe(true)
  })

  it('throws on a malformed holding (the same card twice), like classifyStartingHand', () => {
    const dup = parseCards('As As') as [Card, Card]
    expect(() => gradePreflop(preflopCtx({ holeCards: dup }), CALL)).toThrow(RangeError)
  })

  it('tags every preflop verdict with the ranges concept (the chart IS the ranges idea)', () => {
    // True across the open, fold, and free-check paths and across tiers — preflop is always graded
    // off the strength-tier chart, never the postflop equity-vs-price lens.
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh') }), CALL).concept).toBe('ranges')
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h2c') }), FOLD).concept).toBe('ranges')
    expect(gradePreflop(preflopCtx({ holeCards: hole('7c2d'), seat: 1 }), CHECK).concept).toBe(
      'ranges',
    )
  })
})

describe('gradePreflop — raise-aware defend grading (0053)', () => {
  // A small raise (below the large cut), a large raise, and a 3-bet-sized raise — the two behavioral
  // regimes plus the 3-bet teaching frame. Kept comfortably away from the cuts so the test is robust
  // to knob retuning.
  const SMALL = LARGE_RAISE_MIN_BB - 2 // ~3x — still a reasonable flatting price (small regime)
  const LARGE = LARGE_RAISE_MIN_BB + 1 // ~6x — value-only
  const THREEBET = THREE_BET_MIN_BB + 1 // ~10x — value-only, taught as a 3-bet

  // Position helpers for a 6-handed table: the button is late, an early seat is not.
  const INPOS = { seat: 0, buttonIndex: 0, numPlayers: 6 }
  const OOP = { seat: 2, buttonIndex: 0, numPlayers: 6 }

  it('a strong hand still GOOD calling/3-betting at every price (the legitimate defend)', () => {
    const strong = hole('AsQs') // AQs — strong tier
    for (const raiseBb of [SMALL, LARGE, THREEBET]) {
      expect(gradePreflop(preflopCtx({ holeCards: strong, raiseBb, ...INPOS }), CALL).verdict).toBe(
        'good',
      )
      expect(gradePreflop(preflopCtx({ holeCards: strong, raiseBb, ...OOP }), CALL).verdict).toBe(
        'good',
      )
    }
    // The rationale describes the defend decision, not the open-chart label.
    const v = gradePreflop(preflopCtx({ holeCards: strong, raiseBb: THREEBET, ...INPOS }), CALL)
    expect(v.rationale).toMatch(/3-bet or call/i)
  })

  it('the SAME speculative hand: open GOOD, small raise in position GOOD, OOP a LEAK', () => {
    // 76s (playable) — the open chart blesses it, and so should a small raise *in position*; but a
    // cold-call of a raise *out of position* is the beginner leak this ticket targets.
    const spec = hole('7h6h')
    // Unraised pot (open): playable always opens.
    expect(gradePreflop(preflopCtx({ holeCards: spec, ...INPOS }), CALL).verdict).toBe('good')
    // Small raise, in position: a fine thin flat → good.
    const smallIn = gradePreflop(preflopCtx({ holeCards: spec, raiseBb: SMALL, ...INPOS }), CALL)
    expect(smallIn.verdict).toBe('good')
    expect(smallIn.rationale).toMatch(/in position/i)
    // Small raise, out of position: a speculative cold-call → leak.
    const smallOop = gradePreflop(preflopCtx({ holeCards: spec, raiseBb: SMALL, ...OOP }), CALL)
    expect(smallOop.verdict).toBe('leak')
    expect(smallOop.rationale).toMatch(/out of position/i)
    // Folding the OOP cold-call is the GOOD play.
    expect(
      gradePreflop(preflopCtx({ holeCards: spec, raiseBb: SMALL, ...OOP }), FOLD).verdict,
    ).toBe('good')
  })

  it('a large raise collapses to value: speculative folds even in position', () => {
    const spec = hole('7h6h') // playable
    const large = gradePreflop(preflopCtx({ holeCards: spec, raiseBb: LARGE, ...INPOS }), CALL)
    expect(large.advice).toBe('fold')
    expect(large.verdict).toBe('leak') // calling is the leak
    expect(
      gradePreflop(preflopCtx({ holeCards: spec, raiseBb: LARGE, ...INPOS }), FOLD).verdict,
    ).toBe('good')
    expect(large.rationale).toMatch(/speculative/i)
  })

  it('a 3-bet collapses to a value range: a small pair cold-call is a LEAK', () => {
    // The seed-32 spot: 33 (playable) cold-calling a big raise. Against a 3-bet it must fold.
    const smallPair = hole('3s3d')
    const v = gradePreflop(preflopCtx({ holeCards: smallPair, raiseBb: THREEBET, ...INPOS }), CALL)
    expect(v.advice).toBe('fold')
    expect(v.verdict).toBe('leak')
    expect(v.rationale).toMatch(/3-bet/i)
    expect(
      gradePreflop(preflopCtx({ holeCards: smallPair, raiseBb: THREEBET, ...INPOS }), FOLD).verdict,
    ).toBe('good')
  })

  it('a marginal hand cold-calling a raise is a LEAK with a self-consistent rationale (the bug)', () => {
    // The seed-39 spot: 64s (marginal) calling a 6x raise. The old code printed "fold to pressure"
    // above a GOOD; now it grades a LEAK and the rationale describes the fold.
    const marginal = hole('6d4d') // 64s — marginal tier
    const v = gradePreflop(preflopCtx({ holeCards: marginal, raiseBb: LARGE, ...OOP }), CALL)
    expect(v.verdict).toBe('leak')
    expect(v.advice).toBe('fold')
    expect(v.rationale).toMatch(/fold/i)
    expect(v.rationale).not.toMatch(/fold to pressure/i)
  })

  it('the facing-raise rationale never carries the static open-chart label', () => {
    // Across tiers and prices, the facing-raise path replaces the opening-tier rationale with a
    // defend line that mentions the raise faced — never the verbatim "open only in late position"
    // style label that contradicts a call of a raise.
    for (const cards of ['AsAh', 'AsQs', '7h6h', '6d4d', '7h2c']) {
      for (const raiseBb of [SMALL, LARGE, THREEBET]) {
        const v = gradePreflop(preflopCtx({ holeCards: hole(cards), raiseBb, ...OOP }), CALL)
        expect(v.rationale).toMatch(/facing/i)
        expect(v.rationale).not.toMatch(/open only in late position/i)
      }
    }
  })

  it('rounds the raise size once: the label matches the band (4.6x → 5x large, 8.6x → 9x 3-bet)', () => {
    // The round-once fix: the gates compare the SAME rounded integer the label prints, so a
    // fractional raise can never read one size while being graded in another band.
    const spec = hole('7h6h') // playable — folds in the large/value-only band, flats in the small band

    // 4.6x rounds to 5x: that is LARGE_RAISE_MIN_BB, the large/value-only regime. So a playable
    // speculative hand is graded a fold (a leak to call) AND the rationale reads "a 5x raise" — the
    // label and the band agree. (Before the fix it printed 5x but was graded in the small band.)
    const justLarge = gradePreflop(preflopCtx({ holeCards: spec, raiseBb: 4.6, ...INPOS }), CALL)
    expect(justLarge.rationale).toContain('a 5x raise')
    expect(justLarge.advice).toBe('fold')
    expect(justLarge.verdict).toBe('leak')

    // 8.6x rounds to 9x: that is THREE_BET_MIN_BB, the 3-bet teaching frame. The rationale reads
    // "a 9x raise" and is taught as a 3-bet — label and band agree.
    const strong = hole('AsQs') // strong — continues at a 3-bet
    const justThreeBet = gradePreflop(
      preflopCtx({ holeCards: strong, raiseBb: 8.6, ...INPOS }),
      CALL,
    )
    expect(justThreeBet.rationale).toContain('a 9x raise')
    expect(justThreeBet.rationale).toMatch(/3-bet or call/i)
    expect(justThreeBet.verdict).toBe('good')
  })

  it('unraised pots are unaffected — the opening chart still grades them (no regression)', () => {
    // currentBet <= bigBlind keeps the opening behaviour: a marginal hand opens in late position,
    // folds early — exactly the pre-0053 grading.
    const marginal = hole('KsJd') // KJo — marginal
    const late = preflopCtx({ holeCards: marginal, seat: 0, buttonIndex: 0, numPlayers: 3 })
    expect(gradePreflop(late, CALL).advice).toBe('open')
    expect(gradePreflop(late, CALL).rationale).toMatch(/late position/i) // open-chart label intact
    const early = preflopCtx({ holeCards: marginal, seat: 1, buttonIndex: 0, numPlayers: 3 })
    expect(gradePreflop(early, CALL).verdict).toBe('leak')
  })
})

describe('startingHandChart', () => {
  const chart = startingHandChart()

  it('is a 13×13 grid indexed by CHART_RANKS (A→2)', () => {
    expect(CHART_RANKS).toHaveLength(13)
    expect(chart).toHaveLength(13)
    for (const row of chart) expect(row).toHaveLength(13)
  })

  it('lays out pairs on the diagonal, suited upper-right, offsuit lower-left', () => {
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const cell = chart[r]![c]!
        if (r === c) expect(cell.kind).toBe('pair')
        else if (c > r) expect(cell.kind).toBe('suited')
        else expect(cell.kind).toBe('offsuit')
      }
    }
  })

  it('labels each class in standard notation (higher rank first)', () => {
    expect(chart[0]![0]!.label).toBe('AA') // top-left pair
    expect(chart[0]![1]!.label).toBe('AKs') // suited, upper-right
    expect(chart[1]![0]!.label).toBe('AKo') // offsuit, lower-left (same A-K class)
    expect(chart[12]![12]!.label).toBe('22') // bottom-right pair
  })

  it('classifies every cell into a tier that matches the live coach', () => {
    for (const row of chart) {
      for (const cell of row) {
        expect(['premium', 'strong', 'playable', 'marginal', 'trash']).toContain(cell.tier)
      }
    }
    // Spot-check against classifyStartingHand — the chart IS that function, so they cannot diverge.
    expect(chart[0]![0]!.tier).toBe('premium') // AA
    expect(chart[0]![1]!.tier).toBe(classifyStartingHand(hole('AhKh')).tier) // AKs
    expect(chart[1]![0]!.tier).toBe(classifyStartingHand(hole('AhKs')).tier) // AKo
  })

  it('puts the worst hands in trash (72o) and small pairs in playable (22)', () => {
    const seven = CHART_RANKS.indexOf('7')
    const two = CHART_RANKS.indexOf('2')
    // 72 offsuit is the lower-left cell (row 2, col 7): higher rank (7) leads the label.
    const cell72o = chart[two]![seven]!
    expect(cell72o.label).toBe('72o')
    expect(cell72o.kind).toBe('offsuit')
    expect(cell72o.tier).toBe('trash')
    expect(chart[12]![12]!.tier).toBe('playable') // 22
  })
})

describe('handClassLabel', () => {
  it('labels pairs, suited, and offsuit in standard notation (higher rank first)', () => {
    expect(handClassLabel(hole('AsAh'))).toBe('AA')
    expect(handClassLabel(hole('AhKh'))).toBe('AKs')
    expect(handClassLabel(hole('AhKs'))).toBe('AKo')
    expect(handClassLabel(hole('7c2d'))).toBe('72o')
    expect(handClassLabel(hole('Th9h'))).toBe('T9s')
  })

  it('orders by rank regardless of card order', () => {
    expect(handClassLabel(hole('KsAs'))).toBe('AKs')
    expect(handClassLabel(hole('2d7c'))).toBe('72o')
  })

  it('matches the label of the cell the hand falls in (so a chart can highlight it)', () => {
    // For a sample of hands, the class label equals the matching chart cell's label.
    const grid = startingHandChart()
    const cellLabels = new Set(grid.flat().map((c) => c.label))
    for (const cards of ['AsAh', 'AhKh', 'AhKs', '7c2d', 'Th9h', 'Js9c', 'Qd2d']) {
      expect(cellLabels.has(handClassLabel(hole(cards)))).toBe(true)
    }
  })
})
