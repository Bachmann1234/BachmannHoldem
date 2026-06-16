/**
 * Seeded card-dealing primitives — the deterministic randomness the drill generator threads through
 * every random choice (ticket 0065).
 *
 * The whole testability contract of `@holdem/drills` is *seed-in → spot-out is pure*: a session
 * ([[0066-drills-themed-sets]]) and its tests must replay byte-for-byte, and the no-answer-key
 * invariant is only checkable if the spot a seed produces never moves. So **all** randomness in this
 * package flows through one PRNG, and that PRNG is the project's existing one: {@link mulberry32}
 * from `@holdem/odds` — the *same* seeded generator the equity sims use ([[0014-monte-carlo-equity]]).
 * We deliberately do **not** invent a parallel PRNG (the ticket's explicit "reuse that seam"): one
 * seeded stream across the whole project keeps "deterministic given a seed" a single, shared meaning.
 *
 * This module is the thin layer between that raw `() => number` float stream and *cards*: draw a
 * uniform integer, shuffle a deck in place (a seeded Fisher–Yates, the same algorithm the equity
 * sampler deals its boards with), and deal `n` distinct cards off the top. Building every deal on a
 * freshly-shuffled 52-card deck is what makes "no duplicate cards" structural rather than something a
 * later check has to catch: a hand and a board dealt off the same shuffled deck physically cannot
 * collide.
 *
 * Purity: zero I/O, no Node/DOM/network, no `Math.random()`. Imports only `@holdem/*`. The only
 * randomness is the seeded {@link mulberry32} stream, consumed in a fixed order.
 */

import { makeDeck, type Card } from '@holdem/engine'
import { mulberry32 } from '@holdem/odds'

/**
 * A seeded dealer — the stateful cursor a single drill generation deals from. Constructed once per
 * seed ({@link makeDealer}), it owns one {@link mulberry32} float stream and the running shuffled
 * deck, so every card a generation draws comes from the *same* ordered random sequence and the same
 * seed always reproduces the same deal.
 *
 * It is deliberately tiny — `nextInt`, `deal`, `dealHole`, `dealBoard` — because the generator should
 * express a deal as "draw the hero's two cards, then three board cards", never as raw index
 * arithmetic. Keeping the deck and the cursor private to the closure ({@link makeDealer}) makes it
 * impossible for a caller to deal the same card twice or rewind the stream out from under another
 * draw.
 */
export interface Dealer {
  /**
   * A uniform random integer in `[0, n)` drawn from the seeded stream — the single primitive every
   * other choice (a pot size, a price bucket, a seat) is derived from, so the whole generation stays
   * on one reproducible sequence. Throws {@link RangeError} on a non-positive or non-integer `n`, in
   * the odds/bots validation idiom.
   */
  nextInt(n: number): number
  /**
   * Deal `count` distinct cards off the top of the running shuffled deck. Because the deck is a real
   * 52-card deck shuffled once and dealt without replacement, the cards are guaranteed distinct from
   * each other *and* from every card already dealt this generation — duplicate-free by construction,
   * not by a post-hoc check. Throws {@link RangeError} if more cards are requested than remain.
   */
  deal(count: number): Card[]
  /**
   * Deal the hero's two hole cards — a convenience over {@link deal}`(2)` that returns the fixed-arity
   * tuple the curriculum `SpotContext`/`PreflopSpot` shapes require.
   */
  dealHole(): readonly [Card, Card]
  /**
   * Deal a `street`-legal community board off the top of the deck: `0` cards preflop, `3` on the flop,
   * `4` on the turn, `5` on the river. Centralising the street→size mapping here is what guarantees a
   * generated `CoachSpot` never carries an illegal board length for its street. Throws
   * {@link RangeError} on an unknown street.
   */
  dealBoard(street: BoardStreet): Card[]
}

/**
 * The board streets a drill spot can be dealt on, paired with the *only* legal board sizes
 * ({@link BOARD_SIZE}). Preflop is excluded from the postflop board deal because a `CoachSpot` is a
 * postflop priced decision; the `'preflop'` size is still listed so the mapping is total and a
 * `PreflopSpot` can ask for a zero-card board through the same table.
 */
export type BoardStreet = 'preflop' | 'flop' | 'turn' | 'river'

/**
 * The one legal community-card count per street — the single source of truth the {@link Dealer}'s
 * board deal reads, so a board's length can never drift out of step with its street. These are
 * exactly the sizes `synthesizeContext` / the Monte-Carlo oracle accept (0, 3, 4, 5).
 */
export const BOARD_SIZE: Readonly<Record<BoardStreet, number>> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
}

/**
 * Build a {@link Dealer} for a given integer `seed`: a fresh 52-card deck shuffled in place by a
 * seeded Fisher–Yates over the {@link mulberry32} stream, with a private cursor that deals
 * without replacement. The shuffle is the same partial-shuffle algorithm `monteCarloEquity` deals
 * boards with, run fully here so the *whole* 52-card order is reproducible from the seed.
 *
 * Two dealers built from the same seed deal byte-identical cards in the same order — the property the
 * generator's determinism (and every determinism test) rests on. Throws {@link RangeError} if `seed`
 * is not an integer, so a malformed seed fails loudly at construction rather than producing a quietly
 * different deal (mulberry32 itself would coerce `NaN`/floats into *some* state, which would silently
 * break the "same seed → same spot" contract).
 */
export function makeDealer(seed: number): Dealer {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`drill seed must be an integer, got ${seed}`)
  }

  const next = mulberry32(seed)
  const nextInt = (n: number): number => {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`nextInt bound must be a positive integer, got ${n}`)
    }
    return Math.floor(next() * n)
  }

  // A full Fisher–Yates shuffle of a real 52-card deck over the seeded stream. Dealing off the top of
  // a once-shuffled deck without replacement is what makes "no duplicate cards" structural: any two
  // cards dealt this generation came from distinct deck positions, so they cannot be equal.
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = nextInt(i + 1)
    const tmp = deck[i]!
    deck[i] = deck[j]!
    deck[j] = tmp
  }

  // The cursor into the shuffled deck. Every `deal` advances it, so no card is ever dealt twice.
  let cursor = 0

  const deal = (count: number): Card[] => {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`deal count must be a non-negative integer, got ${count}`)
    }
    if (cursor + count > deck.length) {
      throw new RangeError(
        `deal of ${count} would exceed the deck (${deck.length - cursor} cards left)`,
      )
    }
    const cards = deck.slice(cursor, cursor + count)
    cursor += count
    return cards
  }

  const dealHole = (): readonly [Card, Card] => {
    const [a, b] = deal(2)
    return [a!, b!]
  }

  const dealBoard = (street: BoardStreet): Card[] => {
    const size = BOARD_SIZE[street]
    if (size === undefined) throw new RangeError(`unknown board street "${street}"`)
    return deal(size)
  }

  return { nextInt, deal, dealHole, dealBoard }
}
