/**
 * The drill **theme catalogue** + the **interleaved session composer** — M5's named practice topics
 * and the load-bearing learning-science requirement that mixes them (ticket 0066).
 *
 * Ticket 0065 built the generation *primitive*: a seed (+ a {@link DrillConfig}) in, one legal,
 * coach-graded {@link Spot} out, with no answer key. This module builds the two layers on top of it
 * the epic ([[0009-drills-and-quizzes]]) still needs:
 *
 * 1. **Themes** — a small, *data-driven* catalogue ({@link DRILL_THEMES}). Each theme is a named,
 *    coherent practice topic (preflop ranges, pot-odds calls, …) that is nothing more than a stable
 *    `id`, a human `title`, the {@link Concept} it exercises (the coach/primer vocabulary from
 *    [[0043-coach-concept-tag]], so a session summary can say "this drilled pot odds"), and the
 *    {@link DrillConfig} that constrains the generator to that kind of spot. Adding a theme is a *data*
 *    edit — push one {@link DrillTheme} onto the list — never new control flow, mirroring how the spot
 *    model avoided a generic rules engine. The composer reads the catalogue uniformly; it knows nothing
 *    about *which* themes exist.
 *
 * 2. **The interleaved session composer** ({@link composeSession}) — `f(themes, length, seed)` → an
 *    ordered list of generated {@link SessionItem}s. Its headline job is to **INTERLEAVE** the themes:
 *    consecutive items must not be *blocked* by topic. This is **not** a nicety — it is the
 *    differentiator the validated learning approach ([../../docs/LEARNING-APPROACH.md]) names: interleaved
 *    and retrieval practice transfer *better* than blocked drilling, because mixing forces the learner to
 *    *retrieve which model applies* on every rep rather than running the same procedure on autopilot down
 *    a block. The order is **seeded-randomized** (not a fixed cycle) precisely so the learner cannot
 *    predict the next topic and pre-load its schema — unpredictability is part of the retrieval benefit,
 *    and the epic ([[0009-drills-and-quizzes]]) names it in those words. A future reader must not
 *    "simplify" this back to "all the preflop spots, then all the pot-odds spots" *nor* to a fixed
 *    round-robin — either deletes the pedagogy. See {@link composeSession}'s policy note for the exact
 *    rule (seeded randomized interleave, no two consecutive items share a theme) and the invariant its
 *    test pins.
 *
 * **Honest framing (the learning doc is explicit).** Drills are high-efficiency reps but they
 * **complement** playing volume, they do not replace it. No theme title or description here claims
 * otherwise ("drills are all you need" is exactly the overstatement the doc warns against); the titles
 * name the *topic practised*, nothing more.
 *
 * **No answer keys, still.** A {@link SessionItem} carries the generated {@link Spot} verbatim — the
 * spot the existing `gradeSpot` rules on — so a composed session is graded *identically* to a single
 * generated spot: by the live coach math, never a stored flag. The item also carries the theme it came
 * from, so the UI ([[0068-pwa-drills-nav-summary]]) can recover the {@link Concept} and summarise a
 * finished session "by concept" without re-deriving anything.
 *
 * Purity: zero UI/DOM/Node/network, no `Math.random()` — the only randomness is the seeded
 * {@link mulberry32} stream from `@holdem/odds` (the *same* PRNG the generator and the equity sims use),
 * threaded so a `(themes, length, seed)` triple replays byte-for-byte. Imports only `@holdem/*` and
 * relative `.js`.
 */

import { mulberry32 } from '@holdem/odds'
import type { Concept } from '@holdem/coach'
import type { Spot } from '@holdem/curriculum'
import { generateSpot } from './generate.js'
import type { DrillConfig } from './config.js'

/**
 * A drill **theme** — one named, coherent practice topic in the {@link DRILL_THEMES} catalogue.
 *
 * A theme is *pure data*: it adds no behaviour of its own, it only *describes* a family of spots to
 * generate and the idea that family exercises. That is the whole design — the composer treats every
 * theme identically (generate a spot from its {@link config}), so adding a topic is a data edit, not a
 * new code path. The four fields are exactly what the UI and the composer need and nothing more:
 *
 * - {@link id} — the stable key the UI persists a chosen theme by.
 * - {@link title} — the human label shown when picking themes / summarising a session.
 * - {@link concept} — the {@link Concept} this theme drills, so a finished session can be summarised
 *   "by concept" ([[0068-pwa-drills-nav-summary]]) in the *same* vocabulary the coach and the
 *   Foundations primer use.
 * - {@link config} — the {@link DrillConfig} that constrains {@link generateSpot} to produce spots of
 *   this kind. This is the *only* coupling to the generator: the theme says "preflop, please" or "a
 *   postflop spot with a real price", and the generator obliges.
 */
