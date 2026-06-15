import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'

import {
  classifyStartingHand,
  describeHandClass,
  classifyPosition,
  gradePreflop,
  PREFLOP_CHART,
  CHART_RANKS,
  EARLY_SEATS,
  LARGE_RAISE_MIN_BB,
  THREE_BET_MIN_BB,
  STEAL_OPEN_RANGE,
  startingHandChart,
  handClassLabel,
  type Position,
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

describe('classifyStartingHand — rationale strings (strength descriptors, no false absolute)', () => {
  it('returns a tier-specific, human-readable STRENGTH rationale for every tier', () => {
    const cases: ReadonlyArray<readonly [string, PreflopTier, string]> = [
      ['AsAh', 'premium', 'raise'],
      ['TsTh', 'strong', 'value'],
      ['7h6h', 'playable', 'plays nicely in position'],
      ['KsJh', 'marginal', 'thin edge'],
      ['7h2c', 'trash', 'Trash'],
    ]
    for (const [cards, tier, needle] of cases) {
      const v: StartingHandVerdict = classifyStartingHand(hole(cards))
      expect(v.tier).toBe(tier)
      expect(v.rationale.length).toBeGreaterThan(0)
      expect(v.rationale).toContain(needle)
    }
  })

  it('the strength rationale asserts no false universal advice (0056)', () => {
    // The classification string describes STRENGTH, not absolute advice the position-aware grader
    // would contradict: trash is NOT "it makes no money over time" (it can be a profitable steal),
    // and marginal is NOT "fold to pressure" (it opens in late position).
    expect(classifyStartingHand(hole('7h2c')).rationale).not.toMatch(/makes no money/i)
    expect(classifyStartingHand(hole('Kh7c')).rationale).not.toMatch(/makes no money/i)
    expect(classifyStartingHand(hole('KsJh')).rationale).not.toMatch(/fold to pressure/i)
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

  it('premium / strong open from EVERY position, including UTG (the value tiers never fold)', () => {
    // UTG of a 6-max table (seat 3 = button+3, first to act): the value tiers still open.
    const utg = { seat: 3, buttonIndex: 0, numPlayers: 6 }
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh'), ...utg }), CALL).advice).toBe('open')
    expect(gradePreflop(preflopCtx({ holeCards: hole('KsQs'), ...utg }), CALL).advice).toBe('open')
    // …and the speculative `playable` tier opens from a non-early seat (the button), with a plan.
    const btn = { seat: 0, buttonIndex: 0, numPlayers: 6 }
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h6h'), ...btn }), CALL).advice).toBe('open')
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
    // 6-max, button on seat 0: the button (seat 0) and the cutoff (seat 5 = button-1) are late
    // position → the marginal hand opens.
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 0, buttonIndex: 0, numPlayers: 6 }),
        CALL,
      ).advice,
    ).toBe('open')
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 5, buttonIndex: 0, numPlayers: 6 }),
        CALL,
      ).advice,
    ).toBe('open')
    // UTG (seat 3 = button+3, first to act 6-max) is early position → the chart folds it.
    const early = preflopCtx({ holeCards: marginal, seat: 3, buttonIndex: 0, numPlayers: 6 })
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
    const late = preflopCtx({ holeCards: marginal, seat: 0, buttonIndex: 0, numPlayers: 6 })
    expect(gradePreflop(late, CALL).advice).toBe('open')
    expect(gradePreflop(late, CALL).rationale).toMatch(/late position/i) // open-chart label intact
    const early = preflopCtx({ holeCards: marginal, seat: 3, buttonIndex: 0, numPlayers: 6 })
    expect(gradePreflop(early, CALL).verdict).toBe('leak')
  })
})

