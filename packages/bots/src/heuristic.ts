/**
 * The heuristic policy — equity + pot odds + personality → a legal action (ticket 0020).
 *
 * This is the headline deliverable of the heuristic-opponents epic
 * ([[0006-heuristic-opponents]]): the first {@link Opponent} that actually *plays*, by
 * composing the three pieces the earlier tickets built into a single legal {@link Action}:
 *
 * 1. **The read** — how good is my hand right now? Answered by {@link estimateEquity}
 *    ([[0018-bot-hand-reading]]), entirely through `@holdem/odds`, against the villain
 *    range the bot's personality assumes.
 * 2. **The math** — given that equity and the money on the table, should chips go in, and
 *    is it worth it? Answered by the decision helpers in `@holdem/odds`
 *    ({@link potOdds} / {@link callIsProfitable} / {@link evOfCall}), ticket 0015. We
 *    re-derive **none** of this here.
 * 3. **The personality** — how much hand do I need to continue, and how often / how big do
 *    I bet when I do? The tight/loose × passive/aggressive {@link Personality}
 *    ([[0019-bot-personality]]) supplies the knobs.
 *
 * The aim, per [LEARNING-APPROACH.md], is *plausible over strong*: believable, mostly-sane
 * lines that are fun to play against and make good coachable pots — not a solver, not
 * exploit-proof. A real GTO policy ([[0012-gto-solver]]) drops into the same
 * {@link Opponent} seam later without touching this file.
 *
 * **Purity / determinism.** Zero I/O, no Node/DOM, no global randomness. The bot carries
 * its own seeded {@link mulberry32} PRNG, threaded into both the Monte-Carlo equity read
 * and the aggression coin-flip, so a fixed `(personality, seed, context)` always yields
 * the same action — essential for stable tests and replays.
 */

import type { Action } from '@holdem/engine'
import { callIsProfitable, evOfCall, potOdds } from '@holdem/odds'

import type { DecisionContext } from './context.js'
import { estimateEquity } from './handReading.js'
import type { Opponent } from './opponent.js'
import { mulberry32 } from './opponent.js'
import { DEFAULT_PERSONALITY, validatePersonality, type Personality } from './personality.js'

/**
 * Monte-Carlo iteration count for the in-decision equity read. Deliberately *lower* than
 * the perception layer's {@link DEFAULT_ITERATIONS} (4000): a bot decides on every street
 * of every hand, and the robustness tests play many full hands across dozens of seeds, so
 * the hot path must stay cheap. ~800 samples is a ±1.8%-ish read on a coin-flip — plenty
 * for a *plausible* (not solver-grade) decision, and the seeded PRNG keeps it deterministic.
 */
export const HEURISTIC_ITERATIONS = 800

/**
 * Clamp an intended "bet/raise to" total into the legal `[min, max]` window and round to
 * an integer (the engine requires integer amounts). Returns `null` when the window is
 * degenerate (`min > max`, which the engine never reports, but we stay total). The rounded
 * value is re-clamped so rounding can never push it back outside the window.
 */
function clampToLegal(intended: number, min: number, max: number): number | null {
  if (min > max) return null
  const rounded = Math.round(intended)
  return Math.min(max, Math.max(min, rounded))
}

/**
 * A heuristic {@link Opponent}: reads its equity, runs the pot-odds / EV math, and lets its
 * {@link Personality} bias both the continue decision (tightness) and the bet/raise choice
 * and sizing (aggression).
 *
 * Construct directly (`new HeuristicOpponent(LOOSE_AGGRESSIVE, 42)`) or via the
 * {@link heuristicOpponent} factory. Both default to {@link DEFAULT_PERSONALITY} (TAG) and
 * seed `0`. The personality is validated up front, so a malformed one throws at
 * construction rather than mid-hand.
 *
 * **The decision rule**, given a {@link DecisionContext}:
 *
 * - Read `equity` via {@link estimateEquity} against `personality.tightness.assumedVillainRange`,
 *   threading the seed and {@link HEURISTIC_ITERATIONS}.
 * - **Facing a bet** (`legalActions.call` non-null): continue only if the call clears
 *   *both* the pot-odds/EV bar **and** the tightness bias — see {@link wantsToContinue}.
 *   On a continue, the aggression coin-flip ({@link wantsAggression}) decides call vs
 *   raise; a chosen raise is sized `betSizing × pot` and clamped to `legalActions.raise`,
 *   falling back to a call if a raise is illegal (capped, not reopened) or the bot rolls
 *   the passive branch.
 * - **Unbet pot** (`legalActions.check`): the aggression coin-flip plus an equity floor
 *   decide bet vs check; a chosen bet is sized `betSizing × pot` and clamped to
 *   `legalActions.bet`, falling back to a check if a bet is illegal.
 * - Always returns an action permitted by `ctx.legalActions` — every aggressive branch
 *   degrades to call/check/fold when its option is unavailable; an illegal action is never
 *   constructed.
 */
