/**
 * Exact equity by board enumeration — the correctness oracle for the odds engine
 * (ticket 0013).
 *
 * Given fully-known hole cards for two or more seats and a partial board, this
 * enumerates **every** completion of the board from the remaining deck (the 52-card
 * deck minus all known hole + board cards), runs a showdown with the engine
 * evaluator on each completion, and tallies per-seat win / tie counts. The result is
 * exact — no sampling, no randomness — which is exactly what the Monte Carlo
 * simulator ([[0014-monte-carlo-equity]]) is tested against.
 *
 * It is slower than sampling (preflop heads-up enumerates C(48,5) = 1,712,304
 * boards) but never approximate, so it is the reference, not the workhorse.
 *
 * The exported shapes ({@link HandEquity}, {@link EquityRequest}) are the shared
 * contract that Monte Carlo and the equity Web Worker will reuse, so they live here
 * and are kept deliberately small and plain.
 */

import {
  evaluate7,
  makeDeck,
  parseCard,
  formatCard,
  type Card,
  type HandValue,
} from '@holdem/engine'

/**
 * One seat's equity in a spot.
 *
 * - `win` — fraction of enumerated boards this seat wins outright (0..1).
 * - `tie` — fraction of enumerated boards this seat ties on (chops with ≥1 other
 *   seat). This is the *share of boards*, not the seat's split of those pots.
 * - `equity` — the seat's expected share of the pot: `win + tie-split`, where a
 *   board tied N-ways contributes `1 / N` to each tied seat. Across all seats the
 *   `equity` values sum to 1 (modulo floating-point rounding).
 */
export interface HandEquity {
  readonly win: number
  readonly tie: number
  readonly equity: number
}

/**
 * A request to compute equity for a fully-specified spot.
 *
 * - `hands` — each seat's two known hole cards (≥2 seats).
 * - `board` — the community cards revealed so far: 0 (preflop), 3 (flop), 4 (turn),
 *   or 5 (river) cards. A 5-card board has no completions, so equity is decided by
 *   the single showdown.
 */
export interface EquityRequest {
  readonly hands: readonly (readonly [Card, Card])[]
  readonly board: readonly Card[]
}

/** Board sizes that are legal in Hold'em: preflop, flop, turn, river. */
const LEGAL_BOARD_SIZES = new Set([0, 3, 4, 5])

/** How many board cards a complete 5-card board still needs at each legal size. */
function cardsToCome(boardSize: number): number {
  return 5 - boardSize
}

/**
 * Validate a request and return the cards that are still in the deck (every card not
 * already known as a hole or board card), in deterministic deck order. Throws a clear
 * error on any malformed input: too few seats, a wrong-length hand, an illegal board
 * size, or a duplicate card anywhere across hands + board.
 */
function remainingDeck(req: EquityRequest): Card[] {
  if (req.hands.length < 2) {
    throw new RangeError(`equity needs at least 2 hands, got ${req.hands.length}`)
  }
  if (!LEGAL_BOARD_SIZES.has(req.board.length)) {
    throw new RangeError(`board must have 0, 3, 4, or 5 cards, got ${req.board.length}`)
  }

  // Gather every known card, rejecting duplicates as we go. A duplicate means the
  // same physical card was dealt twice, which makes the spot nonsensical.
  const seen = new Set<Card>()
  const claim = (card: Card, where: string): void => {
    if (seen.has(card)) {
      throw new Error(`duplicate card ${formatCard(card)} (${where})`)
    }
    seen.add(card)
  }
  for (let i = 0; i < req.hands.length; i++) {
    const hand = req.hands[i]!
    if (hand.length !== 2) {
      throw new RangeError(`hand ${i} must have exactly 2 cards, got ${hand.length}`)
    }
    claim(hand[0], `hand ${i}`)
    claim(hand[1], `hand ${i}`)
  }
  for (const card of req.board) claim(card, 'board')

  return makeDeck().filter((card) => !seen.has(card))
}

/**
 * Compute **exact** equity for every seat by enumerating all completions of the
 * board.
 *
 * For each completion the seats' 7-card hands are evaluated and the best score wins;
 * ties chop. A board won outright by seat `s` adds 1 to `s.win`; a board tied
 * `k`-ways adds 1 to each tied seat's `tie` count and `1/k` to each tied seat's
 * pot share. Final fractions divide by the total number of enumerated completions,
 * so `equity` sums to 1 across seats.
 *
 * The enumeration is order-independent (it walks the remaining deck in fixed deck
 * order and the engine evaluator is deterministic), so the result is reproducible
 * with no randomness.
 */
