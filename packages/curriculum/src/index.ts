/**
 * `@holdem/curriculum` — the pure *spot → ask → grade → explain* engine the Foundations primer
 * ([[0042-foundations-primer]]) and the M5 drills ([[0009-drills-and-quizzes]]) share.
 *
 * It is to a lesson what `@holdem/coach` is to a live hand: a pure grader the UI shells render. The
 * engine carries **no lesson content** (that is [[0045-foundations-primer-content]]) — only the data
 * model ({@link Spot}, {@link Lesson}), the synthesis seam ({@link synthesizeContext}), and the one
 * grade function ({@link gradeSpot}) that rules on a spot by running the deterministic coach, never a
 * hand-authored answer key.
 */

export * from './spot.js'
export * from './grade.js'
export * from './worked.js'
export * from './serialize.js'
export * from './lesson.js'
export * from './foundations.js'
