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

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  describeHandClass,
  explainGrade,
  startingHandChart,
  type GradeTermId,
  type PreflopTier,
} from '@holdem/coach'
import { GlossaryText } from './GlossaryText.js'
import { GlossaryOverlay } from './GlossaryOverlay.js'

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
  // Tap-to-decode: the selected cell's label drives the caption that spells the shorthand out in
  // words — the touch-friendly counterpart to the hover `title` (which never fires on a phone). Seed
  // it with "your hand" when the coach opened the chart, so the decode is already showing on open.
  const [selected, setSelected] = useState<string | undefined>(highlight)
  // The tier of the selected cell, for the caption's "— Marginal" suffix (cells carry their tier).
  const selectedTier = useMemo(
    () => grid.flat().find((cell) => cell.label === selected)?.tier,
    [grid, selected],
  )
  // The plain-English "why this grade" for the selected hand — the A9s-vs-K9s explanation (0064).
  const explanation = useMemo(() => (selected ? explainGrade(selected) : []), [selected])
  // When a learner taps a term inside the explanation, open the glossary scrolled to that entry. The
  // glossary is rendered nested here (it portals to <body>) so this works from both chart entry
  // points — the Learn reference and the coach drawer — without threading callbacks through parents.
  const [glossaryTerm, setGlossaryTerm] = useState<GradeTermId | undefined>(undefined)
  const glossaryOpen = glossaryTerm !== undefined
  // Both this chart and the nested glossary register a window-level Escape handler. When the glossary
  // is open on top, its handler closes it — so the chart must ignore Escape, or one keypress would
  // collapse both layers at once. A ref (not a dep) lets the long-lived listener read the live value.
  const glossaryOpenRef = useRef(glossaryOpen)
  glossaryOpenRef.current = glossaryOpen

  // Focus management (mirrors CoachDrawer): focus the close button on open, Escape closes, restore
  // focus to the opener on unmount. The overlay mounts only while open, so this runs once per open.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !glossaryOpenRef.current) onClose()
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
        // While the glossary is stacked on top, this chart is the background layer: hide it from
        // assistive tech and block interaction so only one modal is live at a time.
        aria-hidden={glossaryOpen || undefined}
        inert={glossaryOpen}
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
              const isSelected = cell.label === selected
              const decoded = describeHandClass(cell.label)
              return (
                <button
                  type="button"
                  key={`${r}-${c}`}
                  className={
                    `chart-cell tier-${cell.tier}` +
                    (current ? ' is-current' : '') +
                    (isSelected ? ' is-selected' : '')
                  }
                  onClick={() => setSelected(cell.label)}
                  title={`${cell.label} — ${decoded} — ${TIER_LABEL[cell.tier]}${current ? ' (your hand)' : ''}`}
                  aria-label={`${decoded}, ${TIER_LABEL[cell.tier]}${current ? ', your hand' : ''}`}
                  aria-pressed={isSelected}
                  data-testid={current ? 'chart-current' : undefined}
                >
                  {cell.label}
                </button>
              )
            }),
          )}
        </div>

        {/* Decode caption: spells the tapped cell's shorthand out in words, then explains why it
            earns its grade (0064). aria-live so a screen reader announces both when selection
            changes; a hint prompts the first tap. */}
        <div className="chart-caption" data-testid="chart-caption" aria-live="polite">
          {selected && selectedTier ? (
            <>
              <p className="chart-caption-name">
                <b className="chart-your-hand">{selected}</b> — {describeHandClass(selected)} —{' '}
                {TIER_LABEL[selectedTier]}
              </p>
              {explanation.length > 0 ? (
                <p className="chart-caption-why" data-testid="chart-caption-why">
                  <GlossaryText segments={explanation} onTermClick={setGlossaryTerm} />
                </p>
              ) : null}
            </>
          ) : (
            <span className="chart-caption-hint">Tap any hand to read its full name.</span>
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

      {/* Tapping a term in the explanation opens the glossary at that entry (it portals to <body>,
          so it stacks above this chart). */}
      {glossaryTerm ? (
        <GlossaryOverlay focusTerm={glossaryTerm} onClose={() => setGlossaryTerm(undefined)} />
      ) : null}
    </>,
    document.body,
  )
}
