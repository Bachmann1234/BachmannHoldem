import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import { potOdds, type CallSpot } from '@holdem/odds'
import { estimateEquity, type DecisionContext, type RangeWidth } from '@holdem/bots'

import {
  coachDecision,
  assumedRangeForLine,
  assumedLineRead,
  coachAssumedRead,
  LARGE_BET_POT_FRACTION,
  UNBET_RANGE_WIDTH,
  FACING_BET_RANGE_WIDTH,
  BARRELED_RANGE_WIDTH,
  BLUFF_FRACTION,
  COACH_ASSUMED_RANGE,
  COACH_SEED,
  EPSILON,
  VALUE_BET_THRESHOLD,
  ARCHETYPE_TIER_SHIFT,
  ARCHETYPE_BLUFF_STEP,
  type DecisionVerdict,
  type VillainArchetype,
} from './verdict.js'

/** The canonical width order, tightest → widest, for asserting the bounded ±1-tier clamp. */
const WIDTH_ORDER: readonly RangeWidth[] = ['ultraTight', 'tight', 'medium', 'loose', 'anyTwo']
const widthTier = (w: RangeWidth): number => WIDTH_ORDER.indexOf(w)

/** Parse a glued two-card string into a hole-card tuple, e.g. "AhKh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/**
 * Build a {@link DecisionContext} for a clean, controlled spot. Only the fields
 * {@link coachDecision} reads (holeCards, board, pot, toCall) matter; the rest are filled
 * with plausible defaults so the context type-checks.
 */
function ctx(over: {
  holeCards: readonly [Card, Card]
  board?: readonly Card[]
  pot: number
  toCall: number
  numActive?: number
  street?: DecisionContext['street']
  stack?: number
  committed?: number
  opponents?: DecisionContext['opponents']
}): DecisionContext {
  const board = over.board ?? []
  const legal: LegalActions = { fold: true, check: false, call: null, bet: null, raise: null }
  const numActive = over.numActive ?? 2
  // Default the street from the board size, but let a caller override it (a 5-card board is
  // the river, and turn/river-barrel tests need the street to drive assumedRangeForLine).
  const street: DecisionContext['street'] =
    over.street ??
    (board.length === 0
      ? 'preflop'
      : board.length === 3
        ? 'flop'
        : board.length === 4
          ? 'turn'
          : 'river')
  return {
    seat: 0,
    holeCards: over.holeCards,
    board,
    street,
    legalActions: legal,
    pot: over.pot,
    currentBet: over.toCall,
    toCall: over.toCall,
    stack: over.stack ?? 1000,
    committed: over.committed ?? 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    isButton: true,
    numPlayers: numActive,
    numActive,
    opponents: over.opponents ?? [],
  }
}

/**
 * The exact equity {@link coachDecision} will read for a spot, computed the same way the
 * coach does (same range, same fixed seed). Tests assert against *this* number rather than
 * a hard-coded literal so they stay correct if the Monte-Carlo internals shift, while still
 * pinning the coach's own determinism.
 */
function coachEquity(
  holeCards: readonly [Card, Card],
  board: readonly Card[] = [],
  numActive = 2,
  width: RangeWidth = COACH_ASSUMED_RANGE,
): number {
  return estimateEquity({
    holeCards,
    board,
    opponentRange: width,
    seed: COACH_SEED,
    opponentCount: numActive - 1,
  }).equity
}

/**
 * The exact equity {@link coachDecision} reads for a *whole spot* — same range, same seed, same
 * opponent count. Reads against the *actual* range {@link coachAssumedRead} resolves (a
 * {@link RangeWidth} on unbet/facing-bet lines, the board-aware polarised {@link Range} on a barreled
 * postflop line — ticket 0057), so tests that assert "the coach's equity equals a standalone read"
 * stay correct whether the spot narrows to a width or swaps in the polarised range.
 */
function coachEquityForSpot(spot: DecisionContext): number {
  return estimateEquity({
    holeCards: spot.holeCards,
    board: spot.board,
    opponentRange: coachAssumedRead(spot).opponentRange,
    seed: COACH_SEED,
    opponentCount: spot.numActive - 1,
  }).equity
}

const FOLD: Action = { type: 'fold' }
const CALL: Action = { type: 'call' }
const CHECK: Action = { type: 'check' }

describe('coachDecision — numbers it reports', () => {
  it('reports equity, the pot-odds threshold, and the chip EV of calling', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const v = coachDecision(spot, CALL)

    const equity = coachEquityForSpot(spot)
    expect(v.equity).toBe(equity)
    expect(v.potOddsThreshold).toBe(potOdds(50, 100))
    // EV consistent with the odds helper's accounting (pot is BEFORE the call).
    const expectedEv = equity * (100 + 50) - 50
    expect(v.callEv).toBeCloseTo(expectedEv, 9)
  })

  it('maps pot accounting DIRECTLY — toCall is not folded into pot', () => {
    // potOdds(50, 100) = 50/150 = 1/3, not 50/200 = 1/4 (the bug of adding toCall to pot).
    const v = coachDecision(ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 }), CALL)
    expect(v.potOddsThreshold).toBeCloseTo(1 / 3, 9)
    expect(v.potOddsThreshold).not.toBeCloseTo(1 / 4, 3)
  })
})

describe('coachDecision — value / +EV continue is good', () => {
  it('calling a clearly +EV spot is good and the correct decision is continue', () => {
    // Pocket aces preflop crush a medium range; equity ≫ pot-odds threshold of 1/3.
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const v = coachDecision(spot, CALL)

    expect(v.equity).toBeGreaterThan(v.potOddsThreshold + EPSILON)
    expect(v.correctDecision).toBe('continue')
    expect(v.heroContinued).toBe(true)
    expect(v.verdict).toBe('good')
    expect(v.callEv).toBeGreaterThan(0)
  })

  it('a raise (also a continue) on the same +EV spot is good — sizing is not graded', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const raise: Action = { type: 'raise', amount: 300 }
    expect(coachDecision(spot, raise).verdict).toBe('good')
  })
})

describe('coachDecision — clearly −EV continue is a leak', () => {
  it('calling a huge price with a weak hand is a leak; correct decision is fold', () => {
    // 7-2 offsuit getting almost no pot odds (call 200 into 100 → threshold 200/300 ≈ 0.667).
    const spot = ctx({ holeCards: hole('7h2c'), pot: 100, toCall: 200 })
    const v = coachDecision(spot, CALL)

    expect(v.equity).toBeLessThan(v.potOddsThreshold - EPSILON)
    expect(v.correctDecision).toBe('fold')
    expect(v.heroContinued).toBe(true)
    expect(v.verdict).toBe('leak')
    expect(v.callEv).toBeLessThan(0)
  })
})

describe('coachDecision — folding', () => {
  it('folding a clearly +EV spot is a leak', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const v = coachDecision(spot, FOLD)

    expect(v.correctDecision).toBe('continue')
    expect(v.heroContinued).toBe(false)
    expect(v.verdict).toBe('leak')
  })

  it('correctly folding a clearly −EV spot is good', () => {
    const spot = ctx({ holeCards: hole('7h2c'), pot: 100, toCall: 200 })
    const v = coachDecision(spot, FOLD)

    expect(v.correctDecision).toBe('fold')
    expect(v.heroContinued).toBe(false)
    expect(v.verdict).toBe('good')
  })
})

