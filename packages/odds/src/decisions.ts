/**
 * Decision-math helpers — turn an equity number and a betting situation into the
 * quantities the coach ([[0007-coaching-engine]]) narrates and the bots
 * ([[0006-heuristic-opponents]]) reason with (ticket 0015).
 *
 * Where the equity layer ({@link exactEquity}, tickets 0013/0014) answers *"how often
 * do I win this pot?"*, this layer answers the next question: *"given that win rate and
 * the money on the table, should I put chips in, and what is it worth?"* Everything here
 * is closed-form and exact — pot odds, the rule-of-2-and-4 outs approximation, and the
 * chip EV of a call or a bet/shove — except {@link countOuts}, which enumerates the
 * remaining deck (reusing {@link evaluate7}) to count next-card outs against a specified
 * opponent hand.
 *
 * Conventions used throughout:
 *
 * - **Equity** is a fraction in `0..1` (hero's expected pot share), exactly the
 *   `equity` field of {@link HandEquity}.
 * - **Chips** (`pot`, `callAmount`, `betAmount`) are plain non-negative numbers in
 *   whatever unit the caller uses (big blinds, dollars, ...); the helpers never assume a
 *   unit. EV results come back in the same unit.
 * - **`pot` is the pot BEFORE hero's chips go in** — the dead money hero is trying to
 *   win, *not* counting the call/bet hero is contemplating. The amount hero must add is
 *   the separate `callAmount` / `betAmount`.
 *
 * These are deliberately small pure functions over plain numbers and {@link Card}s — no
 * engine state object, no randomness, no Node/DOM. They are the verdict primitives the
 * deterministic coach narrates.
 */

import { evaluate7, HandCategory, makeDeck, rankIndex, suitIndex, type Card } from '@holdem/engine'

import { exactEquity, type HandEquity } from './equity.js'

/**
 * Pot odds: the **break-even equity** hero needs to profitably call.
 *
 * Hero risks `callAmount` to win the `pot` already out there plus hero's own call back,
 * so the total pot hero plays for is `pot + callAmount`. Calling breaks even when
 *
 *   equity * (pot + callAmount) === callAmount
 *
 * i.e. when `equity === callAmount / (pot + callAmount)`. That ratio — returned here as
 * a fraction in `0..1` — is the minimum equity a call needs to be break-even or better.
 *
 * `pot` is the pot *before* hero's call (the standard convention); `callAmount` is what
 * hero must put in to call. A free check (`callAmount === 0`) needs 0 equity. Throws on
 * negative inputs, or on a zero pot facing a zero call (no pot to play for).
 *
 * @example
 *   potOdds(50, 100) // call 50 into a pot of 100 → 50 / 150 = 0.3333…
 */
export function potOdds(callAmount: number, pot: number): number {
  if (callAmount < 0) throw new RangeError(`callAmount must be ≥ 0, got ${callAmount}`)
  if (pot < 0) throw new RangeError(`pot must be ≥ 0, got ${pot}`)
  const total = pot + callAmount
  if (total === 0) throw new RangeError('pot odds are undefined when both pot and callAmount are 0')
  return callAmount / total
}

/**
 * Rule of 2 and 4: the standard mental approximation of a draw's equity from its out
 * count.
 *
 * Each clean out is worth roughly 2% per card still to come, so the approximate equity
 * is `outs * 2% * cardsToCome`:
 *
 * - **Flop, two cards to come** (`cardsToCome === 2`): `≈ outs * 4%`.
 * - **Turn, one card to come** (`cardsToCome === 1`): `≈ outs * 2%`.
 *
 * It is a deliberate over-estimate at high out counts (it double-counts the outs that
 * would arrive on *both* streets), so the result is clamped to `1`. Returned as a
 * fraction in `0..1`. For an exact figure use {@link exactEquity}; this exists because
 * it is the arithmetic the coach teaches players to do at the table.
 *
 * @example
 *   outsToEquity(9, 2) // 9-out flush draw on the flop → ≈ 0.36
 *   outsToEquity(9, 1) // …with one card to come → ≈ 0.18
 */
