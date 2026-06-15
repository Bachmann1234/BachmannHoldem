/**
 * The **starting-hand chart** overlay (ticket 0050) — a viewable form of the chart the coach grades
 * preflop decisions against. The coach's preflop verdicts and the Foundations *ranges* lesson refer
 * to "the chart"; this is where the player can actually see it.
 *
 * Presentational only: the 13×13 grid comes straight from `@holdem/coach`'s pure
 * {@link startingHandChart} (pairs on the diagonal, suited upper-right, offsuit lower-left), each
 * cell coloured by its {@link PreflopTier}. Because the grid is enumerated from the same
 * `classifyStartingHand` the live coach uses, the chart can never disagree with how a hand is graded.
 *
 * A centred modal dialog reusing the design's surface tokens — opened from two places (the Learn
 * reference and the coach drawer's preflop verdict), so it is a self-contained overlay (its own
 * scrim, above the coach drawer) rather than a routed screen. Accessibility mirrors {@link CoachDrawer}:
 * a labelled `role="dialog"`, focus moved to the close button on open, Escape to close, focus restored.
 */

import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { startingHandChart, type PreflopTier } from '@holdem/coach'

/** The tiers in strength order — the legend order, strongest first. */
const TIER_ORDER: readonly PreflopTier[] = ['premium', 'strong', 'playable', 'marginal', 'trash']

/** Human labels for the legend. */
const TIER_LABEL: Readonly<Record<PreflopTier, string>> = {
  premium: 'Premium',
  strong: 'Strong',
  playable: 'Playable',
  marginal: 'Marginal',
  trash: 'Trash',
}

/** Props for {@link ChartOverlay}. */
export interface ChartOverlayProps {
  /** Dismiss the overlay. */
  readonly onClose: () => void
  /**
   * The hand-class label to highlight as "your hand" (e.g. `"AKs"`, from `@holdem/coach`'s
   * `handClassLabel`). Its cell gets a ring and the header names it. Omitted from the Learn section
   * (no live hand) — only the coach drawer's preflop verdict passes it.
   */
  readonly highlight?: string
}

/** Render the starting-hand chart as a centred modal over a scrim. */
export function ChartOverlay({ onClose, highlight }: ChartOverlayProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  // The grid is a pure function of nothing (the chart is fixed), so compute it once per open.
  const grid = useMemo(() => startingHandChart(), [])

  // Focus management (mirrors CoachDrawer): focus the close button on open, Escape closes, restore
  // focus to the opener on unmount. The overlay mounts only while open, so this runs once per open.
  useEffect(() => {
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
  }, [onClose])

  // Portal to <body> so the overlay escapes any transformed ancestor (the coach `.drawer` slides via
  // `transform`, which would otherwise become the containing block for our `position: fixed` and pin
  // the chart to the drawer instead of the viewport — BUG-0006). At <body> the `fixed` centering
  // resolves against the viewport from both entry points.
  return createPortal(
    <>
      <div className="chart-scrim" onClick={onClose} aria-hidden="true" data-testid="chart-scrim" />
      <div
        className="chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Starting-hand chart"
        data-testid="chart-modal"
      >
        <div className="drawer-head">
          <div className="drawer-title">Starting-hand chart</div>
          <button
            type="button"
            className="drawer-close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close chart"
            data-testid="chart-close"
          >
            ×
          </button>
        </div>

        <p className="chart-note">
          Every starting hand, sorted into strength tiers — the same chart the coach grades preflop
          against. <b>Suited</b> hands are above the diagonal, <b>offsuit</b> below, pairs down the
          middle.
          {highlight ? (
            <>
              {' '}
              Your hand <b className="chart-your-hand">{highlight}</b> is ringed.
            </>
          ) : null}
        </p>

        <div className="chart-grid" data-testid="chart-grid">
          {grid.flatMap((row, r) =>
            row.map((cell, c) => {
              const current = highlight !== undefined && cell.label === highlight
              return (
                <div
                  key={`${r}-${c}`}
                  className={`chart-cell tier-${cell.tier}${current ? ' is-current' : ''}`}
                  title={`${cell.label} — ${TIER_LABEL[cell.tier]}${current ? ' (your hand)' : ''}`}
                  data-testid={current ? 'chart-current' : undefined}
                >
                  {cell.label}
                </div>
              )
            }),
          )}
        </div>

        <div className="chart-legend" data-testid="chart-legend">
          {TIER_ORDER.map((tier) => (
            <div className="legend-item" key={tier}>
              <span className={`legend-swatch tier-${tier}`} />
              {TIER_LABEL[tier]}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
