import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { exactEquity, parseRange } from '@holdem/odds'
import {
  estimateEquity,
  opponentRangeFor,
  DEFAULT_RANGE_WIDTH,
  DEFAULT_ITERATIONS,
  MAX_EXACT_CARDS_TO_COME,
  type RangeWidth,
} from './handReading.js'

/** Parse a glued or spaced two-card string into a hole-card tuple, e.g. "AhKh". */
function hole(cards: string): readonly [Card, Card] {
  const glued = cards.replace(/\s+/g, '')
  const [a, b] = parseCards(`${glued.slice(0, 2)} ${glued.slice(2, 4)}`)
  return [a!, b!]
}

describe('opponentRangeFor — named range widths', () => {
  const widths: RangeWidth[] = ['ultraTight', 'tight', 'medium', 'loose', 'anyTwo']

  it('produces a non-empty concrete range for every width', () => {
    for (const w of widths) {
      expect(opponentRangeFor(w).length).toBeGreaterThan(0)
    }
  })

  it('orders widths from tighter to wider in combo count', () => {
    const counts = widths.map((w) => opponentRangeFor(w).length)
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThan(counts[i - 1]!)
    }
  })

  it('anyTwo is the full 1,326-combo starting space', () => {
    expect(opponentRangeFor('anyTwo').length).toBe(1326)
  })

  it('ultraTight matches its parseRange expansion (AA,KK,QQ,JJ,AKs,AKo = 4*6 + 4 + 12)', () => {
    expect(opponentRangeFor('ultraTight').length).toBe(parseRange('AA,KK,QQ,JJ,AKs,AKo').length)
  })

  it('throws on an unknown width (JS caller bypassing the type)', () => {
    expect(() => opponentRangeFor('nonsense' as RangeWidth)).toThrow(/unknown range width/)
  })
})

describe('estimateEquity — known spots read plausibly', () => {
  it('a monster (top set on a dry board) reads very high vs a reasonable range', () => {
    // 7c7d on 7s 2h Qd — top set on a dry, rainbow-ish board.
    const eq = estimateEquity({
      holeCards: hole('7c7d'),
      board: parseCards('7s 2h Qd'),
      opponentRange: 'tight',
      seed: 1,
    })
    expect(eq.equity).toBeGreaterThan(0.85)
  })

  it('a weak hand (72o on a board that misses it) reads low vs a tight range', () => {
    // 7h2c on A K Q rainbow — no pair, no draw, against premium holdings.
    const eq = estimateEquity({
      holeCards: hole('7h2c'),
      board: parseCards('As Kd Qh'),
      opponentRange: 'tight',
      seed: 2,
    })
    expect(eq.equity).toBeLessThan(0.2)
  })

  it('reads higher against a wider (weaker) range than against a tight one', () => {
    const board = parseCards('As Kd Qh')
    const tight = estimateEquity({
      holeCards: hole('7h2c'),
      board,
      opponentRange: 'tight',
      seed: 3,
    })
    const wide = estimateEquity({
      holeCards: hole('7h2c'),
      board,
      opponentRange: 'anyTwo',
      seed: 3,
    })
    expect(wide.equity).toBeGreaterThan(tight.equity)
  })
})

describe('estimateEquity — preflop matchup near its textbook number', () => {
  it('AA vs a single combo KK preflop is ~82% (within Monte-Carlo tolerance)', () => {
    // Single explicit combo, preflop (5 cards to come) → samples (too expensive to enumerate).
    const eq = estimateEquity({
      holeCards: hole('AhAd'),
      board: [],
      opponentRange: parseRange('KsKc'),
      seed: 42,
      iterations: 20000,
    })
    // Textbook AA vs KK ≈ 0.82; generous tolerance so the seeded sample never flakes.
    expect(eq.equity).toBeGreaterThan(0.78)
    expect(eq.equity).toBeLessThan(0.86)
  })
})

describe('estimateEquity — exact vs Monte Carlo selection', () => {
  it('a single combo on the turn takes the exact path (matches exactEquity exactly)', () => {
    const heroCards = hole('AhAd')
    const villain = hole('KsKc')
    const board = parseCards('2h 7d 9c Ts')
    // iterations:1 would be a terrible sample — if this matched exactEquity it can only be
    // because the exact path was taken (it ignores iterations).
    const eq = estimateEquity({
      holeCards: heroCards,
      board,
      opponentRange: parseRange('KsKc'),
      seed: 999,
      iterations: 1,
    })
    const [exact] = exactEquity({ hands: [heroCards, villain], board })
    expect(eq).toEqual(exact)
  })

  it('a single combo on the river takes the exact path (no cards to come)', () => {
    const heroCards = hole('AhAd')
    const villain = hole('KsKc')
    const board = parseCards('2h 7d 9c Ts 3d')
    const eq = estimateEquity({
      holeCards: heroCards,
      board,
      opponentRange: parseRange('KsKc'),
      iterations: 1,
    })
    const [exact] = exactEquity({ hands: [heroCards, villain], board })
    expect(eq).toEqual(exact)
    expect(eq.equity).toBe(1) // AA outright beats KK on this dry board
  })

  it('MAX_EXACT_CARDS_TO_COME is the turn/river boundary (=1)', () => {
    expect(MAX_EXACT_CARDS_TO_COME).toBe(1)
  })
})

