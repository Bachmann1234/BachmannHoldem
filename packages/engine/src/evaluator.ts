/**
 * 7-card hand evaluator for Texas Hold'em.
 *
 * Strategy (per ticket 0002): **simple but correct**. We rank an exact 5-card hand
 * into a single, totally-orderable integer `score`, then for 6- or 7-card inputs we
 * enumerate every 5-card combination and keep the best. This is plenty fast for a
 * single-player trainer and equity sims (see the benchmark note in the PR); a
 * lookup-table / perfect-hash evaluator is deferred until equity actually feels slow.
 *
 * The `score` is built so that a plain numeric comparison resolves both hand
 * category and kicker tie-breaks:
 *
 *   score = category, then five tie-break ranks appended as base-16 digits
 *         = category * 16^5 + r0 * 16^4 + r1 * 16^3 + r2 * 16^2 + r3 * 16 + r4
 *
 * Each rank is 0..12 (fits a base-16 digit) and the five tie-break ranks are listed
 * in descending order of significance. Within a category the number of meaningful
 * ranks is constant, so padding the remainder with 0 is consistent and safe.
 */

import { rankIndex, suitIndex, type Card } from './card.js'

/** The nine hand categories, ordered weakest (0) -> strongest (8). */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
} as const
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory]

/** Human-readable category names, indexed by `HandCategory`. */
export const HAND_CATEGORY_NAMES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
] as const

/**
 * The evaluated strength of a 5-card hand.
 *
 * `score` is the only thing you need to compare two hands — higher always wins,
 * equal always ties. `category` and `ranks` are carried along for display and
 * debugging (`ranks` are the tie-break ranks, descending significance).
 */
export interface HandValue {
  readonly score: number
  readonly category: HandCategory
  readonly ranks: readonly number[]
}

const RANK_DIGITS = 5
const RADIX = 16
const CATEGORY_SCALE = RADIX ** RANK_DIGITS // 16^5

// Reused scratch buffer for per-rank counts. The evaluator is single-threaded and
// fully synchronous, so a shared buffer is safe and spares the hot path 21 array
// allocations per 7-card hand.
const scratchCounts = new Int8Array(13)

/** Pack a category + descending tie-break ranks into a single orderable integer. */
function encodeScore(category: HandCategory, ranks: number[]): number {
  let score = category
  for (let i = 0; i < RANK_DIGITS; i++) {
    score = score * RADIX + (ranks[i] ?? 0)
  }
  return score
}

/**
 * How many of the five packed digits are meaningful tie-break ranks per category;
 * the rest are zero padding. (E.g. a Full House is fully described by trips rank +
 * pair rank, so only 2 digits matter.) A real low kicker can itself be rank 0
 * ("Two"), so we must use this length rather than stripping trailing zeros.
 */
const CATEGORY_RANK_COUNT: Record<HandCategory, number> = {
  [HandCategory.HighCard]: 5,
  [HandCategory.Pair]: 4,
  [HandCategory.TwoPair]: 3,
  [HandCategory.ThreeOfAKind]: 3,
  [HandCategory.Straight]: 1,
  [HandCategory.Flush]: 5,
  [HandCategory.FullHouse]: 2,
  [HandCategory.FourOfAKind]: 2,
  [HandCategory.StraightFlush]: 1,
}

/** Recover a `HandValue` (category + tie-break ranks) from a packed score. */
function decodeScore(score: number): HandValue {
  const category = Math.floor(score / CATEGORY_SCALE) as HandCategory
  const keep = CATEGORY_RANK_COUNT[category]
  const ranks: number[] = []
  let rest = score % CATEGORY_SCALE
  for (let i = RANK_DIGITS - 1; i >= 0; i--) {
    const place = RADIX ** i
    if (RANK_DIGITS - 1 - i < keep) ranks.push(Math.floor(rest / place))
    rest %= place
  }
  return { score, category, ranks }
}