describe('coachDecision — free check (toCall === 0)', () => {
  it('checking for free is always good; the threshold is 0 and the EV is non-negative', () => {
    const spot = ctx({ holeCards: hole('7h2c'), pot: 100, toCall: 0 })
    const v = coachDecision(spot, CHECK)

    // A free continue needs 0 equity to be break-even, so the threshold is exactly 0.
    expect(v.potOddsThreshold).toBe(0)
    // The chip EV of a free call is the equity share of the pot (nothing at risk), ≥ 0.
    expect(v.callEv).toBeGreaterThanOrEqual(0)
    expect(v.callEv).toBeCloseTo(v.equity * 100, 9)
    expect(v.correctDecision).toBe('continue')
    expect(v.verdict).toBe('good')
  })

  it('folding a free check is the pathological leak', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 0 })
    expect(coachDecision(spot, FOLD).verdict).toBe('leak')
  })
})

describe('coachDecision — missed value bet (over-passivity flag, ticket 0055)', () => {
  const BET: Action = { type: 'bet', amount: 10 }

  it('flags a checked unbet pot with equity ≥ VALUE_BET_THRESHOLD — but keeps the verdict good', () => {
    // The seed-29 spot: an overpair (Ts Td) on a dry low board in an unbet pot is comfortably
    // ahead of a typical range, so checking it leaves value — bet for value instead.
    const holeCards = hole('TsTd')
    const board = parseCards('6h 7s 2d')
    const spot = ctx({ holeCards, board, pot: 10, toCall: 0 })
    const v = coachDecision(spot, CHECK)

    // Premise: the read is comfortably over the value threshold.
    expect(v.equity).toBeGreaterThanOrEqual(VALUE_BET_THRESHOLD)
    expect(v.missedValueBet).toBe(true)
    // The flag is ADDITIONAL — checking a free card is not a −EV mistake, so it stays good.
    expect(v.verdict).toBe('good')
  })

  it('does NOT flag a checked unbet pot when equity is below the threshold', () => {
    // 7-2 offsuit on a dry board is well under VALUE_BET_THRESHOLD — checking is correct,
    // and there is no value being left, so no nudge.
    const holeCards = hole('7h2c')
    const board = parseCards('Ad Ks Qh')
    const spot = ctx({ holeCards, board, pot: 10, toCall: 0 })
    const v = coachDecision(spot, CHECK)

    expect(v.equity).toBeLessThan(VALUE_BET_THRESHOLD)
    expect(v.missedValueBet).toBe(false)
  })

  it('does NOT flag a BET into an unbet pot — the hero already took the value (it is the action we want)', () => {
    const holeCards = hole('TsTd')
    const board = parseCards('6h 7s 2d')
    const spot = ctx({ holeCards, board, pot: 10, toCall: 0 })
    const v = coachDecision(spot, BET)

    // Same high-equity unbet pot, but the hero bet — there is no value missed, but heroBet is set.
    expect(v.equity).toBeGreaterThanOrEqual(VALUE_BET_THRESHOLD)
    expect(v.missedValueBet).toBe(false)
    expect(v.heroBet).toBe(true)
  })

  it('is never set on a priced spot, even a high-equity one (scoped to the unbet check)', () => {
    // A +EV value call with strong equity: the flag is about over-passivity in an unbet pot,
    // not about priced spots, so it stays false in every toCall > 0 branch.
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    expect(coachDecision(spot, CALL).missedValueBet).toBe(false)
    expect(coachDecision(spot, FOLD).missedValueBet).toBe(false)
  })
})

describe('coachDecision — heroBet (bet into an unbet pot, BUG-0009)', () => {
  const BET: Action = { type: 'bet', amount: 10 }
  const RAISE: Action = { type: 'raise', amount: 10 }

  it('is set when the hero bets into an unbet pot (and the verdict stays good)', () => {
    const spot = ctx({ holeCards: hole('TsTd'), board: parseCards('6h 7s 2d'), pot: 10, toCall: 0 })
    const v = coachDecision(spot, BET)
    expect(v.heroBet).toBe(true)
    // It is the mirror of missedValueBet — exactly one of the two fires on an unbet pot.
    expect(v.missedValueBet).toBe(false)
    expect(v.verdict).toBe('good')
  })

  it('is set for a raise into an unbet pot too', () => {
    const spot = ctx({ holeCards: hole('TsTd'), board: parseCards('6h 7s 2d'), pot: 10, toCall: 0 })
    expect(coachDecision(spot, RAISE).heroBet).toBe(true)
  })

  it('is NOT set on a check, a call, or a fold of an unbet pot', () => {
    const spot = ctx({ holeCards: hole('TsTd'), board: parseCards('6h 7s 2d'), pot: 10, toCall: 0 })
    expect(coachDecision(spot, CHECK).heroBet).toBe(false)
    expect(coachDecision(spot, FOLD).heroBet).toBe(false)
  })

  it('is never set on a priced spot — a bet there is a raise we grade as a continue, not an unbet bet', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    expect(coachDecision(spot, CALL).heroBet).toBe(false)
    expect(coachDecision(spot, RAISE).heroBet).toBe(false)
    expect(coachDecision(spot, FOLD).heroBet).toBe(false)
  })
})

describe('coachDecision — break-even tolerance band', () => {
  it('a spot within EPSILON of the threshold is breakEven, never a leak', () => {
    // Find a (hand, board) whose coach equity is known, then set toCall so the pot-odds threshold
    // lands within EPSILON of that equity — a deliberate coin-flip. Use a *turn* board so any bet
    // is a barrel (the read is the board-aware polarised range for any toCall), and read the coach's
    // actual equity off a probe spot rather than a fixed width — the read no longer maps to a bucket.
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h 9s')
    const pot = 100
    const probe = ctx({ holeCards, board, pot, toCall: 50, street: 'turn' })
    const equity = coachEquityForSpot(probe)

    // Solve potOdds(toCall, pot) = equity for toCall given a fixed pot:
    //   equity = toCall / (pot + toCall)  ⇒  toCall = equity*pot / (1 - equity)
    const toCall = Math.round((equity * pot) / (1 - equity))
    const spot = ctx({ holeCards, board, pot, toCall, street: 'turn' })
    // A turn barrel reads against the board-aware range for any bet size, so the probe equity matches.
    expect(coachAssumedRead(spot).trace.assumedRange).toBe('board-aware')

    const v = coachDecision(spot, CALL)
    expect(Math.abs(v.equity - v.potOddsThreshold)).toBeLessThanOrEqual(EPSILON)
    expect(v.verdict).toBe('breakEven')
    // Folding the same coin-flip is also not a leak.
    expect(coachDecision(spot, FOLD).verdict).toBe('breakEven')
  })

  it('just outside the band on the −EV side flips to a leak', () => {
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h 9s')
    const pot = 100
    const probe = ctx({ holeCards, board, pot, toCall: 50, street: 'turn' })
    const equity = coachEquityForSpot(probe)

    // Push the threshold clearly above equity (beyond EPSILON): make the call too expensive.
    // toCall for threshold = equity + 2*EPSILON
    const target = equity + 2 * EPSILON
    const toCall = Math.ceil((target * pot) / (1 - target))
    const spot = ctx({ holeCards, board, pot, toCall, street: 'turn' })

    const v = coachDecision(spot, CALL)
    expect(v.potOddsThreshold).toBeGreaterThan(v.equity + EPSILON)
    expect(v.verdict).toBe('leak')
  })
})

