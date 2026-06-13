/**
 * Monte Carlo equity by sampling — the fast, general equity path (ticket 0014).
 *
 * The exact oracle ({@link exactEquity}, ticket 0013) enumerates every board
 * completion, which is precise but explodes when villain holdings are unknown or
 * drawn from a range: a preflop spot against a wide range has far too many
 * (holding x board) combinations to walk. This module instead **samples**. Each
 * iteration draws a concrete two-card holding for every range seat, deals the
 * remaining board from the leftover deck, runs a single showdown, and tallies the
 * result. Averaged over many iterations the per-seat fractions converge to the true
 * equity — and on a fully-known spot (no ranges) they converge to whatever
 * {@link exactEquity} would have returned, which is exactly how the tests pin it.
 *
 * Everything here is deterministic given a `seed`: the randomness comes from a small
 * seeded PRNG ({@link mulberry32}), never `Math.random`, so two runs with the same
 * request and seed produce byte-identical {@link HandEquity} results. That
 * reproducibility is what lets the bots ([[0006-heuristic-opponents]]) and coach
 * ([[0007-coaching-engine]]) replay and test their equity calls.
 *
 * The result shape ({@link HandEquity}) is shared with — and imported from — the exact
 * path, so callers can swap between exact and sampled equity without reshaping data.
 */

import {
  evaluate7,
  makeDeck,
  makeCard,
  parseCard,
  formatCard,
  RANKS,
  SUITS,
  type Card,
  type HandValue,
} from '@holdem/engine'

import type { HandEquity } from './equity.js'

/**
 * A seeded, deterministic pseudo-random number generator (mulberry32).
 *
 * mulberry32 is a tiny, well-known 32-bit generator: one multiply-xor-shift round per
 * call, a full 2^32 period, and good enough statistical quality for equity sampling
 * (we are estimating fractions, not doing cryptography). It is chosen over `Math.random`
 * precisely because it is *seedable* — the whole point of this module is that a given
 * seed reproduces a given run exactly.
 *
 * Returns a function yielding the next float in [0, 1). Construct one per simulation so
 * each `monteCarloEquity` call is independent and depends only on its own seed.
 */
