/**
 * The drill-progress store round-trips + aggregates per-concept records (ticket 0080) — exercised against
 * `fake-indexeddb` (the real IndexedDB API in-memory) so this covers the actual transaction/cursor code,
 * not a stub. Also pins the `foldOutcome` merge math, the `weakConcepts` selection, schema-version
 * tolerance, and graceful degradation against a throwing fake. Each test gets a fresh in-memory factory.
 */

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { IndexedDbDrillProgressStore, foldOutcome, weakConcepts } from './store.js'
import { DRILL_PROGRESS_SCHEMA_VERSION, type DrillProgressRecord } from './record.js'

/** Read one concept's record back from a store (the keyspace is tiny, so list + find is fine). */
async function get(
  store: IndexedDbDrillProgressStore,
  concept: string,
): Promise<DrillProgressRecord | undefined> {
  return (await store.list()).find((r) => r.concept === concept)
}

describe('foldOutcome — the per-concept merge math', () => {
  it('seeds a fresh record on the first spot, counting correct/total and recency', () => {
    const rec = foldOutcome(undefined, { concept: 'pot-odds', correct: true }, 1000)
    expect(rec).toEqual({
      schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
      concept: 'pot-odds',
      total: 1,
      correct: 1,
      missStreak: 0,
      lastDrilledAt: 1000,
      lastMissedAt: 0,
    })
  })

  it('a miss increments missStreak and stamps lastMissedAt; a correct resets the streak', () => {
    const a = foldOutcome(undefined, { concept: 'equity', correct: false }, 1000)
    expect(a.missStreak).toBe(1)
    expect(a.lastMissedAt).toBe(1000)
    const b = foldOutcome(a, { concept: 'equity', correct: false }, 2000)
    expect(b.missStreak).toBe(2)
    expect(b.total).toBe(2)
    expect(b.correct).toBe(0)
    expect(b.lastMissedAt).toBe(2000)
    const c = foldOutcome(b, { concept: 'equity', correct: true }, 3000)
    expect(c.missStreak).toBe(0)
    expect(c.correct).toBe(1)
    expect(c.lastDrilledAt).toBe(3000)
    // A correct answer does NOT advance lastMissedAt — it stays the last actual miss.
    expect(c.lastMissedAt).toBe(2000)
  })
})

describe('weakConcepts — the re-queue selection', () => {
  const rec = (concept: string, missStreak: number, lastMissedAt: number): DrillProgressRecord => ({
    schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
    concept: concept as DrillProgressRecord['concept'],
    total: 5,
    correct: 5 - missStreak,
    missStreak,
    lastDrilledAt: lastMissedAt,
    lastMissedAt,
  })

  it('selects only concepts with an active miss streak, most-recently-missed first, capped', () => {
    const records = [
      rec('pot-odds', 0, 100), // mastered since — excluded
      rec('equity', 1, 500),
      rec('ranges', 2, 900),
      rec('ev', 1, 300),
    ]
    expect(weakConcepts(records, 3)).toEqual(['ranges', 'equity', 'ev'])
    // The cap is honoured.
    expect(weakConcepts(records, 1)).toEqual(['ranges'])
    // A zero/negative cap selects nothing.
    expect(weakConcepts(records, 0)).toEqual([])
  })
})