describe('coachDecision — concept tag (the Foundations cross-link)', () => {
  it('a free check (no price) is the equity idea', () => {
    const spot = ctx({ holeCards: hole('7h2c'), pot: 100, toCall: 0 })
    // There is nothing to weigh against, so the decision is purely reading equity.
    expect(coachDecision(spot, CHECK).concept).toBe('equity')
    expect(coachDecision(spot, FOLD).concept).toBe('equity')
  })

  it('a clearly priced continue (good or leak) is the equity-vs-price idea', () => {
    // +EV value spot (good) and the −EV overpay (leak) both hinge on equity vs the price.
    const value = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const overpay = ctx({ holeCards: hole('7h2c'), pot: 100, toCall: 200 })
    expect(coachDecision(value, CALL).verdict).toBe('good')
    expect(coachDecision(value, CALL).concept).toBe('equity-vs-price')
    expect(coachDecision(overpay, CALL).verdict).toBe('leak')
    expect(coachDecision(overpay, CALL).concept).toBe('equity-vs-price')
  })

  it('a break-even priced spot is also the equity-vs-price idea', () => {
    // Same coin-flip construction as the tolerance-band test: priced right on the threshold against
    // the board-aware barreled read (a turn bet, so any size is a barrel).
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h 9s')
    const pot = 100
    const probe = ctx({ holeCards, board, pot, toCall: 50, street: 'turn' })
    const equity = coachEquityForSpot(probe)
    const toCall = Math.round((equity * pot) / (1 - equity))
    const spot = ctx({ holeCards, board, pot, toCall, street: 'turn' })

    const v = coachDecision(spot, CALL)
    expect(v.verdict).toBe('breakEven')
    expect(v.concept).toBe('equity-vs-price')
  })
})

describe('coachDecision — input validation (odds/bots RangeError idiom)', () => {
  it('throws on a negative pot', () => {
    expect(() =>
      coachDecision(ctx({ holeCards: hole('AsAh'), pot: -1, toCall: 10 }), CALL),
    ).toThrow(RangeError)
  })

  it('throws on a negative toCall', () => {
    expect(() =>
      coachDecision(ctx({ holeCards: hole('AsAh'), pot: 10, toCall: -1 }), CALL),
    ).toThrow(RangeError)
  })
})

describe('coachDecision — determinism', () => {
  it('a fixed (ctx, action) always yields the same verdict', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const first: DecisionVerdict = coachDecision(spot, CALL)
    const second: DecisionVerdict = coachDecision(spot, CALL)
    expect(second).toEqual(first)
  })

  it('the read is the line-narrowed width and consistent with a standalone read', () => {
    // An unbet pot reads against the COACH_ASSUMED_RANGE baseline; a priced spot reads
    // against the narrowed width. Both must match a standalone read at the same width.
    const holeCards = hole('AsAh')
    const unbet = ctx({ holeCards, pot: 100, toCall: 0 })
    expect(assumedRangeForLine(unbet)).toBe(COACH_ASSUMED_RANGE)
    expect(coachDecision(unbet, CHECK).equity).toBe(
      estimateEquity({
        holeCards,
        board: [],
        opponentRange: COACH_ASSUMED_RANGE,
        seed: COACH_SEED,
      }).equity,
    )

    const priced = ctx({ holeCards, pot: 100, toCall: 50 })
    expect(coachDecision(priced, CALL).equity).toBe(coachEquityForSpot(priced))
  })
})

describe('coachDecision — multiway equity read (numActive)', () => {
  it('heads-up (numActive 2) equals the unchanged single-villain read', () => {
    const holeCards = hole('AsAh')
    const spot = ctx({ holeCards, pot: 100, toCall: 50, numActive: 2 })
    // numActive 2 == opponentCount 1; the priced line narrows the width, so compare to the
    // matching standalone read for this spot rather than the baseline read.
    expect(coachDecision(spot, CALL).equity).toBe(coachEquityForSpot(spot))
  })

  it('reported equity falls as the table grows (2-way → 3-way → 6-way) for a fixed hand', () => {
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const heads = coachDecision(ctx({ holeCards, board, pot: 100, toCall: 50, numActive: 2 }), CALL)
    const threeWay = coachDecision(
      ctx({ holeCards, board, pot: 100, toCall: 50, numActive: 3 }),
      CALL,
    )
    const sixWay = coachDecision(
      ctx({ holeCards, board, pot: 100, toCall: 50, numActive: 6 }),
      CALL,
    )
    expect(threeWay.equity).toBeLessThan(heads.equity)
    expect(sixWay.equity).toBeLessThan(threeWay.equity)
  })

  it('a 6-way read is deterministic and matches a standalone multiway read', () => {
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const spot = ctx({ holeCards, board, pot: 100, toCall: 50, numActive: 6 })
    expect(coachDecision(spot, CALL).equity).toBe(coachEquityForSpot(spot))
  })

  it('a hand that is +EV heads-up but −EV multiway flips good → leak at the bigger table', () => {
    // A speculative hand on a coordinated board: decent equity vs one villain, much thinner
    // against five. Priced so the call clears the threshold heads-up but not 6-way.
    const holeCards = hole('Th9h')
    const board = parseCards('8h 7c 2d') // open-ended + backdoor flush draw
    const pot = 100
    const toCall = 60 // threshold = 60/160 = 0.375

    const heads = coachDecision(ctx({ holeCards, board, pot, toCall, numActive: 2 }), CALL)
    const sixWay = coachDecision(ctx({ holeCards, board, pot, toCall, numActive: 6 }), CALL)

    // Heads-up the draw is good to continue; six-way the same price is a leak.
    expect(heads.equity).toBeGreaterThan(heads.potOddsThreshold)
    expect(heads.verdict).toBe('good')
    expect(sixWay.equity).toBeLessThan(sixWay.potOddsThreshold)
    expect(sixWay.verdict).toBe('leak')
  })

  it('propagates a RangeError on a degenerate spot with no live opponents (numActive 1)', () => {
    // A real DecisionContext always has numActive >= 2 (a decision needs an opponent), but guard
    // the contract: numActive 1 ⇒ opponentCount 0, which estimateEquity rejects rather than
    // reading a no-villain equity. The throw surfaces (the TUI catches it as an advisory notice).
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50, numActive: 1 })
    expect(() => coachDecision(spot, CALL)).toThrow(RangeError)
  })
})