export interface DrillTheme {
  /**
   * A stable, machine identifier for this theme — the key a UI persists a selection by and a session
   * summary groups on. Kebab-case and *frozen*: changing it would orphan any stored "themes I picked"
   * selection, so treat it like a database key, not a label (that is what {@link title} is for).
   */
  readonly id: string
  /**
   * The human-readable topic name shown in the theme picker and the session summary. Names the *topic
   * practised* only — deliberately **not** any "this is all you need" claim, because the learning doc
   * is explicit that drills *complement* playing volume rather than replacing it.
   */
  readonly title: string
  /**
   * The mental model this theme exercises, in the shared {@link Concept} vocabulary
   * ([[0043-coach-concept-tag]]). Declared on the theme — not read off a generated spot — so a session
   * can be summarised by concept *before* any spot is graded, and so the theme lines up with the coach
   * and the Foundations primer ("this drilled the pot-odds idea from Foundations"). It is the concept
   * the theme's {@link config} *is built to* exercise; the per-spot {@link GradeResult.concept} the
   * coach derives from each actual spot is the authoritative grade-time tag and will agree with this on
   * the spots the config produces.
   */
  readonly concept: Concept
  /**
   * The {@link DrillConfig} constraining {@link generateSpot} to this theme's spot family — the lone
   * seam to the generator. A preflop-ranges theme sets `{ kind: 'preflop' }`; a pot-odds theme sets
   * `{ kind: 'coach', priceMode: 'priced' }` (a real price to weigh, never a free check). Because every
   * config field is optional with a documented default, a new theme only specifies what it constrains.
   */
  readonly config: DrillConfig
}

/**
 * The **theme catalogue** — the data-driven list of practice topics M5 ships. *Every* themed session is
 * built from entries here; the composer never special-cases a particular theme, so growing this list is
 * the *only* thing adding a drill topic requires (the ticket's "a data edit, not new control flow").
 *
 * It covers the two topics the epic names — **preflop ranges** and **pot-odds calls** — plus a third,
 * **postflop equity**, so a session can interleave more than two topics:
 *
 * - `preflop-ranges` → `{ kind: 'preflop' }`. Open-or-fold against the starting-hand chart, graded by
 *   `gradePreflop`. Drills the `'ranges'` idea (thinking in the *set* of hands a chart sorts into).
 * - `pot-odds-calls` → `{ kind: 'coach', priceMode: 'priced' }`. A postflop continue decision facing a
 *   *real* price (`toCall > 0`), graded by `coachDecision`. Drills `'pot-odds'` — weighing the price a
 *   call costs against the equity needed to pay it. (The live verdict tags a priced continue
 *   `'equity-vs-price'`, which *is* the pot-odds idea applied; the theme tags the isolated concept the
 *   topic is *about*, matching the {@link Concept} vocabulary the primer teaches.)
 * - `postflop-equity` → `{ kind: 'coach', priceMode: 'any' }`. A postflop decision that may be free
 *   (`toCall === 0`) or priced, graded by `coachDecision`. Drills `'equity'` — reading your raw share
 *   of the pot, the lens for a free decision where there is no price to weigh it against. This is the
 *   "one more" beyond the epic's two, and it deliberately leaves the price *unconstrained* so the topic
 *   exercises the equity read across free and priced spots alike.
 *
 * Each theme's {@link DrillTheme.concept} is the idea its {@link DrillTheme.config} is built to
 * exercise; the per-spot grade-time concept the coach derives will agree with it on the spots that
 * config produces (the catalogue test pins both the spot *kind* and the concept agreement).
 *
 * `as const satisfies readonly DrillTheme[]` keeps the literal narrow (so `id`s stay a known set the UI
 * can switch on) while still type-checking every entry against {@link DrillTheme}.
 */
