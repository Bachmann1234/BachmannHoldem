import { describe, expect, it } from 'vitest'
import { evaluate7, parseCards, rankIndex, HandCategory, type Card } from '@holdem/engine'

import { polarizedBarrelRange } from './boardRange.js'

/** Parse a glued two-card string into a hole-card tuple, e.g. "Kc3d". */
function combo(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/** Whether a concrete range contains a given two-card combo (order-independent). */
function rangeHas(range: readonly (readonly [Card, Card])[], c: readonly [Card, Card]): boolean {
  return range.some((r) => (r[0] === c[0] && r[1] === c[1]) || (r[0] === c[1] && r[1] === c[0]))
}

/** The made category of a combo on a board, via the engine evaluator. */
function categoryOf(c: readonly [Card, Card], board: readonly Card[]): HandCategory {
  return evaluate7([c[0], c[1], ...board]).category
}

describe('polarizedBarrelRange — composition', () => {
  it('keeps two-pair-or-better value (sets, straights) the texture supports', () => {
    const board = parseCards('5d 3s 7s 6h') // wet, coordinated low board
    const { range } = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    // Sets (33, 77) and the straights this 3-5-6-7 board allows are all texture value a preflop
    // bucket cannot express. The board is one card off 3-4-5-6-7, so any 4 completes the straight.
    expect(rangeHas(range, combo('3c3d'))).toBe(true) // set of threes
    expect(rangeHas(range, combo('7d7c'))).toBe(true) // set of sevens
    expect(categoryOf(combo('4c8d'), board)).toBe(HandCategory.Straight)
    expect(rangeHas(range, combo('4c8d'))).toBe(true) // 4 completes 3-4-5-6-7
  })

  it('includes an overpair and top pair as value, but excludes weaker single pairs', () => {
    const board = parseCards('8s 6d 3c') // dry-ish flop, top card the Eight
    const { range } = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    // Overpair (AA) and top pair (A8 → pair of eights, top pair) are value.
    expect(rangeHas(range, combo('AcAd'))).toBe(true)
    expect(rangeHas(range, combo('As8h'))).toBe(true)
    // Second pair (a six) and bottom pair (a three) are checked showdown-value — excluded.
    expect(rangeHas(range, combo('6h5s'))).toBe(false) // pair of sixes (second pair)
    expect(rangeHas(range, combo('3h2s'))).toBe(false) // pair of threes (bottom pair)
  })

  it('treats a hand merely playing the board pair as air, not a made pair (paired board)', () => {
    const board = parseCards('Th Tc 4d') // paired board
    const { range, valueCombos } = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    // KQ has only the board's pair of tens (no pair of its own) → air, bluff-eligible, not value.
    expect(categoryOf(combo('KsQh'), board)).toBe(HandCategory.Pair)
    // The range must NOT collapse to ~all combos (the paired-board pathology): value is a minority.
    expect(valueCombos).toBeLessThan(range.length) // some bluffs were added
    expect(valueCombos).toBeLessThan(600) // far from the ~1081-combo "everything is made" collapse
  })

  it('does not mask a small pocket pair as value on a paired board (pocket pairs judged like an overpair)', () => {
    // On KK5 a small pocket pair (77) makes "two pair" (KK+77) — but it is the same weak showdown hand
    // a 77 is on an unpaired board, so it must be 'medium' (excluded), not value. A set (55 → full
    // house) and an overpair (AA) are still value; an overpair (AA) above the King clears the cut.
    const board = parseCards('Kh Kd 5c')
    const { range } = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    expect(categoryOf(combo('7h7s'), board)).toBe(HandCategory.TwoPair) // KK+77, would mask as value
    expect(rangeHas(range, combo('7h7s'))).toBe(false) // ...but excluded (underpair to the King)
    expect(rangeHas(range, combo('AcAd'))).toBe(true) // overpair → value
    expect(rangeHas(range, combo('5h5s'))).toBe(true) // set (full house) → value

    // Consistency: the same 77 is also 'medium' on an UNPAIRED King-high board — the board pairing
    // must not change the verdict for an equally-weak underpair.
    const unpaired = parseCards('Kh 9d 5c')
    expect(
      rangeHas(polarizedBarrelRange({ board: unpaired, bluffFraction: 0.25 }).range, combo('7h7s')),
    ).toBe(false)
  })

  it('realises the requested bluff fraction (value-heavy: most of the range is value)', () => {
    const board = parseCards('5d 3s 7s 6h')
    const { valueCombos, bluffCombos, bluffFraction } = polarizedBarrelRange({
      board,
      bluffFraction: 0.25,
    })
    expect(bluffFraction).toBeCloseTo(0.25, 2)
    expect(bluffCombos).toBeLessThan(valueCombos) // value-heavy, as a barreller's range should be
  })

  it('a higher bluff fraction adds more air combos (the polarisation dial)', () => {
    const board = parseCards('5d 3s 7s 6h')
    const lean = polarizedBarrelRange({ board, bluffFraction: 0.1 })
    const loose = polarizedBarrelRange({ board, bluffFraction: 0.35 })
    expect(loose.bluffCombos).toBeGreaterThan(lean.bluffCombos)
    expect(lean.valueCombos).toBe(loose.valueCombos) // value is unchanged; only the bluff slice grows
  })

  it('a bluff fraction of 0 yields a pure value range (no bluffs)', () => {
    const board = parseCards('5d 3s 7s 6h')
    const { bluffCombos, bluffFraction } = polarizedBarrelRange({ board, bluffFraction: 0 })
    expect(bluffCombos).toBe(0)
    expect(bluffFraction).toBe(0)
  })
})

describe('polarizedBarrelRange — texture sensitivity (wet vs dry)', () => {
  it('a wet, coordinated board supports more value combos than a dry, disconnected one', () => {
    // Same number of board cards; the connected low board makes far more straights/two pair.
    const wet = polarizedBarrelRange({ board: parseCards('6h 7s 8d'), bluffFraction: 0.25 })
    const dry = polarizedBarrelRange({ board: parseCards('Ad Kc 2h'), bluffFraction: 0.25 })
    expect(wet.valueCombos).toBeGreaterThan(dry.valueCombos)
  })
})

describe('polarizedBarrelRange — blockers and determinism', () => {
  it('never includes a combo that collides with a blocked (hero) card or the board', () => {
    const board = parseCards('5d 3s 7s 6h')
    const hero = combo('Kc3d')
    const { range } = polarizedBarrelRange({
      board,
      bluffFraction: 0.25,
      blocked: new Set(hero),
    })
    const blocked = new Set<Card>([...hero, ...board])
    for (const c of range) {
      expect(blocked.has(c[0])).toBe(false)
      expect(blocked.has(c[1])).toBe(false)
    }
  })

  it('is deterministic: the same board + fraction yields the identical range', () => {
    const board = parseCards('5d 3s 7s 6h')
    const a = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    const b = polarizedBarrelRange({ board, bluffFraction: 0.25 })
    expect(a.range).toEqual(b.range)
    expect(a.valueCombos).toBe(b.valueCombos)
    expect(a.bluffCombos).toBe(b.bluffCombos)
  })
})

describe('polarizedBarrelRange — input validation', () => {
  it('rejects a non-postflop (preflop) board', () => {
    expect(() => polarizedBarrelRange({ board: [], bluffFraction: 0.25 })).toThrow(RangeError)
  })

  it('rejects a bluff fraction outside [0, 1)', () => {
    const board = parseCards('5d 3s 7s')
    expect(() => polarizedBarrelRange({ board, bluffFraction: 1 })).toThrow(RangeError)
    expect(() => polarizedBarrelRange({ board, bluffFraction: -0.1 })).toThrow(RangeError)
  })

  // A sanity probe so the rankIndex import is load-bearing: the wet board's top card is the Eight.
  it('reads board ranks via the engine primitives', () => {
    const board = parseCards('6h 7s 8d')
    const top = Math.max(...board.map(rankIndex))
    expect(top).toBe(rankIndex(parseCards('8c')[0]!))
  })
})
