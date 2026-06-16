import { describe, expect, it } from 'vitest'
import { parseCards, rankIndex, suitIndex, type Card } from '@holdem/engine'
import { classifyPosition, coachDecision, gradePreflop } from '@holdem/coach'
import { gradeSpot, synthesizeContext, type CoachSpot, type PreflopSpot } from '@holdem/curriculum'
import { generateSpot } from './generate.js'

/** A spread of seeds to exercise the generator across many distinct deals. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

/**
 * A smaller seed slice for the invariants whose grade runs the coach's Monte-Carlo equity read
 * (`coachDecision`, ~4000 iterations per choice). A handful of distinct deals is plenty to prove the
 * no-answer-key invariant — the property is structural, not statistical — and keeps the suite fast.
 */
const COACH_SEEDS = SEEDS.slice(0, 8)

/** Every physical card a spot touches — hole cards plus any board — for the duplicate/legality checks. */
function allCards(spot: CoachSpot | PreflopSpot): Card[] {
  return spot.kind === 'coach'
    ? [...spot.context.holeCards, ...spot.context.board]
    : [...spot.holeCards]
}

/** A card's encoding is valid iff its rank/suit indices are in range — i.e. it is a real 0..51 card. */
function isLegalCard(card: Card): boolean {
  return (
    Number.isInteger(card) &&
    card >= 0 &&
    card < 52 &&
    rankIndex(card) >= 0 &&
    rankIndex(card) < 13 &&
    suitIndex(card) >= 0 &&
    suitIndex(card) < 4
  )
}

describe('generateSpot — determinism', () => {
  it('same seed → identical spot (deep-equal), across kinds and price modes', () => {
    for (const seed of SEEDS) {
      expect(generateSpot(seed)).toEqual(generateSpot(seed))
      expect(generateSpot(seed, { kind: 'preflop' })).toEqual(
        generateSpot(seed, { kind: 'preflop' }),
      )
      expect(generateSpot(seed, { kind: 'coach', priceMode: 'priced' })).toEqual(
        generateSpot(seed, { kind: 'coach', priceMode: 'priced' }),
      )
    }
  })

  it('rejects a non-integer seed', () => {
    expect(() => generateSpot(1.5)).toThrow(RangeError)
  })

  it('omitting the config matches an explicit default config', () => {
    for (const seed of SEEDS) {
      expect(generateSpot(seed)).toEqual(generateSpot(seed, { kind: 'coach', priceMode: 'any' }))
    }
  })
})

describe('generateSpot — card & board legality', () => {
  it('coach spots: distinct, legal cards on a legal flop board', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed) as CoachSpot
      expect(spot.kind).toBe('coach')
      expect(spot.context.board).toHaveLength(3)
      const cards = allCards(spot)
      expect(cards.every(isLegalCard)).toBe(true)
      expect(new Set(cards).size).toBe(cards.length) // no duplicates
      // synthesizeContext is the curriculum's own legality gate — it must accept every generated spot.
      expect(() => synthesizeContext(spot.context)).not.toThrow()
    }
  })

  it('preflop spots: two distinct legal hole cards, empty board, legal geometry', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, { kind: 'preflop' }) as PreflopSpot
      expect(spot.kind).toBe('preflop')
      expect(spot.holeCards).toHaveLength(2)
      expect(spot.holeCards[0]).not.toBe(spot.holeCards[1])
      expect(allCards(spot).every(isLegalCard)).toBe(true)
      expect(spot.numPlayers).toBeGreaterThanOrEqual(2)
      expect(spot.seat).toBeGreaterThanOrEqual(0)
      expect(spot.seat).toBeLessThan(spot.numPlayers)
      expect(spot.buttonIndex).toBeGreaterThanOrEqual(0)
      expect(spot.buttonIndex).toBeLessThan(spot.numPlayers)
    }
  })
})

