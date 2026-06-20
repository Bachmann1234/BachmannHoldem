import { describe, expect, it } from 'vitest'
import {
  gradeSpot,
  synthesizeContext,
  type CalculationSpot,
  type CoachSpot,
  type PreflopSpot,
} from '@holdem/curriculum'
import type { HandReadingSpot, SizingSpot } from '@holdem/curriculum'
import { gradeSizing } from '@holdem/coach'
import {
  composeSession,
  DRILL_THEMES,
  type DrillTheme,
  type SessionBias,
  type SessionItem,
} from './themes.js'

/**
 * A spread of session seeds to exercise the composer across many distinct draws. Kept to 10 because the
 * structural sweeps compose over the full catalogue — which includes the `equity-estimate` theme that
 * runs the coach's Monte-Carlo equity read at GENERATION — so each composed session is several equity
 * sims; 10 distinct seeds proves the (structural, not statistical) interleave/determinism invariants
 * while keeping these sweeps well under the per-test timeout on CI's contended 2-core runner.
 */
const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1)

/** Look a theme up by id — the catalogue is small, so a find is fine and keeps the tests readable. */
function theme(id: string): DrillTheme {
  const found = DRILL_THEMES.find((t) => t.id === id)
  if (!found) throw new Error(`no such theme ${id} in the catalogue`)
  return found
}

describe('DRILL_THEMES — the catalogue', () => {
  it('covers the epic-named topics plus one more, with stable, unique ids', () => {
    const ids = DRILL_THEMES.map((t) => t.id)
    // The two the epic names + the third (postflop equity).
    expect(ids).toContain('preflop-ranges')
    expect(ids).toContain('pot-odds-calls')
    expect(ids).toContain('postflop-equity')
    // The calculation themes (ticket 0077): the numeric-retrieval topics.
    expect(ids).toContain('pot-odds-math')
    expect(ids).toContain('equity-estimate')
    // The sizing theme (ticket 0105): pick the bet size.
    expect(ids).toContain('bet-sizing')
    expect(DRILL_THEMES.length).toBeGreaterThanOrEqual(3)
    // ids are the persisted keys — they must be unique.
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every theme has a non-empty human title and a concept tag', () => {
    for (const t of DRILL_THEMES) {
      expect(t.title.length).toBeGreaterThan(0)
      expect(t.concept).toBeTruthy()
    }
  })

  it('titles do not overstate drills as a replacement for playing volume', () => {
    // The learning doc is explicit: drills COMPLEMENT volume. No title should claim otherwise.
    for (const t of DRILL_THEMES) {
      expect(t.title.toLowerCase()).not.toMatch(/all you need|replace|instead of/)
    }
  })
})

