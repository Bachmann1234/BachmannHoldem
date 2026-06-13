import { describe, expect, it } from 'vitest'
import { parseCards } from '@holdem/engine'
import { exactEquity, parseEquityRequest, type EquityRequest } from './equity.js'

/** Sum of every seat's equity — should always be ~1 for a valid spot. */
function totalEquity(req: EquityRequest): number {
  return exactEquity(req).reduce((sum, e) => sum + e.equity, 0)
}

// Full preflop enumeration (an empty board) is the heavyweight case: heads-up it scores
// C(48,5) = 1,712,304 board completions. It is exact and reproducible but takes seconds,
// so the suite runs exactly one such spot — the AA-vs-KK acceptance criterion — under a
// generous timeout. Every other spot uses a partial board (flop/turn), which enumerates
// in well under a millisecond, to keep the suite fast while still exercising every path.
const PREFLOP_TIMEOUT_MS = 60_000

describe('exactEquity — textbook spots', () => {
  it(
    'AA vs KK preflop is ~81% / ~19% (the canonical pocket-pair domination)',
    () => {
      const req = parseEquityRequest(['AhAd', 'KsKc'])
      const [aa, kk] = exactEquity(req)

      // Exact, not sampled, so the figures are reproducible to the digit. For this suit
      // layout (no shared suits) AA wins 81.06%, ties 0.38%, equity 81.26% — the classic
      // "82/18" is the average over all suit combinations; specific layouts vary ~81–83%.
      expect(aa!.equity).toBeCloseTo(0.812555, 5)
      expect(kk!.equity).toBeCloseTo(0.187445, 5)
      expect(aa!.win).toBeCloseTo(0.810646, 5)
      expect(aa!.tie).toBeCloseTo(0.003818, 5)
      expect(aa!.equity).toBeGreaterThan(0.81)
      expect(aa!.equity).toBeLessThan(0.82)

      // Equities partition the pot exactly.
      expect(aa!.equity + kk!.equity).toBeCloseTo(1, 12)
    },
    PREFLOP_TIMEOUT_MS,
  )

  it('treats a genuine race (a big draw vs two overcards) as exactly 50/50 on the flop', () => {
    // QhJh — an open-ended straight draw plus a flush draw — against AsKc's two
    // overcards on Th 9c 2d. The draw's outs and the overcards' pairing outs balance
    // to an exact coin flip: 50.000% / 50.000% over all 990 turn+river runouts.
    const req = parseEquityRequest(['QhJh', 'AsKc'], 'Th 9c 2d')
    const [draw, overcards] = exactEquity(req)
    expect(draw!.equity).toBeCloseTo(0.5, 6)
    expect(overcards!.equity).toBeCloseTo(0.5, 6)
    expect(draw!.equity + overcards!.equity).toBeCloseTo(1, 12)
  })

  it('a hand drawing dead is locked at 0% (and the made hand at 100%)', () => {
    // A complete board (river is set, so there is a single "completion"): seat 0 holds
    // the case ace for quad aces; seat 1 cannot beat or tie it on this exact board.
    const board = parseCards('Ac Ad Ah 2c 3d')
    const req: EquityRequest = {
      hands: [
        [parseCards('As')[0]!, parseCards('Ks')[0]!],
        [parseCards('7s')[0]!, parseCards('8s')[0]!],
      ],
      board,
    }
    const [made, dead] = exactEquity(req)
    expect(made!.equity).toBe(1)
    expect(made!.win).toBe(1)
    expect(dead!.equity).toBe(0)
    expect(dead!.win).toBe(0)
    expect(dead!.tie).toBe(0)
  })

  it('splits an exact tie 50/50 (both seats play the board)', () => {
    // A complete board that is a Broadway straight; both seats' hole cards are
    // irrelevant low cards, so both "play the board" and chop the single completion.
    const board = parseCards('Ts Js Qd Kh Ac')
    const req: EquityRequest = {
      hands: [
        [parseCards('2c')[0]!, parseCards('3c')[0]!],
        [parseCards('2d')[0]!, parseCards('3d')[0]!],
      ],
      board,
    }
    const [a, b] = exactEquity(req)
    expect(a!.equity).toBe(0.5)
    expect(b!.equity).toBe(0.5)
    expect(a!.tie).toBe(1) // it is a tie on the (single) completed board
    expect(b!.tie).toBe(1)
    expect(a!.win).toBe(0)
    expect(b!.win).toBe(0)
  })

  it('splits a partial-board tie 50/50 when neither seat can break the chop', () => {
    // Turn board T J Q K already makes a King-high straight; the river is to come.
    // Both seats hold low offsuit cards that can never improve past the board straight
    // (and no river pairs the board into a higher hand for either), so every river
    // keeps the chop — an exact 50/50 with a tie on every completion. Verifies the
    // tie-split share generalises across a multi-completion enumeration, not just one
    // fixed board.
    const req: EquityRequest = {
      hands: [
        [parseCards('2c')[0]!, parseCards('3c')[0]!],
        [parseCards('2d')[0]!, parseCards('3d')[0]!],
      ],
      board: parseCards('Ts Js Qh Kd'), // turn: K-high straight on board, river to come
    }
    const [a, b] = exactEquity(req)
    expect(a!.equity).toBeCloseTo(0.5, 12)
    expect(b!.equity).toBeCloseTo(0.5, 12)
    expect(a!.win).toBe(0)
    expect(b!.win).toBe(0)
    // The board K-high straight is the nut on every river here, so every completion ties.
    expect(a!.tie).toBeCloseTo(1, 12)
  })
})