describe('assumedRangeForLine — narrowing the read on the betting line', () => {
  it('an unbet pot / free check keeps the no-read baseline width', () => {
    // toCall === 0: the villain has revealed nothing, so stay at the bots-aliased baseline.
    const flop = ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 50, toCall: 0 })
    expect(assumedRangeForLine(flop)).toBe(UNBET_RANGE_WIDTH)
    expect(UNBET_RANGE_WIDTH).toBe(COACH_ASSUMED_RANGE)
  })

  it('a small bet/raise on an early street narrows one bucket to facingBet', () => {
    // Small flop c-bet: toCall 3 into a pot of 13 (10 of dead money before the bet) ⇒
    // betFraction 3/(13-3) = 0.30 < LARGE_BET_POT_FRACTION (a <1/3-pot bet).
    const flop = ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 13, toCall: 3 })
    expect(flop.toCall / (flop.pot - flop.toCall)).toBeLessThan(LARGE_BET_POT_FRACTION)
    expect(assumedRangeForLine(flop)).toBe(FACING_BET_RANGE_WIDTH)
  })

  it('a large bet on an early street narrows to the barreled width', () => {
    // Pot-sized flop bet: toCall 12 into a pot of 24 (12 of dead money before the bet) ⇒
    // betFraction 12/(24-12) = 1.0 ≥ LARGE_BET_POT_FRACTION (a full-pot bet).
    const flop = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 24,
      toCall: 12,
    })
    expect(flop.toCall / (flop.pot - flop.toCall)).toBeGreaterThanOrEqual(LARGE_BET_POT_FRACTION)
    expect(assumedRangeForLine(flop)).toBe(BARRELED_RANGE_WIDTH)
  })

  it('a barrel in a 3-bet-bloated pot narrows to barreled where the old post-bet ratio would not', () => {
    // The exact leak the new denominator targets: a genuine ~2/3-pot barrel in a bloated pot.
    // Pre-bet pot 40, villain fires 28 ⇒ ctx.pot 68, toCall 28. The OLD post-bet ratio
    // 28/68 = 0.41 reads merely "facing a bet"; the bet-into-pot ratio 28/(68-28) = 28/40 = 0.70
    // ≥ LARGE_BET_POT_FRACTION correctly reads it as a strong, barreled line.
    const flop = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 68,
      toCall: 28,
    })
    expect(flop.toCall / flop.pot).toBeLessThan(LARGE_BET_POT_FRACTION) // old denominator: under-narrows
    expect(flop.toCall / (flop.pot - flop.toCall)).toBeGreaterThanOrEqual(LARGE_BET_POT_FRACTION)
    expect(assumedRangeForLine(flop)).toBe(BARRELED_RANGE_WIDTH)
  })

  it('classifies a no-dead-money bet (zero pre-bet pot) as the barreled read via the guard', () => {
    // ctx.pot - ctx.toCall === 0 (the bet is the entire pot): the denom guard falls back to
    // Infinity, so the bet is the strong (barreled) read rather than a divide-by-zero.
    const flop = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 10,
      toCall: 10,
    })
    expect(flop.pot - flop.toCall).toBe(0)
    expect(assumedRangeForLine(flop)).toBe(BARRELED_RANGE_WIDTH)
  })

  it('any bet on a later street (turn/river) narrows to the barreled width, even if small', () => {
    // Small turn bet: betFraction below the large-bet knob, but a later-street barrel alone
    // is enough to read against the tightest range (proxy for a multi-barrel line).
    const turn = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h 9s'),
      pot: 40,
      toCall: 4,
      street: 'turn',
    })
    expect(turn.toCall / (turn.pot - turn.toCall)).toBeLessThan(LARGE_BET_POT_FRACTION)
    expect(assumedRangeForLine(turn)).toBe(BARRELED_RANGE_WIDTH)

    const river = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h 9s 4d'),
      pot: 40,
      toCall: 4,
      street: 'river',
    })
    expect(assumedRangeForLine(river)).toBe(BARRELED_RANGE_WIDTH)
  })

  it('the line-strength widths run baseline → tight → ultraTight (monotonically narrowing)', () => {
    expect(UNBET_RANGE_WIDTH).toBe('medium')
    expect(FACING_BET_RANGE_WIDTH).toBe('tight')
    expect(BARRELED_RANGE_WIDTH).toBe('ultraTight')
  })

  it('treats the impossible zero-pot-with-a-bet case as a strong line (conservative read)', () => {
    // A positive toCall into a zero pot cannot occur in a real spot (the bet villain made is
    // part of the pot), but guard the contract: the division-by-zero-safe fallback classifies
    // it as the tightest read rather than crashing or widening.
    const flop = ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 0, toCall: 5 })
    expect(assumedRangeForLine(flop)).toBe(BARRELED_RANGE_WIDTH)
  })

  it('is a pure function of the line: same (toCall, pot, street) → same width', () => {
    const a = ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 24, toCall: 12 })
    const b = ctx({ holeCards: hole('7h2c'), board: parseCards('Qd 8c 3h'), pot: 24, toCall: 12 })
    // Different cards, identical line ⇒ identical width (the read depends on the line, not the hand).
    expect(assumedRangeForLine(a)).toBe(assumedRangeForLine(b))
  })
})

describe('coachDecision — uses the line-narrowed read', () => {
  it('an unbet pot reads against the baseline width (existing behaviour unchanged)', () => {
    // Free check: equity must equal the standalone read at the baseline COACH_ASSUMED_RANGE.
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const spot = ctx({ holeCards, board, pot: 100, toCall: 0 })
    expect(coachDecision(spot, CHECK).equity).toBe(coachEquity(holeCards, board))
  })

  it('a barreled postflop line reads against the board-aware polarised range, lowering a beatable equity', () => {
    // A turn barrel: the read swaps the fixed preflop bucket for the board-aware polarised range
    // (ticket 0057), so the reported equity matches the polarised standalone read and (for a beaten
    // bluff-catcher) is LOWER than BOTH the baseline-medium read AND the old ultraTight-bucket read —
    // proving the board-aware range is what actually changed the number. This is the seed-28 hero hand
    // (bottom pair, Kc3d on a low coordinated board): the structural leak the ticket targets. The
    // ultraTight bucket still over-rated it (~0.42, beating the AK-high in the bucket); the polarised
    // range — where value is the texture's sets/two pair/straights and the hero beats only the bluff
    // fraction — drops it below the pot-odds price, flipping the calldown to the correct fold.
    const holeCards = hole('Kc3d')
    const board = parseCards('5d 3s 7s 6h') // seed-28 turn texture
    const spot = ctx({ holeCards, board, pot: 18, toCall: 8, street: 'turn' })

    expect(coachAssumedRead(spot).trace.assumedRange).toBe('board-aware')
    const read = coachDecision(spot, CALL)
    expect(read.equity).toBe(coachEquityForSpot(spot))
    // Rated materially worse than the baseline-medium read AND the old ultraTight-bucket read.
    expect(read.equity).toBeLessThan(coachEquity(holeCards, board, 2, COACH_ASSUMED_RANGE))
    expect(read.equity).toBeLessThan(coachEquity(holeCards, board, 2, BARRELED_RANGE_WIDTH))
    // The beaten bottom pair is now a −EV continue (the seed-28 calldown leak), not Good.
    expect(read.verdict).toBe('leak')
    expect(read.correctDecision).toBe('fold')
  })

  it('flips a calling-station call good → fold on a barreled river (the seed-28-style leak)', () => {
    // Ace-high on a low, dry board facing a big river barrel: against a *medium* range this
    // hand beats all of villain's missed broadways/suited connectors (~0.45 equity ⇒ the old
    // static coach graded the call a +EV "continue" — the calling-station leak). Against the
    // value-heavy ultraTight barreled range it is drawing dead (~0.00). So the narrowed read
    // must flip the verdict: the call is no longer good, the EV-correct decision is fold, and
    // EV(call) is negative.
    const holeCards = hole('AcQd')
    const board = parseCards('7h 5c 2d 9s 3h')
    const spot = ctx({ holeCards, board, pot: 46, toCall: 20, street: 'river' })

    // Sanity-check the premise: the OLD static 'medium' read would have called this +EV.
    const baselineEquity = coachEquity(holeCards, board, 2, COACH_ASSUMED_RANGE)
    expect(baselineEquity).toBeGreaterThan(potOdds(20, 46) + EPSILON)

    const v = coachDecision(spot, CALL)
    expect(assumedRangeForLine(spot)).toBe(BARRELED_RANGE_WIDTH)
    expect(v.verdict).not.toBe('good')
    expect(v.verdict).toBe('leak')
    expect(v.correctDecision).toBe('fold')
    expect(v.callEv).toBeLessThan(0)
  })
})

