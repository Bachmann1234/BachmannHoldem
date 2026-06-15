/**
 * The on-demand coach drawer (ticket 0036) — the bottom sheet the {@link CoachFab} opens, laying
 * out the shared model's {@link CoachResult}. It is the design's `.drawer` (+ `.scrim`) and the
 * payoff of the whole app on the phone: the verdict badge + headline + encouraging copy, the
 * preflop starting-hand line, the three metric cards, the equity win/lose bar, and the explainer.
 *
 * **Presentational only — like the TUI's `CoachPanel`.** The reducer already graded the decision
 * via `@holdem/coach` (capture-before-apply) and stored the finished {@link DecisionVerdict} on
 * `model.coach`; this component does NO verdict math. Every number/label is rendered through the
 * shared `@holdem/format` helpers (`pct` / `evMetric` / `VERDICT_LABEL`) so the PWA and the TUI
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

import { useEffect, useRef, useState } from 'react'
import type { Action, Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import {
  handClassLabel,
  serializeSpot,
  type DecisionVerdict,
  type PreflopVerdict,
} from '@holdem/coach'
import { explainDecision, explainPreflop, pct, evMetric, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '@holdem/session'
import { ChartOverlay } from './ChartOverlay.js'

/** How far (px) the sheet must be dragged down before releasing dismisses it. */
const DISMISS_THRESHOLD = 90

