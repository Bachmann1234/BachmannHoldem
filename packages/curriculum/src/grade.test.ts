import { describe, expect, it } from 'vitest'
import { evaluate7, HAND_CATEGORY_NAMES, parseCards, type Card } from '@holdem/engine'
import { potOdds } from '@holdem/odds'
import { coachDecision, gradeSizing, recommendedBand } from '@holdem/coach'
import { pct } from '@holdem/format'
import { gradeSpot } from './grade.js'
import { synthesizeContext } from './spot.js'
import type {
  CalculationSpot,
  CoachSpot,
  DeclarativeSpot,
  HandReadingSpot,
  PreflopSpot,
  SizingSpot,
} from './spot.js'

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

  it('grades an UNRAISED PreflopSpot through the open path (trace.facingRaise === false)', () => {
    // No facingRaiseBb ⇒ the unchanged unraised-open synthesis: gradePreflop reads no raise.
    // `advice` is a PreflopVerdict-only field, so it narrows the union to the preflop trace.
    const res = gradeSpot(BUTTON_PREMIUM, 0)
    const v = res.verdict!
    expect('advice' in v && v.trace.facingRaise).toBe(false)
  })

  it('grades a FACING-RAISE PreflopSpot through the defend path (trace.facingRaise === true)', () => {
    // 76s out of position facing a large 6 BB raise: the defend standard collapses to value only,
    // so folding is correct and calling is the leak — graded through the raise-aware path.
    const facingRaise: PreflopSpot = {
      kind: 'preflop',
      prompt: 'UTG with 76s facing a 6 BB raise — call or fold?',
      choices: [
        { label: 'Call', action: { type: 'call' } },
        { label: 'Fold', action: { type: 'fold' } },
      ],
      holeCards: hole('7h 6h'),
      seat: 0,
      buttonIndex: 3,
      numPlayers: 6,
      facingRaiseBb: 6,
    }
    const call = gradeSpot(facingRaise, 0)
    const v = call.verdict!
    expect('advice' in v && v.trace.facingRaise).toBe(true)
    if ('advice' in v) expect(v.trace.raiseBb).toBe(6)
    expect(call.correct).toBe(false) // calling 76s vs a large raise is the leak
    expect(gradeSpot(facingRaise, 1).correct).toBe(true) // folding is correct
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

describe('gradeSpot — calculation (numeric retrieval, no answer key)', () => {
  // 30 to call into a 90 win-pot → potOdds(30, 90) = 30/120 = 0.25 exactly. Buckets tile [20%,30%) and
  // [30%,40%): under the half-open [lo,hi) convention 0.25 is in the FIRST (correct), so a player who
  // taps [20%,30%) is right and [30%,40%) is the distractor.
  const POT_ODDS_SPOT: CalculationSpot = {
    kind: 'calculation',
    prompt: '30 to call into a 90 pot — what equity do you need?',
    quantity: 'required-equity',
    concept: 'pot-odds',
    choices: [
      { label: '10–20%', lo: 0.1, hi: 0.2 },
      { label: '20–30%', lo: 0.2, hi: 0.3 },
      { label: '30–40%', lo: 0.3, hi: 0.4 },
    ],
    context: {
      holeCards: hole('Ah Kd'),
      board: parseCards('As 7c 2d'),
      pot: 90,
      toCall: 30,
      numActive: 2,
    },
  }

  it('derives the correct bucket from potOdds at grade time — never a stored flag', () => {
    // The math the grade re-runs: potOdds(toCall, pot) — exactly what the coach reports too.
    const value = potOdds(30, 90)
    expect(value).toBeCloseTo(0.25, 9)
    const res = gradeSpot(POT_ODDS_SPOT, 1) // [20%,30%) contains 0.25
    expect(res.correctIndex).toBe(1)
    expect(res.correct).toBe(true)
    expect(res.concept).toBe('pot-odds')
    expect(res.verdict).toBeUndefined() // no coach verdict on a calculation spot
    // The explanation shows the EXACT number and how it's derived, via @holdem/format's pct.
    expect(res.explanation).toContain(pct(value))
    expect(res.explanation).toContain('30/120')
  })

  it('a wrong bucket grades incorrect, still pointing at the derived correct bucket', () => {
    const res = gradeSpot(POT_ODDS_SPOT, 2) // [30%,40%) — too high
    expect(res.correct).toBe(false)
    expect(res.correctIndex).toBe(1)
    expect(res.chosenIndex).toBe(2)
  })

  it("'pot-odds' and 'required-equity' grade against the SAME potOdds value", () => {
    const price: CalculationSpot = { ...POT_ODDS_SPOT, quantity: 'pot-odds' }
    const need: CalculationSpot = { ...POT_ODDS_SPOT, quantity: 'required-equity' }
    expect(gradeSpot(price, 1).correctIndex).toBe(gradeSpot(need, 1).correctIndex)
    expect(gradeSpot(price, 1).correct).toBe(true)
    expect(gradeSpot(need, 1).correct).toBe(true)
  })

  it("'pot-odds' answer equals the coach's potOddsThreshold for the same deal (no divergence)", () => {
    // The cardinal cross-check: the number a calculation spot grades against is the SAME number the
    // live coach would price the deal at — so a drill can never disagree with the coach.
    const ctx = synthesizeContext(POT_ODDS_SPOT.context)
    const threshold = coachDecision(ctx, { type: 'call' }).potOddsThreshold
    expect(threshold).toBeCloseTo(potOdds(30, 90), 9)
  })

  it("grades the 'equity' quantity against the coach's own seeded read", () => {
    // The equity the grade buckets against is coachDecision(...).equity — the live coach's seeded read.
    const ctx = synthesizeContext(POT_ODDS_SPOT.context)
    const equity = coachDecision(ctx, { type: 'call' }).equity
    // Offer a bucket that straddles the coach's equity plus two distractors; the grade must pick it.
    const lo = Math.floor(equity * 10) / 10 // a clean 10%-wide bucket containing the equity
    const equitySpot: CalculationSpot = {
      kind: 'calculation',
      prompt: 'Estimate your equity',
      quantity: 'equity',
      concept: 'equity',
      choices: [
        { label: 'low', lo: 0, hi: lo },
        { label: 'mid', lo, hi: lo + 0.1 },
        { label: 'high', lo: lo + 0.1, hi: 1.0001 },
      ],
      context: POT_ODDS_SPOT.context,
    }
    const res = gradeSpot(equitySpot, 1)
    expect(res.correct).toBe(true) // the coach's equity lands in the [lo, lo+0.1) bucket
    expect(res.correctIndex).toBe(1)
    expect(res.concept).toBe('equity')
  })

  it("grades an 'equity' spot at the ~1.0 boundary into its ceiling bucket, no throw (the 1.0 edge)", () => {
    // Pin the 0.0/1.0 equity boundary AT THE GRADE SEAM: a hero holding the effective nuts (top set of
    // aces) on a dry, low, rainbow board reads ~1.0 equity heads-up. The ceiling bucket must reach a hair
    // past 1.0 (the half-open [lo, hi) containment rule excludes a `hi` of exactly 1.0), so gradeSpot
    // computes the coach's seeded equity, finds the CONTAINING bucket, and grades it — never throwing on a
    // perfectly legal locked-up read. Previously this edge was only covered transitively through the drills
    // package; this exercises it through gradeSpot directly.
    const lockContext = {
      holeCards: hole('As Ah'),
      board: parseCards('Ac 7d 2c'),
      pot: 150,
      toCall: 50,
      numActive: 2,
    }
    const equity = coachDecision(synthesizeContext(lockContext), { type: 'call' }).equity
    expect(equity).toBeGreaterThanOrEqual(0.96) // a near-lock — the band that brushes the 1.0 ceiling

    // Offer a ceiling bucket whose `hi` is a hair past 1.0 (1.0001) so it CONTAINS a value of exactly 1.0,
    // plus two lower distractors — the same tiling the generator builds around a high-equity read.
    const lockSpot: CalculationSpot = {
      kind: 'calculation',
      prompt: 'Estimate your equity',
      quantity: 'equity',
      concept: 'equity',
      choices: [
        { label: '80–88%', lo: 0.8, hi: 0.88 },
        { label: '88–96%', lo: 0.88, hi: 0.96 },
        { label: '96–100%', lo: 0.96, hi: 1.0001 },
      ],
      context: lockContext,
    }
    // The whole point: grading every choice never throws (the ceiling bucket covers the ~1.0 read), and
    // exactly the containing bucket comes back correct.
    const expected = lockSpot.choices.findIndex((c) => equity >= c.lo && equity < c.hi)
    expect(expected).toBeGreaterThanOrEqual(0)
    lockSpot.choices.forEach((_c, i) => {
      expect(() => gradeSpot(lockSpot, i)).not.toThrow()
      const res = gradeSpot(lockSpot, i)
      expect(res.correct).toBe(i === expected)
      expect(res.concept).toBe('equity')
    })
  })

  it('throws RangeError when no offered bucket contains the computed value (ill-posed)', () => {
    const illPosed: CalculationSpot = {
      ...POT_ODDS_SPOT,
      // potOdds is 0.25, but the only buckets offered are far above it — no bucket contains the value.
      choices: [
        { label: '50–60%', lo: 0.5, hi: 0.6 },
        { label: '60–70%', lo: 0.6, hi: 0.7 },
      ],
    }
    expect(() => gradeSpot(illPosed, 0)).toThrow(RangeError)
  })

  it('throws RangeError on an out-of-range chosen index', () => {
    expect(() => gradeSpot(POT_ODDS_SPOT, 3)).toThrow(RangeError)
    expect(() => gradeSpot(POT_ODDS_SPOT, -1)).toThrow(RangeError)
  })
})

describe('gradeSpot — hand-reading (board recognition, ticket 0078)', () => {
  /**
   * Build a hand-reading spot from card text + the offered category labels. The labels are authored by
   * the *test* only to set up the choice menu; correctness is still DERIVED by gradeSpot from evaluate7.
   */
  function handReadingSpot(holeText: string, boardText: string, labels: string[]): HandReadingSpot {
    return {
      kind: 'hand-reading',
      prompt: 'test',
      choices: labels.map((label) => ({ label })),
      holeCards: hole(holeText),
      board: parseCards(boardText),
      concept: 'ranges',
    }
  }

  it('derives the correct category from evaluate7 — never a stored flag', () => {
    // Trips: As Ah + Ac on the board → Three of a Kind. The correct choice is whichever offered label the
    // evaluator's category name matches — computed at grade time, not stored.
    const spot = handReadingSpot('As Ah', 'Ac Kd 7h', ['Pair', 'Three of a Kind', 'Two Pair'])
    const answer = HAND_CATEGORY_NAMES[evaluate7([...spot.holeCards, ...spot.board]).category]
    expect(answer).toBe('Three of a Kind')

    const res = gradeSpot(spot, 1) // "Three of a Kind"
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(1)
    expect(res.concept).toBe('ranges')
    expect(res.verdict).toBeUndefined() // no coach verdict — the evaluator is the authority
    expect(res.explanation).toContain('Three of a Kind')

    // A wrong pick grades incorrect, but correctIndex still points at the derived answer.
    const wrong = gradeSpot(spot, 0) // "Pair"
    expect(wrong.correct).toBe(false)
    expect(wrong.correctIndex).toBe(1)
  })

  it('reads the made hand correctly across streets (flop, turn, river)', () => {
    // A turn (4-card) board: a flush is made once the fourth spade lands.
    const turn = handReadingSpot('As Ks', 'Qs 7s 2d 9s', ['Flush', 'Pair', 'High Card'])
    expect(gradeSpot(turn, 0).correct).toBe(true) // Flush

    // A river (5-card) board: the made hand is read off all seven cards.
    const river = handReadingSpot('As Ks', 'Qs 7s 2d 9s 3h', ['Flush', 'Two Pair', 'Straight'])
    expect(gradeSpot(river, 0).correct).toBe(true) // still the Flush
  })

  it('grades every choice correct iff its label is the evaluator-derived category', () => {
    // The no-answer-key proof at the grade seam: grade EVERY choice and assert exactly the one whose label
    // equals HAND_CATEGORY_NAMES[evaluate7(...).category] comes back correct.
    const spot = handReadingSpot('7c 7d', 'Ah Kd Qs', ['High Card', 'Pair', 'Two Pair'])
    const answer = HAND_CATEGORY_NAMES[evaluate7([...spot.holeCards, ...spot.board]).category]
    spot.choices.forEach((c, i) => {
      expect(gradeSpot(spot, i).correct).toBe(c.label === answer)
    })
  })

  it('throws RangeError when no offered choice matches the true category (ill-posed)', () => {
    // Trips is the truth, but only weaker categories are offered — no choice names it.
    const illPosed = handReadingSpot('As Ah', 'Ac Kd 7h', ['Pair', 'Two Pair', 'High Card'])
    expect(() => gradeSpot(illPosed, 0)).toThrow(RangeError)
  })

  it('throws RangeError on an out-of-range chosen index', () => {
    const spot = handReadingSpot('As Ah', 'Ac Kd 7h', ['Pair', 'Three of a Kind'])
    expect(() => gradeSpot(spot, 2)).toThrow(RangeError)
    expect(() => gradeSpot(spot, -1)).toThrow(RangeError)
  })
})

describe('gradeSpot — sizing (pick the bet size, ticket 0105)', () => {
  // An UNBET postflop spot (toCall === 0): the hero is choosing a *bet* size. We derive the coach's band
  // off the SAME synthesizeContext the grade uses, then offer a ¼-pot (too small) / band-midpoint
  // (in-band) / 1.5×-pot (too big) triple — exactly the shape the generator builds, so the grade test and
  // the generator agree on what "good" means. (Top set on a dry board ⇒ a value bet, band ½–¾ pot.)
  const SIZING_CONTEXT = {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 0,
    numActive: 2,
  } as const

  const band = recommendedBand(synthesizeContext(SIZING_CONTEXT))
  const mid = Math.round((band.toLo + band.toHi) / 2)
  const tooSmall = Math.round(0.25 * SIZING_CONTEXT.pot)
  const tooBig = Math.round(1.5 * SIZING_CONTEXT.pot)

  // choices: [too small, in-band, too big] — index 1 is the in-band ('good') answer.
  const SIZING_SPOT: SizingSpot = {
    kind: 'sizing',
    prompt: "You hold As Ah on Ac Kd 7h. It's checked to you (pot 100). What size?",
    concept: 'pot-odds',
    choices: [
      { label: '¼ pot', toAmount: tooSmall },
      { label: '½ pot', toAmount: mid },
      { label: '1.5× pot', toAmount: tooBig },
    ],
    context: SIZING_CONTEXT,
  }

  it('grades the in-band size correct, deriving the answer from gradeSizing — never a stored flag', () => {
    const res = gradeSpot(SIZING_SPOT, 1)
    expect(res.correctIndex).toBe(1)
    expect(res.correct).toBe(true)
    expect(res.concept).toBe('pot-odds')
    expect(res.verdict).toBeUndefined() // no coach *continue* verdict on a sizing spot
    // The explanation is the chosen (in-band) size's own `why` from the coach — exactly the why play gives.
    const ctx = synthesizeContext(SIZING_CONTEXT)
    const why = gradeSizing(ctx, { type: 'bet', amount: mid })!.why
    expect(res.explanation).toBe(why)
  })

  it("grades a too-big pick incorrect, explained with the coach's OWN too-big why (play parity)", () => {
    const res = gradeSpot(SIZING_SPOT, 2)
    expect(res.correct).toBe(false)
    expect(res.correctIndex).toBe(1)
    expect(res.chosenIndex).toBe(2)
    // The cardinal criterion: an out-of-band pick is explained with the SAME why the coach gives in play.
    const ctx = synthesizeContext(SIZING_CONTEXT)
    const tooBigRead = gradeSizing(ctx, { type: 'bet', amount: tooBig })!
    expect(tooBigRead.verdict).toBe('too-big')
    expect(res.explanation).toBe(tooBigRead.why)
  })

  it("grades a too-small pick incorrect, explained with the coach's OWN too-small why", () => {
    const res = gradeSpot(SIZING_SPOT, 0)
    expect(res.correct).toBe(false)
    expect(res.correctIndex).toBe(1)
    const ctx = synthesizeContext(SIZING_CONTEXT)
    const tooSmallRead = gradeSizing(ctx, { type: 'bet', amount: tooSmall })!
    expect(tooSmallRead.verdict).toBe('too-small')
    expect(res.explanation).toBe(tooSmallRead.why)
  })

  it('throws when no offered size grades good (an ill-posed spot)', () => {
    // Only the two out-of-band sizes offered — no in-band size, so the coach blesses none.
    const noGood: SizingSpot = {
      ...SIZING_SPOT,
      choices: [
        { label: '¼ pot', toAmount: tooSmall },
        { label: '1.5× pot', toAmount: tooBig },
      ],
    }
    expect(() => gradeSpot(noGood, 0)).toThrow(RangeError)
  })

  it('throws RangeError on an out-of-range chosen index', () => {
    expect(() => gradeSpot(SIZING_SPOT, 3)).toThrow(RangeError)
    expect(() => gradeSpot(SIZING_SPOT, -1)).toThrow(RangeError)
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