export class HeuristicOpponent implements Opponent {
  readonly name: string
  private readonly personality: Personality
  /** The bot's own PRNG, advanced once per aggression decision. Seeded for determinism. */
  private readonly rng: () => number
  /** The fixed seed handed to every {@link estimateEquity} call, so the read is stable. */
  private readonly equitySeed: number

  constructor(personality: Personality = DEFAULT_PERSONALITY, seed = 0) {
    this.personality = validatePersonality(personality)
    this.name = personality.name
    this.equitySeed = seed
    this.rng = mulberry32(seed)
  }

  /**
   * The bot's equity read for this spot: its hole cards and the board against the
   * personality's assumed villain range, sampled with the bot's seed and the cheap
   * in-decision iteration count.
   */
  private readEquity(ctx: DecisionContext): number {
    return estimateEquity({
      holeCards: ctx.holeCards,
      board: ctx.board,
      opponentRange: this.personality.tightness.assumedVillainRange,
      seed: this.equitySeed,
      iterations: HEURISTIC_ITERATIONS,
    }).equity
  }

  /**
   * Should the bot keep chips in when facing a bet? Combines the pot-odds/EV math with the
   * tightness bias so the two reinforce rather than fight:
   *
   * - **Pot-odds floor (the math).** A call must be profitable — `callIsProfitable` /
   *   `evOfCall ≥ 0`, i.e. `equity ≥ potOdds(toCall, pot)`. We never continue on a
   *   clearly −EV call regardless of style; that is the objective spine the ticket asks us
   *   to keep.
   * - **Tightness bias.** On top of the pot-odds floor, the bot demands a *blend* of the
   *   pot-odds threshold and its `continueEquity`: `bar = max(potOddsThreshold, blend)`
   *   where `blend = potOddsThreshold + tightnessWeight × (continueEquity − potOddsThreshold)`.
   *   So a tight bot (high `continueEquity`) folds marginal-but-+EV spots its discipline
   *   dislikes, while a loose bot (low `continueEquity`) can *pull the bar down toward* the
   *   raw pot-odds floor and continue wider — but never below it (the `max` guarantees the
   *   call stays at least break-even). {@link CONTINUE_TIGHTNESS_WEIGHT} sets how hard the
   *   bias pulls.
   *
   * **Pot accounting (read carefully — the easiest bug here).** The odds helpers define
   * `pot` as the dead money *before* hero's call and `callAmount` as the chips hero must
   * *add* to call. The {@link DecisionContext} hands us exactly those as `ctx.pot` (the
   * engine's lifetime pot total, already including villain's current bet and hero's own
   * committed chips, but **not** the `toCall` hero has yet to add) and `ctx.toCall` (the
   * additional chips to call). So we map **directly**: `potOdds(ctx.toCall, ctx.pot)` and
   * `evOfCall({ equity, pot: ctx.pot, callAmount: ctx.toCall })`. We do **not** add
   * `toCall` into `pot` (the helper does that) nor subtract hero's committed.
   */
  private wantsToContinue(equity: number, ctx: DecisionContext): boolean {
    // A free continue (nothing to call) is never folded — there is no price to pay, so the
    // tightness bias has nothing to weigh against. (Pot odds are likewise 0 here.)
    if (ctx.toCall === 0) return true

    const spot = { equity, pot: ctx.pot, callAmount: ctx.toCall }
    // Objective floor: never continue on a −EV call.
    if (!callIsProfitable(spot)) return false
    if (evOfCall(spot) < 0) return false

    const threshold = potOdds(ctx.toCall, ctx.pot)
    const { continueEquity } = this.personality.tightness
    const blend = threshold + CONTINUE_TIGHTNESS_WEIGHT * (continueEquity - threshold)
    const bar = Math.max(threshold, blend)
    return equity >= bar
  }

