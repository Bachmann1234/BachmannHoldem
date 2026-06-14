/**
 * The presentation-metadata seam for the Learn path (ticket 0046).
 *
 * `@holdem/curriculum`'s {@link Lesson} is deliberately *content-only* — `{ id, title, concept,
 * explanation, spots }`. The path/recap UI wants two presentational extras that have no place in the
 * pure package: a one-line `subtitle` shown beside the title, and a one-line `teaser` describing the
 * concept on the node. Those display strings live here, in the shell, keyed by the lesson's stable
 * `id`, so the package stays framework-agnostic and the copy stays a UI concern.
 *
 * The strings are the verbatim design copy: `subtitle` from the design bundle's `curriculum.js`, and
 * `teaser` from `screens.jsx`'s `TEASER` map (concept → one-liner). The lesson *number* is purely
 * positional — its index + 1 in `FOUNDATIONS` — so it is not stored here; {@link learnLessons} stamps
 * it on while zipping the content with its meta.
 */

import { FOUNDATIONS, type Lesson } from '@holdem/curriculum'

/** The presentational extras for one lesson — display-only copy the pure package does not carry. */
export interface LessonMeta {
  /** A short qualifier shown after the title (e.g. "your share of the pot"). */
  readonly subtitle: string
  /** A one-line description of the concept, shown on the path node and the recap. */
  readonly teaser: string
}

/** Per-lesson display copy, keyed by `Lesson.id` (verbatim from the design bundle). */
const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  'foundations-equity': {
    subtitle: 'your share of the pot',
    teaser: 'Your share of the pot, right now.',
  },
  'foundations-pot-odds': {
    subtitle: 'the price of a call',
    teaser: 'The break-even price of a call.',
  },
  'foundations-equity-vs-price': {
    subtitle: 'equity vs price',
    teaser: 'Continue when equity beats the price.',
  },
  'foundations-ev': {
    subtitle: 'counting the decision in chips',
    teaser: 'The same decision, counted in chips.',
  },
  'foundations-position': {
    subtitle: 'acting later is an edge',
    teaser: 'Acting later lets you play more hands.',
  },
  'foundations-ranges': {
    subtitle: 'think in strength tiers',
    teaser: 'Sort hands into strength tiers.',
  },
}

/** A safe fallback so a newly-authored lesson without copy still renders (empty extras, never throws). */
const EMPTY_META: LessonMeta = { subtitle: '', teaser: '' }

/** Look up a lesson's presentational extras by id; falls back to empty copy if none is registered. */
export function lessonMeta(lesson: Lesson): LessonMeta {
  return LESSON_META[lesson.id] ?? EMPTY_META
}

/** A lesson zipped with its display copy and its 1-based position — what the Learn path renders over. */
export interface LearnLesson {
  /** The pure content lesson from `@holdem/curriculum`. */
  readonly lesson: Lesson
  /** Its 1-based number on the path (index + 1 in `FOUNDATIONS`). */
  readonly n: number
  /** The shell-owned display copy for this lesson. */
  readonly meta: LessonMeta
}

/**
 * The `FOUNDATIONS` sequence zipped with each lesson's number and presentation copy — the single list
 * the Learn path/recap iterate. Built once at module load (the curriculum is static).
 */
export const learnLessons: readonly LearnLesson[] = FOUNDATIONS.map((lesson, i) => ({
  lesson,
  n: i + 1,
  meta: lessonMeta(lesson),
}))