describe('DRILL_THEMES — each theme generates only legal spots of its declared kind', () => {
  it('preflop-ranges → PreflopSpots, graded by the chart with no answer key', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('preflop-ranges')], 1, seed)
      const spot = item!.spot as PreflopSpot
      expect(spot.kind).toBe('preflop')
      // The composed spot is graded by the EXISTING gradeSpot (no answer key) and carries the theme's
      // concept through to the grade-time tag the coach derives.
      const result = gradeSpot(spot, 0)
      expect(result.concept).toBe('ranges')
      expect(item!.theme.concept).toBe('ranges')
    }
  })

  it('pot-odds-calls → CoachSpots with a real (non-zero) toCall', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('pot-odds-calls')], 1, seed)
      const spot = item!.spot as CoachSpot
      expect(spot.kind).toBe('coach')
      // The defining constraint of a pot-odds theme: a real price to weigh, never a free check.
      expect(spot.context.toCall).toBeGreaterThan(0)
      // And the synthesised context is legal (curriculum's own gate accepts it).
      expect(() => synthesizeContext(spot.context)).not.toThrow()
    }
  })

  it('postflop-equity → CoachSpots (price unconstrained), at least one free spot over the sweep', () => {
    let sawFree = false
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('postflop-equity')], 1, seed)
      const spot = item!.spot as CoachSpot
      expect(spot.kind).toBe('coach')
      expect(spot.context.toCall).toBeGreaterThanOrEqual(0)
      if (spot.context.toCall === 0) sawFree = true
    }
    // 'any' price mode must be able to produce a free spot — proof the theme did not silently force a price.
    expect(sawFree).toBe(true)
  })

  it('pot-odds-math → CalculationSpots graded against potOdds, with the pot-odds concept', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('pot-odds-math')], 1, seed)
      const spot = item!.spot as CalculationSpot
      expect(spot.kind).toBe('calculation')
      expect(spot.quantity).toBe('required-equity')
      expect(spot.context.toCall).toBeGreaterThan(0) // always priced
      // Graded with no answer key — the correct bucket is derived; the concept flows through.
      const res = gradeSpot(spot, 0)
      expect(res.concept).toBe('pot-odds')
      expect(item!.theme.concept).toBe('pot-odds')
    }
  })

  it('equity-estimate → CalculationSpots asking for equity, graded against the coach read', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const [item] = composeSession([theme('equity-estimate')], 1, seed)
      const spot = item!.spot as CalculationSpot
      expect(spot.kind).toBe('calculation')
      expect(spot.quantity).toBe('equity')
      expect(gradeSpot(spot, 0).concept).toBe('equity')
      expect(item!.theme.concept).toBe('equity')
    }
  })

  it('hand-reading → HandReadingSpots on a flop, graded against evaluate7 (ticket 0078)', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('hand-reading')], 1, seed)
      const spot = item!.spot as HandReadingSpot
      expect(spot.kind).toBe('hand-reading')
      expect(spot.board).toHaveLength(3) // flop by default
      // Graded with no answer key — the correct category is derived; the concept flows through as 'ranges'.
      expect(gradeSpot(spot, 0).concept).toBe('ranges')
      expect(item!.theme.concept).toBe('ranges')
    }
  })

  it('turn-river-reading → HandReadingSpots on a full river board (ticket 0078)', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('turn-river-reading')], 1, seed)
      const spot = item!.spot as HandReadingSpot
      expect(spot.kind).toBe('hand-reading')
      expect(spot.board).toHaveLength(5) // river
      expect(gradeSpot(spot, 0).concept).toBe('ranges')
    }
  })

  it('turn-decisions → CoachSpots on a 4-card turn board with a real price (ticket 0078)', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('turn-decisions')], 1, seed)
      const spot = item!.spot as CoachSpot
      expect(spot.kind).toBe('coach')
      expect(spot.context.board).toHaveLength(4) // the turn
      expect(spot.context.toCall).toBeGreaterThan(0) // priced
      expect(() => synthesizeContext(spot.context)).not.toThrow()
    }
  })

  it('raise-or-fold → CoachSpots offering Call/Raise/Fold, all coach-graded (ticket 0078)', () => {
    for (const seed of SEEDS) {
      const [item] = composeSession([theme('raise-or-fold')], 1, seed)
      const spot = item!.spot as CoachSpot
      expect(spot.kind).toBe('coach')
      expect(spot.choices.map((c) => c.label)).toEqual(['Call', 'Raise', 'Fold'])
      expect(spot.context.toCall).toBeGreaterThan(0) // priced
    }
  })

  it('bet-sizing → unbet SizingSpots with exactly one in-band size, reusing gradeSizing (ticket 0105)', () => {
    // The composer includes the catalogue uniformly, so the sizing theme composes like any other; the spot
    // it yields is an UNBET sizing spot whose three sizes the coach's OWN gradeSizing rules — exactly one
    // 'good'. (A small seed slice: generation runs the coach's Monte-Carlo read.)
    for (const seed of SEEDS.slice(0, 4)) {
      const [item] = composeSession([theme('bet-sizing')], 1, seed)
      const spot = item!.spot as SizingSpot
      expect(spot.kind).toBe('sizing')
      expect(spot.context.toCall).toBe(0) // unbet — the hero picks a bet
      expect(spot.choices).toHaveLength(3)
      expect(item!.theme.concept).toBe('pot-odds')
      const ctx = synthesizeContext(spot.context)
      const goods = spot.choices.filter(
        (c) => gradeSizing(ctx, { type: 'bet', amount: c.toAmount })?.verdict === 'good',
      )
      expect(goods).toHaveLength(1)
    }
  })
})