describe('classifyPosition — seat geometry (0054)', () => {
  // 6-max, button on seat 0: sb=1, bb=2, UTG=3, MP=4, CO=5(=button-1), BTN=0.
  const np6 = (seat: number): Position =>
    classifyPosition(preflopCtx({ holeCards: hole('AsAh'), seat, buttonIndex: 0, numPlayers: 6 }))

  it('classes the button and cutoff as late', () => {
    expect(np6(0)).toBe('late') // BTN
    expect(np6(5)).toBe('late') // CO (button-1)
  })

  it('classes the small and big blind as distinct buckets (SB widens, BB does not)', () => {
    expect(np6(1)).toBe('small-blind') // SB
    expect(np6(2)).toBe('big-blind') // BB
  })

  it('classes the EARLY_SEATS just after the BB as early', () => {
    expect(EARLY_SEATS).toBeGreaterThanOrEqual(1)
    // 6-max has only UTG(3) and MP(4) as non-blind, non-late seats; with EARLY_SEATS=2 both are
    // early, so there is no `middle` seat at a 6-max table (middle appears at larger tables — see
    // the 9-handed case below).
    expect(np6(3)).toBe('early') // UTG, first to act
    expect(np6(4)).toBe('early') // MP/HJ — the second early seat
  })

  it('produces a `middle` bucket at a full ring (9-handed) between early and the cutoff', () => {
    const np9 = (seat: number): Position =>
      classifyPosition(preflopCtx({ holeCards: hole('AsAh'), seat, buttonIndex: 0, numPlayers: 9 }))
    expect(np9(3)).toBe('early') // UTG (first to act, offset 6)
    expect(np9(4)).toBe('early') // UTG+1
    expect(np9(5)).toBe('middle') // MP — now genuinely middle
    expect(np9(8)).toBe('late') // CO (button-1)
    expect(np9(0)).toBe('late') // BTN
    expect(np9(1)).toBe('small-blind') // SB
    expect(np9(2)).toBe('big-blind') // BB
  })

  it('heads-up: the button(=SB) is late/in-position, the BB is out of position', () => {
    // The fix 0053 deferred: the OLD isLatePosition treated BOTH HU seats as late.
    expect(
      classifyPosition(
        preflopCtx({ holeCards: hole('AsAh'), seat: 0, buttonIndex: 0, numPlayers: 2 }),
      ),
    ).toBe('late')
    expect(
      classifyPosition(
        preflopCtx({ holeCards: hole('AsAh'), seat: 1, buttonIndex: 0, numPlayers: 2 }),
      ),
    ).toBe('big-blind')
  })

  it('classifies a 4-handed table sensibly (the untested boundary)', () => {
    // 4-handed, button on seat 0: sb=1, bb=2, and seat 3 is the cutoff/UTG (offset 1 → late). There
    // is no early/middle seat at 4-handed — every non-blind seat is the button or the cutoff.
    const np4 = (seat: number): Position =>
      classifyPosition(preflopCtx({ holeCards: hole('AsAh'), seat, buttonIndex: 0, numPlayers: 4 }))
    expect(np4(0)).toBe('late') // BTN
    expect(np4(3)).toBe('late') // CO (= button-1, offset 1)
    expect(np4(1)).toBe('small-blind') // SB
    expect(np4(2)).toBe('big-blind') // BB
  })
})

