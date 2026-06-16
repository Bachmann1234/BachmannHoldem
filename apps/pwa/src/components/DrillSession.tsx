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
 * Progress is **ephemeral** this milestone — the session lives entirely in component state, nothing is
 * persisted (durable stats are M6). The clean props API ({@link DrillSessionProps}) — selected themes,
 * seed, length, and `onComplete`/`onExit` — is what ticket 0068 wraps with its theme picker and its
 * by-concept end-of-session summary; this ticket keeps the entry/end minimal.
 */

import { useCallback, useMemo, useState } from 'react'
import { composeSession, type DrillTheme } from '@holdem/drills'
import { gradeSpot, type GradeResult } from '@holdem/curriculum'
import { BackIcon, SparkIcon } from './Icons.js'
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
  onComplete,
  onExit,
}: DrillSessionProps): React.JSX.Element {
  // Compose the interleaved session once — the pure engine owns the ordering + the deals; same
  // (themes, length, seed) ⇒ the same session, and a re-render must not re-deal.
  const session = useMemo(() => composeSession(themes, length, seed), [themes, length, seed])
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
      <div className="appbar">
        <button
          type="button"
          className="back"
          onClick={onExit}
          aria-label="Back"
          data-testid="drill-back"
        >
          <BackIcon />
        </button>
        <div className="appbar-titles">
          <div className="appbar-eyebrow" data-testid="drill-progress">{`SPOT ${Math.min(
            spotIndex + 1,
            total,
          )} OF ${total}`}</div>
          <div className="appbar-title">Drill</div>
        </div>
        <div className="appbar-spacer" />
      </div>

      <div className="lesson-head">
        <div className="lesson-steps">
          {session.map((_s, i) => (
            <div className="ls-seg" key={i}>
              <span
                className="fill"
                style={{
                  width: i < spotIndex ? '100%' : i === spotIndex ? '50%' : '0%',
                }}
              />
            </div>
          ))}
        </div>
        {item !== undefined ? (
          <span className="concept-tag" data-testid="drill-theme">
            <SparkIcon style={{ width: 12, height: 12 }} /> {item.theme.title}
          </span>
        ) : null}
      </div>

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
