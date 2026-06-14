/**
 * The lesson player (ticket 0047) — the heart of the Foundations primer UI: the screen that teaches a
 * lesson by **retrieval**. It walks one {@link Lesson}'s spots through the design's read → ask → grade
 * → explain loop:
 *
 * 1. **Read** ({@link ReadView}) — the lesson's ~30-second `explanation`, plus (for the continue-rule
 *    lesson) the design's "one rule" callout; a "Start the check(s) →" CTA begins the spots.
 * 2. **Ask** ({@link AskView}/{@link SpotView}) — render the current spot. Postflop coach spots show a
 *    mini felt (pot, board, hero hand, a To-call / Free price chip); preflop spots show the
 *    {@link SeatRing} + a position label + hero hand. Two answer buttons from the spot's `choices`.
 * 3. **Grade** — on answer, call the REAL `gradeSpot` from `@holdem/curriculum` (this component does
 *    **no** verdict math, hardcodes no equity/EV). Lock the choices, light the correct one green / a
 *    wrong pick red, and slide up the {@link ResultSheet} drawer.
 * 4. **Explain** ({@link ResultSheet}) — a `.drawer` sibling to the table's {@link CoachDrawer}: the
 *    `.verdict` badge + an encouraging headline/body, then (postflop priced) the slim inline metric
 *    row + equity bar, (free check) equity only, or (preflop) the chart rationale with no metric row.
 *    A `.result-cta` advances to the next check, or finishes the lesson on the last one.
 *
 * **Presentational + engine-driven, exactly like {@link CoachDrawer}.** All correctness lives in the
 * pure engine; every number/label renders through `@holdem/format` (`pct`/`signedChips`) so the primer
 * phrases a verdict identically to the table. Finishing the last spot calls `onComplete` so the shell
 * advances in-memory progress (durable progress is ticket 0048).
 *
 * Accessibility: the result sheet is a labelled `role="dialog"` with the same focus-management bar as
 * {@link CoachDrawer} — focus moves in on open, Escape advances/closes, focus restores on close.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import {
  gradeSpot,
  type GradeResult,
  type Lesson,
  type Spot,
  type SpotVerdict,
} from '@holdem/curriculum'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import { lessonMeta, positionLabel } from '../learn/lessonMeta.js'
import { Card } from './Card.js'
import { BackIcon, SparkIcon } from './Icons.js'
import { SeatRing } from './SeatRing.js'

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

/** Discriminate a {@link SpotVerdict}: only the postflop {@link DecisionVerdict} carries a pot-odds price. */
function isDecisionVerdict(verdict: SpotVerdict): verdict is DecisionVerdict {
  return 'potOddsThreshold' in verdict
}

/**
 * The encouraging copy that wraps a graded result — a PWA-local formatter modelled on
 * {@link CoachDrawer}'s `encouragingCopy`. Correct → a warm affirmation; wrong → "Close one — not
 * quite," naming the correct line so the leak still teaches. It touches NO numbers (those go through
 * `@holdem/format`) and never says "WRONG", per the locked encouraging tone.
 */
function encouragingBody(result: GradeResult, spot: Spot): { headline: string; body: string } {
  if (result.correct) {
    return {
      headline: "Nice — that's exactly right.",
      body: 'Keep trusting the math — that is the read the coach would make at the table.',
    }
  }
  const correctLabel = spot.choices[result.correctIndex]?.label ?? 'the other line'
  return {
    headline: 'Close one — not quite.',
    body: `The math points to ${correctLabel} here — you'll catch it next time.`,
  }
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
          lastSpot={lastSpot}
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
  const head = lesson.title.split(':')[0] ?? lesson.title
  const startLabel = lesson.spots.length > 1 ? 'Start the checks →' : 'Start the check →'
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
      </div>
      <div className="lesson-cta">
        <button type="button" className="cta-primary" onClick={onStart} data-testid="lesson-start">
          {startLabel}
        </button>
      </div>
    </>
  )
}