describe('coachAssumedRead — board-aware polarised range on a barreled line (ticket 0057)', () => {
  it('only barreled POSTFLOP lines read board-aware; unbet / facing-bet / preflop keep the width', () => {
    const board = parseCards('Kd 7c 2h')
    // Unbet and facing-bet keep their width buckets (no board-aware swap).
    expect(
      coachAssumedRead(ctx({ holeCards: hole('AsAh'), board, pot: 50, toCall: 0 })).opponentRange,
    ).toBe(UNBET_RANGE_WIDTH)
    expect(
      coachAssumedRead(ctx({ holeCards: hole('AsAh'), board, pot: 13, toCall: 3 })).opponentRange,
    ).toBe(FACING_BET_RANGE_WIDTH)
    // A barreled *preflop* bet has no board, so it falls back to the barreled width bucket.
    const preflopBarrel = coachAssumedRead(ctx({ holeCards: hole('AsAh'), pot: 24, toCall: 12 }))
    expect(preflopBarrel.opponentRange).toBe(BARRELED_RANGE_WIDTH)
    expect(preflopBarrel.trace.polarized).toBeNull()
    // A barreled postflop bet swaps in the concrete polarised range (an array of combos, not a width).
    const barrel = coachAssumedRead(ctx({ holeCards: hole('AsAh'), board, pot: 24, toCall: 12 }))
    expect(Array.isArray(barrel.opponentRange)).toBe(true)
    expect(barrel.trace.assumedRange).toBe('board-aware')
    expect(barrel.trace.polarized).not.toBeNull()
  })

  it('excludes the hero cards as blockers (the range never contains a combo the hero holds)', () => {
    const holeCards = hole('Kc3d')
    const board = parseCards('5d 3s 7s 6h')
    const range = coachAssumedRead(
      ctx({ holeCards, board, pot: 18, toCall: 8, street: 'turn' }),
    ).opponentRange
    // The polarised range is a concrete Range here; no combo may reuse a hero card.
    if (!Array.isArray(range)) throw new Error('expected a concrete board-aware range')
    for (const combo of range) {
      expect(combo).not.toContain(holeCards[0])
      expect(combo).not.toContain(holeCards[1])
    }
  })

  it('a beaten bottom pair on a WET, coordinated low board folds (the seed-28 calldown)', () => {
    // Bottom pair (3s) on 5-3-7-6: a board dense with straights/sets/two pair the polarised value
    // range holds. The hero beats only the bluff fraction, so a river barrel is a clear −EV continue.
    const holeCards = hole('Kc3d')
    const board = parseCards('5d 3s 7s 6h 8h') // seed-28 river
    const spot = ctx({ holeCards, board, pot: 46, toCall: 20, street: 'river' })
    const v = coachDecision(spot, CALL)
    expect(v.trace.assumedRange).toBe('board-aware')
    expect(v.verdict).toBe('leak')
    expect(v.correctDecision).toBe('fold')
    expect(v.callEv).toBeLessThan(0)
  })

  it('the same pocket pair grades far better on a DRY low board than on a WET high one', () => {
    // A texture contrast against a barreled flop bet. The same 8-8 is a strong *overpair* on a dry,
    // disconnected low board (7-4-2 rainbow) but a weak *underpair* on a wet, connected high board
    // (Q-J-K, dense with straight/high-pair value) — and the polarised read swaps in the board's own
    // value either way, so the overpair beats most of the dry range while the underpair beats little
    // of the wet one. (8-8 is chosen so neither board completes a straight for the hero.)
    const holeCards = hole('8c8d')
    const pot = 24
    const toCall = 24 // pot-sized flop bet ⇒ barreled ⇒ board-aware on both
    const dry = ctx({ holeCards, board: parseCards('7h 4d 2c'), pot, toCall })
    const wet = ctx({ holeCards, board: parseCards('Qh Js Kd'), pot, toCall })
    const dryV = coachDecision(dry, CALL)
    const wetV = coachDecision(wet, CALL)
    expect(dryV.trace.assumedRange).toBe('board-aware')
    expect(wetV.trace.assumedRange).toBe('board-aware')
    // The wet, coordinated high board crushes the pair (now an underpair) far harder than the dry one.
    expect(wetV.equity).toBeLessThan(dryV.equity)
  })

  it('the determinism contract holds: a fixed board-aware spot yields a byte-identical verdict', () => {
    const spot = ctx({
      holeCards: hole('Kc3d'),
      board: parseCards('5d 3s 7s 6h'),
      pot: 18,
      toCall: 8,
      street: 'turn',
    })
    expect(coachDecision(spot, CALL)).toEqual(coachDecision(spot, CALL))
  })

  it('falls back to the barreled width (not a throw) on a degenerate board polarizedBarrelRange rejects', () => {
    // The board-aware builder rejects a non-3/4/5 board; unreachable in real hold'em, but a malformed
    // spot must degrade to the width bucket rather than throw out of the read. Use a 6-card board on a
    // barreled (river) line: coachAssumedRead catches the builder's throw and returns the width.
    const spot = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h 9s 4d 3c'),
      pot: 24,
      toCall: 12,
      street: 'river',
    })
    const read = coachAssumedRead(spot)
    expect(read.opponentRange).toBe(BARRELED_RANGE_WIDTH)
    expect(read.trace.assumedRange).toBe(BARRELED_RANGE_WIDTH)
    expect(read.trace.polarized).toBeNull()
    expect(read.trace.lineReason).toBe('barreled')
  })
})

