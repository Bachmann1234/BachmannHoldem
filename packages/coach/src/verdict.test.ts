import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import { potOdds, type CallSpot } from '@holdem/odds'
import { estimateEquity, type DecisionContext, type RangeWidth } from '@holdem/bots'

import {
  coachDecision,
  assumedRangeForLine,
  LARGE_BET_POT_FRACTION,
  UNBET_RANGE_WIDTH,
  FACING_BET_RANGE_WIDTH,
  BARRELED_RANGE_WIDTH,
  COACH_ASSUMED_RANGE,
  COACH_SEED,
  EPSILON,
  VALUE_BET_THRESHOLD,
  type DecisionVerdict,
} from './verdict.js'

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
    stack: 1000,
    committed: 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    isButton: true,
    numPlayers: numActive,
    numActive,
    opponents: [],
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
 * The exact equity {@link coachDecision} reads for a *whole spot* — same range (the
 * line-narrowed {@link assumedRangeForLine} width), same seed, same opponent count. Tests
 * that assert "the coach's equity equals a standalone read" use this rather than hard-coding
 * the baseline `'medium'`, so they stay correct now that the read narrows on the line.
 */
function coachEquityForSpot(spot: DecisionContext): number {
  return coachEquity(spot.holeCards, spot.board, spot.numActive, assumedRangeForLine(spot))
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

    // Same high-equity unbet pot, but the hero bet — there is no value missed.
    expect(v.equity).toBeGreaterThanOrEqual(VALUE_BET_THRESHOLD)
    expect(v.missedValueBet).toBe(false)
  })

  it('is never set on a priced spot, even a high-equity one (scoped to the unbet check)', () => {
    // A +EV value call with strong equity: the flag is about over-passivity in an unbet pot,
    // not about priced spots, so it stays false in every toCall > 0 branch.
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    expect(coachDecision(spot, CALL).missedValueBet).toBe(false)
    expect(coachDecision(spot, FOLD).missedValueBet).toBe(false)
  })
})

describe('coachDecision — break-even tolerance band', () => {
  it('a spot within EPSILON of the threshold is breakEven, never a leak', () => {
    // Find a (hand, board) whose coach equity is known, then set toCall so the pot-odds
    // threshold lands within EPSILON of that equity — a deliberate coin-flip. The read
    // narrows on the line, and a coin-flip toCall here is a big bet (→ ultraTight), so we
    // read equity against the width the resulting spot actually uses.
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const pot = 100
    const equity = coachEquity(holeCards, board, 2, BARRELED_RANGE_WIDTH)

    // Solve potOdds(toCall, pot) = equity for toCall given a fixed pot:
    //   equity = toCall / (pot + toCall)  ⇒  toCall = equity*pot / (1 - equity)
    const toCall = Math.round((equity * pot) / (1 - equity))
    const spot = ctx({ holeCards, board, pot, toCall })
    // The big-bet coin-flip toCall narrows to the barreled width, matching `equity` above.
    expect(assumedRangeForLine(spot)).toBe(BARRELED_RANGE_WIDTH)

    const v = coachDecision(spot, CALL)
    expect(Math.abs(v.equity - v.potOddsThreshold)).toBeLessThanOrEqual(EPSILON)
    expect(v.verdict).toBe('breakEven')
    // Folding the same coin-flip is also not a leak.
    expect(coachDecision(spot, FOLD).verdict).toBe('breakEven')
  })

  it('just outside the band on the −EV side flips to a leak', () => {
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const pot = 100
    const equity = coachEquity(holeCards, board, 2, BARRELED_RANGE_WIDTH)

    // Push the threshold clearly above equity (beyond EPSILON): make the call too expensive.
    // toCall for threshold = equity + 2*EPSILON
    const target = equity + 2 * EPSILON
    const toCall = Math.ceil((target * pot) / (1 - target))
    const spot = ctx({ holeCards, board, pot, toCall })

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
    // Same coin-flip construction as the tolerance-band test: priced right on the threshold.
    // The coin-flip toCall is a big bet, so the read narrows to the barreled width.
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const pot = 100
    const equity = coachEquity(holeCards, board, 2, BARRELED_RANGE_WIDTH)
    const toCall = Math.round((equity * pot) / (1 - equity))
    const spot = ctx({ holeCards, board, pot, toCall })

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

  it('a barreled line reads against the narrowed (tighter) width, lowering a beatable equity', () => {
    // A pot-sized turn barrel: the read must use the barreled width, so the reported equity
    // matches the ultraTight standalone read and (for a beatable hand) is LOWER than the
    // baseline-medium read — proving the narrowing actually changed the number. This is the
    // seed-28 hero hand (bottom pair, Kc3d): the static 'medium' read inflated its turn equity
    // to ~0.58; the barreled read drops it materially (toward the ~0.42 ultraTight read).
    const holeCards = hole('Kc3d')
    const board = parseCards('5d 3s 7s 6h') // seed-28 turn texture
    const spot = ctx({ holeCards, board, pot: 18, toCall: 8, street: 'turn' })

    expect(assumedRangeForLine(spot)).toBe(BARRELED_RANGE_WIDTH)
    const narrowed = coachDecision(spot, CALL)
    expect(narrowed.equity).toBe(coachEquity(holeCards, board, 2, BARRELED_RANGE_WIDTH))
    // Against the tighter range the hand is rated materially worse than against the baseline.
    const baseline = coachEquity(holeCards, board, 2, COACH_ASSUMED_RANGE)
    expect(narrowed.equity).toBeLessThan(baseline)
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

// Exercise the imported CallSpot type so the test's intent (we reason about call spots) is
// explicit and the import is load-bearing rather than incidental.
const _exampleSpot: CallSpot = { equity: 0.5, pot: 100, callAmount: 50 }
void _exampleSpot