describe('estimateEquity — determinism', () => {
  it('same input + seed yields byte-identical equity', () => {
    const args = {
      holeCards: hole('JhTh'),
      board: parseCards('9h 8c 2d'),
      opponentRange: 'medium' as const,
      seed: 7,
      iterations: 2000,
    }
    const a = estimateEquity(args)
    const b = estimateEquity(args)
    expect(a).toEqual(b)
  })

  it('different seeds give (slightly) different samples', () => {
    const base = {
      holeCards: hole('JhTh'),
      board: parseCards('9h 8c 2d'),
      opponentRange: 'medium' as const,
      iterations: 2000,
    }
    const a = estimateEquity({ ...base, seed: 1 })
    const b = estimateEquity({ ...base, seed: 2 })
    expect(a.equity).not.toBe(b.equity)
  })
})

describe('estimateEquity — opponent range polymorphism & defaults', () => {
  it('defaults to the DEFAULT_RANGE_WIDTH range when opponentRange is omitted', () => {
    const explicit = estimateEquity({
      holeCards: hole('AhKh'),
      board: parseCards('Qh Jh 2c'),
      opponentRange: DEFAULT_RANGE_WIDTH,
      seed: 5,
    })
    const omitted = estimateEquity({
      holeCards: hole('AhKh'),
      board: parseCards('Qh Jh 2c'),
      seed: 5,
    })
    expect(omitted).toEqual(explicit)
  })

  it('accepts a raw range string', () => {
    const eq = estimateEquity({
      holeCards: hole('AhKh'),
      board: parseCards('Qh Jh 2c'),
      opponentRange: 'AA, KK, QQ',
      seed: 6,
    })
    expect(eq.equity).toBeGreaterThanOrEqual(0)
    expect(eq.equity).toBeLessThanOrEqual(1)
  })

  it('accepts an already-parsed Range', () => {
    const eq = estimateEquity({
      holeCards: hole('AhKh'),
      board: parseCards('Qh Jh 2c'),
      opponentRange: parseRange('AA, KK'),
      seed: 6,
    })
    expect(eq.equity).toBeGreaterThanOrEqual(0)
  })

  it('DEFAULT_ITERATIONS is a positive integer', () => {
    expect(Number.isInteger(DEFAULT_ITERATIONS)).toBe(true)
    expect(DEFAULT_ITERATIONS).toBeGreaterThan(0)
  })
})

describe('estimateEquity — collisions & validation', () => {
  it('prunes range combos that collide with the bot cards / board (KK still readable when hero holds a king)', () => {
    // Hero holds Ks; villain "KK" loses the Ks combo but the other 3 K-pairs remain.
    const eq = estimateEquity({
      holeCards: hole('KsAd'),
      board: [],
      opponentRange: parseRange('KK'),
      seed: 8,
      iterations: 1000,
    })
    expect(eq.equity).toBeGreaterThanOrEqual(0)
    expect(eq.equity).toBeLessThanOrEqual(1)
  })

  it('throws when every assumed combo collides with the known cards', () => {
    // Villain can only hold AsAd; hero holds As, so no combo survives.
    expect(() =>
      estimateEquity({
        holeCards: hole('AsKc'),
        board: [],
        opponentRange: parseRange('AsAd'),
        seed: 1,
      }),
    ).toThrow(/every assumed opponent combo collides/)
  })

  it('throws on a duplicate card between hole cards and board', () => {
    expect(() =>
      estimateEquity({
        holeCards: hole('AhKh'),
        board: parseCards('Ah 2c 3d'),
        opponentRange: 'tight',
      }),
    ).toThrow(/duplicate card/)
  })

  it('throws on an illegal board size', () => {
    expect(() =>
      estimateEquity({
        holeCards: hole('AhKh'),
        board: parseCards('2c 3d'),
        opponentRange: 'tight',
      }),
    ).toThrow(/board must have 0, 3, 4, or 5 cards/)
  })

  it('throws on an empty resolved range string', () => {
    expect(() =>
      estimateEquity({
        holeCards: hole('AhKh'),
        board: [],
        opponentRange: '',
      }),
    ).toThrow(/zero combos/)
  })

  it('throws on a non-positive iteration count (Monte Carlo path)', () => {
    expect(() =>
      estimateEquity({
        holeCards: hole('AhKh'),
        board: [],
        opponentRange: 'tight',
        iterations: 0,
      }),
    ).toThrow(/iterations must be a positive integer/)
  })
})
