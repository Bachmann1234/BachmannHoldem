/**
 * The bot personality matrix — tight/loose × passive/aggressive, as data (ticket 0019).
 *
 * The epic ([[0006-heuristic-opponents]]) asks for "range-based bots with a
 * **tight/loose × passive/aggressive** personality matrix". This module *is* that matrix,
 * expressed as a plain, heavily-documented parameter object — **not** baked into the
 * policy. Keeping personality as data is what makes the matrix legible (you can read a bot
 * off its knobs), tunable (nudge a number, not a branch), and selectable (the UI can offer
 * "Calling Station" vs "Maniac" as a menu). It also keeps play *varied and fun* — a
 * first-class goal in [LEARNING-APPROACH.md], not merely a drill dial — by giving the
 * policy a spread of *plausible* opponents to embody.
 *
 * A `Personality` has two **orthogonal** axes, each a small bundle of knobs:
 *
 * - **Tightness** (tight ↔ loose) — *how much hand the bot needs to keep playing*. It
 *   answers "do I continue?": a tighter bot demands more equity to put chips in and reads
 *   villain as holding a narrower range; a looser bot continues on thinner equity and
 *   credits villain with a wider range. Captured by {@link Tightness}.
 * - **Aggression** (passive ↔ aggressive) — *how the bot puts chips in when it does
 *   continue*. It answers "do I bet/raise or just call/check, and how big?": an aggressive
 *   bot bets and raises often and sizes large; a passive bot prefers checking and calling
 *   and sizes small. Captured by {@link Aggression}.
 *
 * The two axes are deliberately independent so all four quadrants exist as distinct
 * presets: tight-aggressive (TAG), loose-aggressive (LAG / maniac), tight-passive
 * (rock / nit), loose-passive (calling station).
 *
 * **Scope / purity.** This module is pure data plus a tiny validator. It has **no** equity
 * calls, **no** engine state, and **no** I/O — it imports only the {@link RangeWidth}
 * *type* from the perception layer ([[0018-bot-hand-reading]]) so the tightness axis can
 * name the villain range it assigns. The policy ([[0020-heuristic-opponent]]) is what
 * *reads* these knobs and turns them into actions; see {@link Personality} for the exact
 * contract of which knob the policy consumes for what.
 */

import type { RangeWidth } from './handReading.js'

/** The set of legal {@link RangeWidth} names, for runtime validation (the type is erased). */
const RANGE_WIDTHS: ReadonlySet<string> = new Set<RangeWidth>([
  'ultraTight',
  'tight',
  'medium',
  'loose',
  'anyTwo',
])

/**
 * The **tightness** axis (tight ↔ loose): how much hand the bot needs to *continue*.
 *
 * This is the "do I keep playing?" half of the personality. Both knobs move together
 * along the same axis — a tight bot has a *high* {@link continueEquity} and a *narrow*
 * {@link assumedVillainRange}; a loose bot has a *low* threshold and a *wide* assumed
 * range — but they answer two different questions, so both are carried explicitly.
 */
export interface Tightness {
  /**
   * The minimum equity (expected pot share) the bot wants before it will keep chips in a
   * contested pot. A **fraction in `0..1`**: a nit might demand `~0.6`, a calling station
   * as little as `~0.2`. The policy ([[0020-heuristic-opponent]]) compares the bot's
   * equity read against this *together with* the spot's pot odds — it is a tightness
   * *bias*, not a replacement for pot-odds math — so a higher number means "I fold more
   * marginal spots", a lower number means "I call/continue wider".
   */
  readonly continueEquity: number
  /**
   * The {@link RangeWidth} the bot assigns its *opponent* when reading equity. This is the
   * single named dial the perception layer ([[0018-bot-hand-reading]]) turns: a tight,
   * nitty bot pictures villain on a narrow `'ultraTight'`/`'tight'` range; a loose bot
   * credits villain with a wide `'loose'`/`'anyTwo'` range. The policy passes this straight
   * to `estimateEquity`'s `opponentRange`. Must be one of the five {@link RangeWidth} names.
   */
  readonly assumedVillainRange: RangeWidth
}