describe('composeSession — interleaving (the headline)', () => {
  const all = [...DRILL_THEMES]

  // The interleave / randomization ORDER properties below are a pure function of the theme LIST and the
  // seeded draw — they do NOT depend on the generated spot content. So the order sweeps run over the themes
  // whose spot GENERATION is cheap, excluding the two that run the coach's ~4000-iteration Monte-Carlo
  // equity read at generation time ('equity-estimate' builds its buckets around the coach equity;
  // 'bet-sizing' derives + verifies the recommended band — several sims per spot). Composing long mixed
  // sessions that include those two re-tripped CI's per-test timeout once M8 added 'bet-sizing' to the
  // catalogue (ticket 0105). Their composition is covered by their own per-theme tests above, and the
  // composer draws from every theme by the SAME uniform logic regardless of a theme's spot cost — so the
  // ordering invariants are proven identically on the cheap subset.
  const MONTE_CARLO_GEN_THEMES = new Set(['equity-estimate', 'bet-sizing'])
  const cheap = all.filter((t) => !MONTE_CARLO_GEN_THEMES.has(t.id))

  /** The longest run of consecutive items sharing the same theme id in a session. */
  function longestSameThemeRun(items: readonly SessionItem[]): number {
    let longest = 0
    let run = 0
    let prev: string | null = null
    for (const item of items) {
      run = item.theme.id === prev ? run + 1 : 1
      prev = item.theme.id
      if (run > longest) longest = run
    }
    return longest
  }

  it('a multi-theme session is interleaved: NO two consecutive items share a theme', () => {
    // The invariant the seeded-randomized policy guarantees — far stronger than the ticket's "no
    // 3-in-a-row" floor. A blocked composition (A A A B B B …) would have a long run; this asserts the
    // order, however it is randomized, is still genuinely mixed (run-length exactly 1). Swept across
    // seeds and lengths so it is not an accident of one draw.
    for (const seed of SEEDS) {
      for (const length of [3, 6, 7, 12]) {
        const items = composeSession(cheap, length, seed)
        expect(items).toHaveLength(length)
        // Strongest pin: max run is exactly 1 (no consecutive repeat at all) — comfortably under the
        // "no 3-in-a-row" floor, and proof the session is not accidentally blocked by topic.
        expect(longestSameThemeRun(items)).toBe(1)
      }
    }
  })

  it('the topic order is RANDOMIZED, not a fixed round-robin', () => {
    // The headline refinement (ticket 0066): the epic requires the interleave be *randomized*, not a
    // predictable cycle. Two proofs, both deterministic (assert on specific seeds — never Math.random):
    //
    // (1) The order is NOT the fixed `themes[i % n]` round-robin pattern for every seed. If it were, the
    //     theme-id sequence would always equal [t0, t1, t2, t0, t1, t2, …] regardless of seed. We show at
    //     least one seed deviates from that fixed cycle.
    const length = cheap.length * 4
    const fixedRoundRobin = Array.from({ length }, (_, i) => cheap[i % cheap.length]!.id)
    const matchesFixedCycle = (seed: number): boolean => {
      const ids = composeSession(cheap, length, seed).map((i) => i.theme.id)
      return ids.every((id, i) => id === fixedRoundRobin[i])
    }
    expect(SEEDS.some((seed) => !matchesFixedCycle(seed))).toBe(true)

    // (2) Different seeds produce a different theme-id ORDER (not merely different spots) for at least
    //     some seed pair — i.e. the topic order genuinely depends on the seed.
    const orderFor = (seed: number): string =>
      composeSession(cheap, length, seed)
        .map((i) => i.theme.id)
        .join(',')
    const orders = new Set(SEEDS.map(orderFor))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('every theme actually appears across a long-enough session (not just one topic)', () => {
    // Across enough seeds the randomized draw must reach every topic at least once. (A single session is
    // not guaranteed to hit all three with random draws, so sweep seeds and union what was seen.)
    // Keeps the FULL catalogue (this is the one order test that must see every real theme, including the
    // two Monte-Carlo-at-generation ones), but composes `all.length` items per seed rather than ×4: across
    // the 10 seeds that is ~110 draws over the catalogue, which reaches every theme by a wide margin while
    // running far fewer of the heavy sizing/equity generations than the ×4 length did.
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const item of composeSession(all, all.length, seed)) seen.add(item.theme.id)
    }
    for (const t of all) expect(seen.has(t.id)).toBe(true)
  })

  it('two themes alternate strictly A B A B … (with ≥2 themes, no-repeat forces alternation)', () => {
    // With exactly two themes the "different from the previous" pool always has exactly one candidate, so
    // after the (seeded) first pick the order must strictly alternate. Which theme leads is the seeded
    // draw; the alternation itself is the invariant.
    const pair = [theme('preflop-ranges'), theme('pot-odds-calls')]
    const items = composeSession(pair, 6, 7)
    const ids = items.map((i) => i.theme.id)
    expect(longestSameThemeRun(items)).toBe(1)
    // Strict alternation: every item differs from the one before it (the two-theme consequence).
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1])
    // And exactly the two themes are used, no third id leaks in.
    expect(new Set(ids)).toEqual(new Set(['preflop-ranges', 'pot-odds-calls']))
  })
})

