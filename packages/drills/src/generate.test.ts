import { describe, expect, it } from 'vitest'
import {
  evaluate7,
  HAND_CATEGORY_NAMES,
  parseCards,
  rankIndex,
  suitIndex,
  type Card,
} from '@holdem/engine'
import { potOdds } from '@holdem/odds'
import { classifyPosition, coachDecision, gradePreflop } from '@holdem/coach'
import {
  gradeSpot,
  synthesizeContext,
  type CalculationSpot,
  type CoachSpot,
  type HandReadingSpot,
  type PreflopSpot,
} from '@holdem/curriculum'
import { buildBuckets, buildCategoryChoices, generateSpot, pickWindowStart } from './generate.js'
import { makeDealer } from './deal.js'

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

describe('generateSpot — calculation spots (numeric retrieval, ticket 0077)', () => {
  /** The three calculation quantities the generator can emit. */
  const QUANTITIES = ['pot-odds', 'required-equity', 'equity'] as const

  it('same seed → identical calculation spot (deep-equal), for every quantity', () => {
    for (const seed of SEEDS) {
      for (const quantity of QUANTITIES) {
        expect(generateSpot(seed, { kind: 'calculation', quantity })).toEqual(
          generateSpot(seed, { kind: 'calculation', quantity }),
        )
      }
    }
  })

  it('omitting the quantity defaults to the pot-odds price', () => {
    for (const seed of SEEDS) {
      expect(generateSpot(seed, { kind: 'calculation' })).toEqual(
        generateSpot(seed, { kind: 'calculation', quantity: 'pot-odds' }),
      )
    }
  })

  it('emits a well-formed, always-priced calculation spot with ≥2 partitioning buckets', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, { kind: 'calculation' }) as CalculationSpot
      expect(spot.kind).toBe('calculation')
      // Always priced — a free spot has degenerate (0) pot odds, so the ask must face a real bet.
      expect(spot.context.toCall).toBeGreaterThan(0)
      // The same win-pot accounting as a coach spot (pot = dead + bet), so the price matches the coach's.
      expect(spot.context.toCall).toBeLessThanOrEqual(spot.context.pot - spot.context.toCall)
      // At least two choices, and the buckets partition cleanly: ascending, gap-free, no overlap.
      expect(spot.choices.length).toBeGreaterThanOrEqual(2)
      spot.choices.forEach((c, i) => {
        expect(c.hi).toBeGreaterThan(c.lo)
        expect(c.lo).toBeGreaterThanOrEqual(0)
        expect(c.hi).toBeLessThanOrEqual(1.0001)
        if (i > 0) expect(c.lo).toBeCloseTo(spot.choices[i - 1]!.hi, 9) // contiguous (no gap/overlap)
      })
    }
  })

  it("the pot-odds answer the grade computes equals the coach's potOddsThreshold for the same deal", () => {
    // The cardinal cross-check: a generated calc spot's pot-odds value is the SAME number the live coach
    // prices the deal at — derived from the spot's own pot/toCall, never stored, never divergent.
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, {
        kind: 'calculation',
        quantity: 'pot-odds',
      }) as CalculationSpot
      const { pot, toCall } = spot.context
      const threshold = coachDecision(synthesizeContext(spot.context), {
        type: 'call',
      }).potOddsThreshold
      expect(potOdds(toCall, pot)).toBeCloseTo(threshold, 9)
    }
  })

  // THE NO-ANSWER-KEY PROOF: a generated calc spot stores no correct flag. Re-compute the value with the
  // app's own math, find the containing bucket, and assert gradeSpot rules EXACTLY that bucket correct —
  // i.e. correctness comes only from the live math, never anything the generator stored.
  it('price quantities: graded correct bucket = the bucket containing potOdds(toCall, pot)', () => {
    for (const seed of SEEDS) {
      for (const quantity of ['pot-odds', 'required-equity'] as const) {
        const spot = generateSpot(seed, { kind: 'calculation', quantity }) as CalculationSpot
        const value = potOdds(spot.context.toCall, spot.context.pot)
        const expected = spot.choices.findIndex((c) => value >= c.lo && value < c.hi)
        expect(expected).toBeGreaterThanOrEqual(0) // the value is always inside an offered bucket
        // Grading EVERY choice: exactly the containing bucket comes back correct.
        spot.choices.forEach((_c, i) => {
          expect(gradeSpot(spot, i).correct).toBe(i === expected)
          expect(gradeSpot(spot, i).correctIndex).toBe(expected)
        })
      }
    }
  })

  it("equity quantity: graded correct bucket = the bucket containing the coach's seeded equity (within tolerance)", () => {
    // The equity read runs the coach's Monte-Carlo, so use the smaller slice. The value is the coach's
    // OWN seeded read, and the bucket width IS the rule-of-2-and-4 tolerance — so the generated spot
    // grades to the computed value's bucket within tolerance, by construction.
    for (const seed of COACH_SEEDS) {
      const spot = generateSpot(seed, {
        kind: 'calculation',
        quantity: 'equity',
      }) as CalculationSpot
      const equity = coachDecision(synthesizeContext(spot.context), { type: 'call' }).equity
      const expected = spot.choices.findIndex((c) => equity >= c.lo && equity < c.hi)
      expect(expected).toBeGreaterThanOrEqual(0)
      spot.choices.forEach((_c, i) => {
        expect(gradeSpot(spot, i).correct).toBe(i === expected)
      })
    }
  })

  it('every generated calculation spot grades through gradeSpot without throwing (well-posed buckets)', () => {
    for (const seed of COACH_SEEDS) {
      for (const quantity of QUANTITIES) {
        const spot = generateSpot(seed, { kind: 'calculation', quantity })
        spot.choices.forEach((_c, i) => expect(() => gradeSpot(spot, i)).not.toThrow())
      }
    }
  })
})

