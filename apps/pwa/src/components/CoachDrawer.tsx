/**
 * The on-demand coach drawer (ticket 0036) — the bottom sheet the {@link CoachFab} opens, laying
 * out the shared model's {@link CoachResult}. It is the design's `.drawer` (+ `.scrim`) and the
 * payoff of the whole app on the phone: the verdict badge + headline + encouraging copy, the
 * preflop starting-hand line, the three metric cards, the equity win/lose bar, and the explainer.
 *
 * **Presentational only — like the TUI's `CoachPanel`.** The reducer already graded the decision
 * via `@holdem/coach` (capture-before-apply) and stored the finished {@link DecisionVerdict} on
 * `model.coach`; this component does NO verdict math. Every number/label is rendered through the
 * shared `@holdem/format` helpers (`pct` / `signedChips` / `VERDICT_LABEL`) so the PWA and the TUI
 * can never phrase a verdict differently.
 *
 * **Post-action verdict only** (user decision, recorded in ticket 0036): there is no pre-action
 * "live read" mode. The `'none'` state is a placeholder that prompts the hero to act and check back.
 *
 * Four states, one per {@link CoachResult.kind}:
 * - `'verdict'` — the full *postflop* grade (badge ✓/!/~, `VERDICT_LABEL` headline, encouraging
 *   copy, the equity / pot-odds / EV metric cards, the win/lose bar, the note).
 * - `'preflop'` — the *preflop* grade off the starting-hand chart (badge + headline + copy + the
 *   chart rationale), with no pot-odds cards to contradict the chart (ticket BUG-0001).
 * - `'none'` — the dim "act, then tap to review" placeholder.
 * - `'error'` — the one-line advisory `coach.message` (coaching never crashes the hand).
 *
 * Accessibility: a `role="dialog"` bottom sheet, labelled, dismissible by the scrim, the close
 * button, or Escape. On open the close button is focused; the safe-area inset is respected by the
 * design CSS.
 */

import { useEffect, useRef } from 'react'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '@holdem/session'

/** Props for {@link CoachDrawer}. */
export interface CoachDrawerProps {
  /** The coach grade to lay out (from `model.coach`). */
  readonly coach: CoachResult
  /** Whether the sheet is open (slid up). */
  readonly open: boolean
  /** Dismiss the sheet. */
  readonly onClose: () => void
}

/**
 * The encouraging verdict copy — a PWA-local helper keyed on our three verdict tags, modelled on
 * the design's `TONE_COPY.encouraging`. It references the EV-correct decision so the warm line still
 * teaches; it touches no numbers (those go through `@holdem/format`), so it stays PWA-local.
 */
function encouragingCopy(verdict: DecisionVerdict): string {
  const target = verdict.correctDecision === 'continue' ? 'staying in' : 'folding'
  switch (verdict.verdict) {
    case 'good':
      return `Nice — that's exactly right. Keep trusting the odds.`
    case 'leak':
      return `Close one! The numbers pointed to ${target} here — you'll catch it next time.`
    case 'breakEven':
      return `Coin-flip spot — either way is fine here. Trust your read.`
    default:
      return ''
  }
}

/** The verdict-block tone class + badge glyph for one verdict tag. */
function verdictTone(tag: DecisionVerdict['verdict']): {
  readonly cls: string
  readonly badge: string
} {
  switch (tag) {
    case 'good':
      return { cls: 'good', badge: '✓' }
    case 'leak':
      return { cls: 'leak', badge: '!' }
    case 'breakEven':
      return { cls: 'neutral', badge: '~' }
    default:
      return { cls: 'neutral', badge: '~' }
  }
}