describe('gradePreflop — position-aware across all tiers (0054)', () => {
  // 6-max geometry, button on seat 0.
  const at = (seat: number, holeCards: readonly [Card, Card]) =>
    preflopCtx({ holeCards, seat, buttonIndex: 0, numPlayers: 6 })
  const UTG = 3
  const BTN = 0

  it('a playable speculative hand FOLDS from early position, OPENS from late (EP fold → LP open)', () => {
    for (const cards of ['7h6h', '6s5s', '4d4c', 'As2s']) {
      // 76s/65s/44/A2s are playable — a winning 6-max reg folds these UTG, opens them on the button.
      const early = gradePreflop(at(UTG, hole(cards)), CALL)
      expect(early.advice).toBe('fold')
      expect(early.verdict).toBe('leak') // opening them UTG is the leak
      expect(gradePreflop(at(UTG, hole(cards)), FOLD).verdict).toBe('good')
      // The fold rationale follows the advice — never the "open in position" label above a fold.
      expect(early.rationale).not.toMatch(/open in position/i)

      const late = gradePreflop(at(BTN, hole(cards)), CALL)
      expect(late.advice).toBe('open')
      expect(late.verdict).toBe('good')
    }
  })

  it('the HU button widens: K7o / A9o / T9o OPEN on the button — no longer Trash/Leak', () => {
    const HU_BTN = { seat: 0, buttonIndex: 0, numPlayers: 2 }
    for (const cards of ['Kh7c', 'Ah9c', 'Td9c']) {
      const v = gradePreflop(preflopCtx({ holeCards: hole(cards), ...HU_BTN }), CALL)
      expect(v.tier).toBe('trash') // strength tier is UNCHANGED — the steal range is an advice layer
      expect(v.advice).toBe('open') // …but the steal/HU range promotes the open
      expect(v.verdict).toBe('good') // calling/opening is correct, NOT a Leak
      // Folding the steal is now the leak (it is a profitable open).
      expect(gradePreflop(preflopCtx({ holeCards: hole(cards), ...HU_BTN }), FOLD).verdict).toBe(
        'leak',
      )
    }
  })

  it('those same trash steals still FOLD from early position (the widening is late/blind/HU only)', () => {
    for (const cards of ['Kh7c', 'Ah9c', 'Td9c']) {
      const v = gradePreflop(at(UTG, hole(cards)), CALL)
      expect(v.advice).toBe('fold')
      expect(v.verdict).toBe('leak') // opening trash UTG is a leak
    }
  })

  it('genuine trash (72o) still folds everywhere, even on the HU button', () => {
    const HU_BTN = { seat: 0, buttonIndex: 0, numPlayers: 2 }
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h2c'), ...HU_BTN }), CALL).verdict).toBe(
      'leak',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h2c'), ...HU_BTN }), FOLD).verdict).toBe(
      'good',
    )
  })

  it('premium / strong open from every seat (spot-check across positions and table sizes)', () => {
    for (const cards of ['AsAh', 'KsKh', 'AsKh', 'AsQs', 'KsQs']) {
      for (const seat of [UTG, 4, 5, BTN, 1, 2]) {
        expect(gradePreflop(at(seat, hole(cards)), CALL).advice).toBe('open')
      }
      // …and heads-up, both seats.
      expect(
        gradePreflop(
          preflopCtx({ holeCards: hole(cards), seat: 0, buttonIndex: 0, numPlayers: 2 }),
          CALL,
        ).advice,
      ).toBe('open')
    }
  })

  it('the HU BB defend is no longer labelled "in position" (the 0053-deferred wording fix)', () => {
    // HU, button on seat 1 → the hero (seat 0) is the BB, out of position. Facing a small raise with
    // a playable hand: the verdict is the OOP cold-call leak and the rationale must NOT say "in
    // position" (the old isLatePosition called both HU seats late).
    const huBb = preflopCtx({
      holeCards: hole('7h6h'),
      seat: 0,
      buttonIndex: 1,
      numPlayers: 2,
      raiseBb: LARGE_RAISE_MIN_BB - 2, // a small raise — the one regime position moves
    })
    const v = gradePreflop(huBb, CALL)
    expect(v.rationale).not.toMatch(/in position/i)
    expect(v.verdict).toBe('leak') // a thin OOP cold-call → leak
    expect(v.rationale).toMatch(/out of position/i)
  })

  it('a trash steal opens when FOLDED to the hero but is a LEAK over a limper (the steal gate)', () => {
    // K7o on the button. Folded to the hero (no voluntary entrants) it is a profitable steal → open.
    const folded = preflopCtx({ holeCards: hole('Kh7c'), seat: 0, buttonIndex: 0, numPlayers: 6 })
    expect(gradePreflop(folded, CALL).verdict).toBe('good') // opening the steal is correct
    expect(gradePreflop(folded, CALL).advice).toBe('open')
    expect(gradePreflop(folded, CALL).rationale).toMatch(/steal/i)

    // The SAME K7o with a limper already in the pot (seat 3 voluntarily committed a big blind). Now it
    // is NOT a steal — raising junk over a limper is a leak — so the promotion does not fire: the
    // raise is a leak and folding is correct.
    const limped: DecisionContext = {
      ...folded,
      opponents: [
        { seat: 3, stack: 998, committed: 2, totalCommitted: 2, status: 'active', isButton: false },
      ],
    }
    expect(gradePreflop(limped, CALL).advice).toBe('fold')
    expect(gradePreflop(limped, CALL).verdict).toBe('leak') // raising junk over the limper is a leak
    expect(gradePreflop(limped, FOLD).verdict).toBe('good') // folding it is correct
    // The fold line may honestly note the hand steals in OTHER spots, but must not sell THIS spot as a
    // steal to take now (the open steal line's "open this profitably / take it down").
    const limpedRationale = gradePreflop(limped, CALL).rationale
    expect(limpedRationale).not.toMatch(/take it down|open this profitably/i)
  })

  it('an involuntary big blind is not a "limper": the SB steal still fires past it', () => {
    // SB (seat 1) with K7o, folded around to it: only the BB (seat 2) remains, and the BB's POSTED big
    // blind is involuntary — so this is still a genuine steal spot and the promotion fires.
    const sbSteal: DecisionContext = {
      ...preflopCtx({ holeCards: hole('Kh7c'), seat: 1, buttonIndex: 0, numPlayers: 6 }),
      opponents: [
        // The BB posted its blind but has not voluntarily entered — must NOT count as an entrant.
        { seat: 2, stack: 998, committed: 2, totalCommitted: 2, status: 'active', isButton: false },
      ],
    }
    expect(gradePreflop(sbSteal, CALL).advice).toBe('open')
    expect(gradePreflop(sbSteal, CALL).verdict).toBe('good')
  })

  it('SB gets steal widening; an unraised BB does not open via the grader', () => {
    // SB (seat 1) is a widening/steal seat → a steal-range trash hand opens.
    const sb = preflopCtx({ holeCards: hole('Kh7c'), seat: 1, buttonIndex: 0, numPlayers: 6 })
    expect(classifyPosition(sb)).toBe('small-blind')
    expect(gradePreflop(sb, CALL).advice).toBe('open')
    expect(gradePreflop(sb, CALL).verdict).toBe('good')

    // The BB (seat 2) is NOT a widening seat. In normal flow an unraised BB reaches the grader only via
    // the free `check` (its option), which is always GOOD — assert the short-circuit covers it.
    const bb = preflopCtx({ holeCards: hole('Kh7c'), seat: 2, buttonIndex: 0, numPlayers: 6 })
    expect(classifyPosition(bb)).toBe('big-blind')
    expect(gradePreflop(bb, CHECK).verdict).toBe('good')
    expect(gradePreflop(bb, CHECK).rationale).toMatch(/free flop/i)
    // And the BB-open path through adviceFor folds trash (no steal widening) — if a BB combo did reach
    // the opening rule (e.g. a non-check action), the steal promotion must not fire.
    expect(gradePreflop(bb, CALL).advice).toBe('fold')
    expect(gradePreflop(bb, CALL).verdict).toBe('leak') // entering trash from the BB is a leak
  })

  it('the STEAL_OPEN_RANGE is a wider, additive layer — it promotes trash, never re-tiers it', () => {
    // Every steal-range hand is still its same strength tier; the range only changes ADVICE in a
    // widening seat. (Guards the acceptance criterion that the chart tiers are unchanged.)
    expect(STEAL_OPEN_RANGE).toMatch(/K7o/)
    expect(classifyStartingHand(hole('Kh7c')).tier).toBe('trash') // K7o still trash on the chart
  })
})

