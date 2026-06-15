import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { pct } from '@holdem/format'
import { gradeSpot } from './grade.js'
import type { CoachSpot, DeclarativeSpot, PreflopSpot } from './spot.js'

function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

/**
 * A clearly +EV postflop spot: top set on a dry flop at a cheap price — the coach blesses calling
 * and folding is the leak. Choice 0 = Call (correct), choice 1 = Fold (leak).
 */
const STRONG_COACH_SPOT: CoachSpot = {
  kind: 'coach',
  prompt: 'Top set, cheap price — call or fold?',
  choices: [
    { label: 'Call', action: { type: 'call' } },
    { label: 'Fold', action: { type: 'fold' } },
  ],
  context: {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 10,
    numActive: 2,
  },
}

/**
 * A clearly −EV postflop spot: total air facing a pot-sized bet multiway — the coach blesses folding
 * and calling is the leak. Choice 0 = Call (leak), choice 1 = Fold (correct).
 */
const WEAK_COACH_SPOT: CoachSpot = {
  kind: 'coach',
  prompt: 'Air, big price — call or fold?',
  choices: [
    { label: 'Call', action: { type: 'call' } },
    { label: 'Fold', action: { type: 'fold' } },
  ],
  context: {
    holeCards: hole('2c 3d'),
    board: parseCards('As Kd Qh'),
    pot: 50,
    toCall: 200,
    numActive: 3,
  },
}

describe('gradeSpot — coach-graded postflop', () => {
  it('grades the CORRECT choice correct, carrying the verdict and concept', () => {
    const res = gradeSpot(STRONG_COACH_SPOT, 0) // Call
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(0)
    expect(res.chosenIndex).toBe(0)
    expect(res.verdict).toBeDefined()
    expect(res.verdict!.verdict).not.toBe('leak')
    // Priced continue decision → equity-vs-price concept flows through from the coach.
    expect(res.concept).toBe('equity-vs-price')
  })

  it('grades an INCORRECT choice incorrect, with a leak verdict on the chosen action', () => {
    const res = gradeSpot(STRONG_COACH_SPOT, 1) // Fold a +EV spot
    expect(res.correct).toBe(false)
    expect(res.correctIndex).toBe(0)
    expect(res.chosenIndex).toBe(1)
    expect(res.verdict!.verdict).toBe('leak')
  })

  it('rules fold correct when the coach says fold', () => {
    const callRes = gradeSpot(WEAK_COACH_SPOT, 0) // Call air — leak
    expect(callRes.correct).toBe(false)
    expect(callRes.correctIndex).toBe(1) // Fold is correct
    const foldRes = gradeSpot(WEAK_COACH_SPOT, 1) // Fold air — good
    expect(foldRes.correct).toBe(true)
  })

  it('builds the explanation from deterministic numbers (verdict round-trip)', () => {
    const res = gradeSpot(STRONG_COACH_SPOT, 0)
    const v = res.verdict
    // The explanation is the shared @holdem/format wording: the verdict headline + the deterministic
    // "why" line, carrying the actual equity %, the price %, and the chip EV (not invented copy).
    expect(v && 'potOddsThreshold' in v).toBe(true)
    if (v && 'potOddsThreshold' in v) {
      expect(res.explanation).toContain(pct(v.equity))
      expect(res.explanation).toContain(pct(v.potOddsThreshold))
    }
    expect(res.explanation).toMatch(/chips/)
    expect(res.explanation).toMatch(/\+EV/)
  })
})

describe('gradeSpot — correctness is the chosen action grade, not index-equality', () => {
  // Top set on a dry flop at a cheap price: the coach blesses any continue, so BOTH calling and
  // raising are 'good' while folding is the leak. The first non-leak choice is the canonical
  // `correctIndex`, but a player picking the OTHER valid continue must still be graded correct.
  const MULTI_CONTINUE: CoachSpot = {
    kind: 'coach',
    prompt: 'Top set, cheap price — fold, call, or raise?',
    choices: [
      { label: 'Fold', action: { type: 'fold' } },
      { label: 'Call', action: { type: 'call' } },
      { label: 'Raise', action: { type: 'raise', amount: 40 } },
    ],
    context: {
      holeCards: hole('As Ah'),
      board: parseCards('Ac Kd 7h'),
      pot: 100,
      toCall: 10,
      numActive: 2,
    },
  }

  it('grades a second valid continue correct even though it is not correctIndex', () => {
    const raise = gradeSpot(MULTI_CONTINUE, 2) // Raise — also a 'good' continue
    expect(raise.correctIndex).toBe(1) // Call is the first non-leak (canonical answer)
    expect(raise.chosenIndex).toBe(2)
    expect(raise.verdict!.verdict).not.toBe('leak') // the coach blessed the raise
    expect(raise.correct).toBe(true) // …so the player is correct, consistent with the verdict
    // The fold is still the leak.
    expect(gradeSpot(MULTI_CONTINUE, 0).correct).toBe(false)
  })

  it('grades either side of a break-even (coin-flip) spot correct', () => {
    // Equity sits within the coach's EPSILON band of the pot-odds price, so the coach rules every
    // action 'breakEven' (never a leak). Both calling and folding must therefore grade correct.
    const COIN_FLIP: CoachSpot = {
      kind: 'coach',
      prompt: 'Coin-flip price — call or fold?',
      choices: [
        { label: 'Call', action: { type: 'call' } },
        { label: 'Fold', action: { type: 'fold' } },
      ],
      context: {
        holeCards: hole('Ad 5c'),
        board: parseCards('2c 7d 9h'),
        pot: 100,
        // A ~quarter-pot flop bet: the coach narrows the read on the betting line (ticket
        // 0052) to 'tight' here (a small early-street bet), against which A5-high on this dry
        // board sits ~0.18 — and 22-into-100 prices the call at ~0.18 too, a genuine
        // coin-flip within the coach's EPSILON band.
        toCall: 22,
        numActive: 2,
      },
    }
    const call = gradeSpot(COIN_FLIP, 0)
    expect(call.verdict!.verdict).toBe('breakEven') // guard: this really is a coin-flip spot
    expect(call.correct).toBe(true)
    expect(gradeSpot(COIN_FLIP, 1).correct).toBe(true) // folding the coin-flip is fine too
  })
})