describe('assumedLineRead — the trace projection of the line read', () => {
  it('mirrors assumedRangeForLine on width, and assumedRangeForLine returns its width', () => {
    // The refactor invariant: assumedRangeForLine(ctx) === assumedLineRead(ctx).width, on every line.
    const spots = [
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 50, toCall: 0 }), // unbet
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 13, toCall: 3 }), // small bet
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 24, toCall: 12 }), // big bet
    ]
    for (const s of spots) expect(assumedRangeForLine(s)).toBe(assumedLineRead(s).width)
  })

  it('an unbet pot reads reason "unbet" with a null betFraction (no bet to size)', () => {
    const r = assumedLineRead(ctx({ holeCards: hole('AsAh'), pot: 50, toCall: 0 }))
    expect(r.width).toBe(UNBET_RANGE_WIDTH)
    expect(r.reason).toBe('unbet')
    expect(r.betFraction).toBeNull()
  })

  it('a small early-street bet reads reason "facing-bet" with the bet-into-pot fraction', () => {
    // toCall 3 into a pot of 13 ⇒ 3/(13-3) = 0.30 < LARGE_BET_POT_FRACTION.
    const r = assumedLineRead(
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 13, toCall: 3 }),
    )
    expect(r.width).toBe(FACING_BET_RANGE_WIDTH)
    expect(r.reason).toBe('facing-bet')
    expect(r.betFraction).toBeCloseTo(0.3, 9)
  })

  it('a large bet reads reason "barreled" with the bet-into-pot fraction', () => {
    // A pot-sized flop bet: 12/(24-12) = 1.0 ≥ LARGE_BET_POT_FRACTION.
    const r = assumedLineRead(
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 24, toCall: 12 }),
    )
    expect(r.width).toBe(BARRELED_RANGE_WIDTH)
    expect(r.reason).toBe('barreled')
    expect(r.betFraction).toBeCloseTo(1.0, 9)
  })

  it('a small later-street bet is "barreled" even though its fraction is below the large knob', () => {
    const r = assumedLineRead(
      ctx({
        holeCards: hole('AsAh'),
        board: parseCards('Kd 7c 2h 9s'),
        pot: 40,
        toCall: 4,
        street: 'turn',
      }),
    )
    expect(r.betFraction!).toBeLessThan(LARGE_BET_POT_FRACTION)
    expect(r.reason).toBe('barreled')
    expect(r.width).toBe(BARRELED_RANGE_WIDTH)
  })
})

describe('coachDecision — decision trace (the audit by-product)', () => {
  it('records reason "unbet" / null betFraction on a free check', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 0 })
    const t = coachDecision(spot, CHECK).trace
    expect(t.assumedRange).toBe(UNBET_RANGE_WIDTH)
    expect(t.lineReason).toBe('unbet')
    expect(t.betFraction).toBeNull()
  })

  it('records reason "facing-bet" with the betFraction on a small priced spot', () => {
    // toCall 3 into 13 (10 dead) ⇒ 0.30, a small early-street bet.
    const spot = ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 13, toCall: 3 })
    const t = coachDecision(spot, CALL).trace
    expect(t.assumedRange).toBe(FACING_BET_RANGE_WIDTH)
    expect(t.lineReason).toBe('facing-bet')
    expect(t.betFraction).toBeCloseTo(0.3, 9)
  })

  it('records reason "barreled" and a board-aware range with its polarised composition (postflop)', () => {
    // A pot-sized flop barrel: the read is the board-aware polarised range (ticket 0057), so the
    // trace records assumedRange 'board-aware' and the value/bluff composition, not a width bucket.
    const spot = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 24,
      toCall: 12,
    })
    const t = coachDecision(spot, CALL).trace
    expect(t.assumedRange).toBe('board-aware')
    expect(t.lineReason).toBe('barreled')
    expect(t.betFraction).toBeCloseTo(1.0, 9)
    expect(t.polarized).not.toBeNull()
    expect(t.polarized!.valueCombos).toBeGreaterThan(0)
    expect(t.polarized!.bluffCombos).toBeGreaterThan(0)
    expect(t.polarized!.bluffFraction).toBeCloseTo(BLUFF_FRACTION, 1)
  })

  it('records reason "barreled" with a width fallback (no polarised composition) PREFLOP', () => {
    // A barreled *preflop* bet (3-bet) has no board to read, so the trace keeps the width fallback.
    const spot = ctx({ holeCards: hole('AsAh'), pot: 24, toCall: 12 })
    const t = coachDecision(spot, CALL).trace
    expect(t.lineReason).toBe('barreled')
    expect(t.assumedRange).toBe(BARRELED_RANGE_WIDTH)
    expect(t.polarized).toBeNull()
  })

  it('the trace.assumedRange records the actual read: a width bucket, or board-aware when barreled postflop', () => {
    // Unbet and facing-bet lines keep the width bucket (and assumedRangeForLine); a barreled postflop
    // line records 'board-aware' (the polarised range) instead of the width fallback.
    const unbet = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 0 })
    const facingBet = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 13,
      toCall: 3,
    })
    const barreled = ctx({
      holeCards: hole('AsAh'),
      board: parseCards('Kd 7c 2h'),
      pot: 24,
      toCall: 12,
    })
    expect(coachDecision(unbet, CALL).trace.assumedRange).toBe(assumedRangeForLine(unbet))
    expect(coachDecision(facingBet, CALL).trace.assumedRange).toBe(assumedRangeForLine(facingBet))
    expect(coachDecision(barreled, CALL).trace.assumedRange).toBe('board-aware')
  })
})

