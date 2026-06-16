/**
 * Per-concept **mastery** + the **adaptive-difficulty** derivation (ticket 0081) — the pure read-side of
 * the durable {@link DrillProgressStore} (ticket 0080). The store owns the *recording* (folding session
 * outcomes into one per-concept aggregate); this owns the *reading*: turning those same records into
 *
 * 1. a **mastery readout** the learner sees over time ("pot odds: 70% over 40 reps") — surfaced in the
 *    Drills lobby next to each theme and in the session-over recap, and
 * 2. the **adaptive difficulty** the next session is dealt at — both the weak-concept `SessionBias`
 *    weighting (reusing 0080's bias seam, NOT a second one) and the per-concept harder-parameter
 *    {@link Difficulty} the generator draws with.
 *
 * Everything here is a **pure function of the store's records** — no second aggregation, no storage of its
 * own. The store is the single source of truth; mastery is just a view of `correct / total`, and difficulty
 * is just a threshold over that view. Kept out of the React component (a plain module, jsdom-free tests) so
 * the policy — what counts as "mastered", how the bias is shaped — is unit-testable in isolation and the
 * component stays a thin wiring layer.
 *
 * **The honest framing (the learning doc is explicit).** Mastery is a *decision-quality* read, not a score
 * to grind — the readout names the rep count alongside the percent so a high number off two reps reads as
 * the thin sample it is, and the copy in the UI says as much. Difficulty *rising with mastery* is the point
 * (a mastered concept earns harder spots; a struggling one is eased back), but it never changes the correct
 * answer — only which legal spot is dealt (the no-answer-key invariant the generator keeps).
 */

import type { Concept } from '@holdem/coach'
import type { Difficulty, DrillTheme } from '@holdem/drills'
import type { DrillProgressRecord } from './record.js'

/**
 * One concept's mastery, derived straight from its {@link DrillProgressRecord} — `correct / total` as a
 * fraction, with the `reps` (the `total`) carried alongside so the readout can say "over N reps" and a
 * thin sample is visible as thin. A concept the learner has never drilled has no record and therefore no
 * mastery entry (see {@link masteryByConcept}) — it is "unseen", not "0%".
 */
export interface ConceptMastery {
  /** The concept this mastery is for — the shared coach/primer {@link Concept} vocabulary. */
  readonly concept: Concept
  /** Decision quality: `correct / total` as a fraction `0..1`. The mastery numerator over its denominator. */
  readonly fraction: number
  /** How many spots of this concept were answered, ever — the denominator (`record.total`). The rep count. */
  readonly reps: number
}

/**
 * Index the store's records by concept as {@link ConceptMastery} views — the one place `correct / total`
 * is computed. Records with `total === 0` are skipped (a degenerate empty aggregate has no mastery to
 * report). Pure: the store reads the records, this projects them; no re-aggregation, no I/O.
 */
export function masteryByConcept(
  records: readonly DrillProgressRecord[],
): ReadonlyMap<Concept, ConceptMastery> {
  const out = new Map<Concept, ConceptMastery>()
  for (const r of records) {
    if (r.total <= 0) continue
    out.set(r.concept, { concept: r.concept, fraction: r.correct / r.total, reps: r.total })
  }
  return out
}

/**
 * The minimum number of reps before a concept's mastery is trusted to *raise* difficulty. Below this the
 * sample is too thin to call a concept "mastered" — a learner who got their first two pot-odds spots right
 * is not yet ready for the gnarly numbers — so difficulty stays `'standard'` until the evidence is real.
 * (The readout still *shows* the percent below this; it just doesn't drive difficulty off it.)
 */
export const MASTERY_REPS_THRESHOLD = 8

/**
 * The mastery fraction at or above which a (sufficiently-drilled) concept earns `'hard'` parameters. Set
 * high (0.8) so harder spots are a *reward* for genuine command of the concept, eased back the moment
 * accuracy slips below it — the "rises as mastery rises, eases when it drops" the ticket asks for.
 */
export const MASTERY_HARD_THRESHOLD = 0.8

/**
 * Derive the {@link Difficulty} a concept's spots should be dealt at from its mastery — the adaptive
 * mastery→difficulty mapping ([[0081]]). `'hard'` only once the concept is both **well-sampled**
 * (`reps >= MASTERY_REPS_THRESHOLD`) **and accurate** (`fraction >= MASTERY_HARD_THRESHOLD`); otherwise
 * `'standard'`. An **unseen** concept (no mastery entry) is `'standard'` — a beginner starts on the gentle
 * draw. Pure and total (defined for every input), so it is trivially unit-testable and the component just
 * looks the answer up.
 *
 * @param mastery The concept's mastery view, or `undefined` if it has never been drilled.
 */
export function difficultyForMastery(mastery: ConceptMastery | undefined): Difficulty {
  if (mastery === undefined) return 'standard'
  if (mastery.reps < MASTERY_REPS_THRESHOLD) return 'standard'
  return mastery.fraction >= MASTERY_HARD_THRESHOLD ? 'hard' : 'standard'
}