describe('generateSpot — pot / toCall accounting (the pitfall)', () => {
  it('forwards a consistent pot (before-call dead money) and toCall (chips to add), never summed', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed) as CoachSpot
      const { pot, toCall, numActive } = spot.context
      expect(pot).toBeGreaterThan(0)
      expect(toCall).toBeGreaterThanOrEqual(0)
      // toCall is a fraction (0..1) of the pot it was sized against — so it can never exceed the pot.
      // If the generator had folded toCall into pot, the price would balloon past this bound.
      expect(toCall).toBeLessThanOrEqual(pot)
      expect(numActive).toBeGreaterThanOrEqual(2)
      expect(numActive).toBeLessThanOrEqual(6)
    }
  })

  it("'priced' mode always carries a real (non-zero) price", () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, { kind: 'coach', priceMode: 'priced' }) as CoachSpot
      expect(spot.context.toCall).toBeGreaterThan(0)
    }
  })

  it("'any' mode produces at least one free spot across the seed sweep", () => {
    const anyFree = SEEDS.some((seed) => (generateSpot(seed) as CoachSpot).context.toCall === 0)
    expect(anyFree).toBe(true)
  })

  // The pot convention BUG-fix: `context.pot` is the win-pot the hero would collect — the dead money
  // BEFORE the villain's bet PLUS the villain's bet — exactly as the live engine builds it and the
  // coach reads it (`potOdds` divides by `pot + toCall`; the line read recovers the dead money as
  // `pot - toCall`). A spot dealt with deadPot=100 / fraction=0.5 (a half-pot bet) must therefore
  // carry pot=150, toCall=50 — NOT pot=100 (which graded a half-pot bet as 33% pot odds AND a
  // pot-sized barrel). We assert the convention holds across the generated sweep, then pin a concrete
  // half-pot spot grades as a half-pot bet, never a barrel.
  it('pot is the win-pot (dead money + villain bet): pot - toCall is the dead money the bet faced', () => {
    for (const seed of SEEDS) {
      const { pot, toCall } = (generateSpot(seed) as CoachSpot).context
      const deadMoney = pot - toCall
      // The villain's bet faced positive dead money (a real pot), and on a priced spot the bet is a
      // fraction of that dead money — so toCall is at most the dead money it bet into (a pot-sized bet).
      expect(deadMoney).toBeGreaterThan(0)
      expect(toCall).toBeLessThanOrEqual(deadMoney)
    }
  })

  it('a half-pot bet (deadPot=100, fraction=0.5) → pot=150, toCall=50, graded 25% pot odds, not barreled', () => {
    // Build the exact spot a deadPot=100 / fraction=0.5 deal produces under the corrected convention:
    // toCall = round(100 * 0.5) = 50, pot = 100 + 50 = 150 (the win-pot). This is the convention pin.
    const deadPot = 100
    const fraction = 0.5
    const toCall = Math.round(deadPot * fraction)
    const pot = deadPot + toCall
    expect(pot).toBe(150)
    expect(toCall).toBe(50)

    // A flop spot heads-up: hero holds a bluff-catcher (top pair) on a dry board. The exact cards are
    // immaterial to the convention — what we pin is the LINE READ the coach derives from pot/toCall.
    const spot: CoachSpot = {
      kind: 'coach',
      prompt: 'test',
      choices: [
        { label: 'Call', action: { type: 'call' } },
        { label: 'Fold', action: { type: 'fold' } },
      ],
      context: {
        holeCards: parseCards('Ah Kd') as [Card, Card],
        board: parseCards('As 7c 2d'),
        pot,
        toCall,
        numActive: 2,
      },
    }

    const ctx = synthesizeContext(spot.context)
    const verdict = coachDecision(ctx, spot.choices[0]!.action)

    // The price the coach charges is potOdds(50, 150) = 50/200 = 25% — a half-pot bet is 25% pot odds.
    // Under the OLD pot=100 convention this was 50/150 = 33%, the mis-pricing the bug caused.
    expect(verdict.potOddsThreshold).toBeCloseTo(0.25, 5)

    // And the line read: betFraction = toCall / (pot - toCall) = 50/100 = 0.5 (a half-pot bet), which
    // is BELOW LARGE_BET_POT_FRACTION (0.6), so the villain reads as a small bet ('facing-bet'/'tight')
    // — the small-bet width — NOT a pot-sized barrel ('barreled'/ultra-tight). Under the old convention
    // betFraction was 50/(100-50) = 1.0 ≥ 0.6, so the coach read a barrel and a far tighter villain.
    expect(verdict.trace.betFraction).toBeCloseTo(0.5, 5)
    expect(verdict.trace.lineReason).toBe('facing-bet')
    expect(verdict.trace.assumedRange).not.toBe('board-aware') // not the polarised barrel range
  })
})

