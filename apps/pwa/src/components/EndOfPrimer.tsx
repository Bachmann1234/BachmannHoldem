/**
 * The end-of-primer hand-off (ticket 0047) — recreated from the design bundle's `EndOfPrimer`. After
 * the learner finishes the sixth and last lesson, the path is complete and this warm, restrained
 * celebration takes over: a medal, "You've got the fundamentals.", a recap of all six ideas (each
 * checked, with its concept tag), then the hand-off — a primary **Play a hand →** CTA that switches to
 * the Play tab, plus a forward nod to **Drills — coming soon (M5)**.
 *
 * Presentational: it takes the zipped {@link LearnLesson}s for the recap and two callbacks (play /
 * back). The §5.5 design is deliberately not loud — no confetti storm; encouraging, not loud.
 */

import type { LearnLesson } from '../learn/lessonMeta.js'
import { BackIcon, CheckIcon } from './Icons.js'

/** Props for {@link EndOfPrimer}. */
export interface EndOfPrimerProps {
  /** The six lessons, zipped with their display copy — the recap rows. */
  readonly lessons: readonly LearnLesson[]
  /** Hand off to free play (switch to the Play tab). */
  readonly onPlay: () => void
  /** Return to the Learn path (e.g. to review a lesson). */
  readonly onBack: () => void
}

/** Render the completion screen: medal, lede, the six-idea recap, and the Play hand-off CTA. */
export function EndOfPrimer({ lessons, onPlay, onBack }: EndOfPrimerProps): React.JSX.Element {
  return (
    <div className="screen" data-testid="end-of-primer">
      <div className="appbar">
        <button
          type="button"
          className="back"
          onClick={onBack}
          aria-label="Back"
          data-testid="endprimer-back"
        >
          <BackIcon />
        </button>
        <div className="appbar-titles">
          <div className="appbar-eyebrow">FOUNDATIONS</div>
          <div className="appbar-title">Complete</div>
        </div>
        <div className="appbar-spacer" />
      </div>

      <div className="endprimer">
        <div className="endprimer-body">
          <div className="ep-medal">
            <CheckIcon style={{ width: 34, height: 34 }} />
          </div>
          <h1>You&apos;ve got the fundamentals.</h1>
          <p className="ep-lede">
            All six ideas the coach speaks in. Now the numbers at the table will mean something — go
            put them to work.
          </p>
          <div className="recap">
            {lessons.map(({ lesson }) => (
              <div className="recap-row" key={lesson.id}>
                <span className="rr-check">
                  <CheckIcon />
                </span>
                <span className="rr-name">{lesson.title}</span>
                <span className="rr-sub">{lesson.concept.replace(/-/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="endprimer-cta">
          <button
            type="button"
            className="cta-primary"
            onClick={onPlay}
            data-testid="endprimer-play"
          >
            Play a hand →
          </button>
          <div className="drills-soon">
            <span className="ds-tag">Next</span> Drill sets to sharpen each idea — coming soon
          </div>
        </div>
      </div>
    </div>
  )
}