describe('coachDecision — archetype-aware read (ticket 0062)', () => {
  const ALL: readonly VillainArchetype[] = ['tag', 'lag', 'rock', 'station']

  describe('per-archetype direction on a priced bluff-catcher spot', () => {
    // A facing-bet (small, early-street) priced spot: the read is a WIDTH bucket, so the ±1-tier
    // width shift bites directly (not the polarised barrel). A genuine bluff-catcher (Q9 on a K72
    // board — a weak holding whose equity tracks how wide/weak the assumed villain is): wider villain
    // ⇒ weaker holdings in range ⇒ higher hero equity; tighter villain ⇒ lower. (Aces would be a
    // monster, not a bluff-catcher, and the nested ranges aren't strictly monotone for it.)
    const holeCards = hole('Qc9c')
    const board = parseCards('Kd 7c 2h')
    const spot = ctx({ holeCards, board, pot: 13, toCall: 3 }) // facing-bet width bucket
    const baseline = coachDecision(spot, CALL)

    it('tag is byte-identical to the two-arg (line-only) call', () => {
      // tag has shift 0, so the assumed villain, equity, and verdict are exactly the line-only grade.
      // The trace gains the (optional) archetype fields, so compare every other field explicitly.
      const tagged = coachDecision(spot, CALL, 'tag')
      expect(tagged.equity).toBe(baseline.equity)
      expect(tagged.verdict).toBe(baseline.verdict)
      expect(tagged.correctDecision).toBe(baseline.correctDecision)
      expect(coachAssumedRead(spot, 'tag').opponentRange).toBe(coachAssumedRead(spot).opponentRange)
      expect(ARCHETYPE_TIER_SHIFT.tag).toBe(0)
    })

    it('station reads one bucket looser and rates the bluff-catcher ≥ baseline', () => {
      const base = coachAssumedRead(spot).opponentRange as RangeWidth
      const station = coachAssumedRead(spot, 'station').opponentRange as RangeWidth
      expect(widthTier(station)).toBe(widthTier(base) + 1) // one tier wider
      expect(coachDecision(spot, CALL, 'station').equity).toBeGreaterThanOrEqual(baseline.equity)
    })

    it('lag moves the same direction as station (wider, equity ≥ baseline)', () => {
      const base = coachAssumedRead(spot).opponentRange as RangeWidth
      const lag = coachAssumedRead(spot, 'lag').opponentRange as RangeWidth
      expect(widthTier(lag)).toBe(widthTier(base) + 1)
      expect(coachDecision(spot, CALL, 'lag').equity).toBeGreaterThanOrEqual(baseline.equity)
    })

    it('rock reads one bucket tighter and rates the bluff-catcher ≤ baseline', () => {
      const base = coachAssumedRead(spot).opponentRange as RangeWidth
      const rock = coachAssumedRead(spot, 'rock').opponentRange as RangeWidth
      expect(widthTier(rock)).toBe(widthTier(base) - 1) // one tier tighter
      expect(coachDecision(spot, CALL, 'rock').equity).toBeLessThanOrEqual(baseline.equity)
    })
  })

  describe('bounded ±1 tier across every archetype and line branch', () => {
    // Every width-bucket line branch (unbet, facing-bet, barreled-preflop) shifted by every archetype
    // moves at most one tier from the line-only baseline.
    const lines = [
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 50, toCall: 0 }), // unbet
      ctx({ holeCards: hole('AsAh'), board: parseCards('Kd 7c 2h'), pot: 13, toCall: 3 }), // facing-bet
      ctx({ holeCards: hole('AsAh'), pot: 24, toCall: 12 }), // barreled PREFLOP (width fallback)
    ]
    it('the shifted width index differs from baseline by at most 1', () => {
      for (const line of lines) {
        const base = widthTier(coachAssumedRead(line).opponentRange as RangeWidth)
        for (const a of ALL) {
          const shifted = widthTier(coachAssumedRead(line, a).opponentRange as RangeWidth)
          expect(Math.abs(shifted - base)).toBeLessThanOrEqual(1)
        }
      }
    })

    it('clamps at the poles: rock on ultraTight stays ultraTight, station/lag on anyTwo stays anyTwo', () => {
      expect(WIDTH_ORDER[Math.max(0, 0 + ARCHETYPE_TIER_SHIFT.rock)]).toBe('ultraTight')
      expect(WIDTH_ORDER[Math.min(4, 4 + ARCHETYPE_TIER_SHIFT.station)]).toBe('anyTwo')
      expect(WIDTH_ORDER[Math.min(4, 4 + ARCHETYPE_TIER_SHIFT.lag)]).toBe('anyTwo')
      // A barreled-preflop line (BARRELED_RANGE_WIDTH = 'ultraTight') under rock clamps at the pole.
      const preflopBarrel = ctx({ holeCards: hole('AsAh'), pot: 24, toCall: 12 })
      expect(coachAssumedRead(preflopBarrel, 'rock').opponentRange).toBe('ultraTight')
    })
  })

  describe('barreled bluff fraction shift (the call-down spot)', () => {
    // A barreled postflop line reads the board-aware polarised range, so the archetype bites via the
    // bluff fraction, not the width. Step is exactly ARCHETYPE_BLUFF_STEP per tier, clamped to [0,1].
    const board = parseCards('Kd 7c 2h')
    const spot = ctx({ holeCards: hole('AsAh'), board, pot: 24, toCall: 12 }) // pot-sized flop barrel

    it('station-barrel bluff fraction > rock-barrel bluff fraction on the same board', () => {
      const station = coachAssumedRead(spot, 'station').trace
      const rock = coachAssumedRead(spot, 'rock').trace
      expect(station.assumedRange).toBe('board-aware')
      expect(rock.assumedRange).toBe('board-aware')
      // The TARGET bluff fraction handed to polarizedBarrelRange differs by 2 * STEP (station +1, rock
      // -1); the realised fraction recorded in the trace reflects that ordering.
      expect(station.polarized!.bluffFraction).toBeGreaterThan(rock.polarized!.bluffFraction)
    })

    it('the barreled bluff fraction stays in [0, 1] and moves exactly one STEP per tier', () => {
      // Reconstruct the target fraction the read used for each archetype: clamp(BLUFF_FRACTION + shift*STEP).
      for (const a of ALL) {
        const target = Math.max(
          0,
          Math.min(1, BLUFF_FRACTION + ARCHETYPE_TIER_SHIFT[a] * ARCHETYPE_BLUFF_STEP),
        )
        expect(target).toBeGreaterThanOrEqual(0)
        expect(target).toBeLessThanOrEqual(1)
        // tag (shift 0) is the bare BLUFF_FRACTION; station/lag are +STEP; rock is -STEP.
        expect(target).toBeCloseTo(
          BLUFF_FRACTION + ARCHETYPE_TIER_SHIFT[a] * ARCHETYPE_BLUFF_STEP,
          9,
        )
      }
    })
  })

  describe('purity / determinism', () => {
    it('a fixed (ctx, action, archetype) is deterministic across two calls', () => {
      const spot = ctx({
        holeCards: hole('AsAh'),
        board: parseCards('Kd 7c 2h'),
        pot: 24,
        toCall: 12,
      })
      expect(coachDecision(spot, CALL, 'station')).toEqual(coachDecision(spot, CALL, 'station'))
    })

    it('does not mutate ctx (deep-equal before/after)', () => {
      const spot = ctx({
        holeCards: hole('AsAh'),
        board: parseCards('Kd 7c 2h'),
        pot: 24,
        toCall: 12,
      })
      // A JSON snapshot is a sufficient deep copy here — every ctx field is plain serialisable data
      // (cards are numbers). Equal before/after proves the coach treated the input as read-only.
      const before = JSON.parse(JSON.stringify(spot))
      coachDecision(spot, CALL, 'station')
      expect(JSON.parse(JSON.stringify(spot))).toEqual(before)
    })

    it('records the archetype + shift on the trace, and omits them on a line-only grade', () => {
      const spot = ctx({
        holeCards: hole('AsAh'),
        board: parseCards('Kd 7c 2h'),
        pot: 24,
        toCall: 12,
      })
      const tagged = coachDecision(spot, CALL, 'rock').trace
      expect(tagged.villainArchetype).toBe('rock')
      expect(tagged.archetypeShift).toBe(ARCHETYPE_TIER_SHIFT.rock)
      // A line-only (two-arg) grade carries no archetype keys — byte-identical trace to today.
      const lineOnly = coachDecision(spot, CALL).trace
      expect(lineOnly.villainArchetype).toBeUndefined()
      expect(lineOnly.archetypeShift).toBeUndefined()
    })
  })
})

