/**
 * The lesson player (ticket 0046 lands a PLACEHOLDER; ticket 0047 fills it in).
 *
 * This proves the Learn route end-to-end: selecting an unlocked node on the path opens this surface,
 * and the back chevron returns to the path. It recreates the design's `AppBar` (back affordance +
 * eyebrow + title) and an immersive, tab-less body — the design's `LessonShell` is deliberately
 * tab-less, so the bottom tab bar is NOT rendered here.
 *
 * TODO(0047): replace the placeholder body with the real read → ask → grade → explain loop over the
 * lesson's `Spot`s — `ReadView` (teach from `Lesson.explanation`), `AskView`/`SpotView` (render each
 * spot, cards via the table's `Card`), and the `ResultSheet` drawer over `@holdem/curriculum`'s
 * `gradeSpot`, with the encouraging-tone formatter wrapping the verdict.
 */

import type { Lesson } from '@holdem/curriculum'
import { BackIcon } from './Icons.js'

/** Props for {@link LessonPlayer}. */
export interface LessonPlayerProps {
  /** The lesson being played. */
  readonly lesson: Lesson
  /** Its 1-based number on the path (for the "LESSON n OF 6" eyebrow). */
  readonly n: number
  /** How many lessons there are in total (the eyebrow's denominator). */
  readonly total: number
  /** Return to the Learn path. */
  readonly onBack: () => void
}

/** Render the (placeholder) lesson player — app bar + title; the real loop arrives in 0047. */
export function LessonPlayer({ lesson, n, total, onBack }: LessonPlayerProps): React.JSX.Element {
  return (
    <div className="screen" data-testid="lesson-player">
      <div className="appbar">
        <button
          type="button"
          className="back"
          onClick={onBack}
          aria-label="Back"
          data-testid="lesson-back"
        >
          <BackIcon />
        </button>
        <div className="appbar-titles">
          <div className="appbar-eyebrow">{`LESSON ${n} OF ${total}`}</div>
          <div className="appbar-title">{lesson.title}</div>
        </div>
        <div className="appbar-spacer" />
      </div>

      {/* Placeholder body — ticket 0047 replaces this with read → ask → grade → explain. */}
      <div className="screen-body">
        <div className="lesson-body">
          <p className="teach">{lesson.explanation}</p>
        </div>
      </div>
    </div>
  )
}