export function outsToEquity(outs: number, cardsToCome: 1 | 2): number {
  if (!Number.isInteger(outs) || outs < 0) {
    throw new RangeError(`outs must be a non-negative integer, got ${outs}`)
  }
  if (cardsToCome !== 1 && cardsToCome !== 2) {
    throw new RangeError(`cardsToCome must be 1 (turn) or 2 (flop), got ${cardsToCome}`)
  }
  return Math.min(1, outs * 0.02 * cardsToCome)
}

/**
 * A counted-outs result: which remaining cards, dealt as the **next** board card,
 * promote hero from behind/tied to ahead of the opponent's current best hand.
 *
 * - `outs` — how many such cards there are (`cards.length`).
 * - `cards` — those cards, in deterministic deck order, for display/debugging.
 */
export interface OutsResult {
  readonly outs: number
  readonly cards: readonly Card[]
}

/**
 * Count hero's **outs** against a specific opponent hand on a partial board.
 *
 * Definition used here (one of several reasonable ones, chosen for being crisp and
 * verifiable): an out is a card that, dealt as the **next** board card, makes hero's
 * best hand *strictly beat* the opponent's best hand on that same one-card-longer board.
 * Cards where hero merely catches up to a tie do **not** count. Only cards that change
 * the verdict from "not winning" to "winning" are outs — if hero is already ahead before
 * the card, that card is still counted iff hero is still ahead after it (so a made hand
 * with no way to be outdrawn on the next card counts every remaining card as an "out").
 * In the typical drawing spot hero is behind pre-card, so this reduces to the intuitive
 * "cards that complete my hand into the lead".
 *
 * The board must be a flop (3) or turn (4): there must be at least one card still to
 * come for "the next card" to mean anything. The opponent hand is fixed and known. The
 * remaining deck excludes hero's two cards, the opponent's two cards, and the board.
 *
 * Reuses {@link evaluate7} for both seats on each candidate board, so it agrees exactly
 * with the showdown logic the equity engine uses. For the multi-card lookahead figure
 * (turn *and* river), use {@link exactEquity} instead — this counts single next cards.
 */
export function countOuts(
  hero: readonly [Card, Card],
  opponent: readonly [Card, Card],
  board: readonly Card[],
): OutsResult {
  if (board.length !== 3 && board.length !== 4) {
    throw new RangeError(`countOuts needs a flop (3) or turn (4) board, got ${board.length}`)
  }

  // Gather every known card and reject duplicates — the same physical card cannot be in
  // two places. Mirrors the equity engine's duplicate guard.
  const seen = new Set<Card>()
  const claim = (card: Card, where: string): void => {
    if (seen.has(card)) throw new Error(`duplicate card (${where})`)
    seen.add(card)
  }
  claim(hero[0], 'hero')
  claim(hero[1], 'hero')
  claim(opponent[0], 'opponent')
  claim(opponent[1], 'opponent')
  for (const card of board) claim(card, 'board')

  const deck = makeDeck().filter((card) => !seen.has(card))

  // Reused 7-card buffers (hole cards + board + the candidate next card). The board has
  // 3 or 4 known cards; the candidate fills the next slot, leaving a 5- or 6-card board
  // — both of which evaluate7 accepts.
  const heroHand: Card[] = [hero[0], hero[1], ...board, hero[0]]
  const oppHand: Card[] = [opponent[0], opponent[1], ...board, opponent[0]]
  const nextSlot = 2 + board.length

  const cards: Card[] = []
  for (const card of deck) {
    heroHand[nextSlot] = card
    oppHand[nextSlot] = card
    if (evaluate7(heroHand).score > evaluate7(oppHand).score) {
      cards.push(card)
    }
  }
  return { outs: cards.length, cards }
}