/**
 * The **aggression** axis (passive ↔ aggressive): how the bot commits chips when it has
 * decided to play.
 *
 * This is the "bet/raise or check/call, and how big?" half. {@link betFrequency} governs
 * *how often* the bot takes the aggressive line; {@link betSizing} governs *how much* it
 * wagers when it does.
 */
export interface Aggression {
  /**
   * How often the bot chooses the **aggressive** action (bet or raise) over the passive
   * one (check or call) when both are available and its hand clears the continue bar. A
   * **fraction in `0..1`**: `0` is purely passive (only ever checks/calls — a true calling
   * station / rock), `1` is relentlessly aggressive (always bets/raises when it can). The
   * policy uses this as the probability of the aggressive branch (against its seeded PRNG),
   * so it directly sets the bot's bet/raise frequency.
   */
  readonly betFrequency: number
  /**
   * The bet/raise size the bot prefers, as a **fraction of the current pot** (a positive
   * number, e.g. `0.5` = a half-pot bet, `1` = pot-sized, `1.5` = overbet). The policy
   * multiplies the pot by this and then **clamps the result to the legal bet/raise
   * min/max** — so this expresses the bot's *intent*, and the engine's `legalActions`
   * guarantees the action it ultimately takes is legal. Must be `> 0`.
   */
  readonly betSizing: number
}

/**
 * A complete bot personality: a point in the tight/loose × passive/aggressive matrix,
 * plus a display label.
 *
 * It is a passive bundle of knobs — the policy ([[0020-heuristic-opponent]]) is what reads
 * them. The contract the policy relies on:
 *
 * - `tightness.continueEquity` — the equity bar for continuing (folding below it more
 *   often).
 * - `tightness.assumedVillainRange` — the villain {@link RangeWidth} fed to the equity read.
 * - `aggression.betFrequency` — the probability of betting/raising vs checking/calling.
 * - `aggression.betSizing` — the intended bet size as a pot fraction (then clamped to legal).
 *
 * Use {@link validatePersonality} before trusting a hand-built one.
 */
export interface Personality {
  /** A short, human-readable label for display / debugging (e.g. "TAG", "Calling Station"). */
  readonly name: string
  /** The tightness axis: how much hand the bot needs to continue. */
  readonly tightness: Tightness
  /** The aggression axis: how often and how big it bets/raises. */
  readonly aggression: Aggression
}

/**
 * **Tight-aggressive (TAG)** — the textbook winning style and the sensible default.
 *
 * Plays a disciplined range (folds marginal spots, demands real equity to continue) but
 * applies pressure with the hands it does play (bets and raises often, sizes near pot).
 * Reads villain on a fairly narrow `'tight'` range. Believable and tough without being a
 * solver — exactly the "plausible, not maximally strong" target of [LEARNING-APPROACH.md].
 */
export const TIGHT_AGGRESSIVE: Personality = {
  name: 'Tight-Aggressive (TAG)',
  tightness: { continueEquity: 0.55, assumedVillainRange: 'tight' },
  aggression: { betFrequency: 0.7, betSizing: 0.75 },
}

/**
 * **Loose-aggressive (LAG / maniac)** — wide and relentless.
 *
 * Continues on thin equity (low {@link Tightness.continueEquity}) and credits villain with
 * a wide `'loose'` range, then hammers: the highest {@link Aggression.betFrequency} and the
 * biggest {@link Aggression.betSizing} of the four. Fun and chaotic to play against, and a
 * good generator of big, coachable pots.
 */
export const LOOSE_AGGRESSIVE: Personality = {
  name: 'Loose-Aggressive (LAG)',
  tightness: { continueEquity: 0.3, assumedVillainRange: 'loose' },
  aggression: { betFrequency: 0.85, betSizing: 1 },
}

