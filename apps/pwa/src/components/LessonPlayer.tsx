/**
 * The lesson player (ticket 0047) — the heart of the Foundations primer UI: the screen that teaches a
 * lesson by **retrieval**. It walks one {@link Lesson}'s spots through the design's read → ask → grade
 * → explain loop:
 *
 * 1. **Read** ({@link ReadView}) — the lesson's ~30-second `explanation`, plus (for the continue-rule
 *    lesson) the design's "one rule" callout; a "Start the check(s) →" CTA begins the spots.
 * 2. **Ask** ({@link AskView}) — render the current spot via the shared {@link SpotView}. Postflop coach
 *    spots show a mini felt (pot, board, hero hand, a To-call / Free price chip); preflop spots show the
 *    {@link SeatRing} + a position label + hero hand. The shared {@link SpotAnswers} renders the answer
 *    buttons from the spot's `choices`.
 * 3. **Grade** — on answer, call the REAL `gradeSpot` from `@holdem/curriculum` (this component does
 *    **no** verdict math, hardcodes no equity/EV). Lock the choices, light the correct one green / a
 *    wrong pick red, and slide up the shared {@link ResultSheet} drawer.
 * 4. **Explain** ({@link ResultSheet}) — a `.drawer` sibling to the table's {@link CoachDrawer}: the
 *    `.verdict` badge + an encouraging headline/body, then (postflop priced) the slim inline metric
 *    row + equity bar, (free check) equity only, or (preflop) the chart rationale with no metric row.
 *    A `.result-cta` advances to the next check, or finishes the lesson on the last one.
 *
 * The spot/answers/result pieces are the shared {@link SpotPlayer} primitives the drill loop (ticket
 * 0067) reuses, so a graded lesson check and a drilled spot render of-a-piece.
 *
 * **Presentational + engine-driven, exactly like {@link CoachDrawer}.** All correctness lives in the
 * pure engine; every number/label renders through `@holdem/format` (`pct`/`signedChips`) so the primer
 * phrases a verdict identically to the table. Finishing the last spot calls `onComplete` so the shell
 * advances in-memory progress (durable progress is ticket 0048).
 *
 * Accessibility: the result sheet is a labelled `role="dialog"` with the same focus-management bar as
 * {@link CoachDrawer} — focus moves in on open, Escape advances/closes, focus restores on close.
 */

import { useCallback, useState } from 'react'
import { gradeSpot, type GradeResult, type Lesson, type Spot } from '@holdem/curriculum'
import { lessonHead, lessonMeta } from '../learn/lessonMeta.js'
import { ChartOverlay } from './ChartOverlay.js'
import { BackIcon, SparkIcon } from './Icons.js'
import { ResultSheet, SpotAnswers, SpotView } from './SpotPlayer.js'

/** Props for {@link LessonPlayer}. */
export interface LessonPlayerProps {
  /** The lesson being played. */
  readonly lesson: Lesson
  /** Its 1-based number on the path (for the "LESSON n OF 6" eyebrow). */
  readonly n: number
  /** How many lessons there are in total (the eyebrow's denominator). */
  readonly total: number
  /** Return to the Learn path without finishing. */
  readonly onBack: () => void
  /** Called when the learner finishes the last spot — the shell advances progress + closes the player. */
  readonly onComplete: () => void
}

