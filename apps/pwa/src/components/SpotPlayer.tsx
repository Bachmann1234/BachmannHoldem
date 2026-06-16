/**
 * The shared **spot player** primitives (ticket 0067) — the read → ask → grade → explain pieces the
 * {@link LessonPlayer} pioneered (ticket 0047), extracted so a drilled spot and a lesson check render
 * **of-a-piece**: same mini-felt / seat-ring renderer, same answer buttons, same graded result drawer.
 *
 * Three exports, lifted verbatim from the lesson player so both surfaces share one implementation:
 *
 * - {@link SpotView} — a curriculum {@link Spot}'s "stage": a postflop mini-felt (pot, board, hero
 *   hand, a To-call / Free price chip) or a preflop {@link SeatRing} + position label + hero hand, plus
 *   the prompt. Identical pixels whether the spot came from a hand-authored lesson or the drill generator.
 * - {@link SpotAnswers} — the answer-choices block: the spot's `choices` as tappable buttons that lock
 *   on answer, lighting the canonical right answer green / a wrong pick red.
 * - {@link ResultSheet} — the slide-up `.drawer` graded-result sheet (sibling to {@link CoachDrawer}):
 *   the `.verdict` badge + encouraging copy, the slim metric row + equity bar (postflop priced), equity
 *   only (free check), or the chart rationale (preflop), then the shared `explainDecision` "why" line.
 *   Carries the same focus-management bar as {@link CoachDrawer}: focus moves to the advance CTA on
 *   open, Escape advances, focus restores on close.
 *
 * **Presentational + engine-driven, exactly like {@link CoachDrawer}.** All correctness lives in the
 * pure engine; every number/label renders through `@holdem/format` so a drill, a lesson, and the live
 * coach phrase a verdict identically. None of these do verdict math — they render what `gradeSpot` returns.
 *
 * The only seam parameterising lesson-vs-drill is the {@link ResultSheet}'s copy ({@link ResultSheetProps.title},
 * {@link ResultSheetProps.ctaLabel}, {@link ResultSheetProps.ariaLabel}); everything else is shared.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import { type GradeResult, type Spot, type SpotVerdict } from '@holdem/curriculum'
import { explainDecision, pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import { positionLabel } from '../learn/lessonMeta.js'
import { Card } from './Card.js'
import { SeatRing } from './SeatRing.js'

/** Discriminate a {@link SpotVerdict}: only the postflop {@link DecisionVerdict} carries a pot-odds price. */
function isDecisionVerdict(verdict: SpotVerdict): verdict is DecisionVerdict {
  return 'potOddsThreshold' in verdict
}

/**
 * The encouraging copy that wraps a graded result — modelled on {@link CoachDrawer}'s `encouragingCopy`.
 * Correct → a warm affirmation; wrong → "Close one — not quite," naming the correct line so the leak
 * still teaches. It touches NO numbers (those go through `@holdem/format`) and never says "WRONG", per
 * the locked encouraging tone.
 */
export function encouragingBody(
  result: GradeResult,
  spot: Spot,
): { headline: string; body: string } {
  if (result.correct) {
    return {
      headline: "Nice, that's exactly right.",
      body: 'Keep trusting the math. That is the read the coach would make at the table.',
    }
  }
  const correctLabel = spot.choices[result.correctIndex]?.label ?? 'the other line'
  return {
    headline: 'Close one, not quite.',
    body: `The math points to ${correctLabel} here. You'll catch it next time.`,
  }
}

/** Render the spot's "stage": a postflop mini-felt or a preflop seat-ring panel, plus the prompt. */
export function SpotView({ spot }: { readonly spot: Spot }): React.JSX.Element {
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

/** The answer-choices block: the spot's choices as buttons, locked + lit once answered. */
export function SpotAnswers({
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
    <div className="answers" data-testid="answers">
      {spot.choices.map((choice, i) => {
        let cls = 'answer'
        if (result !== null) {
          // Light the canonical right answer green, and the player's own pick green too when the engine
          // ruled it correct (`result.correct` is "not a leak" — so a second valid continue or a
          // break-even pick stays consistent with the ✓ badge). Only a pick the engine marks wrong
          // lights red; the rest dim.
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
  )
}

/** Props for {@link ResultSheet}. */
export interface ResultSheetProps {
  /** The engine grade for the answered spot — the sheet renders exactly what it carries. */
  readonly result: GradeResult
  /** The spot just answered (for the correct-line label in the encouraging copy). */
  readonly spot: Spot
  /** The drawer-head title (e.g. `Decision review · pot odds`). */
  readonly title: string
  /** The advance CTA label (e.g. `Next check →` / `Finish lesson →` / `Next spot →`). */
  readonly ctaLabel: string
  /** The dialog's accessible name (e.g. `Lesson check review` / `Drill review`). */
  readonly ariaLabel: string
  /** Advance the loop (also fired by Escape). */
  readonly onAdvance: () => void
  /** Dismiss the sheet (the scrim tap). */
  readonly onClose: () => void
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
export function ResultSheet({
  result,
  spot,
  title,
  ctaLabel,
  ariaLabel,
  onAdvance,
  onClose,
}: ResultSheetProps): React.JSX.Element {
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

  return (
    <>
      <div className="scrim show" onClick={onClose} data-testid="result-scrim" aria-hidden="true" />
      <div
        className="drawer open"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-testid="result-sheet"
      >
        <div className="grab" />
        <div className="drawer-head">
          <div className="drawer-title">{title}</div>
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
                  n/a
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
        ) : (
          // Declarative carve-out (no coach verdict): the author's own explanation is the whole "why".
          // The draws/implied-odds spot (ticket 0074) is the first such spot in the app; without this
          // branch its hand-authored explanation — the actual teaching — would never render.
          <div className="coach-note" data-testid="result-explanation">
            {result.explanation}
          </div>
        )}

        {/* The shared deterministic "why" line — the same sentence the live play coach shows, so a
            lesson, a drill, and the table explain a verdict identically. Postflop (priced or free)
            only; preflop's rationale above already is its why. */}
        {decision !== null ? (
          <div className="coach-note" data-testid="result-why">
            {explainDecision(decision)}
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
