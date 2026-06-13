/**
 * Equity-based hand reading — the bot perception layer (ticket 0018).
 *
 * A bot decides by first answering *"how good is my hand right now?"*. The epic
 * ([[0006-heuristic-opponents]]) mandates that this answer come from the equity engine,
 * **not** a hand-rolled strength table — so everything here is computed entirely through
 * `@holdem/odds` ({@link exactEquity} / {@link monteCarloEquity} / {@link parseRange} /
 * {@link rangeSeat} / {@link fixedSeat}). This module does not re-derive equity; it only
 * decides *which* odds-engine entry point to call and against *what* assumed villain
 * holdings, then hands the result straight back.
 *
 * The crucial difference from the odds package's known-vs-known oracle is **imperfect
 * information**: a bot can see its own two cards and the board (the fields it reads off a
 * {@link DecisionContext}, ticket 0017) but never villain's cards. So instead of a
 * concrete opponent hand it reasons against an **assumed range** — a set of two-card
 * holdings villain plausibly holds — which is exactly what `monteCarloEquity` with a
 * {@link rangeSeat} already samples over.
 *
 * Scope is deliberately narrow: this layer *reads* the hand into an equity number. It
 * makes **no** betting or action decisions — pot odds and the actual policy live in the
 * decision-math helpers ({@link potOdds} etc. in `@holdem/odds`) and the heuristic policy
 * ([[0020-heuristic-opponent]]). Per [LEARNING-APPROACH.md], the goal is a *plausible*
 * read against a roughly-right range, not a solver-grade one.
 *
 * Everything here is pure: no I/O, no Node/DOM, and all randomness is seeded
 * ({@link mulberry32}, via the odds engine), so a given input + seed always yields the
 * same {@link HandEquity}.
 */

import { formatCard, type Card } from '@holdem/engine'
import {
  exactEquity,
  monteCarloEquity,
  parseRange,
  rangeSeat,
  fixedSeat,
  type HandEquity,
  type Range,
} from '@holdem/odds'

/**
 * A named "width" for the assumed opponent range, from the tightest to the widest. This
 * is the dial the personality matrix ([[0019-bot-personality]]) turns: a tight, nitty bot
 * is read against `'ultraTight'`/`'tight'`, a loose-aggressive bot against `'loose'`/
 * `'anyTwo'`. The policy layer ([[0020-heuristic-opponent]]) then reads the bot's equity
 * against whichever width its personality selects.
 *
 * The widths are intentionally coarse (five buckets, not a continuous percentage) so a
 * personality maps onto them with a single named choice, and so the concrete combo sets
 * stay small and the Monte Carlo draws stay cheap. They are rough preflop hand-selection
 * ranges, *not* street-aware or solver-derived — a plausible villain, per the learning
 * approach, not a perfect one.
 */
export type RangeWidth = 'ultraTight' | 'tight' | 'medium' | 'loose' | 'anyTwo'

/**
 * The concrete combo strings backing each {@link RangeWidth}, in the comma-separated
 * syntax {@link parseRange} accepts (pairs like `"77"`, suited like `"AKs"`, offsuit like
 * `"AKo"`). Each wider bucket contains the tighter ones plus more speculative holdings:
 *
 * - `ultraTight` — premium pairs and big broadway only (~the top few percent).
 * - `tight` — a solid value-opening range.
 * - `medium` — a typical full-ring/early-position opening range.
 * - `loose` — a wide, button-style opening range.
 * - `anyTwo` — literally every starting hand (a maniac / "any two cards").
 *
 * These are tuned for *believability and cheap sampling*, not GTO accuracy; tighten or
 * widen them freely as the personalities ([[0019-bot-personality]]) demand.
 */
const RANGE_TEXT: Readonly<Record<RangeWidth, string>> = {
  ultraTight: 'AA, KK, QQ, JJ, AKs, AKo',
  tight: 'AA, KK, QQ, JJ, TT, 99, AKs, AKo, AQs, AQo, AJs, KQs',
  medium:
    'AA, KK, QQ, JJ, TT, 99, 88, 77, AKs, AKo, AQs, AQo, AJs, AJo, ATs, KQs, KQo, KJs, QJs, JTs',
  loose:
    'AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22, ' +
    'AKs, AKo, AQs, AQo, AJs, AJo, ATs, ATo, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, ' +
    'KQs, KQo, KJs, KJo, KTs, QJs, QJo, QTs, JTs, JTo, T9s, 98s, 87s, 76s, 65s, 54s',
  anyTwo: 'AA, KK, QQ, JJ, TT, 99, 88, 77, 66, 55, 44, 33, 22',
}

/**
 * The default assumed opponent width when a caller does not specify one. `'medium'` is a
 * sensible "I have no read" prior: a typical opening range, neither nit nor maniac. The
 * personalities ([[0019-bot-personality]]) override it per bot.
 */
export const DEFAULT_RANGE_WIDTH: RangeWidth = 'medium'