describe('generateSpot — preflop seat is never the big blind (the well-posedness fix)', () => {
  // The big-blind seat, in the SAME HU-aware geometry classifyPosition uses: heads-up the BB is the
  // non-button seat (button+1); three-handed+ it is two seats left of the button (button+2).
  function bigBlindSeat(buttonIndex: number, numPlayers: number): number {
    return numPlayers === 2 ? (buttonIndex + 1) % numPlayers : (buttonIndex + 2) % numPlayers
  }

  it('no generated preflop spot seats the hero in the big blind, across many seeds', () => {
    // A wide seed sweep so every table size / button position is exercised. A BB-seated spot would
    // grade as an open/fold where the live coach short-circuits the unraised BB to a free check —
    // exactly the divergence the fix prevents.
    for (const seed of Array.from({ length: 300 }, (_, i) => i + 1)) {
      const spot = generateSpot(seed, { kind: 'preflop' }) as PreflopSpot
      expect(spot.seat).not.toBe(bigBlindSeat(spot.buttonIndex, spot.numPlayers))
      // And the coach must NOT classify the hero's position as big-blind (the belt-and-braces check).
      const position = classifyPosition({
        seat: spot.seat,
        buttonIndex: spot.buttonIndex,
        numPlayers: spot.numPlayers,
        // The rest is inert for classifyPosition (pure seat arithmetic), but the type needs it.
        holeCards: spot.holeCards,
        board: [],
        street: 'preflop',
        legalActions: { fold: true, check: false, call: null, bet: null, raise: null },
        pot: 0,
        currentBet: 0,
        toCall: 0,
        stack: 100,
        committed: 0,
        smallBlind: 1,
        bigBlind: 2,
        isButton: spot.seat === spot.buttonIndex,
        numActive: spot.numPlayers,
        opponents: [],
      })
      expect(position).not.toBe('big-blind')
    }
  })

  it('every non-BB seat is reachable across the seed sweep (the exclusion is the only constraint)', () => {
    // Sanity: excluding the BB must not collapse the seat distribution — over many seeds we still see
    // the hero on the button, in the small blind, and in mid/early seats.
    const positions = new Set<string>()
    for (const seed of Array.from({ length: 300 }, (_, i) => i + 1)) {
      const spot = generateSpot(seed, { kind: 'preflop' }) as PreflopSpot
      positions.add(
        classifyPosition({
          seat: spot.seat,
          buttonIndex: spot.buttonIndex,
          numPlayers: spot.numPlayers,
          holeCards: spot.holeCards,
          board: [],
          street: 'preflop',
          legalActions: { fold: true, check: false, call: null, bet: null, raise: null },
          pot: 0,
          currentBet: 0,
          toCall: 0,
          stack: 100,
          committed: 0,
          smallBlind: 1,
          bigBlind: 2,
          isButton: spot.seat === spot.buttonIndex,
          numActive: spot.numPlayers,
          opponents: [],
        }),
      )
    }
    expect(positions.has('late')).toBe(true) // the button / cutoff
    expect(positions.has('small-blind')).toBe(true) // the SB steal seat is kept
    expect(positions.has('big-blind')).toBe(false) // the BB is the one excluded seat
  })
})

describe('generateSpot — no answer key, honoured end to end', () => {
  // The cardinal invariant: a generated spot stores NO correct flag. Grade EVERY choice through the
  // existing gradeSpot, then prove the choices it marks correct are EXACTLY the ones the deterministic
  // coach (coachDecision / gradePreflop) does not rule a leak — i.e. correctness comes only from the
  // live coach, never from anything the generator stored.
  it('coach spots: every choice graded correct iff the coach does not rule it a leak', () => {
    for (const seed of COACH_SEEDS) {
      const spot = generateSpot(seed) as CoachSpot
      const context = synthesizeContext(spot.context)
      let anyCorrect = false
      spot.choices.forEach((choice, i) => {
        const result = gradeSpot(spot, i)
        // The verdict gradeSpot reports is the coach's ruling on the player's OWN action — so prove
        // the correctness flag is derived from THAT ruling (not a leak), never a key the generator
        // stored. Cross-check it against an independent coachDecision over the same action, so the
        // generated context is genuinely a coach-graded one.
        const coachVerdict = coachDecision(context, choice.action)
        expect(result.correct).toBe(coachVerdict.verdict !== 'leak')
        expect(result.correct).toBe(result.verdict?.verdict !== 'leak')
        if (result.correct) anyCorrect = true
      })
      // A well-posed spot always offers at least one coach-blessed choice (else gradeSpot throws).
      expect(anyCorrect).toBe(true)
    }
  })

  it('preflop spots: every choice graded correct iff the chart does not rule it a leak', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, { kind: 'preflop' }) as PreflopSpot
      const context = synthesizeContext(
        { holeCards: spot.holeCards, board: [], pot: 0, toCall: 0, numActive: spot.numPlayers },
        { seat: spot.seat, buttonIndex: spot.buttonIndex, numPlayers: spot.numPlayers },
      )
      let anyCorrect = false
      spot.choices.forEach((choice, i) => {
        const result = gradeSpot(spot, i)
        const chartVerdict = gradePreflop(context, choice.action)
        expect(result.correct).toBe(chartVerdict.verdict !== 'leak')
        if (result.correct) anyCorrect = true
      })
      expect(anyCorrect).toBe(true)
    }
  })

  it('a generated spot grades through gradeSpot with no thrown error (well-posed)', () => {
    // The coach path runs the Monte-Carlo equity read, so use the smaller slice; the preflop path is a
    // cheap chart lookup, so it sweeps every seed.
    for (const seed of COACH_SEEDS) {
      const coach = generateSpot(seed)
      coach.choices.forEach((_, i) => expect(() => gradeSpot(coach, i)).not.toThrow())
    }
    for (const seed of SEEDS) {
      const pre = generateSpot(seed, { kind: 'preflop' })
      pre.choices.forEach((_, i) => expect(() => gradeSpot(pre, i)).not.toThrow())
    }
  })
})

describe('generateSpot — prompts state the situation, not the answer', () => {
  it('every generated prompt is a non-empty string ending in the open/call question', () => {
    for (const seed of SEEDS) {
      const coach = generateSpot(seed)
      expect(coach.prompt.length).toBeGreaterThan(0)
      expect(coach.prompt).toMatch(/call or fold\?$/)
      const pre = generateSpot(seed, { kind: 'preflop' })
      expect(pre.prompt).toMatch(/open or fold\?$/)
    }
  })
})
