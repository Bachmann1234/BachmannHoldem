/**
 * `@holdem/drills` — the pure, seeded **drill-spot generator** M5 ([[0009-drills-and-quizzes]])
 * draws its procedural supply from (ticket 0065).
 *
 * Curriculum ([[0044-curriculum-engine]]) owns the *spot → ask → grade → explain* engine but its
 * spots are **hand-authored** (the Foundations primer's fixed content). Drills need spots
 * **generated** on demand, in unbounded supply, from random deals — and that is new behaviour: it owns
 * **seeded randomness**, which curriculum deliberately avoids (curriculum stays content + a
 * randomness-free grader). So generation lives here, a sibling package that depends on curriculum for
 * the `Spot`/`gradeSpot` primitives and reuses the M0–M3 engine/odds/coach packages for the deal and
 * the grading.
 *
 * The public surface is one generator and its config seam:
 *
 * - {@link generateSpot} — seed (+ optional {@link DrillConfig}) → a curriculum `Spot` (a postflop
 *   {@link CoachSpot}, a preflop {@link PreflopSpot}, or a numeric-retrieval {@link CalculationSpot} —
 *   ticket 0077) the existing `gradeSpot` rules on. Pure: the same seed always yields the same spot, and
 *   the spot carries **no answer key** — its correct answer (which action, or which number bucket) is
 *   whatever the deterministic `potOdds`/coach math rules at grade time.
 * - {@link DrillConfig} / {@link DrillKind} / {@link PriceMode} / {@link CalculationQuantity} /
 *   {@link BoardStreet} / {@link ActionSet} / {@link Difficulty} / {@link resolveConfig} — the minimal
 *   parameterisation [[0066-drills-themed-sets]] hangs its theme catalogue + session composer on (and
 *   [[0077-drills-calculation-spots]] extends with the calculation kind + asked quantity;
 *   [[0078-drills-board-reading-and-actions]] with the `'hand-reading'` kind, the turn/river `street`
 *   knob, and the `'call-raise-fold'` action set; [[0081-drills-mastery-difficulty-glossary]] with the
 *   adaptive `difficulty` lever), without a rewrite here. This package builds the generation
 *   *primitive*, not the themes.
 * - {@link makeDealer} / {@link Dealer} / {@link BOARD_SIZE} — the seeded dealing primitives the
 *   generator threads, exported so 0066 (and tests) can build reproducible deals directly.
 * - {@link DRILL_THEMES} / {@link DrillTheme} / {@link SessionItem} / {@link composeSession} /
 *   {@link SessionBias} — the themed drill sets and the **interleaved**, seeded session composer
 *   [[0066-drills-themed-sets]] builds on the generator: named practice topics tagged with the
 *   {@link Concept} they exercise, mixed (not blocked by topic — the load-bearing learning-science
 *   requirement) into a reproducible session the existing `gradeSpot` still grades with no answer key.
 *   The optional {@link SessionBias} weights the seeded draw toward a set of concepts — the one seam
 *   [[0080-drills-spaced-repetition]]'s re-queue and [[0081-drills-mastery-difficulty-glossary]]'s
 *   adaptive difficulty both reuse.
 *
 * Purity: zero UI/DOM/Node/network deps, no `Math.random()` — all randomness is the seeded
 * {@link mulberry32} stream from `@holdem/odds`. Imports only `@holdem/*`.
 */

export * from './deal.js'
export * from './config.js'
export * from './generate.js'
export * from './themes.js'