/** Props for {@link CoachDrawer}. */
export interface CoachDrawerProps {
  /** The coach grade to lay out (from `model.coach`). */
  readonly coach: CoachResult
  /** Whether the sheet is open (slid up). */
  readonly open: boolean
  /** Dismiss the sheet. */
  readonly onClose: () => void
  /**
   * The hero's hole cards for the current hand, if any — used to highlight "your hand" in the
   * starting-hand chart opened from a preflop verdict. Omitted when there is no live hand.
   */
  readonly heroHoleCards?: readonly [Card, Card]
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

/**
 * "Copy ruling" — serialise the *exact* spot this verdict was graded on into a readable JSON blob
 * (`serializeSpot`, which carries the verdict too) and write it to the clipboard, so a learner can
 * paste the whole ruling to an AI for a second opinion (or re-grade it with `pnpm sim --spot=`). The
 * coach is a pure function of `(ctx, action)`, so the blob reproduces this verdict exactly.
 *
 * The serialise lives in the pure `@holdem/coach`; only the clipboard write is here (the one DOM
 * concern). `navigator.clipboard` is missing in insecure contexts / older browsers, so the write is
 * guarded — a failure leaves the label unchanged rather than throwing. On success the label briefly
 * flips to "Copied" as the affordance, matching the minimal `chart-link` button style.
 */
function CopyRulingButton({
  ctx,
  action,
  verdict,
}: {
  readonly ctx: DecisionContext
  readonly action: Action
  readonly verdict: DecisionVerdict | PreflopVerdict
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const onClick = (): void => {
    const blob = serializeSpot(ctx, action, verdict)
    // Guard: clipboard is unavailable in insecure contexts / older browsers. Best-effort; never throw.
    void navigator.clipboard?.writeText?.(blob)?.then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => {
        /* clipboard write rejected — leave the label unchanged */
      },
    )
  }
  return (
    <button type="button" className="chart-link" data-testid="copy-ruling" onClick={onClick}>
      {copied ? 'Copied' : '⧉ Copy ruling'}
    </button>
  )
}

/** Render the bottom sheet + its scrim. */
export function CoachDrawer({
  coach,
  open,
  onClose,
  heroHoleCards,
}: CoachDrawerProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus management for the modal sheet: on open, remember what was focused (the FAB that opened
  // it), move focus to the close button, and close on Escape; on close, restore focus to the opener
  // so keyboard/screen-reader users land back where they were. (`onClose` is a stable callback, so
  // this runs only on an actual open/close, not every render.)
  //
  // `preventScroll: true` on both focus calls is load-bearing on mobile: the default `.focus()`
  // scrolls the focused element into view, and focusing the close button while the sheet is still
  // sliding up makes the browser yank the layout to reveal it — the "whole table bounces" on tap.
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  // Swipe-to-dismiss: drag the grab handle / header down to close the sheet (the design's `.grab`
  // affordance, now wired). Pointer events cover touch + mouse. We only treat a gesture as a drag
  // once it has moved past a small threshold DOWNWARD, so a plain tap on the close button still
  // fires its click (no pointer capture is taken until we're sure it's a drag). The body of the
  // sheet keeps its native scroll — only the non-scrolling handle region starts a dismiss drag.
  // State drives the visual transform; refs hold the synchronous truth the release decision reads
  // (state updates are async, so a fast drag's pointerup must not consult possibly-stale state).
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const dragYRef = useRef(0)

  const onHandlePointerDown = (e: React.PointerEvent): void => {
    if (!open) return
    dragStartY.current = e.clientY
    draggingRef.current = false
    dragYRef.current = 0
  }
  const onHandlePointerMove = (e: React.PointerEvent): void => {
    if (dragStartY.current === null) return
    const dy = e.clientY - dragStartY.current
    if (dy <= 0 && !draggingRef.current) return // ignore upward / pre-threshold movement
    if (!draggingRef.current) {
      if (dy < 6) return // not yet a deliberate drag — let a tap through
      draggingRef.current = true
      setDragging(true)
      // Keep the gesture even if the finger slides off the handle. Best-effort: some browsers throw
      // on an unknown pointer id, and losing capture only costs a slightly shorter drag.
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        /* pointer capture is best-effort */
      }
    }
    dragYRef.current = Math.max(0, dy)
    setDragY(dragYRef.current)
  }
  const endDrag = (): void => {
    if (dragStartY.current === null) return
    const shouldClose = draggingRef.current && dragYRef.current > DISMISS_THRESHOLD
    dragStartY.current = null
    draggingRef.current = false
    dragYRef.current = 0
    setDragging(false)
    setDragY(0)
    if (shouldClose) onClose()
  }

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
        // While dragging, follow the finger with no transition; on release the inline style drops and
        // the CSS transition snaps it back (or, if past the threshold, `onClose` slides it away).
        style={dragging ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="drawer-handle"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          data-testid="coach-grab"
        >
          <div className="grab" />
        </div>
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
          <VerdictBody verdict={coach.verdict} ctx={coach.ctx} action={coach.action} />
        ) : coach.kind === 'preflop' ? (
          <PreflopBody
            verdict={coach.verdict}
            ctx={coach.ctx}
            action={coach.action}
            heroHoleCards={heroHoleCards}
          />
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
function VerdictBody({
  verdict,
  ctx,
  action,
}: {
  readonly verdict: DecisionVerdict
  readonly ctx: DecisionContext
  readonly action: Action
}): React.JSX.Element {
  const tone = verdictTone(verdict.verdict)
  // The win/lose bar mirrors the design: a green win fill at `pct(equity)`, the rest is lose.
  const winWidth = pct(verdict.equity)
  // A free check (no bet to call) has no price — show "—" rather than "0.0%", per the design.
  const potOdds = verdict.potOddsThreshold === 0 ? '—' : pct(verdict.potOddsThreshold)
  // The EV card's label/value comes from the shared helper so the PWA matches the CLI/TUI: on a
  // free check / a bet it relabels to "Pot equity" (callEv is pot-equity, not call-EV — ticket 0055).
  const ev = evMetric(verdict)
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
          <div className="k">{ev.label}</div>
          <div className={`v ${verdict.callEv >= 0 ? 'good' : 'bad'}`} data-testid="metric-ev">
            {ev.value}
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
      <div className="coach-note" data-testid="coach-why">
        {explainDecision(verdict)}
      </div>
      <CopyRulingButton ctx={ctx} action={action} verdict={verdict} />
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
      // The only preflop break-even is the optional steal (ticket 0060): the bottom of a steal range
      // is a hand you may open but never have to, so opening and folding both work.
      return `Either way's fine — the bottom of a steal range is optional, so opening and folding both work.`
  }
}

/**
 * The laid-out *preflop* grade off the starting-hand chart (ticket BUG-0001): the verdict badge +
 * headline + encouraging copy, then the chart rationale. Deliberately no equity / pot-odds / EV
 * cards — preflop is graded by the chart, not the pot-odds math, so there is nothing here to
 * contradict the chart verdict.
 */
function PreflopBody({
  verdict,
  ctx,
  action,
  heroHoleCards,
}: {
  readonly verdict: PreflopVerdict
  readonly ctx: DecisionContext
  readonly action: Action
  readonly heroHoleCards?: readonly [Card, Card]
}): React.JSX.Element {
  const tone = verdictTone(verdict.verdict)
  // The chart this verdict came off is viewable on demand — its open state is local UI.
  const [chartOpen, setChartOpen] = useState(false)
  // Highlight the hero's actual starting hand in the chart (its class label = the cell's label).
  const highlight = heroHoleCards ? handClassLabel(heroHoleCards) : undefined
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
      <div className="coach-note" data-testid="coach-why-preflop">
        {explainPreflop(verdict)}
      </div>
      <button
        type="button"
        className="chart-link"
        data-testid="open-chart"
        onClick={() => setChartOpen(true)}
      >
        ♠ See the starting-hand chart
      </button>
      {chartOpen ? (
        <ChartOverlay onClose={() => setChartOpen(false)} highlight={highlight} />
      ) : null}
      <CopyRulingButton ctx={ctx} action={action} verdict={verdict} />
    </>
  )
}