describe('buildBuckets — covers the full [0, 1] range incl. an exact 1.0 lock, no >100% label', () => {
  // The bucket-grade contract: gradeSpot's findContainingBucket uses the half-open `lo <= v < hi` rule
  // (grade.ts). buildBuckets must offer a tiling under which EVERY reachable value — a tiny pot-odds
  // price, a near-coin-flip equity, a near-lock ≥ 0.96, and an EXACT 1.0 flopped lock — lands in exactly
  // one offered bucket, while no bucket's LABEL exceeds 100% and no `hi` renders above 100%. The old
  // buildBuckets emitted a "96–104%" ceiling bucket (an impossible >100% equity) for value ≥ 0.96, and
  // its top bucket of `[…, 1.0)` did not contain a value of exactly 1.0 — so gradeSpot threw on a legal
  // flopped lock. This pins both edges fixed.

  /** grade.ts's containment predicate, replicated so the test grades by the SAME rule the coach uses. */
  function containsUnderGradeRule(c: { lo: number; hi: number }, value: number): boolean {
    return value >= c.lo && value < c.hi
  }

  // A dense sweep across the full closed [0, 1] range, with the dangerous edges explicitly pinned:
  // 0.0 (the floor), ~0.96 / ~0.99 (the near-lock band the old code spilled past 100%), and EXACTLY 1.0.
  const VALUES = [
    0, 0.001, 0.05, 0.0833, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 0.8, 0.88, 0.9, 0.92, 0.95, 0.96,
    0.9599, 0.9601, 0.98, 0.9835, 0.99, 0.999, 1.0,
  ]

  it("every value lands in exactly one offered bucket under grade.ts's `lo <= v < hi` rule", () => {
    for (const value of VALUES) {
      // Sweep several seeds so the seeded window OFFSET is exercised (the correct bucket is not always in
      // the same button position), and the invariant must hold for every placement.
      for (let seed = 1; seed <= 12; seed++) {
        const buckets = buildBuckets(makeDealer(seed), value)
        const matches = buckets.filter((c) => containsUnderGradeRule(c, value))
        expect(matches).toHaveLength(1) // exactly one — never -1 (would throw) and never two (ambiguous)
      }
    }
  })

  it('no offered bucket ever shows a label or `hi` above 100% — even at value 1.0', () => {
    for (const value of VALUES) {
      for (let seed = 1; seed <= 12; seed++) {
        const buckets = buildBuckets(makeDealer(seed), value)
        for (const c of buckets) {
          // The rendered upper bound rounds to at most 100 — never "104%". The label is "lo–hi%".
          const hiPercent = Number(c.label.split('–')[1]!.replace('%', ''))
          expect(hiPercent).toBeLessThanOrEqual(100)
          // And the partition invariant the package already asserts: hi never renders above 100% (the
          // ceiling bucket's hi is a hair past 1 so it CONTAINS 1.0, but stays within the 1.0001 bound).
          expect(c.hi).toBeLessThanOrEqual(1.0001)
          expect(c.lo).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('the ceiling bucket contains a value of EXACTLY 1.0 (a flopped lock grades, never throws)', () => {
    // The half-open rule excludes a `hi` of exactly 1.0, so the ceiling bucket must reach a hair past 1
    // to contain 1.0 — the precise edge the old `[…, 1.0)` top bucket got wrong.
    for (let seed = 1; seed <= 12; seed++) {
      const buckets = buildBuckets(makeDealer(seed), 1.0)
      const top = buckets[buckets.length - 1]!
      expect(containsUnderGradeRule(top, 1.0)).toBe(true)
      expect(top.label).toMatch(/–100%$/) // labelled at the 100% ceiling, not above it
    }
  })
})

describe('generateSpot — a high-equity (≥0.96) calculation spot grades without throwing', () => {
  // The end-to-end pin: a flopped near-lock (AA on an A-high dry board, heads-up) reads ≥ 0.96 equity —
  // the band the old buildBuckets spilled past 100% / could not contain at 1.0. A calculation spot built
  // on it must grade through gradeSpot (which re-computes the coach's seeded equity and finds the
  // containing bucket) with NO thrown RangeError, and rule exactly the containing bucket correct.
  it('an equity calc spot with value ≥ 0.96 grades to its containing bucket, no RangeError', () => {
    // Construct the spot directly so we deterministically exercise the high-equity band end to end (the
    // seeded generator rarely deals a flopped lock, so we pin one rather than hunt for a seed).
    const context = {
      holeCards: parseCards('Ah Ad') as [Card, Card],
      board: parseCards('As 7c 2d'),
      pot: 150,
      toCall: 50,
      numActive: 2,
    }
    const equity = coachDecision(synthesizeContext(context), { type: 'call' }).equity
    expect(equity).toBeGreaterThanOrEqual(0.96) // the band the bug fix is about

    const spot: CalculationSpot = {
      kind: 'calculation',
      prompt: 'test',
      choices: buildBuckets(makeDealer(7), equity),
      quantity: 'equity',
      context,
      concept: 'equity',
    }

    // The whole point: grading every choice never throws (the ceiling bucket covers the read), and
    // exactly the bucket containing the coach's seeded equity comes back correct.
    const expected = spot.choices.findIndex((c) => equity >= c.lo && equity < c.hi)
    expect(expected).toBeGreaterThanOrEqual(0)
    spot.choices.forEach((_c, i) => {
      expect(() => gradeSpot(spot, i)).not.toThrow()
      expect(gradeSpot(spot, i).correct).toBe(i === expected)
    })
  })
})

describe('generateSpot — prompts state the situation, not the answer', () => {
  it('every generated prompt is a non-empty string ending in the open/call question', () => {
    for (const seed of SEEDS) {
      const coach = generateSpot(seed)
      expect(coach.prompt.length).toBeGreaterThan(0)
      expect(coach.prompt).toMatch(/Call or fold\?$/)
      const pre = generateSpot(seed, { kind: 'preflop' })
      expect(pre.prompt).toMatch(/Open or fold\?$/)
      // A calculation prompt states the situation + the number to retrieve, ending in a question mark
      // or the equity-estimate stem — never the answer.
      const calc = generateSpot(seed, { kind: 'calculation' })
      expect(calc.prompt.length).toBeGreaterThan(0)
      expect(calc.prompt).toMatch(/to call\./)
    }
  })
})

describe('generateSpot — turn/river coach spots (ticket 0078)', () => {
  it('deals the requested street board (flop=3, turn=4, river=5); default is flop', () => {
    for (const seed of SEEDS) {
      // The default coach spot is still a flop — byte-identical pre-0078 behaviour.
      expect((generateSpot(seed) as CoachSpot).context.board).toHaveLength(3)
      expect(
        (generateSpot(seed, { kind: 'coach', street: 'flop' }) as CoachSpot).context.board,
      ).toHaveLength(3)
      expect(
        (generateSpot(seed, { kind: 'coach', street: 'turn' }) as CoachSpot).context.board,
      ).toHaveLength(4)
      expect(
        (generateSpot(seed, { kind: 'coach', street: 'river' }) as CoachSpot).context.board,
      ).toHaveLength(5)
    }
  })

  it('omitting the street matches an explicit flop street (byte-identical default)', () => {
    for (const seed of SEEDS) {
      expect(generateSpot(seed, { kind: 'coach', priceMode: 'priced' })).toEqual(
        generateSpot(seed, { kind: 'coach', priceMode: 'priced', street: 'flop' }),
      )
    }
  })

  it('turn/river spots: distinct legal cards, same win-pot accounting as a flop spot', () => {
    for (const street of ['turn', 'river'] as const) {
      for (const seed of SEEDS) {
        const spot = generateSpot(seed, { kind: 'coach', priceMode: 'priced', street }) as CoachSpot
        const cards = [...spot.context.holeCards, ...spot.context.board]
        expect(cards.every(isLegalCard)).toBe(true)
        expect(new Set(cards).size).toBe(cards.length) // no duplicates across the larger board
        // The money model is identical on every street: pot = dead + bet, toCall <= dead money.
        const { pot, toCall } = spot.context
        expect(toCall).toBeGreaterThan(0)
        expect(toCall).toBeLessThanOrEqual(pot - toCall)
        // synthesizeContext accepts the 4-/5-card board (turn/river are legal sizes).
        expect(() => synthesizeContext(spot.context)).not.toThrow()
      }
    }
  })

  it('the coach grades a turn/river continue decision (no answer key, across streets)', () => {
    // The no-answer-key invariant holds on later streets too: grade every choice and assert exactly the
    // coach-blessed ones come back correct, on a turn and a river board.
    for (const street of ['turn', 'river'] as const) {
      for (const seed of COACH_SEEDS) {
        const spot = generateSpot(seed, { kind: 'coach', priceMode: 'priced', street }) as CoachSpot
        const context = synthesizeContext(spot.context)
        let anyCorrect = false
        spot.choices.forEach((choice, i) => {
          const result = gradeSpot(spot, i)
          expect(result.correct).toBe(coachDecision(context, choice.action).verdict !== 'leak')
          if (result.correct) anyCorrect = true
        })
        expect(anyCorrect).toBe(true)
      }
    }
  })
})

describe('generateSpot — richer actions: Call/Raise/Fold (ticket 0078)', () => {
  it('offers Call/Raise/Fold when actions=call-raise-fold; Call/Fold by default', () => {
    for (const seed of SEEDS) {
      const binary = generateSpot(seed, { kind: 'coach', priceMode: 'priced' }) as CoachSpot
      expect(binary.choices.map((c) => c.label)).toEqual(['Call', 'Fold'])

      const triple = generateSpot(seed, {
        kind: 'coach',
        priceMode: 'priced',
        actions: 'call-raise-fold',
      }) as CoachSpot
      expect(triple.choices.map((c) => c.label)).toEqual(['Call', 'Raise', 'Fold'])
      // The richer prompt names the three buttons; the binary prompt names two.
      expect(triple.prompt).toMatch(/Call, raise, or fold\?$/)
    }
  })

  it('same seed → identical Call/Raise/Fold spot (deterministic)', () => {
    for (const seed of SEEDS) {
      const cfg = { kind: 'coach', priceMode: 'priced', actions: 'call-raise-fold' } as const
      expect(generateSpot(seed, cfg)).toEqual(generateSpot(seed, cfg))
    }
  })

  // THE NO-ANSWER-KEY PROOF for the richer set: Raise is graded by the SAME coachDecision as Call — both
  // are continues. Grade every choice and assert correctness is derived entirely from the coach (Raise and
  // Call always agree; both correct when continuing is right, both leaks when folding is). Nothing authored.
  it('every choice graded correct iff the coach does not rule it a leak — Raise grades like Call', () => {
    for (const seed of COACH_SEEDS) {
      const spot = generateSpot(seed, {
        kind: 'coach',
        priceMode: 'priced',
        actions: 'call-raise-fold',
      }) as CoachSpot
      const context = synthesizeContext(spot.context)
      const callIdx = spot.choices.findIndex((c) => c.action.type === 'call')
      const raiseIdx = spot.choices.findIndex((c) => c.action.type === 'raise')
      let anyCorrect = false
      spot.choices.forEach((choice, i) => {
        const result = gradeSpot(spot, i)
        expect(result.correct).toBe(coachDecision(context, choice.action).verdict !== 'leak')
        if (result.correct) anyCorrect = true
      })
      // Raise and Call are graded identically (both non-fold continues) — so whenever one is correct, so
      // is the other. This is what proves the third button is coach-derived, not an authored key.
      expect(gradeSpot(spot, callIdx).correct).toBe(gradeSpot(spot, raiseIdx).correct)
      expect(anyCorrect).toBe(true)
    }
  })
})

describe('generateSpot — hand-reading (board recognition, ticket 0078)', () => {
  /** The nine engine category names — the universe of labels a hand-reading choice may carry. */
  const CATEGORY_NAMES = new Set<string>(HAND_CATEGORY_NAMES)

  it('same seed → identical hand-reading spot (deep-equal), across streets', () => {
    for (const seed of SEEDS) {
      for (const street of ['flop', 'turn', 'river'] as const) {
        expect(generateSpot(seed, { kind: 'hand-reading', street })).toEqual(
          generateSpot(seed, { kind: 'hand-reading', street }),
        )
      }
    }
  })

  it('emits a well-formed hand-reading spot: 2 hole cards, a legal board, category-name choices', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      const boardLen = { flop: 3, turn: 4, river: 5 }[street]
      for (const seed of SEEDS) {
        const spot = generateSpot(seed, { kind: 'hand-reading', street }) as HandReadingSpot
        expect(spot.kind).toBe('hand-reading')
        expect(spot.concept).toBe('ranges')
        expect(spot.holeCards).toHaveLength(2)
        expect(spot.board).toHaveLength(boardLen)
        const cards = [...spot.holeCards, ...spot.board]
        expect(cards.every(isLegalCard)).toBe(true)
        expect(new Set(cards).size).toBe(cards.length) // duplicate-free
        // At least two choices, every label a verbatim HAND_CATEGORY_NAMES string, no duplicate labels.
        expect(spot.choices.length).toBeGreaterThanOrEqual(2)
        const labels = spot.choices.map((c) => c.label)
        labels.forEach((l) => expect(CATEGORY_NAMES.has(l)).toBe(true))
        expect(new Set(labels).size).toBe(labels.length)
      }
    }
  })

  it('always offers the TRUE category among its choices (the answer is reachable)', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const seed of SEEDS) {
        const spot = generateSpot(seed, { kind: 'hand-reading', street }) as HandReadingSpot
        const trueName = HAND_CATEGORY_NAMES[evaluate7([...spot.holeCards, ...spot.board]).category]
        expect(spot.choices.some((c) => c.label === trueName)).toBe(true)
      }
    }
  })

  // THE NO-ANSWER-KEY PROOF: a generated hand-reading spot stores no correct flag. Re-derive the category
  // with the engine's evaluate7, then assert gradeSpot rules EXACTLY the matching label correct — i.e.
  // correctness comes only from the live evaluator, never anything the generator stored.
  it('every choice graded correct iff its label is the evaluate7-derived category', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const seed of SEEDS) {
        const spot = generateSpot(seed, { kind: 'hand-reading', street }) as HandReadingSpot
        const trueName = HAND_CATEGORY_NAMES[evaluate7([...spot.holeCards, ...spot.board]).category]
        const expected = spot.choices.findIndex((c) => c.label === trueName)
        expect(expected).toBeGreaterThanOrEqual(0)
        spot.choices.forEach((_c, i) => {
          expect(gradeSpot(spot, i).correct).toBe(i === expected)
          expect(gradeSpot(spot, i).correctIndex).toBe(expected)
        })
      }
    }
  })

  it('every generated hand-reading spot grades through gradeSpot without throwing (well-posed)', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const seed of SEEDS) {
        const spot = generateSpot(seed, { kind: 'hand-reading', street })
        spot.choices.forEach((_c, i) => expect(() => gradeSpot(spot, i)).not.toThrow())
      }
    }
  })

  it('the prompt states the situation, never the made hand', () => {
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, { kind: 'hand-reading' }) as HandReadingSpot
      expect(spot.prompt.length).toBeGreaterThan(0)
      expect(spot.prompt).toMatch(/best hand you have\?$/)
      // The prompt never names a hand category (that would leak the answer).
      const trueName = HAND_CATEGORY_NAMES[evaluate7([...spot.holeCards, ...spot.board]).category]
      expect(spot.prompt).not.toContain(trueName)
    }
  })
})