export const DRILL_THEMES = [
  {
    id: 'preflop-ranges',
    title: 'Preflop ranges',
    concept: 'ranges',
    config: { kind: 'preflop' },
  },
  {
    id: 'pot-odds-calls',
    title: 'Pot-odds calls',
    concept: 'pot-odds',
    config: { kind: 'coach', priceMode: 'priced' },
  },
  {
    id: 'postflop-equity',
    title: 'Postflop equity',
    concept: 'equity',
    config: { kind: 'coach', priceMode: 'any' },
  },
] as const satisfies readonly DrillTheme[]

/**
 * One item in a composed session — a generated {@link Spot} paired with the {@link DrillTheme} it was
 * generated from.
 *
 * Pairing the spot with its theme is what makes a session *self-describing* without re-deriving
 * anything: the UI grades `spot` through the existing `gradeSpot` (no answer key — correctness is
 * whatever the coach rules), and reads `theme.concept` to show "this drilled <concept>" and to
 * summarise the finished session by concept ([[0068-pwa-drills-nav-summary]]). Both the spot and the
 * theme are carried verbatim, so an item is a plain, serialisable value with no hidden state.
 */
export interface SessionItem {
  /**
   * The generated curriculum {@link Spot} — a postflop {@link CoachSpot} or a preflop
   * {@link PreflopSpot} — exactly as {@link generateSpot} produced it for this item's {@link theme}.
   * Graded by the *existing* `gradeSpot`; it carries **no** stored correct flag.
   */
  readonly spot: Spot
  /**
   * The {@link DrillTheme} this item's {@link spot} was generated from — so its {@link DrillTheme.concept}
   * and {@link DrillTheme.title} are recoverable for the UI's per-spot "this drilled <concept>" line and
   * the end-of-session by-concept summary, with no need to re-classify the spot.
   */
  readonly theme: DrillTheme
}

/**
 * Validate a session `length` in the odds/bots `RangeError` idiom this package uses everywhere — a
 * malformed length must fail loudly, not silently yield a truncated or infinite session. A length of
 * `0` is allowed (an empty session is a degenerate-but-legal request — the UI may ask for "no spots
 * yet"); negatives and non-integers are not.
 */
function validateLength(length: number): void {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`session length must be a non-negative integer, got ${length}`)
  }
}

/**
 * Validate the session `seed` here too (rather than only deep in {@link makeDealer}) so a malformed
 * seed is rejected *before* any spot is generated — the same loud-failure contract {@link makeDealer}
 * enforces, surfaced at the composer's own boundary with a message naming the session seed.
 */
function validateSeed(seed: number): void {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`session seed must be an integer, got ${seed}`)
  }
}