describe('gradePreflop — rationale follows the position/action advice, no false universal (0056)', () => {
  // 6-max geometry, button on seat 0.
  const at = (seat: number, holeCards: readonly [Card, Card]) =>
    preflopCtx({ holeCards, seat, buttonIndex: 0, numPlayers: 6 })
  const UTG = 3
  const BTN = 0
  const HU_BTN = { seat: 0, buttonIndex: 0, numPlayers: 2 }

  it('the SAME trash hand (K7o): early fold ≠ button steal, and neither asserts a false universal', () => {
    // Folded from early position: the line is an honest, position-relative fold — NOT the old
    // "it makes no money over time" absolute (it IS a profitable steal from a later seat).
    const earlyFold = gradePreflop(at(UTG, hole('Kh7c')), FOLD)
    expect(earlyFold.advice).toBe('fold')
    expect(earlyFold.verdict).toBe('good')
    expect(earlyFold.rationale).not.toMatch(/makes no money/i)
    // K7o is a steal-range hand, so the fold line honestly notes it opens as a steal elsewhere.
    expect(earlyFold.rationale).toMatch(/steal/i)

    // Opened from the heads-up button: the steal line, describing the open it is.
    const btnOpen = gradePreflop(preflopCtx({ holeCards: hole('Kh7c'), ...HU_BTN }), CALL)
    expect(btnOpen.advice).toBe('open')
    expect(btnOpen.verdict).toBe('good')
    expect(btnOpen.rationale).toMatch(/steal/i)
    expect(btnOpen.rationale).not.toMatch(/makes no money/i)

    // The two rationales for the same hand genuinely differ (advice-relative, not a fixed tier label).
    expect(earlyFold.rationale).not.toBe(btnOpen.rationale)
  })

  it('the never-open junk tail (72o) folds without claiming it "opens later" — no inverted false universal', () => {
    // 72o is trash the grader opens NOWHERE (not in the steal range). Its fold line must NOT claim a
    // steal / a "later seat" (there is none later than the button), and NOT claim "makes no money
    // over time" either — just an honest fold. Checked at early position AND on the heads-up button
    // (the latest seat there is no "later" than).
    for (const ctx of [at(UTG, hole('7h2c')), preflopCtx({ holeCards: hole('7h2c'), ...HU_BTN })]) {
      const v = gradePreflop(ctx, FOLD)
      expect(v.advice).toBe('fold')
      expect(v.verdict).toBe('good')
      expect(v.rationale).not.toMatch(/makes no money/i)
      expect(v.rationale).not.toMatch(/steal/i)
      expect(v.rationale).not.toMatch(/later seat/i)
      expect(v.rationale).not.toMatch(/open(s| it| profitably)/i)
    }
  })

  it('a marginal hand OPENING in late position describes the open, with no bare "fold to pressure"', () => {
    const open = gradePreflop(at(BTN, hole('KsJd')), CALL) // KJo (marginal) on the button
    expect(open.advice).toBe('open')
    expect(open.verdict).toBe('good')
    expect(open.rationale).toMatch(/open it/i) // phrased as the open it is
    expect(open.rationale).not.toMatch(/fold to pressure/i) // no false absolute above an open
  })

  it('no emitted rationale claims "makes no money over time" for a hand the grader would open somewhere', () => {
    // K7o/A9o/T9o are trash that the grader OPENS as steals — so wherever they fold (early), the line
    // must NOT assert a universal "no money" the grader itself breaks elsewhere.
    for (const cards of ['Kh7c', 'Ah9c', 'Td9c']) {
      const earlyFold = gradePreflop(at(UTG, hole(cards)), FOLD)
      expect(earlyFold.advice).toBe('fold')
      expect(earlyFold.rationale).not.toMatch(/makes no money/i)
      const steal = gradePreflop(preflopCtx({ holeCards: hole(cards), ...HU_BTN }), CALL)
      expect(steal.advice).toBe('open')
      expect(steal.rationale).not.toMatch(/makes no money/i)
    }
  })

  it('no "fold to pressure" line is ever printed above a Good defend (re-confirms 0053 self-consistency)', () => {
    // Across tiers and prices, a GOOD continue facing a raise never carries the "fold to pressure"
    // absolute — the facing-raise rationale follows the defend decision.
    const INPOS = { seat: 0, buttonIndex: 0, numPlayers: 6 }
    for (const cards of ['AsAh', 'AsQs']) {
      for (const raiseBb of [
        LARGE_RAISE_MIN_BB - 2,
        LARGE_RAISE_MIN_BB + 1,
        THREE_BET_MIN_BB + 1,
      ]) {
        const v = gradePreflop(preflopCtx({ holeCards: hole(cards), raiseBb, ...INPOS }), CALL)
        expect(v.verdict).toBe('good')
        expect(v.rationale).not.toMatch(/fold to pressure/i)
      }
    }
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

describe('describeHandClass', () => {
  it('decodes pairs as "pair of <plural rank>"', () => {
    expect(describeHandClass('AA')).toBe('pair of Aces')
    expect(describeHandClass('KK')).toBe('pair of Kings')
    expect(describeHandClass('TT')).toBe('pair of Tens')
    expect(describeHandClass('22')).toBe('pair of Twos')
  })

  it('uses the irregular plural for pocket sixes', () => {
    expect(describeHandClass('66')).toBe('pair of Sixes')
  })

  it('decodes suited and offsuit hands with the rank words and "suited"/"offsuit"', () => {
    expect(describeHandClass('AKs')).toBe('Ace-King suited')
    expect(describeHandClass('JTo')).toBe('Jack-Ten offsuit')
    expect(describeHandClass('T9s')).toBe('Ten-Nine suited')
    expect(describeHandClass('72o')).toBe('Seven-Two offsuit')
  })

  it('decodes every label the chart renders (no cell reads as raw shorthand)', () => {
    for (const cell of startingHandChart().flat()) {
      const decoded = describeHandClass(cell.label)
      // A decoded label is real prose, never the bare token echoed back.
      expect(decoded).not.toBe(cell.label)
      expect(decoded).toMatch(/pair of |suited|offsuit/)
    }
  })

  it('round-trips with handClassLabel — a dealt hand decodes to a sensible phrase', () => {
    expect(describeHandClass(handClassLabel(hole('AhKh')))).toBe('Ace-King suited')
    expect(describeHandClass(handClassLabel(hole('JdTc')))).toBe('Jack-Ten offsuit')
  })

  it('returns the input unchanged for unrecognisable strings', () => {
    expect(describeHandClass('')).toBe('')
    expect(describeHandClass('XY')).toBe('XY')
    expect(describeHandClass('AKx')).toBe('AKx')
  })
})