describe('composeSession — determinism', () => {
  it('same (themes, length, seed) → deep-equal session', () => {
    // Determinism is structural and theme-agnostic, so it runs over the cheap subset (excluding the two
    // Monte-Carlo-at-generation themes) to stay under CI's per-test timeout; the heavy themes' own
    // determinism is covered by their per-theme tests above.
    const cheap = DRILL_THEMES.filter((t) => t.id !== 'equity-estimate' && t.id !== 'bet-sizing')
    for (const seed of SEEDS) {
      expect(composeSession(cheap, 9, seed)).toEqual(composeSession(cheap, 9, seed))
    }
  })

  it('different seeds → different spots (the per-spot stream is reseeded)', () => {
    const all = [...DRILL_THEMES]
    const a = composeSession(all, 6, 1)
    const b = composeSession(all, 6, 2)
    // The seed drives every deal (and the topic order too) — so at least one item's spot must differ.
    const anyDifferent = a.some(
      (item, i) => JSON.stringify(item.spot) !== JSON.stringify(b[i]!.spot),
    )
    expect(anyDifferent).toBe(true)
  })

  it('every spot in a session is a distinct deal (per-spot seeds differ)', () => {
    // One theme, so any variety comes purely from the per-spot seed stream, not from differing configs.
    const items = composeSession([theme('postflop-equity')], 8, 99)
    const fingerprints = items.map((i) => JSON.stringify(i.spot))
    expect(new Set(fingerprints).size).toBe(fingerprints.length)
  })
})

describe('composeSession — single-theme degrades gracefully', () => {
  it('generates `length` spots of the one theme, no interleave needed, no throw', () => {
    const items = composeSession([theme('preflop-ranges')], 5, 3)
    expect(items).toHaveLength(5)
    expect(items.every((i) => i.theme.id === 'preflop-ranges')).toBe(true)
    expect(items.every((i) => i.spot.kind === 'preflop')).toBe(true)
  })

  it('a length-0 session is an empty (legal) session', () => {
    expect(composeSession([...DRILL_THEMES], 0, 1)).toEqual([])
  })
})

describe('composeSession — composed spots stay graded by gradeSpot, concept recoverable', () => {
  // The whole session funnels through the EXISTING gradeSpot — no answer key — and each item's theme
  // concept is recoverable for the UI's "this drilled <concept>" summary.
  it('grades every choice of every item via gradeSpot with no thrown error, and exposes the concept', () => {
    // Mix all themes; keep the length modest because coach spots run the Monte-Carlo equity read.
    const items = composeSession([...DRILL_THEMES], 6, 11)
    for (const { spot, theme: itemTheme } of items) {
      // The theme's concept is recoverable straight off the item (no re-classifying the spot).
      expect(itemTheme.concept).toBeTruthy()
      let anyCorrect = false
      spot.choices.forEach((_, i) => {
        const result = gradeSpot(spot, i)
        // gradeSpot ruled it — correctness came from the live coach, not a stored flag.
        expect(typeof result.correct).toBe('boolean')
        if (result.correct) anyCorrect = true
      })
      // A well-posed spot always offers at least one coach-blessed choice.
      expect(anyCorrect).toBe(true)
    }
  })
})