/**
 * Build the concrete {@link Range} (the flat list of two-card combos) for a named
 * {@link RangeWidth}, expanding the backing tokens via {@link parseRange}.
 *
 * `'anyTwo'` is handled specially: rather than spell out all 1,326 holdings as range
 * tokens, we expand every pair plus every suited/offsuit two-rank combo programmatically.
 * The result is still a plain `Range`, so it drops straight into {@link rangeSeat}.
 *
 * Throws {@link RangeError} on an unknown width (which the type system already prevents
 * for TypeScript callers, but the runtime guard keeps the error clear for JS callers).
 */
export function opponentRangeFor(width: RangeWidth): Range {
  if (width === 'anyTwo') return allCombos()
  const text = RANGE_TEXT[width]
  if (text === undefined) throw new RangeError(`unknown range width "${String(width)}"`)
  return parseRange(text)
}

/**
 * Every legal two-card starting hand (1,326 combos): all 13 pocket pairs, plus every
 * suited and offsuit combination of two distinct ranks. Used to realise the `'anyTwo'`
 * width without enumerating it by hand. Built from {@link parseRange} tokens so the combo
 * shapes match exactly what every other width produces.
 */
function allCombos(): Range {
  const RANKS = '23456789TJQKA'
  const tokens: string[] = []
  for (let i = 0; i < RANKS.length; i++) {
    tokens.push(`${RANKS[i]}${RANKS[i]}`) // pair
    for (let j = i + 1; j < RANKS.length; j++) {
      const hi = RANKS[j]
      const lo = RANKS[i]
      tokens.push(`${hi}${lo}s`, `${hi}${lo}o`)
    }
  }
  return parseRange(tokens.join(','))
}

/**
 * The perception query: the bot's own two hole cards, the board so far, and the assumed
 * opponent holdings to read against.
 *
 * `opponentRange` is flexible so callers at different layers can express what they have:
 * a {@link RangeWidth} name (the personality's dial, [[0019-bot-personality]]), a raw
 * range string in {@link parseRange} syntax (`"AA, KK, AKs"`), or an already-parsed
 * {@link Range}. It defaults to {@link DEFAULT_RANGE_WIDTH} when omitted.
 *
 * `seed` makes the Monte Carlo path deterministic; `iterations` bounds its cost (default
 * {@link DEFAULT_ITERATIONS}). Both are ignored on the exact path, which uses no
 * randomness.
 */
export interface EquityEstimate {
  /** The acting bot's own two hole cards (e.g. from `DecisionContext.holeCards`). */
  readonly holeCards: readonly [Card, Card]
  /** The community cards revealed so far: 0 (preflop), 3 (flop), 4 (turn), or 5 (river). */
  readonly board: readonly Card[]
  /**
   * The assumed villain holdings: a {@link RangeWidth} name, a raw {@link parseRange}
   * string, or a concrete {@link Range}. Defaults to {@link DEFAULT_RANGE_WIDTH}.
   */
  readonly opponentRange?: RangeWidth | string | Range
  /** Seeds the Monte Carlo PRNG so the read is reproducible. Defaults to `0`. */
  readonly seed?: number
  /** Monte Carlo iteration cap. Defaults to {@link DEFAULT_ITERATIONS}. Ignored when exact. */
  readonly iterations?: number
}

/**
 * Default Monte Carlo iteration count: enough for a *plausible* read (≈±1% standard error
 * on a coin-flip spot) while staying fast enough to run inline for a bot's every decision.
 * Bumped only if a caller wants a tighter read; the bots do not need solver precision.
 */
export const DEFAULT_ITERATIONS = 4000

/** Board sizes that are legal in Hold'em: preflop, flop, turn, river. */
const LEGAL_BOARD_SIZES = new Set([0, 3, 4, 5])

/** The names {@link RangeWidth} can take, for the runtime string-vs-width discriminator. */
const RANGE_WIDTHS = new Set<string>(['ultraTight', 'tight', 'medium', 'loose', 'anyTwo'])

/**
 * Resolve the polymorphic `opponentRange` field into a concrete {@link Range}.
 *
 * - `undefined` → the {@link DEFAULT_RANGE_WIDTH} range.
 * - a {@link RangeWidth} name → {@link opponentRangeFor}.
 * - any other string → parsed via {@link parseRange} (raw range syntax).
 * - a {@link Range} (array of combos) → used as-is.
 *
 * Throws {@link RangeError} if the resolved range is empty (an empty range gives villain
 * no holdings to sample, which `monteCarloEquity` would reject anyway — caught early here
 * with a clearer message).
 */
function resolveRange(spec: RangeWidth | string | Range | undefined): Range {
  let range: Range
  if (spec === undefined) {
    range = opponentRangeFor(DEFAULT_RANGE_WIDTH)
  } else if (typeof spec === 'string') {
    range = RANGE_WIDTHS.has(spec) ? opponentRangeFor(spec as RangeWidth) : parseRange(spec)
  } else {
    range = spec
  }
  if (range.length === 0) {
    throw new RangeError('opponent range resolved to zero combos (nothing for villain to hold)')
  }
  return range
}