describe('buildCategoryChoices — neighbour window always includes the true category, in range', () => {
  // The category-window contract (mirrors buildBuckets): for EVERY category 0..8 and a sweep of seeds, the
  // offered window must (a) include the true category, (b) be contiguous neighbours in ascending rank
  // order, and (c) only ever offer legal category names — no out-of-range rank.
  it('includes the true category and offers only contiguous, legal neighbours, for every category', () => {
    for (let cat = 0; cat < HAND_CATEGORY_NAMES.length; cat++) {
      for (let seed = 1; seed <= 12; seed++) {
        const choices = buildCategoryChoices(makeDealer(seed), cat as never)
        const labels = choices.map((c) => c.label)
        // (a) the true category is present.
        expect(labels).toContain(HAND_CATEGORY_NAMES[cat])
        // (b)+(c) the labels are a contiguous ascending run of real category names.
        const ranks = labels.map((l) => HAND_CATEGORY_NAMES.indexOf(l as never))
        ranks.forEach((r) => expect(r).toBeGreaterThanOrEqual(0))
        for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBe(ranks[i - 1]! + 1)
      }
    }
  })
})

describe('pickWindowStart — the shared seeded-window boundary invariant', () => {
  // The one place the window-placement algorithm (and its ceiling-spill clamp fix) now lives — exercised
  // directly at the three positions that stressed the two former copies: the target at the FLOOR (0), at
  // the CEILING (maxIndex), and in the INTERIOR. For every position, seed, and the two real configurations
  // (CALC_CHOICES over CEILING_BUCKET, HAND_READING_CHOICES over n-1), the returned start must satisfy the
  // contract: the window is wholly in [0, maxIndex] AND contains the target.
  const CASES = [
    { count: 3, maxIndex: 12 }, // CALC_CHOICES over CEILING_BUCKET (= floor(1/0.08))
    { count: 3, maxIndex: 8 }, // HAND_READING_CHOICES over the 0..8 category ladder
  ]

  for (const { count, maxIndex } of CASES) {
    // The floor, the ceiling, and an interior target — the three boundary cases the subtle clamp turns on.
    const targets = [0, Math.floor(maxIndex / 2), maxIndex]
    for (const target of targets) {
      it(`count=${count} maxIndex=${maxIndex} target=${target}: window in-range and contains target`, () => {
        for (let seed = 1; seed <= 20; seed++) {
          const start = pickWindowStart(makeDealer(seed), target, count, maxIndex)
          // (a) the window starts at a legal, non-negative index and fits within [0, maxIndex]…
          expect(start).toBeGreaterThanOrEqual(0)
          expect(start + count - 1).toBeLessThanOrEqual(maxIndex)
          // (b) …and the target is inside it (start <= target <= start + count - 1) — so the correct
          // element is ALWAYS on offer, which is the whole point of the helper.
          expect(target).toBeGreaterThanOrEqual(start)
          expect(target).toBeLessThanOrEqual(start + count - 1)
        }
      })
    }
  }

  it('same seed/args → identical start (pure, seeded)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(pickWindowStart(makeDealer(seed), 5, 3, 12)).toBe(
        pickWindowStart(makeDealer(seed), 5, 3, 12),
      )
    }
  })
})

