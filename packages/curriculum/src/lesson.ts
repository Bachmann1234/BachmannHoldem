/**
 * The **lesson** model — an ordered grouping of a short teach plus its retrieval checks
 * (ticket 0044).
 *
 * Per [LEARNING-APPROACH.md] a lesson is "retrieval, not prose": a *~30-second* explanation that
 * teaches the framework the coach assumes, followed by one or more {@link Spot}s that make the
 * learner *apply* it. The lesson is tagged with the {@link Concept} it teaches, the same vocabulary
 * the coach stamps on every verdict ([[0043-coach-concept-tag]]), so the primer, the play coach, and
 * the M5 drills all speak one cross-linkable language.
 *
 * **No content here.** This ticket builds only the *type* and a tiny sequencing helper the lesson
 * player ([[0047-pwa-lesson-player]]) needs; the actual lessons are authored in
 * [[0045-foundations-primer-content]].
 *
 * Purity: pure data + one pure helper. Imports only `@holdem/*`/relative.
 */

import type { Concept } from '@holdem/coach'
import type { Spot } from './spot.js'

/**
 * One lesson: a short teach, the concept it teaches, and the ordered spots that drill it.
 *
 * A flat, serialisable value (an `explanation` string, a `Concept` tag, a readonly `Spot[]`) — the
 * shape the content ticket fills and the lesson-player UI renders. The `spots` are ordered: the UI
 * walks them front-to-back, and {@link firstUnansweredSpotIndex} resumes that walk.
 */
export interface Lesson {
  /** A stable identifier for the lesson — lets the UI track progress and deep-link to it. */
  readonly id: string
  /** A short human title for the lesson, shown in a syllabus/navigation list. */
  readonly title: string
  /**
   * The ~30-second teach — a plain string (no markup contract beyond plain text). Teaches the
   * framework the coach assumes; the spots then make the learner retrieve it.
   */
  readonly explanation: string
  /** The mental model this lesson teaches — the cross-link vocabulary shared with the coach. */
  readonly concept: Concept
  /** The ordered retrieval checks that drill the concept. At least one (a lesson with no spot is no
   * lesson); enforced by {@link firstUnansweredSpotIndex} treating empty as "nothing to do". */
  readonly spots: readonly Spot[]
}

/**
 * The index of the first spot in `lesson` the learner has not yet answered — the resume point the
 * lesson player uses to continue a partially-completed lesson.
 *
 * `answered` is the parallel run of which spots are done (the UI owns this state; the curriculum
 * stays pure and stateless). Returns the first index where `answered` is falsy, or `-1` when every
 * spot is answered (the lesson is complete) — the same "not found" sentinel `findIndex` uses, so the
 * caller branches on `=== -1`.
 *
 * Kept here, beside the {@link Lesson} type, so the one bit of sequencing logic the UI needs is
 * shared and tested rather than re-implemented per shell.
 */
export function firstUnansweredSpotIndex(lesson: Lesson, answered: readonly boolean[]): number {
  return lesson.spots.findIndex((_spot, i) => !answered[i])
}