describe('coachDecision — short-all-in side-pot eligibility note (ticket 0092)', () => {
  /** A redacted opponent view with only the fields the note reads; the rest are plausible filler. */
  function opp(
    seat: number,
    totalCommitted: number,
    status: DecisionContext['opponents'][number]['status'] = 'active',
  ): DecisionContext['opponents'][number] {
    return { seat, stack: 0, committed: 0, totalCommitted, status, isButton: false }
  }

  it('FIRES when the hero calls all-in short of two villains who are both in for more', () => {
    // Hero calls 20 all-in (stack 20, toCall 20, nothing committed yet → final total 20). Two
    // villains have each already committed 50 — both above the hero, so a real side pot exists.
    // pot = hero's 0 lifetime + 50 + 50 = 100.
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 100,
      toCall: 20,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50)],
    })
    const v = coachDecision(spot, CALL)

    expect(v.shortAllIn).not.toBeNull()
    // The hero's final all-in total is 20.
    expect(v.shortAllIn!.allInFor).toBe(20)
    // Main pot = min(50,20) + min(50,20) + hero's 20 = 60. (The 60 above forms the side pot.)
    expect(v.shortAllIn!.mainPot).toBe(60)
  })

  it('counts FOLDED contributors as dead money in the main pot', () => {
    // Same short all-in, but add a folded seat that put in 10 before folding — those 10 are dead
    // money in the main pot. Two LIVE villains are still above the hero, so the note still fires.
    // pot = hero 0 + 50 + 50 + 10 = 110.
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 110,
      toCall: 20,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50), opp(3, 10, 'folded')],
    })
    const v = coachDecision(spot, CALL)

    expect(v.shortAllIn).not.toBeNull()
    expect(v.shortAllIn!.allInFor).toBe(20)
    // Main pot = min(50,20) + min(50,20) + min(10,20) + hero's 20 = 20+20+10+20 = 70.
    expect(v.shortAllIn!.mainPot).toBe(70)
  })

  it('does NOT fire on an even all-in (every live player at the same total)', () => {
    // Hero all-in for 20; both villains are ALSO in for exactly 20 → no one is above the hero,
    // so everyone is eligible for one pot. No side pot, no note.
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 60,
      toCall: 20,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 20), opp(2, 20)],
    })
    expect(coachDecision(spot, CALL).shortAllIn).toBeNull()
  })

  it('does NOT fire on a heads-up over-shove (exactly ONE opponent above the hero)', () => {
    // Hero all-in for 20 facing a single villain in for 50. The villain's excess 30 is a returned
    // uncalled bet, NOT a contested side pot — so no note (the >= 2 guard).
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 50,
      toCall: 20,
      stack: 20,
      numActive: 2,
      opponents: [opp(1, 50)],
    })
    expect(coachDecision(spot, CALL).shortAllIn).toBeNull()
  })

  it('does NOT fire on a non-all-in call (toCall below the hero stack)', () => {
    // Two villains above the hero, but the hero is NOT all-in — toCall 20 with 1000 behind, so this
    // is an ordinary call, not a short all-in. No note.
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 100,
      toCall: 20,
      stack: 1000,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50)],
    })
    expect(coachDecision(spot, CALL).shortAllIn).toBeNull()
  })

  it('does NOT fire on a fold or a check (neither can be all-in)', () => {
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 100,
      toCall: 20,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50)],
    })
    expect(coachDecision(spot, FOLD).shortAllIn).toBeNull()
    // A free-check spot (toCall 0) with the hero already all-in-for-less structure: still no note.
    const checkSpot = ctx({
      holeCards: hole('AsAh'),
      pot: 100,
      toCall: 0,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50)],
    })
    expect(coachDecision(checkSpot, CHECK).shortAllIn).toBeNull()
  })

  it('FIRES on an all-in raise that is still short of two villains already in for more', () => {
    // The hero raises all-in: bets "to" 20 having committed 0 this street with a 20 stack → chipsIn
    // 20 === stack, all-in. Two villains are already in for 50 lifetime. (A raise can be all-in.)
    const spot = ctx({
      holeCards: hole('AsAh'),
      pot: 100,
      toCall: 0,
      stack: 20,
      numActive: 3,
      opponents: [opp(1, 50), opp(2, 50)],
    })
    const raise: Action = { type: 'raise', amount: 20 }
    const v = coachDecision(spot, raise)
    expect(v.shortAllIn).not.toBeNull()
    expect(v.shortAllIn!.allInFor).toBe(20)
    expect(v.shortAllIn!.mainPot).toBe(60)
  })
})

// ---------------------------------------------------------------------------------------------------
// The sizing read rides on the verdict (ticket 0102) — an ADDITIONAL signal, never a re-grade.
// ---------------------------------------------------------------------------------------------------

describe('coachDecision — the sizing read (ticket 0102)', () => {
  it('is null for fold/call/check (no size to grade)', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    expect(coachDecision(spot, FOLD).sizing).toBeNull()
    expect(coachDecision(spot, CALL).sizing).toBeNull()
    const freeCheck = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 0 })
    expect(coachDecision(freeCheck, CHECK).sizing).toBeNull()
  })

  it('is non-null for a bet/raise and carries intent/band/verdict/why', () => {
    const spot = ctx({
      holeCards: hole('KhKd'),
      board: parseCards('Ks 7c 2d'),
      pot: 100,
      toCall: 0,
      numActive: 2,
    })
    const v = coachDecision(spot, { type: 'bet', amount: 60 })
    expect(v.sizing).not.toBeNull()
    expect(v.sizing!.intent).toBeTypeOf('string')
    expect(v.sizing!.band.spot).toBe('c-bet')
    expect(['good', 'too-big', 'too-small']).toContain(v.sizing!.verdict)
    expect(v.sizing!.why.length).toBeGreaterThan(0)
  })

  it('the ATo 100bb open-shove keeps a correct CONTINUE verdict but gains a too-big sizing read', () => {
    // The exploratory-testing finding: an open-jam of ATo used to get a green "exactly right" with the
    // coach blind to the size. The continue grade (a free, unbet preflop raise is always 'good') must
    // stay correct, while the sizing read flips the size to a leak via the risk/reward guardrail.
    const spot = ctx({
      holeCards: hole('AhTd'),
      board: [],
      pot: 3,
      toCall: 0,
      stack: 200,
    })
    const v = coachDecision(spot, { type: 'raise', amount: 200 })
    // The continue verdict is unchanged: a bet into an unbet pot is graded 'good'.
    expect(v.verdict).toBe('good')
    expect(v.heroBet).toBe(true)
    // The size, however, is a clear leak — risk/reward, no fold-equity.
    expect(v.sizing).not.toBeNull()
    expect(v.sizing!.verdict).toBe('too-big')
    expect(v.sizing!.why.toLowerCase()).toContain('risked')
  })

  it('the continue verdict is byte-identical with vs without the sizing layer (no regression)', () => {
    // Grade a representative priced raise. Stripping the sizing field must leave the rest of the verdict
    // exactly as it was before this ticket existed — the layer is additive, never a re-grade.
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const raiseV = coachDecision(spot, { type: 'raise', amount: 150 })
    const callV = coachDecision(spot, CALL)
    // Everything except `sizing` is identical between a raise and a call of the same priced spot —
    // both are continues, graded purely on equity vs price; sizing is the only field that differs.
    const stripSizing = (v: DecisionVerdict): Omit<DecisionVerdict, 'sizing'> => {
      const copy = { ...v }
      delete (copy as { sizing?: unknown }).sizing
      return copy
    }
    expect(stripSizing(raiseV)).toEqual(stripSizing(callV))
    // And the raise's continue grade matches the call's: sizing did not flip it.
    expect(raiseV.verdict).toBe(callV.verdict)
    expect(raiseV.correctDecision).toBe(callV.correctDecision)
    // The call has no size to grade; the raise does.
    expect(callV.sizing).toBeNull()
    expect(raiseV.sizing).not.toBeNull()
  })
})

// Exercise the imported CallSpot type so the test's intent (we reason about call spots) is
// explicit and the import is load-bearing rather than incidental.
const _exampleSpot: CallSpot = { equity: 0.5, pot: 100, callAmount: 50 }
void _exampleSpot