/**
 * Compose a deterministic, **interleaved** drill session: pick spots from `themes` in a *seeded
 * randomized* topic order in which no two consecutive items share a theme, and return `length`
 * {@link SessionItem}s in that order. Same `(themes, length, seed)` ⇒ byte-identical session.
 *
 * **The interleaving policy (the headline — do not "simplify" this to blocked OR to fixed round-robin).**
 * For each position we draw the next theme *at random* (off the session's seeded stream) from the themes
 * whose `id` differs from the immediately preceding item's theme. With ≥2 distinct themes that "different
 * from previous" set is always non-empty, so the run-length of *any* single topic is exactly `1` — the
 * no-blocking invariant the test pins — while the topic *order* is genuinely unpredictable rather than a
 * fixed cycle.
 *
 * Why **randomized** and not a fixed `A B C A B C …` round-robin? Two reasons, and both are load-bearing:
 *   1. The epic ([[0009-drills-and-quizzes]], acceptance criterion 3) names the requirement in exactly
 *      these words — "interleave spot types within a session (**randomized**, not blocked by topic)". A
 *      fixed cycle is interleaved but not randomized.
 *   2. It is the *mechanism*, not a nicety. The validated learning approach
 *      ([../../docs/LEARNING-APPROACH.md]) makes interleaving the differentiator because mixing topics
 *      forces the learner to *retrieve which model applies* on each rep instead of running one procedure
 *      on autopilot. But a *predictable* cycle leaks the answer: after one pass through `A B C` the
 *      learner knows the next topic and can pre-load that schema, partially defeating the retrieval
 *      challenge. Unpredictability is part of the benefit — the learner must not know which model comes
 *      next. So the order must be randomized, just never *blocked* (consecutive repeats are still
 *      forbidden, which is what keeps it a true interleave and not an accidental run).
 *
 * A future reader must NOT replace this with `themes[i % n]` (fixed cycle) or with a per-theme block
 * (`A A A B B B`) — either quietly deletes the pedagogy above.
 *
 * **Single-theme degrades gracefully.** With one theme the "different from the previous item" set is
 * empty, so there is nothing to draw from a restricted set — we simply use that one theme for every item
 * and generate `length` spots of it. This is the *only* case in which consecutive items share a theme,
 * and it is vacuous: with a single topic there is nothing to interleave in the first place. (The
 * no-consecutive-repeat invariant is about ≥2 themes; the test asserts a one-theme session does not, e.g.,
 * throw.)
 *
 * **Determinism — one stream, fixed draw order.** We open *one* {@link mulberry32} stream from the
 * session `seed` and, per position, draw in a *fixed order*: first the theme (a draw off the stream picks
 * one of the candidate themes), then the per-spot seed (the next 32-bit integer off the same stream,
 * passed to {@link generateSpot}). Threading both the topic choice and the spot seed through the one
 * stream in this fixed order is what makes the whole session replay exactly from `(themes, length, seed)`:
 * same seed ⇒ same topic order *and* same deals. Every item draws a distinct spot seed (so no two spots in
 * a session are the same deal), and changing the session seed reseeds the whole stream (so a different
 * session seed yields a different topic order *and* a wholly different set of spots). We reuse the
 * project's `mulberry32` rather than inventing a parallel PRNG — the single shared "deterministic given a
 * seed" meaning the whole package rests on — and never touch `Math.random()`.
 *
 * Throws {@link RangeError} on an empty `themes` list (a session needs at least one topic to draw from),
 * a non-integer/negative `length`, or a non-integer `seed`.
 *
 * @param themes The themes to draw spots from — typically a subset of {@link DRILL_THEMES} the user
 *   picked. Only the *set* of topics matters; the seeded draw chooses the order (input order does not fix
 *   the cycle).
 * @param length How many spots the session contains. `0` yields an empty session.
 * @param seed The session seed — the single source of both the topic order and every per-spot seed, so
 *   the session replays.
 */
export function composeSession(
  themes: readonly DrillTheme[],
  length: number,
  seed: number,
): SessionItem[] {
  if (themes.length === 0) {
    throw new RangeError('a session needs at least one theme to draw spots from')
  }
  validateLength(length)
  validateSeed(seed)

  // One seeded stream for the WHOLE session: BOTH the topic order and every per-spot seed are drawn off
  // it, in a fixed per-position draw order (theme first, then spot seed). Threading a single stream this
  // way is what makes the session replay exactly from `seed` while still giving every item a distinct
  // deal AND an unpredictable topic — and it is the project's shared mulberry32, never a parallel PRNG or
  // Math.random().
  const nextFloat = mulberry32(seed)
  // Draw a fresh 32-bit unsigned integer per spot — a full-width seed (not a small index) so successive
  // per-spot seeds are well-separated, and an integer because makeDealer requires one.
  const nextSpotSeed = (): number => Math.floor(nextFloat() * 0x100000000)

  const items: SessionItem[] = []
  let prevThemeId: string | null = null
  for (let i = 0; i < length; i++) {
    // SEEDED RANDOMIZED INTERLEAVE — draw the next topic at random from the themes whose id differs from
    // the previous item's, so the order is unpredictable yet no two consecutive items share a theme (the
    // interleave invariant). With one theme the "different from previous" set is empty, so we fall back
    // to the whole list (just that one theme) — the sole, vacuous case where a topic repeats. This is the
    // load-bearing pedagogy: see the function doc / LEARNING-APPROACH.md. Do NOT replace with a fixed
    // round-robin (`themes[i % n]`) or a per-theme block — either leaks/eliminates the retrieval challenge.
    const candidates = themes.filter((t) => t.id !== prevThemeId)
    const pool = candidates.length > 0 ? candidates : themes
    // FIXED DRAW ORDER: theme choice first, then the spot seed — both off the same stream, so the triple
    // `(themes, length, seed)` replays byte-for-byte.
    const theme = pool[Math.floor(nextFloat() * pool.length)]!
    const spot = generateSpot(nextSpotSeed(), theme.config)
    items.push({ spot, theme })
    prevThemeId = theme.id
  }
  return items
}