/**
 * **Tight-passive (rock / nit)** — folds a lot, almost never raises.
 *
 * The highest continue bar of the four (it surrenders any spot it is not clearly ahead in)
 * paired with the lowest aggression: it overwhelmingly checks and calls, betting only its
 * very best, and small when it does. Reads villain on the narrowest `'ultraTight'` range.
 * The classic exploitable-but-believable pole opposite the LAG.
 */
export const TIGHT_PASSIVE: Personality = {
  name: 'Tight-Passive (Rock)',
  tightness: { continueEquity: 0.6, assumedVillainRange: 'ultraTight' },
  aggression: { betFrequency: 0.15, betSizing: 0.4 },
}

/**
 * **Loose-passive (calling station)** — the canonical "station".
 *
 * Continues on very thin equity (the lowest continue bar) against a wide `'anyTwo'` read,
 * but almost never takes the betting lead itself — it calls and calls. Low aggression, small
 * sizing on the rare bet. The ideal opponent to practise value-betting *into*.
 */
export const LOOSE_PASSIVE: Personality = {
  name: 'Loose-Passive (Calling Station)',
  tightness: { continueEquity: 0.25, assumedVillainRange: 'anyTwo' },
  aggression: { betFrequency: 0.1, betSizing: 0.4 },
}

/**
 * The sensible **default** personality when a caller does not pick one: a balanced
 * tight-aggressive bot. TAG is the soundest all-round style, so it makes the least
 * surprising default opponent. Aliased to {@link TIGHT_AGGRESSIVE} (not a copy) so the two
 * stay in lock-step.
 */
export const DEFAULT_PERSONALITY: Personality = TIGHT_AGGRESSIVE

/**
 * All four named presets (one per quadrant) plus the convention that the first is the TAG
 * default, keyed by their standard poker labels. Handy for a UI menu or a test sweep.
 */
export const PERSONALITIES: Readonly<Record<string, Personality>> = {
  tag: TIGHT_AGGRESSIVE,
  lag: LOOSE_AGGRESSIVE,
  rock: TIGHT_PASSIVE,
  station: LOOSE_PASSIVE,
}

/** Assert a knob is a finite fraction in `0..1` (inclusive), throwing a clear error otherwise. */
function assertFraction(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${field} must be a fraction in 0..1, got ${value}`)
  }
}

/**
 * Validate a {@link Personality}, throwing a {@link RangeError} on the first illegal knob —
 * mirroring the odds package's validation idiom (clear message naming the field and the bad
 * value). Checks, in order:
 *
 * - `tightness.continueEquity` is a fraction in `0..1`.
 * - `tightness.assumedVillainRange` is one of the five {@link RangeWidth} names.
 * - `aggression.betFrequency` is a fraction in `0..1`.
 * - `aggression.betSizing` is a finite number `> 0` (a pot fraction; zero/negative sizing
 *   is meaningless).
 *
 * Returns the personality unchanged on success, so it composes in a pipeline
 * (`const p = validatePersonality(buildPersonality(...))`).
 */
export function validatePersonality(personality: Personality): Personality {
  const { tightness, aggression } = personality

  assertFraction(tightness.continueEquity, 'tightness.continueEquity')
  if (!RANGE_WIDTHS.has(tightness.assumedVillainRange)) {
    throw new RangeError(
      `tightness.assumedVillainRange must be a valid RangeWidth, got "${String(
        tightness.assumedVillainRange,
      )}"`,
    )
  }

  assertFraction(aggression.betFrequency, 'aggression.betFrequency')
  if (!Number.isFinite(aggression.betSizing) || aggression.betSizing <= 0) {
    throw new RangeError(`aggression.betSizing must be a number > 0, got ${aggression.betSizing}`)
  }

  return personality
}