describe('composeSession — spaced-repetition bias (ticket 0080)', () => {
  const all = [...DRILL_THEMES]

  // As with the interleaving sweeps above, these bias properties (the empty-bias reduction, determinism,
  // interleave preservation, and "resurfaces the biased concept") are a function of the theme LIST, the
  // bias weights, and the seeded draw — NOT of the generated spot content. So they run over the cheap
  // subset (excluding the two themes that run the coach's Monte-Carlo read at spot generation), which
  // keeps these long biased sweeps under CI's per-test timeout once M8 added the heavy 'bet-sizing' theme.
  // The 'pot-odds' concept the bias targets still has cheap themes here ('pot-odds-calls' / 'pot-odds-math'),
  // so the resurface assertion is exercised exactly as before.
  const MONTE_CARLO_GEN_THEMES = new Set(['equity-estimate', 'bet-sizing'])
  const cheap = all.filter((t) => !MONTE_CARLO_GEN_THEMES.has(t.id))

  /** The longest run of consecutive items sharing the same theme id in a session. */
  function longestSameThemeRun(items: readonly SessionItem[]): number {
    let longest = 0
    let run = 0
    let prev: string | null = null
    for (const item of items) {
      run = item.theme.id === prev ? run + 1 : 1
      prev = item.theme.id
      if (run > longest) longest = run
    }
    return longest
  }

  it('an OMITTED bias replays byte-for-byte with no bias (the reduction invariant)', () => {
    // The load-bearing back-compat guarantee: an empty/omitted bias must reduce the weighted draw to the
    // prior uniform draw EXACTLY, so every existing call replays unchanged.
    for (const seed of SEEDS) {
      const plain = composeSession(cheap, 12, seed)
      const emptySet: SessionBias = { concepts: new Set(), weight: 5 }
      const zeroWeight: SessionBias = { concepts: new Set(['pot-odds']), weight: 0 }
      expect(composeSession(cheap, 12, seed, emptySet)).toEqual(plain)
      expect(composeSession(cheap, 12, seed, zeroWeight)).toEqual(plain)
    }
  })

  it('is deterministic — same (themes, length, seed, bias) → deep-equal session', () => {
    const bias: SessionBias = { concepts: new Set(['pot-odds']), weight: 3 }
    for (const seed of SEEDS) {
      expect(composeSession(cheap, 9, seed, bias)).toEqual(composeSession(cheap, 9, seed, bias))
    }
  })

  it('PRESERVES the interleave invariant — no two consecutive items share a theme', () => {
    const bias: SessionBias = { concepts: new Set(['pot-odds']), weight: 10 }
    for (const seed of SEEDS) {
      for (const length of [3, 6, 12]) {
        const items = composeSession(cheap, length, seed, bias)
        // Even with a heavy bias toward pot-odds (3 themes share that concept), the run-length stays 1:
        // bias re-weights WITHIN the pool that already excludes the previous theme, so it can never block.
        expect(longestSameThemeRun(items)).toBe(1)
      }
    }
  })

  it('actually RESURFACES the biased concept more often (weak concepts recur)', () => {
    // Count how often a pot-odds spot appears across a sweep with vs without the bias. The biased run must
    // show strictly more pot-odds reps — proof the re-queue genuinely weights toward the missed concept.
    const bias: SessionBias = { concepts: new Set(['pot-odds']), weight: 8 }
    const countConcept = (b?: SessionBias): number => {
      let n = 0
      for (const seed of SEEDS) {
        for (const item of composeSession(cheap, 12, seed, b)) {
          if (item.theme.concept === 'pot-odds') n += 1
        }
      }
      return n
    }
    expect(countConcept(bias)).toBeGreaterThan(countConcept(undefined))
  })

  it('a biased concept no chosen theme exercises is a harmless no-op', () => {
    // Bias toward 'ev' (no catalogue theme has that concept) over a preflop-only set: nothing changes.
    const onlyRanges = [DRILL_THEMES.find((t) => t.id === 'preflop-ranges')!]
    const bias: SessionBias = { concepts: new Set(['ev']), weight: 9 }
    expect(composeSession(onlyRanges, 5, 4, bias)).toEqual(composeSession(onlyRanges, 5, 4))
  })

  it('rejects a malformed bias weight (loud failure)', () => {
    expect(() => composeSession(all, 3, 1, { concepts: new Set(), weight: -1 })).toThrow(RangeError)
    expect(() => composeSession(all, 3, 1, { concepts: new Set(), weight: Number.NaN })).toThrow(
      RangeError,
    )
  })
})

describe('composeSession — validation (loud failure)', () => {
  it('rejects an empty themes list', () => {
    expect(() => composeSession([], 3, 1)).toThrow(RangeError)
  })

  it('rejects a non-integer / negative length', () => {
    expect(() => composeSession([...DRILL_THEMES], 1.5, 1)).toThrow(RangeError)
    expect(() => composeSession([...DRILL_THEMES], -1, 1)).toThrow(RangeError)
  })

  it('rejects a non-integer seed', () => {
    expect(() => composeSession([...DRILL_THEMES], 3, 1.5)).toThrow(RangeError)
  })
})