describe('exactEquity — partial boards and streets', () => {
  it('works on the flop (two cards to come) and sums to 1', () => {
    const req = parseEquityRequest(['AhKh', 'QsQd'], '2h 7h 9c')
    const result = exactEquity(req)
    expect(result).toHaveLength(2)
    expect(totalEquity(req)).toBeCloseTo(1, 12)
  })

  it('works on the turn (one card to come) and sums to 1', () => {
    const req = parseEquityRequest(['AhKh', 'QsQd'], '2h 7h 9c Td')
    const result = exactEquity(req)
    expect(result).toHaveLength(2)
    // 44 cards remain (52 - 4 hole - 4 board) -> 44 river completions; per seat the win
    // and tie fractions cannot exceed the whole.
    expect(result[0]!.win + result[0]!.tie).toBeLessThanOrEqual(1)
    expect(totalEquity(req)).toBeCloseTo(1, 12)
  })

  it('handles three-way spots and still partitions the pot', () => {
    const req = parseEquityRequest(['AsKs', 'QhQd', '7c2d'], 'Kd 7h 2s')
    const result = exactEquity(req)
    expect(result).toHaveLength(3)
    expect(totalEquity(req)).toBeCloseTo(1, 12)
  })

  it('accepts both glued and spaced card strings identically', () => {
    const glued = parseEquityRequest(['AcAd', '8h8s'], '7d2c9h')
    const spaced = parseEquityRequest(['Ac Ad', '8h 8s'], '7d 2c 9h')
    expect(exactEquity(glued)).toEqual(exactEquity(spaced))
  })

  it('a dominant set on the flop has very high but not certain equity', () => {
    const req = parseEquityRequest(['AcAd', '8h8s'], 'As 7d 2c')
    const [aa] = exactEquity(req)
    // Set of aces vs a pair of eights needing running eights — near-locked at 99.9%,
    // but not 100% (88 can still spike quads / runner-runner straight).
    expect(aa!.equity).toBeGreaterThan(0.99)
    expect(aa!.equity).toBeLessThan(1)
    expect(aa!.equity).toBeCloseTo(0.99899, 4)
  })
})

describe('exactEquity — input validation', () => {
  it('rejects fewer than two hands', () => {
    expect(() => exactEquity(parseEquityRequest(['AhKh']))).toThrow(/at least 2/)
  })

  it('rejects an illegal board size', () => {
    // A two-card board is not a legal Hold'em street.
    const req: EquityRequest = {
      hands: parseEquityRequest(['AhKh', 'QsQd']).hands,
      board: parseCards('2c 3d'),
    }
    expect(() => exactEquity(req)).toThrow(/board must have/)
  })

  it('rejects a duplicate card across hands', () => {
    expect(() => exactEquity(parseEquityRequest(['AhKh', 'AhQd']))).toThrow(/duplicate/i)
  })

  it('rejects a hole card that also appears on the board', () => {
    expect(() => exactEquity(parseEquityRequest(['AhKh', 'QsQd'], 'Ah 7d 2c'))).toThrow(
      /duplicate/i,
    )
  })

  it('rejects a hand that is not exactly two cards', () => {
    expect(() => parseEquityRequest(['AhKhQs', 'QsQd'])).toThrow(/exactly 2 cards/)
  })

  it('rejects a malformed card via the engine parser', () => {
    expect(() => parseEquityRequest(['Xx', 'QsQd'])).toThrow()
  })
})