/**
 * A classified drawing hand: the kind of draw hero holds, how many cards complete it, and
 * which cards those are. The opponent-independent counterpart to {@link countOuts} — where
 * `countOuts` counts cards that beat a *specific* villain hand, this counts cards that
 * complete hero's draw into a flush or straight, the way a player counts outs at the table.
 *
 * This is the count the coach teaches ({@link outsToEquity}'s rule of 2 and 4 turns it into
 * an equity estimate), so it deliberately recognises only the two draws with a crisp,
 * teachable out count — flushes and straights. Made hands and weaker "improvements" (catching
 * a pair, two pair, trips) return `null`: there is no clean outs story to narrate for them.
 */
export interface DrawRead {
  /** Which draw hero holds. `combo` = a flush draw *and* a straight draw at once. */
  readonly type: 'flush' | 'open-ender' | 'gutshot' | 'combo'
  /** A table-friendly name, e.g. `"flush draw"`, `"open-ended straight draw"`, `"gutshot"`. */
  readonly label: string
  /** How many remaining cards complete the draw (`cards.length`). */
  readonly outs: number
  /** Those cards, in deterministic deck order, for display/debugging. */
  readonly cards: readonly Card[]
}

/**
 * Classify hero's draw on a partial board and count its outs — opponent-independent, the
 * canonical "outs to your draw" a player counts at the table (flush draw ≈ 9, open-ender ≈ 8,
 * gutshot ≈ 4). Returns `null` when hero has no flush/straight draw, or already holds a made
 * hand stronger than a pair (no draw story to tell).
 *
 * The board must be a flop (3) or turn (4): there must be a card still to come for a draw to
 * complete. Reuses {@link evaluate7} (so straight detection agrees exactly with the showdown)
 * and direct suit counting for the flush, and gates both on hero *participating* in the draw —
 * a flush counts only when hero holds a card of the suit, and on the turn a straight out counts
 * only when the board alone is not already a straight with that card (hero must add the hand,
 * not merely play the board).
 *
 * `flush` and combined draws report the flush as the headline; `combo` means a flush draw and a
 * straight draw at once. Straights split on how many distinct ranks complete them: two ranks →
 * `open-ender`, one rank → `gutshot`.
 */
export function countDrawOuts(
  hero: readonly [Card, Card],
  board: readonly Card[],
): DrawRead | null {
  if (board.length !== 3 && board.length !== 4) {
    throw new RangeError(`countDrawOuts needs a flop (3) or turn (4) board, got ${board.length}`)
  }

  const known = [...hero, ...board]
  // A made hand stronger than a pair is not a draw — there's no clean out count to teach.
  const current = evaluate7(known)
  if (current.category > HandCategory.Pair) return null

  const isKnown = (card: Card): boolean => known.includes(card)

  // Flush draw — counted directly off suit counts so we can require hero to hold a card of the
  // suit (otherwise a four-flush board hero doesn't share would read as hero's draw).
  const suitCounts = [0, 0, 0, 0]
  for (const card of known) suitCounts[suitIndex(card)]! += 1
  const heroSuitCounts = [0, 0, 0, 0]
  for (const card of hero) heroSuitCounts[suitIndex(card)]! += 1
  let flushSuit = -1
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s] === 4 && heroSuitCounts[s]! >= 1) flushSuit = s
  }
  const flushCards: Card[] = []
  if (flushSuit >= 0) {
    for (const card of makeDeck()) {
      if (!isKnown(card) && suitIndex(card) === flushSuit) flushCards.push(card)
    }
  }
  const flushSet = new Set(flushCards)

  // Straight draw — a card that makes hero's best hand exactly a straight (a straight flush is a
  // flush out, already counted above and skipped here). On the turn, gate on the board not
  // already making the straight by itself, so hero genuinely adds the hand.
  const straightCards: Card[] = []
  for (const card of makeDeck()) {
    if (isKnown(card) || flushSet.has(card)) continue
    const made = evaluate7([...known, card])
    if (made.category !== HandCategory.Straight) continue
    if (board.length === 4 && evaluate7([...board, card]).category >= HandCategory.Straight) {
      continue
    }
    straightCards.push(card)
  }

  const flushOuts = flushCards.length
  const straightOuts = straightCards.length
  if (flushOuts + straightOuts === 0) return null

  const cards = [...flushCards, ...straightCards]
  let type: DrawRead['type']
  let label: string
  if (flushOuts > 0 && straightOuts > 0) {
    type = 'combo'
    label = 'combo draw (flush + straight)'
  } else if (flushOuts > 0) {
    type = 'flush'
    label = 'flush draw'
  } else if (new Set(straightCards.map(rankIndex)).size >= 2) {
    type = 'open-ender'
    label = 'open-ended straight draw'
  } else {
    type = 'gutshot'
    label = 'gutshot'
  }
  return { type, label, outs: cards.length, cards }
}

