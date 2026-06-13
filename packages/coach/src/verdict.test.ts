import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import { potOdds, type CallSpot } from '@holdem/odds'
import { estimateEquity, type DecisionContext } from '@holdem/bots'

import {
  coachDecision,
  COACH_ASSUMED_RANGE,
  COACH_SEED,
  EPSILON,
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
}): DecisionContext {
  const board = over.board ?? []
  const legal: LegalActions = { fold: true, check: false, call: null, bet: null, raise: null }
  return {
    seat: 0,
    holeCards: over.holeCards,
    board,
    street: board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : 'turn',
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
    numPlayers: 2,
    numActive: 2,
    opponents: [],
  }
}

/**
 * The exact equity {@link coachDecision} will read for a spot, computed the same way the
 * coach does (same range, same fixed seed). Tests assert against *this* number rather than
 * a hard-coded literal so they stay correct if the Monte-Carlo internals shift, while still
 * pinning the coach's own determinism.
 */
function coachEquity(holeCards: readonly [Card, Card], board: readonly Card[] = []): number {
  return estimateEquity({
    holeCards,
    board,
    opponentRange: COACH_ASSUMED_RANGE,
    seed: COACH_SEED,
  }).equity
}

const FOLD: Action = { type: 'fold' }
const CALL: Action = { type: 'call' }
const CHECK: Action = { type: 'check' }

describe('coachDecision — numbers it reports', () => {
  it('reports equity, the pot-odds threshold, and the chip EV of calling', () => {
    const spot = ctx({ holeCards: hole('AsAh'), pot: 100, toCall: 50 })
    const v = coachDecision(spot, CALL)

    const equity = coachEquity(hole('AsAh'))
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

describe('coachDecision — break-even tolerance band', () => {
  it('a spot within EPSILON of the threshold is breakEven, never a leak', () => {
    // Find a (hand, board) whose coach equity is known, then set toCall so the pot-odds
    // threshold lands within EPSILON of that equity — a deliberate coin-flip.
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const equity = coachEquity(holeCards, board)

    // Solve potOdds(toCall, pot) = equity for toCall given a fixed pot:
    //   equity = toCall / (pot + toCall)  ⇒  toCall = equity*pot / (1 - equity)
    const pot = 100
    const toCall = Math.round((equity * pot) / (1 - equity))
    const spot = ctx({ holeCards, board, pot, toCall })

    const v = coachDecision(spot, CALL)
    expect(Math.abs(v.equity - v.potOddsThreshold)).toBeLessThanOrEqual(EPSILON)
    expect(v.verdict).toBe('breakEven')
    // Folding the same coin-flip is also not a leak.
    expect(coachDecision(spot, FOLD).verdict).toBe('breakEven')
  })

  it('just outside the band on the −EV side flips to a leak', () => {
    const holeCards = hole('AsAh')
    const board = parseCards('Kd 7c 2h')
    const equity = coachEquity(holeCards, board)

    // Push the threshold clearly above equity (beyond EPSILON): make the call too expensive.
    const pot = 100
    // toCall for threshold = equity + 2*EPSILON
    const target = equity + 2 * EPSILON
    const toCall = Math.ceil((target * pot) / (1 - target))
    const spot = ctx({ holeCards, board, pot, toCall })

    const v = coachDecision(spot, CALL)
    expect(v.potOddsThreshold).toBeGreaterThan(v.equity + EPSILON)
    expect(v.verdict).toBe('leak')
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

  it('the assumed range is medium and consistent with a standalone read', () => {
    const holeCards = hole('AsAh')
    const spot = ctx({ holeCards, pot: 100, toCall: 50 })
    const standalone = estimateEquity({
      holeCards,
      board: [],
      opponentRange: COACH_ASSUMED_RANGE,
      seed: COACH_SEED,
    }).equity
    expect(coachDecision(spot, CALL).equity).toBe(standalone)
  })
})

// Exercise the imported CallSpot type so the test's intent (we reason about call spots) is
// explicit and the import is load-bearing rather than incidental.
const _exampleSpot: CallSpot = { equity: 0.5, pot: 100, callAmount: 50 }
void _exampleSpot
