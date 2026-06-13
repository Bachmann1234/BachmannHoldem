/**
 * Card primitives for Texas Hold'em.
 *
 * A `Card` is encoded as an integer in the range 0..51. This compact encoding is
 * cheap to copy, store, and (later) feed into a bitmask-based hand evaluator:
 *
 *   rank index = card % 13   // 0 = Two, ... , 8 = Ten, 9 = Jack, 10 = Queen, 11 = King, 12 = Ace
 *   suit index = (card / 13) // 0 = clubs, 1 = diamonds, 2 = hearts, 3 = spades
 *
 * Use the helpers below rather than depending on the encoding directly.
 */

export type Card = number & { readonly __brand: 'Card' }

/** Rank labels, ordered weakest -> strongest (index = rank value). */
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const
export type Rank = (typeof RANKS)[number]

/** Suit labels, ordered to match the encoding (clubs, diamonds, hearts, spades). */
export const SUITS = ['c', 'd', 'h', 's'] as const
export type Suit = (typeof SUITS)[number]

export const NUM_RANKS = RANKS.length // 13
export const NUM_SUITS = SUITS.length // 4
export const NUM_CARDS = NUM_RANKS * NUM_SUITS // 52

/** Build a card from a rank index (0..12) and suit index (0..3). */
export function makeCard(rankIndex: number, suitIndex: number): Card {
  if (rankIndex < 0 || rankIndex >= NUM_RANKS) throw new RangeError(`bad rank index: ${rankIndex}`)
  if (suitIndex < 0 || suitIndex >= NUM_SUITS) throw new RangeError(`bad suit index: ${suitIndex}`)
  return (suitIndex * NUM_RANKS + rankIndex) as Card
}

/** Numeric rank of a card (0 = Two ... 12 = Ace). */
export function rankIndex(card: Card): number {
  return card % NUM_RANKS
}

/** Numeric suit of a card (0 = clubs ... 3 = spades). */
export function suitIndex(card: Card): number {
  return Math.floor(card / NUM_RANKS)
}

export function rankOf(card: Card): Rank {
  return RANKS[rankIndex(card)]!
}

export function suitOf(card: Card): Suit {
  return SUITS[suitIndex(card)]!
}

/** Render a card as a two-character string, e.g. "As", "Th", "2c". */
export function formatCard(card: Card): string {
  return `${rankOf(card)}${suitOf(card)}`
}

/** Parse a two-character card string, e.g. "As" -> Card. Throws on malformed input. */
export function parseCard(text: string): Card {
  if (text.length !== 2) throw new SyntaxError(`expected a 2-char card, got "${text}"`)
  const r = RANKS.indexOf(text[0]! as Rank)
  const s = SUITS.indexOf(text[1]! as Suit)
  if (r < 0) throw new SyntaxError(`bad rank in "${text}"`)
  if (s < 0) throw new SyntaxError(`bad suit in "${text}"`)
  return makeCard(r, s)
}

/** Parse a whitespace-separated list of cards, e.g. "As Kd 7h". */
export function parseCards(text: string): Card[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map(parseCard)
}

/** A fresh, ordered 52-card deck. */
export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (let i = 0; i < NUM_CARDS; i++) deck.push(i as Card)
  return deck
}