/** The pot situation a chip-EV helper reasons about: equity plus the money involved. */
export interface CallSpot {
  /** Hero's equity (expected pot share) as a fraction `0..1`. */
  readonly equity: number
  /** The pot *before* hero's call goes in. */
  readonly pot: number
  /** What hero must put in to call. */
  readonly callAmount: number
}

/** Validate a {@link CallSpot}'s numbers, throwing a clear error on anything illegal. */
function validateCallSpot({ equity, pot, callAmount }: CallSpot): void {
  if (equity < 0 || equity > 1) throw new RangeError(`equity must be in 0..1, got ${equity}`)
  if (pot < 0) throw new RangeError(`pot must be ≥ 0, got ${pot}`)
  if (callAmount < 0) throw new RangeError(`callAmount must be ≥ 0, got ${callAmount}`)
}

/**
 * Chip EV of **calling**, from hero's perspective, relative to folding, in the input
 * unit.
 *
 *   EV = equity * (pot + callAmount) − callAmount
 *
 * Equivalently `equity * pot − (1 − equity) * callAmount`: when hero **wins** (probability
 * `equity`) hero collects the `pot` of dead money — hero's own call comes back but is not
 * profit — and when hero **loses** (probability `1 − equity`) hero forfeits the
 * `callAmount`. A **positive** result means calling gains chips over folding, **negative**
 * means it loses chips, and exactly **0** is the break-even point. (`equity` folds wins and
 * tie-splits together, matching {@link HandEquity}'s `equity` field.)
 *
 * This is the EV that is *consistent with* {@link potOdds}: it crosses zero exactly at
 * `equity === callAmount / (pot + callAmount)`, so {@link evOfCall} and
 * {@link callIsProfitable} never disagree (see that function). A tempting alternative,
 * `equity * (pot + callAmount) − (1 − equity) * callAmount`, counts the returned call as
 * winnings *and* keeps it at risk, so it would not break even at the pot-odds threshold —
 * we use the internally-consistent formula above instead.
 *
 * @example
 *   evOfCall({ equity: 0.5, pot: 100, callAmount: 50 }) // 0.5*150 − 50 = +25
 *   evOfCall({ equity: 1 / 3, pot: 100, callAmount: 50 }) // break-even → 0
 */
export function evOfCall(spot: CallSpot): number {
  validateCallSpot(spot)
  const { equity, pot, callAmount } = spot
  return equity * (pot + callAmount) - callAmount
}

/**
 * Verdict: is calling profitable? `true` when hero's equity meets or beats the pot-odds
 * threshold, i.e. `equity >= potOdds(callAmount, pot)`.
 *
 * This is exactly equivalent to `evOfCall(spot) >= 0`: the break-even equity is the
 * equity at which {@link evOfCall} is `0`, so the two never disagree. The comparison is
 * **non-strict** (`>=`), so a precisely break-even spot — equity equal to the pot odds,
 * EV exactly `0` — counts as profitable (a coin you can flip for free). Callers wanting
 * a strict edge should compare `evOfCall(spot) > 0` themselves.
 *
 * A free call (`callAmount === 0`) is always profitable: the threshold is 0 equity.
 */
export function callIsProfitable(spot: CallSpot): boolean {
  validateCallSpot(spot)
  if (spot.callAmount === 0) return true
  return spot.equity >= potOdds(spot.callAmount, spot.pot)
}