describe('generateSpot — adaptive difficulty (ticket 0081)', () => {
  /** A wider seed sweep — the difficulty levers are *distributional*, so we need many deals to see the shift. */
  const MANY_SEEDS = Array.from({ length: 200 }, (_, i) => i + 1)

  /** Trailing-zero count of a chip number (capped at 2) — the "roundness" the hard lever weights against. */
  function roundness(n: number): number {
    if (n === 0) return 2
    let zeros = 0
    let v = n
    while (v % 10 === 0 && zeros < 2) {
      zeros += 1
      v = Math.floor(v / 10)
    }
    return zeros
  }

  it("omitting difficulty matches an explicit 'standard' difficulty — BYTE-FOR-BYTE, every kind", () => {
    // THE PIN: the lowest/default difficulty reproduces today's uniform-random selection exactly, so every
    // existing generated spot (and its test) is unchanged. Swept across every kind + the price modes that
    // draw money buckets, since 'standard' must be the prior uniform draw, deal for deal.
    for (const seed of SEEDS) {
      expect(generateSpot(seed)).toEqual(generateSpot(seed, { difficulty: 'standard' }))
      expect(generateSpot(seed, { kind: 'coach', priceMode: 'priced' })).toEqual(
        generateSpot(seed, { kind: 'coach', priceMode: 'priced', difficulty: 'standard' }),
      )
      for (const quantity of ['pot-odds', 'required-equity', 'equity'] as const) {
        expect(generateSpot(seed, { kind: 'calculation', quantity })).toEqual(
          generateSpot(seed, { kind: 'calculation', quantity, difficulty: 'standard' }),
        )
      }
    }
  })

  it("'hard' difficulty is deterministic — same seed → identical spot (deep-equal)", () => {
    for (const seed of SEEDS) {
      const cfg = { kind: 'coach', priceMode: 'priced', difficulty: 'hard' } as const
      expect(generateSpot(seed, cfg)).toEqual(generateSpot(seed, cfg))
      const calc = { kind: 'calculation', quantity: 'pot-odds', difficulty: 'hard' } as const
      expect(generateSpot(seed, calc)).toEqual(generateSpot(seed, calc))
    }
  })

  it("'hard' shifts the pot/price draw toward LESS-round values (the math gets harder)", () => {
    // The distribution shift the lever exists to make: average over many deals, the 'hard' draws are less
    // round (lower trailing-zero count) than the uniform 'standard' draws — so the pot-odds arithmetic is
    // real mental math, not "half of a clean 100". Measured on calculation spots (always priced).
    const avgRoundness = (difficulty: 'standard' | 'hard'): number => {
      let sum = 0
      for (const seed of MANY_SEEDS) {
        const spot = generateSpot(seed, {
          kind: 'calculation',
          quantity: 'pot-odds',
          difficulty,
        }) as CalculationSpot
        // pot - toCall is the dead-money bucket; toCall/(dead) recovers the price fraction. Rank both by
        // roundness and sum — the hard draws should average a lower roundness (gnarlier numbers).
        const dead = spot.context.pot - spot.context.toCall
        sum += roundness(dead) + roundness(spot.context.toCall)
      }
      return sum / MANY_SEEDS.length
    }
    // Strictly less round on average — the hard lever genuinely biases toward the awkward numbers.
    expect(avgRoundness('hard')).toBeLessThan(avgRoundness('standard'))
  })

  it("'hard' still honours the no-answer-key invariant (coach grades every choice)", () => {
    // Difficulty changes which legal spot is dealt, NEVER the correct answer. Grade every choice of a hard
    // coach spot and assert exactly the coach-blessed ones come back correct — the same cardinal proof, on
    // the harder draws.
    for (const seed of COACH_SEEDS) {
      const spot = generateSpot(seed, {
        kind: 'coach',
        priceMode: 'priced',
        difficulty: 'hard',
      }) as CoachSpot
      const context = synthesizeContext(spot.context)
      let anyCorrect = false
      spot.choices.forEach((choice, i) => {
        const result = gradeSpot(spot, i)
        expect(result.correct).toBe(coachDecision(context, choice.action).verdict !== 'leak')
        if (result.correct) anyCorrect = true
      })
      expect(anyCorrect).toBe(true)
    }
  })

  it("'hard' calculation spots still grade to the live potOdds bucket (no answer key)", () => {
    // The no-answer-key proof on the calculation kind under 'hard': the graded-correct bucket is still the
    // one containing the live potOdds(toCall, pot) — the difficulty shifted the deal, not the answer.
    for (const seed of SEEDS) {
      const spot = generateSpot(seed, {
        kind: 'calculation',
        quantity: 'pot-odds',
        difficulty: 'hard',
      }) as CalculationSpot
      const value = potOdds(spot.context.toCall, spot.context.pot)
      const expected = spot.choices.findIndex((c) => value >= c.lo && value < c.hi)
      expect(expected).toBeGreaterThanOrEqual(0)
      spot.choices.forEach((_c, i) => expect(gradeSpot(spot, i).correct).toBe(i === expected))
    }
  })

  it("preflop spots ignore difficulty — they draw no money buckets ('hard' === 'standard')", () => {
    // Preflop reads the chart on holding + seat; there are no pot/price draws for the levers to act on, so
    // a 'hard' preflop spot is byte-identical to a 'standard' one.
    for (const seed of SEEDS) {
      expect(generateSpot(seed, { kind: 'preflop', difficulty: 'hard' })).toEqual(
        generateSpot(seed, { kind: 'preflop' }),
      )
    }
  })
})