/**
 * The mastery fraction below which a (sufficiently-drilled) concept is "weak" and weighted *up* in the
 * next session's draw — the low-mastery end of the adaptive-difficulty seam. Distinct from 0080's
 * miss-*streak* review (recency of a fresh miss): this is the *lifetime* low-accuracy signal, so a concept
 * the learner is chronically poor at keeps getting extra reps even between fresh misses. Thinly-sampled
 * concepts (`reps < MASTERY_REPS_THRESHOLD`) are excluded — a couple of early misses is not yet a leak.
 */
export const MASTERY_WEAK_THRESHOLD = 0.6

/**
 * The concepts whose *lifetime* mastery is low enough to weight the next session toward — the mastery-side
 * input to the adaptive `SessionBias` (the COMPLEMENT of {@link difficultyForMastery}: low mastery
 * ⇒ more reps + easier draw, high mastery ⇒ fewer reps + harder draw). A concept is weak iff it is
 * well-sampled (`reps >= MASTERY_REPS_THRESHOLD`) and below {@link MASTERY_WEAK_THRESHOLD}. Operates on
 * the {@link masteryByConcept} view (the component already holds it; {@link masteryByConcept} is the one
 * place records are aggregated), so there is no second pass over the raw records. The component turns the
 * result into a `SessionBias` and *merges* it with 0080's miss-streak review set (it does not replace it —
 * see {@link mergeBiasConcepts}).
 */
export function lowMasteryConcepts(mastery: ReadonlyMap<Concept, ConceptMastery>): Concept[] {
  return [...mastery.values()]
    .filter((m) => m.reps >= MASTERY_REPS_THRESHOLD && m.fraction < MASTERY_WEAK_THRESHOLD)
    .sort((a, b) => a.fraction - b.fraction) // weakest first
    .map((m) => m.concept)
}

/**
 * Combine 0080's miss-streak **review** concepts with this ticket's **low-mastery** concepts into the one
 * concept set the next session's `SessionBias` weights toward — REUSING 0080's single bias seam
 * rather than adding a second one. The two signals are complementary (recency of a fresh miss vs. a
 * chronic low-accuracy leak), so we take their *union* (deduped, review-first for stable order): a concept
 * flagged by either gets the extra reps. Returning the merged set (not a second bias) is what keeps the
 * composer's one `bias` parameter the sole weighting knob.
 *
 * @param reviewConcepts 0080's recently-missed concepts (from `weakConcepts`).
 * @param lowMastery This ticket's chronically-weak concepts (from {@link lowMasteryConcepts}).
 */
export function mergeBiasConcepts(
  reviewConcepts: readonly Concept[],
  lowMastery: readonly Concept[],
): Concept[] {
  const seen = new Set<Concept>()
  const merged: Concept[] = []
  for (const c of [...reviewConcepts, ...lowMastery]) {
    if (seen.has(c)) continue
    seen.add(c)
    merged.push(c)
  }
  return merged
}

/**
 * Bake the adaptive {@link Difficulty} for each theme's concept into the themes' `config`, off the store's
 * mastery — the seam that makes the generator deal harder spots for mastered concepts WITHOUT a new
 * `composeSession` parameter. A theme's `config.difficulty` is its concept's {@link difficultyForMastery},
 * so a mastered pot-odds theme is dealt `'hard'` (less-round money) while an unseen/struggling one stays
 * `'standard'`. Because `config.difficulty` defaults to `'standard'`, a theme whose concept has no mastery
 * is returned byte-identical (the spread sets `difficulty: 'standard'`, which `resolveConfig` would have
 * applied anyway). Pure: a `DrillTheme[]` in, a `DrillTheme[]` (same order, same ids/titles/concepts) out
 * — only `config.difficulty` is touched, so the picker selection and the by-concept summary are unaffected.
 *
 * @param themes The picked themes to deal.
 * @param mastery The per-concept mastery view (from {@link masteryByConcept}).
 */
export function applyDifficulty(
  themes: readonly DrillTheme[],
  mastery: ReadonlyMap<Concept, ConceptMastery>,
): DrillTheme[] {
  return themes.map((theme) => ({
    ...theme,
    config: { ...theme.config, difficulty: difficultyForMastery(mastery.get(theme.concept)) },
  }))
}

/** A {@link ConceptMastery} formatted for display — the percent and the rep count as plain strings. */
export interface MasteryReadout {
  /** Mastery as a whole-percent string, e.g. `"70%"`. */
  readonly percent: string
  /** The rep count phrase, e.g. `"40 reps"` (singular `"1 rep"`). */
  readonly reps: string
}

/**
 * Format a concept's mastery for the readout — `"70%"` + `"40 reps"`. A whole percent (the readout is a
 * coarse decision-quality read, not a precision score) and a pluralised rep count so a thin sample reads as
 * thin. Returns `undefined` for an unseen concept (no record), so the UI can render a "not drilled yet"
 * placeholder rather than a misleading "0% over 0 reps".
 */
export function formatMastery(mastery: ConceptMastery | undefined): MasteryReadout | undefined {
  if (mastery === undefined) return undefined
  const percent = `${Math.round(mastery.fraction * 100)}%`
  const reps = `${mastery.reps} ${mastery.reps === 1 ? 'rep' : 'reps'}`
  return { percent, reps }
}