/**
 * Drop villain combos that collide with the bot's own cards or the board.
 *
 * A combo containing a card the bot holds, or a card already on the board, is physically
 * impossible for villain — they cannot hold a card that is elsewhere. The Monte Carlo
 * sampler rejects such combos *per iteration* anyway (so leaving them in is not
 * incorrect), but pruning them up front (a) keeps the effective range honest, (b) avoids
 * wasted re-draws, and (c) lets us detect the degenerate "every combo collides" case and
 * fail with a clear error instead of the sampler's generic redraw-limit throw.
 */
function pruneColliding(range: Range, blocked: ReadonlySet<Card>): Range {
  return range.filter((combo) => !blocked.has(combo[0]) && !blocked.has(combo[1]))
}

/**
 * Validate the bot's own inputs (its hole cards and the board) the way the odds engine
 * validates a request: exactly two hole cards, a legal board size, and no duplicate card
 * across hole + board. Returns the set of cards the bot itself blocks, for collision
 * pruning. Throws a clear error in the odds-package style on anything malformed.
 */
function blockedByHero(holeCards: readonly [Card, Card], board: readonly Card[]): Set<Card> {
  if (holeCards.length !== 2) {
    throw new RangeError(`holeCards must have exactly 2 cards, got ${holeCards.length}`)
  }
  if (!LEGAL_BOARD_SIZES.has(board.length)) {
    throw new RangeError(`board must have 0, 3, 4, or 5 cards, got ${board.length}`)
  }
  const blocked = new Set<Card>()
  const claim = (card: Card, where: string): void => {
    if (blocked.has(card)) throw new Error(`duplicate card ${formatCard(card)} (${where})`)
    blocked.add(card)
  }
  claim(holeCards[0], 'holeCards')
  claim(holeCards[1], 'holeCards')
  for (const card of board) claim(card, 'board')
  return blocked
}

/**
 * Estimate the bot's equity (expected pot share, a fraction `0..1` in the `equity` field)
 * from its hole cards + board against an assumed opponent range — computed entirely via
 * `@holdem/odds`.
 *
 * **Exact vs. Monte Carlo selection.** The choice turns on whether the spot is cheap to
 * enumerate. After collision pruning:
 *
 * - If the assumed range has collapsed to a **single concrete combo** *and* there are at
 *   most {@link MAX_EXACT_CARDS_TO_COME} board cards still to come (a turn or river spot),
 *   the villain hand is fully known and the board enumeration is small (≤ C(46,1) = 46
 *   boards on the turn, 1 on the river), so we call {@link exactEquity} for an exact,
 *   randomness-free read.
 * - **Otherwise** — a multi-combo range, or a single combo with a flop/preflop board
 *   whose enumeration would explode (C(47,2) and C(48,5) respectively) — we sample with a
 *   bounded, seeded {@link monteCarloEquity} against a {@link rangeSeat}. This is the
 *   natural tool against a range and keeps the read fast and deterministic.
 *
 * Either way the bot is seat 0 in a two-seat (hero vs. one assumed villain) spot, and we
 * return seat 0's {@link HandEquity}.
 *
 * **Collisions.** Range combos that collide with the bot's cards or the board are pruned
 * before the read (see {@link pruneColliding}); if *every* combo collides, this throws
 * rather than handing the sampler an empty range.
 *
 * Throws {@link RangeError}/{@link Error} on malformed inputs (wrong hole-card count,
 * illegal board size, duplicate cards, an empty/fully-colliding range, or a non-positive
 * iteration count), mirroring the odds engine's validation style.
 */
export function estimateEquity(query: EquityEstimate): HandEquity {
  const { holeCards, board, opponentRange, seed = 0, iterations = DEFAULT_ITERATIONS } = query

  const blocked = blockedByHero(holeCards, board)
  const resolved = resolveRange(opponentRange)
  const villain = pruneColliding(resolved, blocked)
  if (villain.length === 0) {
    throw new Error(
      'every assumed opponent combo collides with the bot cards or board — ' +
        'no possible villain holding remains',
    )
  }

  const cardsToCome = 5 - board.length
  if (villain.length === 1 && cardsToCome <= MAX_EXACT_CARDS_TO_COME) {
    // Villain is a single known combo and the board enumeration is small: take the exact,
    // randomness-free read straight from the oracle.
    const villainCombo = villain[0]!
    const [heroEquity] = exactEquity({ hands: [holeCards, villainCombo], board })
    return heroEquity!
  }

  // Against a range (or a single combo with an expensive enumeration), sample. Bounded,
  // seeded, deterministic.
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, got ${iterations}`)
  }
  const [heroEquity] = monteCarloEquity({
    seats: [fixedSeat(holeCards), rangeSeat(villain)],
    board,
    iterations,
    seed,
  })
  return heroEquity!
}

/**
 * The most board cards still to come for which we prefer exact enumeration over sampling
 * when villain is a single known combo. `1` means turn (≤46 completions) and river (1
 * completion) go exact, while flop (C(47,2) = 1,081) and preflop (C(48,5) ≈ 1.7M) sample.
 * Kept here as a named knob so the exact-vs-sampled boundary is one obvious constant.
 */
export const MAX_EXACT_CARDS_TO_COME = 1
