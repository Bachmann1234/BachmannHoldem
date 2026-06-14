/**
 * The on-demand coach FAB (ticket 0036) — the corner button overlaid on the felt that opens the
 * {@link CoachDrawer}. It is the design's `.coach-fab`: a quiet pill with a ring that shows the
 * hero's last-decision state at a glance, and a `COACH` label.
 *
 * Strictly presentational over {@link CoachResult} — it does NO verdict math. The ring reads the
 * stored `model.coach`:
 *
 * - `'none'` / `'error'` — `?`, in the neutral accent ring (no decision graded yet, or coaching
 *   degraded to an advisory). The hero hasn't been told anything actionable, so the dot doesn't
 *   pretend otherwise.
 * - `'verdict'` — a quiet post-action dot: `✓` good (green), `!` leak (red), `·` break-even
 *   (accent) — the design's "after the hero acts, show a dot instead of nagging".
 *
 * Clicking (the whole pill) opens the drawer; it carries `aria-haspopup="dialog"` so the
 * relationship to the drawer is announced.
 */

import type { CoachResult } from '@holdem/session'

/** Props for {@link CoachFab}. */
export interface CoachFabProps {
  /** The coach grade of the hero's most recent decision (from `model.coach`). */
  readonly coach: CoachResult
  /** Open the coach drawer. */
  readonly onOpen: () => void
}

/** The ring glyph + colour class for the current coach state. */
function ringFor(coach: CoachResult): { readonly glyph: string; readonly tone: string } {
  if (coach.kind === 'verdict') {
    switch (coach.verdict.verdict) {
      case 'good':
        return { glyph: '✓', tone: 'good' }
      case 'leak':
        return { glyph: '!', tone: 'leak' }
      case 'breakEven':
        return { glyph: '·', tone: 'neutral' }
    }
  }
  // 'none' and 'error' both read as the neutral, nothing-to-report ring.
  return { glyph: '?', tone: 'neutral' }
}

/** Render the corner coach FAB whose ring reflects the hero's last decision. */
export function CoachFab({ coach, onOpen }: CoachFabProps): React.JSX.Element {
  const { glyph, tone } = ringFor(coach)
  return (
    <button
      type="button"
      className="coach-fab"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label="Open coach"
      data-testid="coach-fab"
    >
      <div className={`ring ring-${tone}`} data-testid="coach-fab-ring">
        {glyph}
      </div>
      <div className="lab">COACH</div>
    </button>
  )
}