/** The situation a bet/shove EV helper reasons about. */
export interface BetSpot {
  /** Hero's equity (expected pot share) as a fraction `0..1`, *for the times villain calls*. */
  readonly equity: number
  /** The pot *before* hero's bet goes in. */
  readonly pot: number
  /** The amount hero bets/shoves. */
  readonly betAmount: number
  /**
   * Probability villain calls the bet, `0..1`. Defaults to `1` (villain always calls):
   * the conservative "no fold equity" assumption, where the bet's value comes only from
   * being ahead at showdown. A value `< 1` credits the bet with **fold equity** — the
   * pot hero scoops uncontested when villain folds.
   */
  readonly villainCallProbability?: number
}

/**
 * Chip EV of **betting/shoving**, from hero's perspective, relative to the moment
 * *before* hero bets, in the input unit.
 *
 * Two branches, weighted by whether villain calls (`villainCallProbability`, default
 * `1` = always calls):
 *
 * - **Villain folds** (probability `1 − p`): hero scoops the existing `pot` uncontested
 *   and risks nothing → net `+pot`.
 * - **Villain calls** (probability `p`): villain matches `betAmount`, so the contested
 *   pot becomes `pot + 2 * betAmount` and hero's win-share of it is `equity`, against
 *   hero's own `betAmount` at risk → net `equity * (pot + 2 * betAmount) − betAmount`.
 *   This is the same accounting as {@link evOfCall} (win the dead money, lose your own
 *   chips), so the two never contradict.
 *
 *   EV = (1 − p) * pot + p * [ equity * (pot + 2 * betAmount) − betAmount ]
 *
 * With the default `p = 1` (no fold equity) this is exactly
 * `evOfCall({ equity, pot: pot + betAmount, callAmount: betAmount })` — hero putting the
 * last `betAmount` into a pot that already holds the original `pot` plus villain's
 * matching call. `equity` is conditional on villain calling (hero's showdown share),
 * the natural number to pass when villain's calling range is known. A `villainCallProbability`
 * **fold-equity** assumption must be supplied by the caller; the default makes none.
 *
 * @example
 *   // No fold equity, 60% to win a called shove of 50 into 100:
 *   evOfBet({ equity: 0.6, pot: 100, betAmount: 50 }) // 0.6*200 − 50 = +70
 */
export function evOfBet(spot: BetSpot): number {
  const { equity, pot, betAmount, villainCallProbability = 1 } = spot
  if (equity < 0 || equity > 1) throw new RangeError(`equity must be in 0..1, got ${equity}`)
  if (pot < 0) throw new RangeError(`pot must be ≥ 0, got ${pot}`)
  if (betAmount < 0) throw new RangeError(`betAmount must be ≥ 0, got ${betAmount}`)
  if (villainCallProbability < 0 || villainCallProbability > 1) {
    throw new RangeError(`villainCallProbability must be in 0..1, got ${villainCallProbability}`)
  }
  const p = villainCallProbability
  const calledEv = equity * (pot + 2 * betAmount) - betAmount
  return (1 - p) * pot + p * calledEv
}

/**
 * Convenience bridge from a fully-known heads-up spot straight to a call verdict: run
 * {@link exactEquity} for `hero` vs `opponent` on `board`, then evaluate the call with
 * those exact equities. Returns hero's {@link HandEquity}, the {@link potOdds} threshold,
 * the chip EV of calling, and the boolean verdict in one shot — handy for tests and for
 * the coach narrating a concrete spot.
 */
export function evaluateCall(
  hero: readonly [Card, Card],
  opponent: readonly [Card, Card],
  board: readonly Card[],
  pot: number,
  callAmount: number,
): {
  readonly equity: HandEquity
  readonly threshold: number
  readonly ev: number
  readonly profitable: boolean
} {
  const [heroEquity] = exactEquity({ hands: [hero, opponent], board })
  const equity = heroEquity!.equity
  const spot: CallSpot = { equity, pot, callAmount }
  return {
    equity: heroEquity!,
    threshold: potOdds(callAmount, pot),
    ev: evOfCall(spot),
    profitable: callIsProfitable(spot),
  }
}