describe('postflop generators only ever deal a real (≥3-card) board (the preflop-street defect)', () => {
  // The correctness defect this guards: a postflop generator handed street:'preflop' would deal a 0-card
  // board and crash evaluate7 ('expects 5..7 cards, got 2'). DrillConfig.street is now typed PostflopStreet
  // so that's unrepresentable — and across every LEGAL postflop street, the board is always ≥ 3 cards (a
  // real flop/turn/river), never the empty board a preflop street would have produced.
  it('coach and hand-reading spots deal ≥3 board cards on every legal street', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const seed of SEEDS) {
        const coach = generateSpot(seed, { kind: 'coach', street }) as CoachSpot
        expect(coach.context.board.length).toBeGreaterThanOrEqual(3)
        const reading = generateSpot(seed, { kind: 'hand-reading', street }) as HandReadingSpot
        expect(reading.board.length).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it("generateSpot rejects a 'preflop' street for a postflop spot, never crashing in evaluate7", () => {
    // The runtime guard (resolveConfig) catches a 'preflop' street smuggled past the PostflopStreet type
    // (`as never`), throwing a RangeError BEFORE any 0-card board reaches evaluate7 — for both postflop
    // kinds. Without the fix, the hand-reading path would instead throw the cryptic
    // 'evaluate7 expects 5..7 cards, got 2'.
    for (const kind of ['coach', 'hand-reading'] as const) {
      expect(() => generateSpot(1, { kind, street: 'preflop' as never })).toThrow(RangeError)
    }
  })
})
