/**
 * The history export envelope (schema v3) — the pure builder + filename. The browser download trigger
 * ({@link downloadHistoryExport}) is the thin platform seam and is exercised via the HistoryView, not
 * here (it needs `URL.createObjectURL`, absent in the node test env).
 */

import { describe, expect, it } from 'vitest'
import { HAND_HISTORY_SCHEMA_VERSION, type HandHistoryRecord } from './record.js'
import { buildHistoryExport, HISTORY_EXPORT_KIND, historyExportFilename } from './export.js'

/** A minimal record stub — only the fields the export envelope copies wholesale matter here. */
function rec(id: string, sessionId: string): HandHistoryRecord {
  return {
    schemaVersion: HAND_HISTORY_SCHEMA_VERSION,
    id,
    playedAt: 0,
    handNumber: 1,
    seatCount: 2,
    players: [],
    heroSeat: 0,
    sessionId,
    decisions: [],
    outcome: { board: [], endReason: 'fold', payouts: {}, players: [], heroNet: 0 },
  }
}

describe('buildHistoryExport', () => {
  it('wraps the records in a tagged, versioned envelope, preserving order', () => {
    const records = [rec('a', 'sess-1'), rec('b', 'sess-2')]
    const out = buildHistoryExport(records, 1234)
    expect(out.kind).toBe(HISTORY_EXPORT_KIND)
    expect(out.schemaVersion).toBe(HAND_HISTORY_SCHEMA_VERSION)
    expect(out.exportedAt).toBe(1234)
    expect(out.handCount).toBe(2)
    expect(out.hands.map((h) => h.id)).toEqual(['a', 'b'])
    // Each record keeps its session id, so the flat dump is sliceable per sitting downstream.
    expect(out.hands.map((h) => h.sessionId)).toEqual(['sess-1', 'sess-2'])
  })

  it('copies the records into a fresh array (no aliasing of the input)', () => {
    const records = [rec('a', 'sess-1')]
    const out = buildHistoryExport(records, 0)
    expect(out.hands).not.toBe(records)
    expect(out.hands).toEqual(records)
  })

  it('handles an empty log', () => {
    const out = buildHistoryExport([], 0)
    expect(out.handCount).toBe(0)
    expect(out.hands).toEqual([])
  })
})

describe('historyExportFilename', () => {
  it('dates the filename from the export timestamp', () => {
    // Build the expected date the same way the helper does (local time), so the test is TZ-agnostic.
    const ts = 1718700000000
    const d = new Date(ts)
    const expected = `holdem-hand-history-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
    expect(historyExportFilename(ts)).toBe(expected)
  })
})
