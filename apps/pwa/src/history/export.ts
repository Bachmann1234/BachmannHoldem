/**
 * Export the hand-history log as a single JSON document (schema v3) — the "export a session and have a
 * coach analyse it" affordance. The store is on-device IndexedDB; this turns a read of it into a file
 * the hero can hand off.
 *
 * **Why an envelope, not the bare array.** A reader (a coach, a future importer) needs to know *what*
 * it is holding without guessing: the {@link HISTORY_EXPORT_KIND} tag identifies the document, and the
 * {@link HistoryExport.schemaVersion} pins the record shape (so a v3 export carrying `holeCards` /
 * `sessionId` is distinguishable from an older one that does not). Each record already carries its own
 * `sessionId` (schema v3), so the flat `hands` array is sliceable per sitting downstream — the export
 * deliberately does NOT pre-group, keeping it a faithful dump of the log rather than a lossy view.
 *
 * The pure builder ({@link buildHistoryExport}) is split from the browser download trigger
 * ({@link downloadHistoryExport}) on the same seam discipline as the rest of the module: the shape is
 * unit-testable without a DOM, and only the thin `Blob`/anchor click touches the platform. Both
 * non-pure inputs — `exportedAt` and the records — are passed in, never read from a clock or store here.
 */

import { HAND_HISTORY_SCHEMA_VERSION, type HandHistoryRecord } from './record.js'

/** Document-type tag stamped on an export so a reader can identify it without guessing the shape. */
export const HISTORY_EXPORT_KIND = 'holdem-hand-history-export'

/** The exported document: a tagged, versioned envelope around the flat hand log. */
export interface HistoryExport {
  /** Always {@link HISTORY_EXPORT_KIND} — identifies the document. */
  readonly kind: typeof HISTORY_EXPORT_KIND
  /** The {@link HAND_HISTORY_SCHEMA_VERSION} the export was written at (the record shape). */
  readonly schemaVersion: number
  /** When the export was produced, epoch ms (shell-supplied — never read from a clock here). */
  readonly exportedAt: number
  /** How many hands the export contains (convenience; equals `hands.length`). */
  readonly handCount: number
  /** The hands, in the order given (the store hands them back newest-first). */
  readonly hands: readonly HandHistoryRecord[]
}

/**
 * Build the export envelope from a set of records + the export timestamp. Pure: given the same inputs
 * it returns the same document, so it is fully unit-testable without a DOM or clock.
 */
export function buildHistoryExport(
  records: readonly HandHistoryRecord[],
  exportedAt: number,
): HistoryExport {
  return {
    kind: HISTORY_EXPORT_KIND,
    schemaVersion: HAND_HISTORY_SCHEMA_VERSION,
    exportedAt,
    handCount: records.length,
    hands: [...records],
  }
}

/**
 * A stable, human-readable download filename for an export, dated from `exportedAt` (local date). Pure
 * given its input. Example: `holdem-hand-history-2026-06-18.json`.
 */
export function historyExportFilename(exportedAt: number): string {
  const d = new Date(exportedAt)
  const yyyy = d.getFullYear().toString().padStart(4, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  return `holdem-hand-history-${yyyy}-${mm}-${dd}.json`
}

/**
 * Trigger a browser download of the export. The thin platform seam: builds the JSON, wraps it in a
 * `Blob`, and clicks a transient `<a download>`. Pretty-printed (2-space) so the file is readable when
 * handed to a coach. Revokes the object URL after the click. Throws only if the platform lacks the
 * APIs (no `document` / `URL.createObjectURL`); the caller wraps it so a failure never breaks the view.
 */
export function downloadHistoryExport(
  records: readonly HandHistoryRecord[],
  exportedAt: number,
): void {
  const json = JSON.stringify(buildHistoryExport(records, exportedAt), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = historyExportFilename(exportedAt)
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