export function mulberry32(seed: number): () => number {
  // Coerce the seed into an unsigned 32-bit integer so any number (or NaN) gives a
  // defined, reproducible starting state.
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A two-card holding. The same plain tuple the exact path uses for a known hand. */
export type Combo = readonly [Card, Card]

/**
 * A range: the concrete set of two-card holdings a seat might hold. We keep it as a
 * plain list of combos (rather than a 13x13 grid) because the simulator just needs to
 * pick one uniformly at random and re-pick on a collision, and a flat list makes that
 * trivial. `"AKs"` expands to its 4 suited combos, `"AKo"` to its 12 offsuit combos,
 * and a pair like `"77"` to its 6 combos — see {@link parseRange}.
 */
export type Range = readonly Combo[]

const RANK_SET = new Set<string>(RANKS)

/** Rank index (0..12) of a single rank character, throwing on anything unknown. */
function rankIndexOf(ch: string): number {
  const i = RANKS.indexOf(ch as (typeof RANKS)[number])
  if (i < 0) throw new SyntaxError(`bad rank "${ch}" in range`)
  return i
}

/** The 6 combos of a pocket pair of the given rank (every unordered pair of suits). */
function pairCombos(rankCh: string): Combo[] {
  const r = rankIndexOf(rankCh)
  const combos: Combo[] = []
  for (let s1 = 0; s1 < SUITS.length; s1++) {
    for (let s2 = s1 + 1; s2 < SUITS.length; s2++) {
      combos.push([makeCard(r, s1), makeCard(r, s2)])
    }
  }
  return combos
}

/** The 4 suited combos of two distinct ranks (same suit, one per suit). */
function suitedCombos(hiCh: string, loCh: string): Combo[] {
  const hi = rankIndexOf(hiCh)
  const lo = rankIndexOf(loCh)
  const combos: Combo[] = []
  for (let s = 0; s < SUITS.length; s++) {
    combos.push([makeCard(hi, s), makeCard(lo, s)])
  }
  return combos
}

/** The 12 offsuit combos of two distinct ranks (every pair of different suits). */
function offsuitCombos(hiCh: string, loCh: string): Combo[] {
  const hi = rankIndexOf(hiCh)
  const lo = rankIndexOf(loCh)
  const combos: Combo[] = []
  for (let s1 = 0; s1 < SUITS.length; s1++) {
    for (let s2 = 0; s2 < SUITS.length; s2++) {
      if (s1 !== s2) combos.push([makeCard(hi, s1), makeCard(lo, s2)])
    }
  }
  return combos
}

/**
 * Parse a single range token into its concrete combos. A token is one of:
 *
 * - a pocket pair, two equal ranks: `"77"` -> 6 combos.
 * - a suited combo, two ranks + `s`: `"AKs"` -> 4 combos.
 * - an offsuit combo, two ranks + `o`: `"AKo"` -> 12 combos.
 * - an explicit holding, two full cards: `"AhKh"` or `"Ah Kh"` -> 1 combo.
 *
 * Throws a {@link SyntaxError} on anything else (a lone rank, an unknown suffix, two
 * equal ranks marked suited, etc.).
 */
function parseRangeToken(token: string): Combo[] {
  // Two bare ranks, optionally followed by s/o: "AA", "AKs", "AKo".
  if (token.length === 2 && RANK_SET.has(token[0]!) && RANK_SET.has(token[1]!)) {
    const [a, b] = [token[0]!, token[1]!]
    if (a === b) return pairCombos(a)
    // Two distinct ranks with no s/o suffix is ambiguous (suited + offsuit); require
    // the caller to be explicit rather than silently guessing all 16 combos.
    throw new SyntaxError(`range token "${token}" needs an s/o suffix (e.g. "${token}s")`)
  }
  if (token.length === 3 && RANK_SET.has(token[0]!) && RANK_SET.has(token[1]!)) {
    const [a, b, suffix] = [token[0]!, token[1]!, token[2]!]
    if (a === b) throw new SyntaxError(`pair "${a}${b}" cannot be suited/offsuit`)
    if (suffix === 's') return suitedCombos(a, b)
    if (suffix === 'o') return offsuitCombos(a, b)
    throw new SyntaxError(`range token "${token}" has unknown suffix "${suffix}"`)
  }
  // Explicit holding: exactly four characters forming two cards, e.g. "AhKh".
  if (token.length === 4) {
    const c1 = parseCard(token.slice(0, 2))
    const c2 = parseCard(token.slice(2, 4))
    if (c1 === c2) throw new SyntaxError(`explicit combo "${token}" repeats a card`)
    return [[c1, c2]]
  }
  throw new SyntaxError(`unrecognised range token "${token}"`)
}

/**
 * Parse a comma-separated range string into its concrete two-card combos, reusing the
 * engine's card primitives. Supports pocket pairs (`"77"`), suited (`"AKs"`), offsuit
 * (`"AKo"`), and explicit holdings (`"AhKh"` or spaced `"Ah Kh"`), in any mix:
 *
 * @example
 *   parseRange('AA, KK, AKs, AKo')
 *   // -> 6 + 6 + 4 + 12 = 28 combos
 *
 * Duplicate combos (e.g. a combo named twice, or an explicit holding already covered by
 * a broader token) are de-duplicated so each physical holding appears once and the
 * uniform draw stays uniform. Throws on any malformed token; returns an empty array
 * only for an empty/whitespace string (which `monteCarloEquity` then rejects).
 */
export function parseRange(text: string): Range {
  const combos: Combo[] = []
  const seen = new Set<string>()
  for (const raw of text.split(',')) {
    // Allow spaces inside an explicit holding ("Ah Kh") by stripping internal
    // whitespace within a token; tokens themselves are comma-separated.
    const token = raw.replace(/\s+/g, '')
    if (token.length === 0) continue
    for (const combo of parseRangeToken(token)) {
      // Canonicalise so the unordered pair {c1,c2} dedupes regardless of order.
      const [lo, hi] = combo[0] < combo[1] ? combo : [combo[1], combo[0]]
      const key = `${lo}-${hi}`
      if (seen.has(key)) continue
      seen.add(key)
      combos.push(combo)
    }
  }
  return combos
}

/**
 * One seat in a Monte Carlo spot: either a **fixed** known two-card holding (like the
 * exact path's `hands`), or a **range** to draw an unknown holding from each iteration.
 */
export type Seat = { readonly known: Combo } | { readonly range: Range }

/** Convenience constructor for a fixed-hand seat. */
export function fixedSeat(hand: Combo): Seat {
  return { known: hand }
}

/** Convenience constructor for a range seat. */
export function rangeSeat(range: Range): Seat {
  return { range }
}

function isKnownSeat(seat: Seat): seat is { readonly known: Combo } {
  return 'known' in seat
}

/**
 * A Monte Carlo equity request.
 *
 * - `seats` — each seat is a {@link Seat}: a fixed known holding or a range (≥2 seats).
 * - `board` — community cards revealed so far: 0/3/4/5 (same legal sizes as the oracle).
 * - `iterations` — how many showdowns to sample (more = tighter convergence).
 * - `seed` — seeds the {@link mulberry32} PRNG; same request + seed = identical result.
 */
export interface MonteCarloRequest {
  readonly seats: readonly Seat[]
  readonly board: readonly Card[]
  readonly iterations: number
  readonly seed: number
}

/** Board sizes that are legal in Hold'em: preflop, flop, turn, river. */
const LEGAL_BOARD_SIZES = new Set([0, 3, 4, 5])

/**
 * Validate a request: ≥2 seats, a legal board size, ≥1 iteration, every range non-empty,
 * every fixed/explicit combo well-formed, and no duplicate card among the *fixed* known
 * cards (fixed hands + board). Collisions involving range cards are inherently
 * per-iteration and handled while sampling, not here. Throws a clear error otherwise.
 */
function validate(req: MonteCarloRequest): void {
  if (req.seats.length < 2) {
    throw new RangeError(`monte carlo needs at least 2 seats, got ${req.seats.length}`)
  }
  if (!LEGAL_BOARD_SIZES.has(req.board.length)) {
    throw new RangeError(`board must have 0, 3, 4, or 5 cards, got ${req.board.length}`)
  }
  if (!Number.isInteger(req.iterations) || req.iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, got ${req.iterations}`)
  }

  const seen = new Set<Card>()
  const claim = (card: Card, where: string): void => {
    if (seen.has(card)) {
      throw new Error(`duplicate card ${formatCard(card)} (${where})`)
    }
    seen.add(card)
  }
  for (let i = 0; i < req.seats.length; i++) {
    const seat = req.seats[i]!
    if (isKnownSeat(seat)) {
      claim(seat.known[0], `seat ${i}`)
      claim(seat.known[1], `seat ${i}`)
    } else if (seat.range.length === 0) {
      throw new RangeError(`seat ${i} has an empty range`)
    }
  }
  for (const card of req.board) claim(card, 'board')
}

/**
 * Estimate per-seat equity by sampling `iterations` showdowns.
 *
 * Each iteration:
 *   1. Mark every fixed hole card and board card as "used".
 *   2. For each range seat, draw a uniform random combo from its range; reject and
 *      re-draw if either card collides with a card already used this iteration (a fixed
 *      card, a board card, or another seat's drawn combo). This keeps every dealt holding
 *      physically possible.
 *   3. Deal the cards still to come on the board from the leftover deck via a partial
 *      Fisher–Yates shuffle driven by the seeded PRNG.
 *   4. Evaluate all seats' 7-card hands with {@link evaluate7}; the best score wins
 *      outright (adds to `win`), an N-way tie adds to each tied seat's `tie` count and
 *      `1/N` to its pot share.
 *
 * Final fractions divide by `iterations`, so each seat's `equity` is `win + tie-split`
 * and the seats' equities sum to ~1. The shape matches {@link exactEquity} exactly.
 *
 * Determinism: the only randomness is the seeded `next()` stream, consumed in a fixed
 * order, so the same request + seed always yields the same numbers.
 */
export function monteCarloEquity(req: MonteCarloRequest): HandEquity[] {
  validate(req)

  const numSeats = req.seats.length
  const next = mulberry32(req.seed)
  // Uniform integer in [0, n) from the PRNG float.
  const randInt = (n: number): number => Math.floor(next() * n)

  const fullDeck = makeDeck()
  const toCome = 5 - req.board.length

  // Cards locked across every iteration: the fixed hole cards plus the known board.
  const fixedUsed = new Set<Card>()
  for (const seat of req.seats) {
    if (isKnownSeat(seat)) {
      fixedUsed.add(seat.known[0])
      fixedUsed.add(seat.known[1])
    }
  }
  for (const card of req.board) fixedUsed.add(card)

  const wins = new Array<number>(numSeats).fill(0)
  const ties = new Array<number>(numSeats).fill(0)
  const potShare = new Array<number>(numSeats).fill(0)

  // Per-iteration scratch. `usedThisIter` tracks cards consumed (fixed + drawn combos)
  // so range draws and the board deal never reuse a card. `holdings[s]` is seat s's
  // two cards for the current iteration. `hand` is a reused 7-card evaluation buffer
  // laid out as [hole0, hole1, ...board(5)...].
  const usedThisIter = new Set<Card>()
  const holdings: Combo[] = new Array<Combo>(numSeats)
  const HOLE = 2
  const hand: Card[] = new Array<Card>(HOLE + 5)
  const values = new Array<HandValue>(numSeats)

  // A reusable mutable deck for the partial Fisher–Yates board deal. We avoid the
  // fixed/board cards by drawing only from cards not used this iteration, rebuilt each
  // iteration from the cards left after the seats' holdings are fixed.
  const deck: Card[] = new Array<Card>(fullDeck.length)

  // Cap re-draws per range seat so a (mis-specified) over-constrained spot fails loudly
  // instead of looping forever — e.g. two seats whose ranges only overlap.
  const MAX_REDRAWS = 10_000

  for (let iter = 0; iter < req.iterations; iter++) {
    usedThisIter.clear()
    for (const card of fixedUsed) usedThisIter.add(card)

    // Draw a holding for each seat: fixed seats use their hand directly; range seats
    // draw uniformly, rejecting collisions with cards already used this iteration.
    for (let s = 0; s < numSeats; s++) {
      const seat = req.seats[s]!
      if (isKnownSeat(seat)) {
        holdings[s] = seat.known
        continue
      }
      const range = seat.range
      let drawn: Combo | undefined
      for (let attempt = 0; attempt < MAX_REDRAWS; attempt++) {
        const candidate = range[randInt(range.length)]!
        if (!usedThisIter.has(candidate[0]) && !usedThisIter.has(candidate[1])) {
          drawn = candidate
          break
        }
      }
      if (drawn === undefined) {
        throw new Error(
          `seat ${s}: could not draw a non-colliding combo in ${MAX_REDRAWS} attempts ` +
            `(range too constrained against the other known/drawn cards?)`,
        )
      }
      holdings[s] = drawn
      usedThisIter.add(drawn[0])
      usedThisIter.add(drawn[1])
    }

    // Build the iteration's available deck (every card not yet used) for the board deal.
    let deckLen = 0
    for (const card of fullDeck) {
      if (!usedThisIter.has(card)) deck[deckLen++] = card
    }

    // Partial Fisher–Yates: draw `toCome` board cards from the front of `deck`,
    // swapping each chosen card into place. Only the prefix is shuffled, which is all
    // we need.
    for (let i = 0; i < toCome; i++) {
      const j = i + randInt(deckLen - i)
      const tmp = deck[i]!
      deck[i] = deck[j]!
      deck[j] = tmp
    }

    // Lay the full board into the eval buffer: known board first, then the dealt cards.
    for (let i = 0; i < req.board.length; i++) hand[HOLE + i] = req.board[i]!
    for (let i = 0; i < toCome; i++) hand[HOLE + req.board.length + i] = deck[i]!

    // Showdown.
    let best = -Infinity
    let bestCount = 0
    for (let s = 0; s < numSeats; s++) {
      hand[0] = holdings[s]![0]
      hand[1] = holdings[s]![1]
      const value = evaluate7(hand)
      values[s] = value
      if (value.score > best) {
        best = value.score
        bestCount = 1
      } else if (value.score === best) {
        bestCount++
      }
    }
    if (bestCount === 1) {
      for (let s = 0; s < numSeats; s++) {
        if (values[s]!.score === best) {
          wins[s]!++
          break
        }
      }
    } else {
      const splitShare = 1 / bestCount
      for (let s = 0; s < numSeats; s++) {
        if (values[s]!.score === best) {
          ties[s]!++
          potShare[s]! += splitShare
        }
      }
    }
  }

  const result: HandEquity[] = []
  for (let s = 0; s < numSeats; s++) {
    result.push({
      win: wins[s]! / req.iterations,
      tie: ties[s]! / req.iterations,
      equity: (wins[s]! + potShare[s]!) / req.iterations,
    })
  }
  return result
}
