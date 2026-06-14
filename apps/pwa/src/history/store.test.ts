/**
 * The IndexedDB store round-trips records (ticket 0037) — exercised against `fake-indexeddb`, which
 * implements the real IndexedDB API in-memory, so this covers the actual cursor/index/transaction
 * code rather than a stub. Each test gets a fresh in-memory factory.
 */

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { IndexedDbHandHistoryStore } from './store.js'
import { HAND_HISTORY_SCHEMA_VERSION, type HandHistoryRecord } from './record.js'

/** A minimal valid record with a settable id/playedAt for ordering assertions. */
function makeRecord(id: string, playedAt: number, heroNet = 0): HandHistoryRecord {
  return {
    schemaVersion: HAND_HISTORY_SCHEMA_VERSION,
    id,
    playedAt,
    handNumber: 1,
    seatCount: 2,
    players: [
      { id: 0, label: 'You' },
      { id: 1, label: 'Seat 1 (TAG)', botKind: 'tag' },
    ],
    heroSeat: 0,
    decisions: [],
    outcome: {
      board: [],
      endReason: 'fold',
      payouts: { 0: 3 },
      players: [
        { id: 0, label: 'You', seat: 0, finalStack: 201, totalCommitted: 1 },
        { id: 1, label: 'Seat 1 (TAG)', seat: 1, finalStack: 198, totalCommitted: 2 },
      ],
      heroNet,
    },
  }
}

describe('IndexedDbHandHistoryStore', () => {
  let store: IndexedDbHandHistoryStore

  beforeEach(() => {
    // A brand-new in-memory IndexedDB per test (no cross-test bleed).
    store = new IndexedDbHandHistoryStore(new IDBFactory())
  })

  it('round-trips an appended record', async () => {
    const rec = makeRecord('a', 1000, 5)
    await store.append(rec)
    const all = await store.list()
    expect(all).toHaveLength(1)
    expect(all[0]).toEqual(rec)
  })

  it('returns records newest-first by playedAt', async () => {
    await store.append(makeRecord('old', 1000))
    await store.append(makeRecord('mid', 2000))
    await store.append(makeRecord('new', 3000))
    const all = await store.list()
    expect(all.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('recent(n) caps the result, still newest-first', async () => {
    await store.append(makeRecord('a', 1000))
    await store.append(makeRecord('b', 2000))
    await store.append(makeRecord('c', 3000))
    const recent = await store.recent(2)
    expect(recent.map((r) => r.id)).toEqual(['c', 'b'])
  })

  it('lists empty when nothing has been recorded', async () => {
    expect(await store.list()).toEqual([])
    expect(await store.recent(5)).toEqual([])
  })

  it('persists across a fresh store opened on the same factory (durability)', async () => {
    const factory = new IDBFactory()
    const first = new IndexedDbHandHistoryStore(factory)
    await first.append(makeRecord('persisted', 1234))
    const second = new IndexedDbHandHistoryStore(factory)
    const all = await second.list()
    expect(all.map((r) => r.id)).toEqual(['persisted'])
  })

  it('prunes the oldest beyond the retention cap, keeping the newest', async () => {
    const capped = new IndexedDbHandHistoryStore(new IDBFactory(), 3)
    for (const [id, playedAt] of [
      ['a', 1000],
      ['b', 2000],
      ['c', 3000],
      ['d', 4000],
      ['e', 5000],
    ] as const) {
      await capped.append(makeRecord(id, playedAt))
    }
    const all = await capped.list()
    // Only the 3 newest survive; 'a' and 'b' were pruned as each append pushed over the cap.
    expect(all.map((r) => r.id)).toEqual(['e', 'd', 'c'])
  })

  it('clear() drops every stored hand', async () => {
    await store.append(makeRecord('a', 1000))
    await store.append(makeRecord('b', 2000))
    await store.clear()
    expect(await store.list()).toEqual([])
    // Still usable after clearing.
    await store.append(makeRecord('c', 3000))
    expect((await store.list()).map((r) => r.id)).toEqual(['c'])
  })
})