export function exactEquity(req: EquityRequest): HandEquity[] {
  const deck = remainingDeck(req)
  const numSeats = req.hands.length
  const toCome = cardsToCome(req.board.length)

  const wins = new Array<number>(numSeats).fill(0)
  const ties = new Array<number>(numSeats).fill(0)
  const potShare = new Array<number>(numSeats).fill(0)
  let totalBoards = 0

  // Reused scratch buffer for one seat's 5..7-card hand, laid out as
  // `[hole0, hole1, ...board...]`. Slots 0 and 1 hold the seat's hole cards (rewritten
  // per seat in `scoreBoard`); slots 2.. hold the full board (known cards followed by
  // the enumerated completion). Keeping the hole cards at the front means the
  // completion never collides with them, even at an empty board.
  const HOLE = 2
  const hand: Card[] = [...new Array<Card>(HOLE), ...req.board, ...new Array<Card>(toCome)]
  const values = new Array<HandValue>(numSeats)

  /** Score one fully-dealt board (the completion already written into the buffer). */
  const scoreBoard = (): void => {
    totalBoards++
    let best = -Infinity
    let bestCount = 0
    for (let s = 0; s < numSeats; s++) {
      const seatHand = req.hands[s]!
      hand[0] = seatHand[0]
      hand[1] = seatHand[1]
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

  // Enumerate every C(deck.length, toCome) board completion. We recurse over board
  // slots with a strictly increasing deck index so each set of cards is visited once
  // (order-independent), writing chosen cards into the shared `hand` buffer.
  const boardBase = HOLE + req.board.length
  const enumerate = (slot: number, start: number): void => {
    if (slot === toCome) {
      scoreBoard()
      return
    }
    // Leave room for the remaining slots so every slot can still be filled.
    const limit = deck.length - (toCome - slot)
    for (let i = start; i <= limit; i++) {
      hand[boardBase + slot] = deck[i]!
      enumerate(slot + 1, i + 1)
    }
  }
  enumerate(0, 0)

  if (totalBoards === 0) {
    // Unreachable for legal inputs (a 5-card board still has one "completion": the
    // empty one), but guards against a divide-by-zero if that ever changes.
    throw new Error('no board completions to enumerate')
  }

  const result: HandEquity[] = []
  for (let s = 0; s < numSeats; s++) {
    result.push({
      win: wins[s]! / totalBoards,
      tie: ties[s]! / totalBoards,
      equity: (wins[s]! + potShare[s]!) / totalBoards,
    })
  }
  return result
}

/**
 * Parse a list of cards that may be written with or without spaces between them, so
 * both `"AhKh"` and `"Ah Kh"` (and `"As Kd 7h"`) work. The text is split on
 * whitespace first, then any token longer than two characters is chopped into
 * two-character cards, each parsed by the engine's {@link parseCard}. Throws on any
 * malformed card, and on a token whose length is not a multiple of two.
 */
function parseCardRun(text: string): Card[] {
  const cards: Card[] = []
  for (const token of text
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)) {
    if (token.length % 2 !== 0) {
      throw new SyntaxError(`"${token}" is not a whole number of 2-char cards`)
    }
    for (let i = 0; i < token.length; i += 2) {
      cards.push(parseCard(token.slice(i, i + 2)))
    }
  }
  return cards
}

/**
 * Build an {@link EquityRequest} from human-readable strings, reusing the engine's
 * card parser. Each hand is a string of two cards, written either glued (`"AhKh"`)
 * or spaced (`"Ah Kh"`); the optional board is one string of community cards
 * (e.g. `"7s 8d 2c"`, `"7s8d2c"`, or `""` for preflop). Throws on any malformed card
 * and rejects a hand that does not parse to exactly two cards.
 *
 * @example
 *   const req = parseEquityRequest(['AhAd', 'KsKc']) // AA vs KK preflop
 *   exactEquity(req)
 */
export function parseEquityRequest(handStrings: readonly string[], board = ''): EquityRequest {
  const hands = handStrings.map((text, i): readonly [Card, Card] => {
    const cards = parseCardRun(text)
    if (cards.length !== 2) {
      throw new RangeError(
        `hand ${i} ("${text}") must parse to exactly 2 cards, got ${cards.length}`,
      )
    }
    return [cards[0]!, cards[1]!]
  })
  return { hands, board: parseCardRun(board) }
}