  /**
   * The seeded aggression coin-flip: `true` (take the aggressive line — bet or raise) with
   * probability `aggression.betFrequency`. Advances the bot's PRNG exactly once, so a fixed
   * seed produces a fixed sequence of aggression decisions across a hand.
   */
  private wantsAggression(): boolean {
    return this.rng() < this.personality.aggression.betFrequency
  }

  /** The bot's intended "bet/raise to" total: `betSizing × pot`, plus the chips already in. */
  private sizedTo(ctx: DecisionContext): number {
    // betSizing is a fraction of the *current* pot; the engine wants a "to" total on this
    // street, so add the chips this seat has already committed this street.
    return ctx.committed + this.personality.aggression.betSizing * ctx.pot
  }

  decide(ctx: DecisionContext): Action {
    const legal = ctx.legalActions
    const equity = this.readEquity(ctx)

    // --- Facing a bet: fold, call, or raise. ----------------------------------------
    if (legal.call) {
      if (!this.wantsToContinue(equity, ctx)) {
        // Below the bar — fold if we can; otherwise checking is not offered here (we face
        // a bet), so the only total fallback is the call we just declined to prefer.
        return legal.fold ? { type: 'fold' } : { type: 'call' }
      }
      // We are continuing. Aggression (and a raise actually being legal) decides whether
      // to turn the call into a raise.
      if (legal.raise && this.wantsAggression()) {
        const amount = clampToLegal(this.sizedTo(ctx), legal.raise.min, legal.raise.max)
        if (amount !== null) return { type: 'raise', amount }
      }
      return { type: 'call' }
    }

    // --- Unbet pot: check or bet. -----------------------------------------------------
    if (legal.check) {
      // Bet when the bot both rolls the aggressive branch *and* holds enough to want chips
      // in — the equity floor stops it from betting air every time the coin says "bet",
      // avoiding the degenerate "bet 100% of nothing" line while still bluffing sometimes.
      if (legal.bet && equity >= BET_EQUITY_FLOOR && this.wantsAggression()) {
        const amount = clampToLegal(this.sizedTo(ctx), legal.bet.min, legal.bet.max)
        if (amount !== null) return { type: 'bet', amount }
      }
      return { type: 'check' }
    }

    // --- No call and no check offered: the engine always leaves fold available. -------
    return { type: 'fold' }
  }
}

/**
 * How hard the tightness bias pulls the continue bar away from the raw pot-odds threshold
 * toward the personality's `continueEquity` (a fraction `0..1`). `0` would make the bot a
 * pure pot-odds machine (ignore personality); `1` would pull the bar all the way to
 * `continueEquity`. `0.5` is a middle ground: tightness *visibly* matters (a nit folds
 * spots a station calls) without overriding the math so hard that the pot-odds floor stops
 * mattering. Kept as a named knob so the blend is one obvious constant.
 */
export const CONTINUE_TIGHTNESS_WEIGHT = 0.5

/**
 * The minimum equity for the bot to *open* the betting in an unbet pot when its aggression
 * coin-flip fires. A low floor (it still semi-bluffs) but non-zero, so the bot does not bet
 * stone-cold air every single time the coin says "bet" — the degenerate, obviously
 * exploitable line [LEARNING-APPROACH.md] warns against. Facing-a-bet continues are gated
 * by the pot-odds math instead; this floor only governs leading out into a checked pot.
 */
export const BET_EQUITY_FLOOR = 0.25

/**
 * Factory mirror of `new HeuristicOpponent(...)`, for callers (and a UI menu) that prefer a
 * function to a constructor. Defaults match the class: {@link DEFAULT_PERSONALITY} and seed
 * `0`. Returns the bot typed as the {@link Opponent} seam.
 */
export function heuristicOpponent(
  personality: Personality = DEFAULT_PERSONALITY,
  seed = 0,
): Opponent {
  return new HeuristicOpponent(personality, seed)
}