/** Render the bottom sheet + its scrim. */
export function CoachDrawer({ coach, open, onClose }: CoachDrawerProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus management for the modal sheet: on open, remember what was focused (the FAB that opened
  // it), move focus to the close button, and close on Escape; on close, restore focus to the opener
  // so keyboard/screen-reader users land back where they were. (`onClose` is a stable callback, so
  // this runs only on an actual open/close, not every render.)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, onClose])

  return (
    <>
      <div
        className={`scrim${open ? ' show' : ''}`}
        onClick={onClose}
        data-testid="coach-scrim"
        aria-hidden="true"
      />
      <div
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal={open || undefined}
        aria-label="Coach decision review"
        // When closed the sheet is only translated off-screen (kept mounted for the slide
        // transition), so mark it inert + hidden so it leaves the tab order and the a11y tree
        // rather than lingering as a reachable hidden dialog behind the table.
        aria-hidden={!open || undefined}
        inert={!open}
        data-testid="coach-drawer"
      >
        <div className="grab" />
        <div className="drawer-head">
          <div className="drawer-title">Decision review</div>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            ref={closeRef}
            aria-label="Close coach"
            data-testid="coach-close"
          >
            ×
          </button>
        </div>
        {coach.kind === 'verdict' ? (
          <VerdictBody verdict={coach.verdict} />
        ) : coach.kind === 'preflop' ? (
          <PreflopBody verdict={coach.verdict} />
        ) : coach.kind === 'error' ? (
          <div className="coach-note" data-testid="coach-error">
            {coach.message}
          </div>
        ) : (
          <div className="coach-note" data-testid="coach-none">
            No decision yet — make your move, then tap the coach to review it.
          </div>
        )}
      </div>
    </>
  )
}

/**
 * The laid-out *postflop* verdict: badge + headline + encouraging copy, the metric cards, equity
 * bar, and the explainer. Postflop only — preflop is graded by the chart and rendered by
 * {@link PreflopBody} (no equity/EV cards to contradict the chart, ticket BUG-0001).
 */
function VerdictBody({ verdict }: { readonly verdict: DecisionVerdict }): React.JSX.Element {
  const tone = verdictTone(verdict.verdict)
  // The win/lose bar mirrors the design: a green win fill at `pct(equity)`, the rest is lose.
  const winWidth = pct(verdict.equity)
  // A free check (no bet to call) has no price — show "—" rather than "0.0%", per the design.
  const potOdds = verdict.potOddsThreshold === 0 ? '—' : pct(verdict.potOddsThreshold)
  return (
    <>
      <div className={`verdict ${tone.cls}`} data-testid="coach-verdict">
        <div className="verdict-badge">{tone.badge}</div>
        <div className="verdict-body">
          <h4>{VERDICT_LABEL[verdict.verdict]}</h4>
          <p>{encouragingCopy(verdict)}</p>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <div className="k">Your equity</div>
          <div className="v accent" data-testid="metric-equity">
            {pct(verdict.equity)}
          </div>
          <div className="sub">to win</div>
        </div>
        <div className="metric">
          <div className="k">Pot odds</div>
          <div className="v" data-testid="metric-potodds">
            {potOdds}
          </div>
          <div className="sub">{verdict.potOddsThreshold === 0 ? 'free check' : 'to call'}</div>
        </div>
        <div className="metric">
          <div className="k">EV of call</div>
          <div className={`v ${verdict.callEv >= 0 ? 'good' : 'bad'}`} data-testid="metric-ev">
            {signedChips(verdict.callEv)}
          </div>
          <div className="sub">chips</div>
        </div>
      </div>
      <div className="eq-bar">
        <div className="win" style={{ width: winWidth }} data-testid="eq-win" />
      </div>
      <div className="eq-fill-note">
        <span>win {pct(verdict.equity)}</span>
        <span>lose {pct(1 - verdict.equity)}</span>
      </div>
      <div className="coach-note">
        Equity is your estimated share of the pot against the live opponents&apos; assumed ranges.{' '}
        <b>Pot odds</b> are the price you&apos;re laid — continue when equity beats the price.
      </div>
    </>
  )
}

/**
 * The encouraging copy for a *preflop* grade — keyed on our three verdict tags, modelled on
 * {@link encouragingCopy}. It references the chart's open/fold advice (not pot odds) so the warm
 * line teaches the chart lesson. Touches no numbers, so it stays PWA-local.
 */
function preflopCopy(verdict: PreflopVerdict): string {
  const target = verdict.advice === 'open' ? 'playing this hand' : 'folding it'
  switch (verdict.verdict) {
    case 'good':
      return `Nice — that's exactly right. Keep trusting the chart.`
    case 'leak':
      return `Close one! The chart pointed to ${target} here — you'll catch it next time.`
    default:
      return `Borderline spot — trust your read and your position.`
  }
}

/**
 * The laid-out *preflop* grade off the starting-hand chart (ticket BUG-0001): the verdict badge +
 * headline + encouraging copy, then the chart rationale. Deliberately no equity / pot-odds / EV
 * cards — preflop is graded by the chart, not the pot-odds math, so there is nothing here to
 * contradict the chart verdict.
 */
function PreflopBody({ verdict }: { readonly verdict: PreflopVerdict }): React.JSX.Element {
  const tone = verdictTone(verdict.verdict)
  return (
    <>
      <div className={`verdict ${tone.cls}`} data-testid="coach-verdict">
        <div className="verdict-badge">{tone.badge}</div>
        <div className="verdict-body">
          <h4>{VERDICT_LABEL[verdict.verdict]}</h4>
          <p>{preflopCopy(verdict)}</p>
        </div>
      </div>
      <div className="coach-note" data-testid="coach-preflop">
        <b>Starting hand:</b> {verdict.rationale}
      </div>
    </>
  )
}