describe('IndexedDbDrillProgressStore', () => {
  let store: IndexedDbDrillProgressStore

  beforeEach(() => {
    store = new IndexedDbDrillProgressStore(new IDBFactory())
  })

  it('records one session and reads back the per-concept aggregate', async () => {
    await store.recordOutcomes(
      [
        { concept: 'pot-odds', correct: true },
        { concept: 'pot-odds', correct: false },
        { concept: 'equity', correct: true },
      ],
      1000,
    )
    const potOdds = await get(store, 'pot-odds')
    expect(potOdds).toMatchObject({ total: 2, correct: 1, missStreak: 1, lastMissedAt: 1000 })
    const equity = await get(store, 'equity')
    expect(equity).toMatchObject({ total: 1, correct: 1, missStreak: 0, lastMissedAt: 0 })
  })

  it('MERGES across sessions — one record per concept, not an append-log', async () => {
    await store.recordOutcomes([{ concept: 'ranges', correct: false }], 1000)
    await store.recordOutcomes([{ concept: 'ranges', correct: false }], 2000)
    const all = await store.list()
    // Aggregated into ONE record per concept (the bounded-keyspace design).
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ concept: 'ranges', total: 2, correct: 0, missStreak: 2 })
  })

  it('persists across a fresh store opened on the same factory (durability)', async () => {
    const factory = new IDBFactory()
    const first = new IndexedDbDrillProgressStore(factory)
    await first.recordOutcomes([{ concept: 'ev', correct: true }], 1234)
    const second = new IndexedDbDrillProgressStore(factory)
    expect((await second.list()).map((r) => r.concept)).toEqual(['ev'])
  })

  it('an empty outcomes list is a no-op (no record written)', async () => {
    await store.recordOutcomes([], 1000)
    expect(await store.list()).toEqual([])
  })

  it('clear() drops every stored concept', async () => {
    await store.recordOutcomes([{ concept: 'equity', correct: true }], 1000)
    await store.clear()
    expect(await store.list()).toEqual([])
    // Still usable after clearing.
    await store.recordOutcomes([{ concept: 'ranges', correct: false }], 2000)
    expect((await store.list()).map((r) => r.concept)).toEqual(['ranges'])
  })

  it('feeds weakConcepts end-to-end: missed concepts surface, mastered ones do not', async () => {
    await store.recordOutcomes(
      [
        { concept: 'pot-odds', correct: false },
        { concept: 'equity', correct: true },
        { concept: 'ranges', correct: false },
      ],
      1000,
    )
    // pot-odds missed most recently is fine; both pot-odds and ranges are weak, equity is not.
    const weak = weakConcepts(await store.list(), 3)
    expect(new Set(weak)).toEqual(new Set(['pot-odds', 'ranges']))
    expect(weak).not.toContain('equity')
  })
})

describe('IndexedDbDrillProgressStore — schema-version tolerance', () => {
  it('ignores a record written by an INCOMPATIBLE future schema (list filters, merge starts fresh)', async () => {
    const factory = new IDBFactory()
    const store = new IndexedDbDrillProgressStore(factory)
    // Hand-write a future-version record straight into the object store, bypassing the typed API.
    await store.recordOutcomes([{ concept: 'equity', correct: true }], 1000)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open('holdem-drill-progress', 1)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('concepts', 'readwrite')
      tx.objectStore('concepts').put({
        schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION + 99,
        concept: 'pot-odds',
        total: 9,
        correct: 9,
        missStreak: 0,
        lastDrilledAt: 1,
        lastMissedAt: 0,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    // list() filters the unknown-version record out.
    expect((await store.list()).map((r) => r.concept)).toEqual(['equity'])
    // And recording into that concept starts FRESH (does not merge into the unreadable shape).
    await store.recordOutcomes([{ concept: 'pot-odds', correct: false }], 2000)
    const potOdds = (await store.list()).find((r) => r.concept === 'pot-odds')
    expect(potOdds).toMatchObject({
      schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
      total: 1,
      correct: 0,
      missStreak: 1,
    })
  })
})

describe('IndexedDbDrillProgressStore — graceful degradation', () => {
  /** An IDBFactory whose every `open` synchronously throws — the "IndexedDB is wedged" failure. */
  const throwingFactory = {
    open() {
      throw new Error('IndexedDB unavailable (private mode)')
    },
  } as unknown as IDBFactory

  it('rejects (does not crash) on a throwing factory — the seam catches it', async () => {
    const store = new IndexedDbDrillProgressStore(throwingFactory)
    // The store itself surfaces the failure as a rejection; the DrillsBranch seam wraps every call so
    // this never reaches the UI. Here we just prove it rejects rather than throwing synchronously.
    await expect(
      store.recordOutcomes([{ concept: 'equity', correct: true }], 1000),
    ).rejects.toThrow()
    await expect(store.list()).rejects.toThrow()
  })
})
