/**
 * The shared **immersive session header** — the appbar + segmented progress bar + concept tag that the
 * {@link LessonPlayer} (ticket 0047) and the {@link DrillSession} (ticket 0067) render near-identically.
 * Extracted (ticket 0069) so the two callers share one implementation, mirroring the {@link SpotPlayer}
 * "one implementation, two callers" pattern — a tweak to this header lands in one place, not two.
 *
 * Purely presentational and parameterised ONLY by the data that differs between the callers:
 * - the back affordance (`onBack` + its `backTestId`),
 * - the eyebrow text (`LESSON n OF total` vs `SPOT i OF N`) + its optional `eyebrowTestId`,
 * - the appbar title,
 * - the step count + current step (the segmented progress bar),
 * - the lesson player's **read-phase** 0%-fill case (`readPhase`: the lesson shows 0% fill during its
 *   teach/read phase; the drill loop has no read phase) — a prop, not a fork,
 * - the concept tag's label + its optional `conceptTestId` (omit `concept` to render no tag, as the
 *   drill loop does before the first item exists).
 *
 * Same DOM/classes/`data-testid`s/fill math as the inlined headers it replaces — no observable change.
 */

import { BackIcon, SparkIcon } from './Icons.js'

/** Props for {@link SessionHeader}. */
export interface SessionHeaderProps {
  /** Return to the previous screen (the back affordance). */
  readonly onBack: () => void
  /** The back button's `data-testid` (e.g. `lesson-back` / `drill-back`). */
  readonly backTestId: string
  /** The appbar eyebrow text (e.g. `LESSON 1 OF 6` / `SPOT 2 OF 10`). */
  readonly eyebrow: string
  /** The eyebrow's optional `data-testid` (e.g. `drill-progress`). */
  readonly eyebrowTestId?: string
  /** The appbar title (e.g. the lesson title / `Drill`). */
  readonly title: string
  /** How many segments the progress bar has (the spot count). */
  readonly stepCount: number
  /** The 0-based current step (the spot index) — fills prior segments full, the current one half. */
  readonly currentStep: number
  /** The lesson's read/teach phase: render every segment at 0% fill (the drill loop never sets this). */
  readonly readPhase?: boolean
  /** The concept-tag label (already humanised). Omit to render no tag (as the drill loop does pre-first-item). */
  readonly concept?: string
  /** The concept tag's optional `data-testid` (e.g. `drill-theme`). */
  readonly conceptTestId?: string
}

/** Render the shared immersive header: appbar + segmented progress bar + concept tag. */
export function SessionHeader({
  onBack,
  backTestId,
  eyebrow,
  eyebrowTestId,
  title,
  stepCount,
  currentStep,
  readPhase = false,
  concept,
  conceptTestId,
}: SessionHeaderProps): React.JSX.Element {
  return (
    <>
      <div className="appbar">
        <button
          type="button"
          className="back"
          onClick={onBack}
          aria-label="Back"
          data-testid={backTestId}
        >
          <BackIcon />
        </button>
        <div className="appbar-titles">
          <div className="appbar-eyebrow" data-testid={eyebrowTestId}>
            {eyebrow}
          </div>
          <div className="appbar-title">{title}</div>
        </div>
        <div className="appbar-spacer" />
      </div>

      <div className="lesson-head">
        <div className="lesson-steps">
          {Array.from({ length: stepCount }, (_, i) => (
            <div className="ls-seg" key={i}>
              <span
                className="fill"
                style={{
                  width: readPhase
                    ? '0%'
                    : i < currentStep
                      ? '100%'
                      : i === currentStep
                        ? '50%'
                        : '0%',
                }}
              />
            </div>
          ))}
        </div>
        {concept !== undefined ? (
          <span className="concept-tag" data-testid={conceptTestId}>
            <SparkIcon style={{ width: 12, height: 12 }} /> {concept}
          </span>
        ) : null}
      </div>
    </>
  )
}