/** Render the lesson player — the read → ask → grade → explain loop over the lesson's spots. */
export function LessonPlayer({
  lesson,
  n,
  total,
  onBack,
  onComplete,
}: LessonPlayerProps): React.JSX.Element {
  const meta = lessonMeta(lesson)
  const spotCount = lesson.spots.length
  // The player walks the spots front-to-back. `phase` gates read vs ask; `spotIndex` is the current
  // spot; `chosen` is the locked pick for that spot (null until answered); `result` is the engine's
  // grade for that pick. The result drawer is open exactly when a `result` exists.
  const [phase, setPhase] = useState<'read' | 'ask'>('read')
  const [spotIndex, setSpotIndex] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)

  const spot = lesson.spots[spotIndex]

  // Start the checks: leave the read state and show the first spot.
  const onStart = useCallback(() => setPhase('ask'), [])

  // Answer the current spot: grade it with the REAL engine, lock the pick, and open the drawer. The
  // component does no grading math — it renders what `gradeSpot` returns.
  const onPick = useCallback(
    (index: number) => {
      if (spot === undefined || chosen !== null) return
      setChosen(index)
      setResult(gradeSpot(spot, index))
    },
    [spot, chosen],
  )

  const lastSpot = spotIndex >= spotCount - 1

  // Advance from the result drawer: to the next spot (reset the pick), or finish the lesson on the
  // last spot (the shell advances progress and returns to the path).
  const onAdvance = useCallback(() => {
    if (lastSpot) {
      onComplete()
      return
    }
    setSpotIndex((i) => i + 1)
    setChosen(null)
    setResult(null)
  }, [lastSpot, onComplete])

  return (
    <div className="screen lesson" data-testid="lesson-player">
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

      <div className="lesson-head">
        <div className="lesson-steps">
          {lesson.spots.map((_s, i) => (
            <div className="ls-seg" key={i}>
              <span
                className="fill"
                style={{
                  width:
                    phase === 'read'
                      ? '0%'
                      : i < spotIndex
                        ? '100%'
                        : i === spotIndex
                          ? '50%'
                          : '0%',
                }}
              />
            </div>
          ))}
        </div>
        <span className="concept-tag">
          <SparkIcon style={{ width: 12, height: 12 }} /> {lesson.concept.replace(/-/g, ' ')}
        </span>
      </div>

      {phase === 'read' || spot === undefined ? (
        <ReadView lesson={lesson} rule={meta.rule} onStart={onStart} />
      ) : (
        <AskView spot={spot} chosen={chosen} result={result} onPick={onPick} />
      )}

      {result !== null && spot !== undefined ? (
        <ResultSheet
          result={result}
          spot={spot}
          title={`Decision review · ${result.concept.replace(/-/g, ' ')}`}
          ctaLabel={lastSpot ? 'Finish lesson →' : 'Next check →'}
          ariaLabel="Lesson check review"
          onAdvance={onAdvance}
          onClose={onBack}
        />
      ) : null}
    </div>
  )
}

/** The read state: the lesson's ~30-second teach + (for the continue-rule lesson) the one-rule callout. */
function ReadView({
  lesson,
  rule,
  onStart,
}: {
  readonly lesson: Lesson
  readonly rule: string | undefined
  readonly onStart: () => void
}): React.JSX.Element {
  const meta = lessonMeta(lesson)
  // The package title is "Equity: your share of the pot"; show just the head, with the subtitle below.
  const head = lessonHead(lesson)
  const startLabel = lesson.spots.length > 1 ? 'Start the checks →' : 'Start the check →'
  // The ranges lesson teaches the *tiers*; the chart's tap-to-explain teaches the *why* behind them
  // (ticket 0064). Bridge the two so a learner can jump straight from "sort into tiers" to "why does
  // this hand sit here?" — the gap that motivated the grade explainer.
  const showChartBridge = lesson.id === 'foundations-ranges'
  const [chartOpen, setChartOpen] = useState(false)
  return (
    <>
      <div className="lesson-body" data-testid="lesson-read">
        <div className="nl-tier" style={{ marginTop: 4 }}>
          The idea
        </div>
        <h2 className="teach-title">
          {head}
          {meta.subtitle ? <span className="tt-sub">{meta.subtitle}</span> : null}
        </h2>
        <p className="teach">{lesson.explanation}</p>
        {rule ? (
          <div className="teach-rule" data-testid="teach-rule">
            <span className="tr-k">The one rule</span>
            {rule}
          </div>
        ) : null}
        {showChartBridge ? (
          <button
            type="button"
            className="chart-link"
            onClick={() => setChartOpen(true)}
            data-testid="lesson-open-chart"
          >
            ♠ Open the chart — tap a hand to see why
          </button>
        ) : null}
      </div>
      {chartOpen ? <ChartOverlay onClose={() => setChartOpen(false)} /> : null}
      <div className="lesson-cta">
        <button type="button" className="cta-primary" onClick={onStart} data-testid="lesson-start">
          {startLabel}
        </button>
      </div>
    </>
  )
}

/** The ask state: render the spot, then the answer buttons — both the shared {@link SpotPlayer} pieces. */
function AskView({
  spot,
  chosen,
  result,
  onPick,
}: {
  readonly spot: Spot
  readonly chosen: number | null
  /** The engine grade once answered (carries `correctIndex` + `correct`); `null` until then. */
  readonly result: GradeResult | null
  readonly onPick: (index: number) => void
}): React.JSX.Element {
  return (
    <>
      <div className="lesson-body">
        <SpotView spot={spot} />
      </div>
      <SpotAnswers spot={spot} chosen={chosen} result={result} onPick={onPick} />
    </>
  )
}
