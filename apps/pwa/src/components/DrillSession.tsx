/**
 * The drill **session loop** (ticket 0067) — the drill analog of the {@link LessonPlayer}. Given the
 * themes the player picked, a session length, and a seed, it runs the composed, **interleaved** session
 * the pure engine ([[0066-drills-themed-sets]]) builds: deal a spot, present its answer choices, grade
 * the pick via the REAL `gradeSpot` ([[0044-curriculum-engine]]), explain, advance — looping at speed.
 *
 * **Reuse, not reinvention.** A drill spot _is_ a curriculum {@link Spot}, graded by the same
 * `gradeSpot`, so the spot/answers/result chrome are the *shared* {@link SpotPlayer} pieces the lesson
 * player also renders — a drilled spot looks of-a-piece with a graded lesson check and a graded live
 * hand. The only drill-specific chrome is the in-session progress ("Spot i of N"); everything else is
 * shared. This component does **no** grading math: it renders what `gradeSpot` returns.
 *
 * Immersive + tab-less like the lesson player, and fast/keyboard-and-tap friendly: tap an answer to
 * grade, then tap the CTA or press **Escape** to advance (the shared {@link ResultSheet}'s focus bar).
 *
 * This component holds **no durable state** — it accumulates each spot's outcome in component state and
 * hands them to the parent via `onComplete`. Persistence lives in the parent ({@link DrillsBranch}),
 * which records the finished session's per-concept outcomes to the durable `DrillProgressStore`
 * ([[0080-drills-spaced-repetition]]) — the shared store M6 stats also consume. The clean props API
 * ({@link DrillSessionProps}) — selected themes, seed, length, and `onComplete`/`onExit` — is what
 * ticket 0068 wraps with its theme picker and its by-concept end-of-session summary; this ticket keeps
 * the entry/end minimal.
 */

import { useCallback, useMemo, useState } from 'react'
import { composeSession, type DrillTheme, type SessionBias } from '@holdem/drills'
import { gradeSpot, type GradeResult } from '@holdem/curriculum'
import { SessionHeader } from './SessionHeader.js'
import { ResultSheet, SpotAnswers, SpotView } from './SpotPlayer.js'

/**
 * The result of one answered spot — the grade plus the theme it came from — accumulated as the session
 * runs so {@link DrillSessionProps.onComplete} can hand ticket 0068 a by-concept summary without
 * re-deriving anything.
 */
export interface DrillOutcome {
  /** The engine grade for the answered spot (carries `correct` + the grade-time `concept`). */
  readonly result: GradeResult
  /** The theme the spot was generated from (its `concept`/`title` for the summary). */
  readonly theme: DrillTheme
}

/** Props for {@link DrillSession} — the clean API ticket 0068 wraps with a picker + summary. */
export interface DrillSessionProps {
  /** The themes to draw spots from (a subset of `DRILL_THEMES` the player picked). Must be non-empty. */
  readonly themes: readonly DrillTheme[]
  /** How many spots the session runs. */
  readonly length: number
  /** The session seed — replays the whole interleaved session byte-for-byte. */
  readonly seed: number
  /**
   * Optional spaced-repetition bias (ticket 0080) — weights the seeded composition toward the learner's
   * recently-missed concepts so weak topics recur more, interleaved (never blocked). Omitted/undefined
   * reproduces the prior uniform interleave byte-for-byte. Threaded straight into {@link composeSession}.
   */
  readonly bias?: SessionBias
  /** Finished the last spot — the shell shows its "session over" recap. Carries every spot's outcome. */
  readonly onComplete: (outcomes: readonly DrillOutcome[]) => void
  /** Leave the session early (the Back affordance) — no recap. */
  readonly onExit: () => void
}

/**
 * Run the drill session loop over the composed, interleaved {@link SessionItem}s. The session is
 * composed ONCE from `(themes, length, seed)` (memoised so a re-render never re-deals); `spotIndex`
 * walks it; `chosen`/`result` hold the locked pick + its grade for the current spot (the result drawer
 * is open exactly when a `result` exists); `outcomes` accumulates each graded spot for the recap.
 */
export function DrillSession({
  themes,
  length,
  seed,
  bias,
  onComplete,
  onExit,
}: DrillSessionProps): React.JSX.Element {
  // Compose the interleaved session once — the pure engine owns the ordering + the deals; same
  // (themes, length, seed, bias) ⇒ the same session, and a re-render must not re-deal. `bias` is frozen
  // by the caller for the session's lifetime, so it is a stable dep.
  const session = useMemo(
    () => composeSession(themes, length, seed, bias),
    [themes, length, seed, bias],
  )
  const total = session.length

  const [spotIndex, setSpotIndex] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [outcomes, setOutcomes] = useState<readonly DrillOutcome[]>([])

  const item = session[spotIndex]
  const spot = item?.spot

  // Answer the current spot: grade it with the REAL engine, lock the pick, open the drawer. No grading
  // math here — it renders what `gradeSpot` returns.
  const onPick = useCallback(
    (index: number) => {
      if (spot === undefined || chosen !== null) return
      setChosen(index)
      setResult(gradeSpot(spot, index))
    },
    [spot, chosen],
  )

  const lastSpot = spotIndex >= total - 1

  // Advance from the result drawer: record the outcome, then move to the next spot (reset the pick), or
  // finish the session on the last spot (hand the accumulated outcomes up for the recap).
  const onAdvance = useCallback(() => {
    if (item === undefined || result === null) return
    const next = [...outcomes, { result, theme: item.theme }]
    if (lastSpot) {
      onComplete(next)
      return
    }
    setOutcomes(next)
    setSpotIndex((i) => i + 1)
    setChosen(null)
    setResult(null)
  }, [item, result, outcomes, lastSpot, onComplete])

  return (
    <div className="screen lesson" data-testid="drill-session">
      <SessionHeader
        onBack={onExit}
        backTestId="drill-back"
        eyebrow={`SPOT ${Math.min(spotIndex + 1, total)} OF ${total}`}
        eyebrowTestId="drill-progress"
        title="Drill"
        stepCount={total}
        currentStep={spotIndex}
        concept={item !== undefined ? item.theme.title : undefined}
        conceptTestId="drill-theme"
      />

      {spot !== undefined ? (
        <>
          <div className="lesson-body">
            <SpotView spot={spot} />
          </div>
          <SpotAnswers spot={spot} chosen={chosen} result={result} onPick={onPick} />
        </>
      ) : null}

      {result !== null && spot !== undefined ? (
        <ResultSheet
          result={result}
          spot={spot}
          title={`Drill review · ${result.concept.replace(/-/g, ' ')}`}
          ctaLabel={lastSpot ? 'Finish drill →' : 'Next spot →'}
          ariaLabel="Drill review"
          onAdvance={onAdvance}
          onClose={onExit}
        />
      ) : null}
    </div>
  )
}