describe('gradeSpot — preflop chart-graded', () => {
  const BUTTON_PREMIUM: PreflopSpot = {
    kind: 'preflop',
    prompt: 'On the button with AA — open or fold?',
    choices: [
      { label: 'Open', action: { type: 'raise', amount: 6 } },
      { label: 'Fold', action: { type: 'fold' } },
    ],
    holeCards: hole('As Ah'),
    seat: 1,
    buttonIndex: 1,
    numPlayers: 6,
  }

  it('grades opening a premium hand correct and carries the ranges concept', () => {
    const res = gradeSpot(BUTTON_PREMIUM, 0)
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(0)
    expect(res.concept).toBe('ranges')
    expect(res.verdict).toBeDefined()
    expect(res.explanation.length).toBeGreaterThan(0)
  })

  it('grades folding a premium hand incorrect', () => {
    const res = gradeSpot(BUTTON_PREMIUM, 1)
    expect(res.correct).toBe(false)
    expect(res.verdict!.verdict).toBe('leak')
  })

  it('grades a trash hand: folding is correct, opening is the leak', () => {
    const trash: PreflopSpot = {
      ...BUTTON_PREMIUM,
      prompt: 'UTG with 72o — open or fold?',
      holeCards: hole('7c 2d'),
      seat: 0,
      buttonIndex: 5,
    }
    expect(gradeSpot(trash, 1).correct).toBe(true) // Fold
    expect(gradeSpot(trash, 0).correct).toBe(false) // Open
  })
})

describe('gradeSpot — declarative carve-out', () => {
  const POSITION_SPOT: DeclarativeSpot = {
    kind: 'declarative',
    prompt: 'Which seat acts last postflop?',
    choices: [
      { label: 'The button', correct: true },
      { label: 'Under the gun', correct: false },
    ],
    concept: 'position',
    explanation: 'The button acts last on every postflop street — the positional edge.',
  }

  it('reads the authored correct flag and concept; no coach verdict attached', () => {
    const right = gradeSpot(POSITION_SPOT, 0)
    expect(right.correct).toBe(true)
    expect(right.correctIndex).toBe(0)
    expect(right.concept).toBe('position')
    expect(right.verdict).toBeUndefined()
    expect(right.explanation).toBe(POSITION_SPOT.explanation)

    const wrong = gradeSpot(POSITION_SPOT, 1)
    expect(wrong.correct).toBe(false)
  })

  it('throws when a declarative spot has no correct choice', () => {
    const broken: DeclarativeSpot = {
      ...POSITION_SPOT,
      choices: [
        { label: 'a', correct: false },
        { label: 'b', correct: false },
      ],
    }
    expect(() => gradeSpot(broken, 0)).toThrow(RangeError)
  })
})

describe('gradeSpot — validation', () => {
  it('throws RangeError on an out-of-range chosen index', () => {
    expect(() => gradeSpot(STRONG_COACH_SPOT, 5)).toThrow(RangeError)
    expect(() => gradeSpot(STRONG_COACH_SPOT, -1)).toThrow(RangeError)
    expect(() => gradeSpot(STRONG_COACH_SPOT, 1.5)).toThrow(RangeError)
  })

  it('throws when a coach spot offers no choice the coach grades as correct', () => {
    const onlyLeak: CoachSpot = {
      ...STRONG_COACH_SPOT,
      // Only a fold offered on a clearly +EV spot — every offered action is a leak.
      choices: [{ label: 'Fold', action: { type: 'fold' } }],
    }
    expect(() => gradeSpot(onlyLeak, 0)).toThrow(RangeError)
  })

  it('throws on a malformed spot context (propagated from synthesis)', () => {
    const bad: CoachSpot = {
      ...STRONG_COACH_SPOT,
      context: { ...STRONG_COACH_SPOT.context, pot: -1 },
    }
    expect(() => gradeSpot(bad, 0)).toThrow(RangeError)
  })
})