/**
 * Evaluate exactly five cards. Throws if not given five cards.
 *
 * Cards may be passed as a 5-element array; for the hot enumeration path we also
 * accept a larger backing array plus explicit indices via {@link score5At}.
 */
export function evaluate5(cards: readonly Card[]): HandValue {
  if (cards.length !== 5) {
    throw new RangeError(`evaluate5 expects 5 cards, got ${cards.length}`)
  }
  return decodeScore(score5At(cards, 0, 1, 2, 3, 4))
}

/**
 * Core evaluator: rank the five cards found at the given indices of `cards` and
 * return their packed, orderable score (see the module header for the encoding).
 *
 * Returning a bare number — rather than a `HandValue` object — lets {@link evaluate7}
 * enumerate all 21 combinations of a 7-card hand without allocating an object and an
 * array per combination; the winning score is decoded into a `HandValue` exactly once.
 */
export function score5At(
  cards: readonly Card[],
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): number {
  // Per-rank counts and a same-suit check, over the five chosen cards. `counts` is a
  // reused module-scoped scratch buffer (this is a hot path called 21x per 7-card
  // hand) — we zero only the 13 rank slots up front, never allocating here.
  const counts = scratchCounts
  counts.fill(0)
  const ca = cards[a]!
  const cb = cards[b]!
  const cc = cards[c]!
  const cd = cards[d]!
  const ce = cards[e]!
  counts[rankIndex(ca)]!++
  counts[rankIndex(cb)]!++
  counts[rankIndex(cc)]!++
  counts[rankIndex(cd)]!++
  counts[rankIndex(ce)]!++
  const suitMask =
    (1 << suitIndex(ca)) |
    (1 << suitIndex(cb)) |
    (1 << suitIndex(cc)) |
    (1 << suitIndex(cd)) |
    (1 << suitIndex(ce))
  const isFlush = (suitMask & (suitMask - 1)) === 0 // exactly one suit bit set

  // Group present ranks, ordered by count desc then rank desc. This ordering is
  // exactly the kicker order for every "grouped" category (pairs, trips, quads,
  // full house) and the straight-descending order for high card / flush.
  const groupRanks: number[] = []
  const groupCounts: number[] = []
  for (let r = 12; r >= 0; r--) {
    const n = counts[r]!
    if (n > 0) {
      // insertion sort by count desc (ranks already arrive in desc order)
      let pos = groupRanks.length
      while (pos > 0 && groupCounts[pos - 1]! < n) pos--
      groupRanks.splice(pos, 0, r)
      groupCounts.splice(pos, 0, n)
    }
  }

  const straightHigh = straightHighCard(groupRanks, groupCounts.length)

  if (isFlush && straightHigh >= 0) {
    return encodeScore(HandCategory.StraightFlush, [straightHigh])
  }
  if (groupCounts[0] === 4) {
    return encodeScore(HandCategory.FourOfAKind, groupRanks)
  }
  if (groupCounts[0] === 3 && groupCounts[1] === 2) {
    return encodeScore(HandCategory.FullHouse, groupRanks)
  }
  if (isFlush) {
    return encodeScore(HandCategory.Flush, groupRanks)
  }
  if (straightHigh >= 0) {
    return encodeScore(HandCategory.Straight, [straightHigh])
  }
  if (groupCounts[0] === 3) {
    return encodeScore(HandCategory.ThreeOfAKind, groupRanks)
  }
  if (groupCounts[0] === 2 && groupCounts[1] === 2) {
    return encodeScore(HandCategory.TwoPair, groupRanks)
  }
  if (groupCounts[0] === 2) {
    return encodeScore(HandCategory.Pair, groupRanks)
  }
  return encodeScore(HandCategory.HighCard, groupRanks)
}

/**
 * If the five distinct ranks form a straight, return its high card's rank index;
 * otherwise return -1. Handles the wheel (A-2-3-4-5), where the Ace plays low and
 * the straight's high card is the Five (rank index 3).
 */
