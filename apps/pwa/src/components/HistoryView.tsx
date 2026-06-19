/**
 * A minimal recent-hands view (ticket 0037) — enough to prove the hand-history store round-trips.
 *
 * It is NOT the M6 analytics UI: it just reads the most recent records back through the
 * {@link HandHistoryStore} contract and lists each hand's time, table size, and the hero's net chip
 * result. Reads run through the same interface the recording seam writes to, so a populated list is
 * proof the IndexedDB write→read loop works. Read failures degrade to an inline notice — never a
 * crash — matching the seam's graceful-degradation contract.
 */

import { useEffect, useRef, useState } from 'react'
import {
  downloadHistoryExport,
  type HandHistoryRecord,
  type HandHistoryStore,
} from '../history/index.js'

/** How many recent hands the view loads. */
const RECENT_LIMIT = 50

/** Props for {@link HistoryView}. */
export interface HistoryViewProps {
  /** The store to read recent hands from (the same one the seam appends to). */
  readonly store: HandHistoryStore
  /** Close the view. */
  readonly onClose: () => void
}

/** Load state for the async read. */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly records: readonly HandHistoryRecord[] }
  | { readonly kind: 'error' }

/** Format an epoch-ms timestamp as a short local time string. */
function formatTime(playedAt: number): string {
  return new Date(playedAt).toLocaleString()
}

/** Render the recent-hands list, reading newest-first through the store. */
export function HistoryView({ store, onClose }: HistoryViewProps): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)

  // Modal focus management, mirroring CoachDrawer: remember the opener, move focus into the dialog,
  // close on Escape, and restore focus to the opener on unmount. (The view is only mounted while
  // open, so a mount-time effect is sufficient — no inert/aria-hidden dance needed.)
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

  useEffect(() => {
    let cancelled = false
    // Wrap the read so a store failure shows the error state rather than throwing out of render.
    Promise.resolve(store.recent(RECENT_LIMIT))
      .then((records) => {
        if (!cancelled) setState({ kind: 'ready', records })
      })
      .catch((err: unknown) => {
        console.warn('hand-history: read failed', err)
        if (!cancelled) setState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [store])

  // Export the WHOLE log as JSON (not just the recent slice rendered) so every session is in the file —
  // each record carries its `sessionId`, so the dump is sliceable per sitting downstream. A fresh
  // `store.list()` read on click; `Date.now()` is the export timestamp (shell-supplied). Wrapped so a
  // read/download failure degrades to a warning, matching the seam's never-crash contract.
  const onExport = (): void => {
    Promise.resolve(store.list())
      .then((records) => {
        if (records.length === 0) return
        downloadHistoryExport(records, Date.now())
      })
      .catch((err: unknown) => {
        console.warn('hand-history: export failed', err)
      })
  }
  // Only offer export once a non-empty read has resolved (nothing to download otherwise).
  const canExport = state.kind === 'ready' && state.records.length > 0

  return (
    <div
      className="history-overlay"
      data-testid="history-view"
      role="dialog"
      aria-modal="true"
      aria-label="Hand history"
      onClick={onClose}
    >
      {/* Stop clicks inside the sheet from bubbling to the scrim's close handler. */}
      <div className="history-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="history-head">
          <div className="history-title">Recent hands</div>
          <div className="history-head-actions">
            <button
              type="button"
              className="btn history-export"
              data-testid="history-export"
              onClick={onExport}
              disabled={!canExport}
              aria-label="Export hand history as JSON"
            >
              Export
            </button>
            <button
              type="button"
              className="btn history-close"
              data-testid="history-close"
              onClick={onClose}
              ref={closeRef}
              aria-label="Close hand history"
            >
              Close
            </button>
          </div>
        </div>

        {state.kind === 'loading' ? (
          <div className="history-empty">Loading…</div>
        ) : state.kind === 'error' ? (
          <div className="history-empty" data-testid="history-error">
            Couldn’t load hand history.
          </div>
        ) : state.records.length === 0 ? (
          <div className="history-empty" data-testid="history-empty">
            No hands recorded yet.
          </div>
        ) : (
          <ul className="history-list" data-testid="history-list">
            {state.records.map((r) => (
              <li className="history-row" key={r.id}>
                <span className="history-when">{formatTime(r.playedAt)}</span>
                <span className="history-table">{r.seatCount}-max</span>
                <span
                  className={
                    'history-net' +
                    (r.outcome.heroNet > 0 ? ' win' : r.outcome.heroNet < 0 ? ' lose' : '')
                  }
                >
                  {r.outcome.heroNet > 0 ? '+' : ''}
                  {r.outcome.heroNet}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