/** The ask state: render the spot, then the two answer buttons (locked + lit once answered). */
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
  const locked = result !== null
  return (
    <>
      <div className="lesson-body">
        <SpotView spot={spot} />
      </div>
      <div className="answers" data-testid="answers">
        {spot.choices.map((choice, i) => {
          let cls = 'answer'
          if (result !== null) {
            // Light the canonical right answer green, and the player's own pick green too when the
            // engine ruled it correct (`result.correct` is "not a leak" — so a second valid continue
            // or a break-even pick stays consistent with the ✓ badge). Only a pick the engine marks
            // wrong lights red; the rest dim.
            if (i === result.correctIndex || (i === chosen && result.correct)) cls += ' is-correct'
            else if (i === chosen) cls += ' is-wrong'
            else cls += ' dim'
          }
          return (
            <button
              key={i}
              type="button"
              className={cls}
              disabled={locked}
              onClick={() => onPick(i)}
              data-testid={`answer-${i}`}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
    </>
  )
}

/** Render the spot's "stage": a postflop mini-felt or a preflop seat-ring panel, plus the prompt. */
function SpotView({ spot }: { readonly spot: Spot }): React.JSX.Element {
  if (spot.kind === 'preflop') {
    const pos = positionLabel(spot.seat, spot.buttonIndex, spot.numPlayers)
    return (
      <div className="spot">
        <div className="spot-pre">
          <SeatRing
            heroSeat={spot.seat}
            buttonIndex={spot.buttonIndex}
            numPlayers={spot.numPlayers}
          />
          <div className="spot-pre-body">
            <div className="pre-pos">{pos.label}</div>
            <div className="pre-sub">{pos.sub}</div>
            <div className="pre-hand">
              {spot.holeCards.map((card, i) => (
                <Card key={i} card={card} size="lg" />
              ))}
            </div>
          </div>
        </div>
        <p className="spot-prompt">{spot.prompt}</p>
      </div>
    )
  }
  if (spot.kind === 'coach') {
    const { pot, toCall, board, holeCards } = spot.context
    const free = toCall === 0
    return (
      <div className="spot">
        <div className="spot-felt">
          <div className="spot-pot">
            <div className="sp-k">Pot</div>
            <div className="sp-v">
              <span className="disc" />
              {pot}
            </div>
          </div>
          <div className="spot-board">
            {board.map((card, i) => (
              <Card key={i} card={card} size="md" />
            ))}
          </div>
          <div className="spot-hand">
            <div className="sh-k">Your hand</div>
            <div className="sh-cards">
              {holeCards.map((card, i) => (
                <Card key={i} card={card} size="lg" />
              ))}
            </div>
          </div>
          <div className="price-chip" data-testid="price-chip">
            {free ? null : <span className="pc-k">To call</span>}
            {free ? 'Free · nothing to call' : toCall}
          </div>
        </div>
        <p className="spot-prompt">{spot.prompt}</p>
      </div>
    )
  }
  // The declarative carve-out has no felt/ring — just the prompt. (Not used in the Foundations primer.)
  return (
    <div className="spot">
      <p className="spot-prompt">{spot.prompt}</p>
    </div>
  )
}

/**
 * The graded result — a slide-up drawer sibling to {@link CoachDrawer} (`.drawer` + `.scrim`,
 * `.verdict` badge, `.eq-bar`), with a slim inline metric row instead of the big 3-card grid.
 *
 * Three layouts, mapped off the engine's {@link GradeResult}/{@link SpotVerdict}:
 * - **Preflop** (no `verdict`, or a {@link PreflopVerdict}) → badge + headline + the chart rationale,
 *   no metric row (the coach drawer's preflop mode).
 * - **Free check** (a {@link DecisionVerdict} with `potOddsThreshold === 0`, the equity lesson) →
 *   equity only; price/EV show "—"/0.
 * - **Postflop priced** (a {@link DecisionVerdict} with a price) → the slim metric row (equity /
 *   pot-odds price / EV-of-call) + the equity win/lose bar.
 */
function ResultSheet({
  result,
  spot,
  lastSpot,
  onAdvance,
  onClose,
}: {
  readonly result: GradeResult
  readonly spot: Spot
  readonly lastSpot: boolean
  readonly onAdvance: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const advanceRef = useRef<HTMLButtonElement>(null)
  // Focus management (mirrors CoachDrawer): on open, remember the opener, move focus to the advance
  // CTA, and let Escape advance the loop; on close, restore focus to the opener. The drawer mounts
  // only while a result exists, so "open" is its whole lifetime — this runs once per graded spot.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    advanceRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onAdvance()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onAdvance])

  const tone = result.correct ? 'good' : 'leak'
  const badge = result.correct ? '✓' : '!'
  const { headline, body } = useMemo(() => encouragingBody(result, spot), [result, spot])
  const verdict = result.verdict
  // The continue-decision spots carry a DecisionVerdict (priced or free); preflop carries a
  // PreflopVerdict (no price). Discriminate to pick the drawer layout.
  const decision = verdict !== undefined && isDecisionVerdict(verdict) ? verdict : null
  const preflop: PreflopVerdict | null =
    verdict !== undefined && !isDecisionVerdict(verdict) ? verdict : null
  const priced = decision !== null && decision.potOddsThreshold > 0

  const ctaLabel = lastSpot ? 'Finish lesson →' : 'Next check →'

  return (
    <>
      <div className="scrim show" onClick={onClose} data-testid="result-scrim" aria-hidden="true" />
      <div
        className="drawer open"
        role="dialog"
        aria-modal="true"
        aria-label="Lesson check review"
        data-testid="result-sheet"
      >
        <div className="grab" />
        <div className="drawer-head">
          <div className="drawer-title">Decision review · {result.concept.replace(/-/g, ' ')}</div>
        </div>

        <div className={`verdict ${tone}`} data-testid="result-verdict" data-verdict={tone}>
          <div className="verdict-badge">{badge}</div>
          <div className="verdict-body">
            <h4>{headline}</h4>
            <p>{body}</p>
          </div>
        </div>

        {decision !== null ? (
          priced ? (
            <>
              <div className="metric-row" data-testid="result-metrics">
                <div className="metric-inline">
                  <div className="k">Your equity</div>
                  <div className="v accent" data-testid="metric-equity">
                    {pct(decision.equity)}
                  </div>
                </div>
                <div className="metric-inline">
                  <div className="k">Pot-odds price</div>
                  <div className="v" data-testid="metric-price">
                    {pct(decision.potOddsThreshold)}
                  </div>
                </div>
                <div className="metric-inline">
                  <div className="k">EV of call</div>
                  <div
                    className={`v ${decision.callEv >= 0 ? 'good' : 'bad'}`}
                    data-testid="metric-ev"
                  >
                    {signedChips(decision.callEv)}
                  </div>
                </div>
              </div>
              <div className="eq-bar slim">
                <div className="win" style={{ width: pct(decision.equity) }} data-testid="eq-win" />
              </div>
              <div className="eq-fill-note">
                <span>win {pct(decision.equity)}</span>
                <span>lose {pct(1 - decision.equity)}</span>
              </div>
            </>
          ) : (
            // Free check (the equity lesson): equity only; price/EV are not in play.
            <div className="metric-row" data-testid="result-metrics">
              <div className="metric-inline">
                <div className="k">Your equity</div>
                <div className="v accent" data-testid="metric-equity">
                  {pct(decision.equity)}
                </div>
              </div>
              <div className="metric-inline">
                <div className="k">Price</div>
                <div className="v" data-testid="metric-price">
                  —
                </div>
              </div>
              <div className="metric-inline">
                <div className="k">To call</div>
                <div className="v">0</div>
              </div>
            </div>
          )
        ) : preflop !== null ? (
          // Preflop chart-graded: no metric row — the chart rationale, like the coach drawer's preflop mode.
          <div className="coach-note" data-testid="result-rationale">
            <b>{VERDICT_LABEL[preflop.verdict]}</b> {preflop.rationale}
          </div>
        ) : null}

        <button
          type="button"
          className="result-cta"
          ref={advanceRef}
          onClick={onAdvance}
          data-testid="result-cta"
        >
          {ctaLabel}
        </button>
      </div>
    </>
  )
}