function straightHighCard(groupRanks: number[], distinct: number): number {
  if (distinct !== 5) return -1 // a straight needs five distinct ranks
  // groupRanks is descending. Wheel: A,5,4,3,2 -> [12, 3, 2, 1, 0].
  if (
    groupRanks[0] === 12 &&
    groupRanks[1] === 3 &&
    groupRanks[2] === 2 &&
    groupRanks[3] === 1 &&
    groupRanks[4] === 0
  ) {
    return 3 // the Five
  }
  if (groupRanks[0]! - groupRanks[4]! === 4) {
    return groupRanks[0]!
  }
  return -1
}

/**
 * Evaluate the best 5-card hand from 5, 6, or 7 cards (2 hole + up to 5 board) by
 * enumerating every 5-card combination and keeping the strongest. Named `evaluate7`
 * per the ticket; it accepts any 5..7 card hand so it works at every street.
 */
export function evaluate7(cards: readonly Card[]): HandValue {
  const n = cards.length
  if (n < 5 || n > 7) {
    throw new RangeError(`evaluate7 expects 5..7 cards, got ${n}`)
  }
  let best = 0
  // Enumerate every C(n,5) combination of indices, keeping the highest packed score.
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const score = score5At(cards, a, b, c, d, e)
            if (score > best) best = score
          }
  return decodeScore(best)
}

/**
 * Compare two evaluated hands. Returns a negative number if `a` is weaker, a
 * positive number if `a` is stronger, and exactly 0 on an exact tie (chopped pot).
 */
export function compareHands(a: HandValue, b: HandValue): number {
  return a.score - b.score
}

/**
 * Given each contender's evaluated hand, return the indices of the winner(s).
 * Multiple indices means a tie (the pot is chopped between them). Throws on empty
 * input.
 */
export function pickWinners(hands: readonly HandValue[]): number[] {
  if (hands.length === 0) throw new RangeError('pickWinners needs at least one hand')
  let best = -Infinity
  for (const h of hands) if (h.score > best) best = h.score
  const winners: number[] = []
  for (let i = 0; i < hands.length; i++) if (hands[i]!.score === best) winners.push(i)
  return winners
}

/** Full rank names, indexed by rank value (0 = Two ... 12 = Ace). */
const RANK_NAMES = [
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Jack',
  'Queen',
  'King',
  'Ace',
] as const

/** Pluralised rank name, e.g. "Kings", "Sixes". */
function plural(rank: number): string {
  const name = RANK_NAMES[rank]!
  return name === 'Six' ? 'Sixes' : `${name}s`
}

/**
 * Render a `HandValue` as a human-readable description with the tie-break ranks
 * spelled out, e.g. "Full House, Kings full of Tens", "Pair of Sevens", "Ace-high".
 * Use {@link HAND_CATEGORY_NAMES} directly when you only want the bare category.
 */
export function describeHand(hand: HandValue): string {
  const r = hand.ranks
  switch (hand.category) {
    case HandCategory.HighCard:
      return `${RANK_NAMES[r[0]!]}-high`
    case HandCategory.Pair:
      return `Pair of ${plural(r[0]!)}`
    case HandCategory.TwoPair:
      return `Two Pair, ${plural(r[0]!)} and ${plural(r[1]!)}`
    case HandCategory.ThreeOfAKind:
      return `Three of a Kind, ${plural(r[0]!)}`
    case HandCategory.Straight:
      return `Straight, ${RANK_NAMES[r[0]!]}-high`
    case HandCategory.Flush:
      return `Flush, ${RANK_NAMES[r[0]!]}-high`
    case HandCategory.FullHouse:
      return `Full House, ${plural(r[0]!)} full of ${plural(r[1]!)}`
    case HandCategory.FourOfAKind:
      return `Four of a Kind, ${plural(r[0]!)}`
    case HandCategory.StraightFlush:
      // The Ace-high straight flush is the Royal.
      return r[0] === 12 ? 'Royal Flush' : `Straight Flush, ${RANK_NAMES[r[0]!]}-high`
  }
}
