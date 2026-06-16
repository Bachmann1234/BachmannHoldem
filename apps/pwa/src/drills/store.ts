/**
 * The drill-progress store contract + its IndexedDB implementation (ticket 0080) — the durable,
 * per-concept aggregate the spaced-repetition re-queue (this ticket) writes on each finished session and
 * reads at the start of the next, and the **shared** layer M6 stats + the per-concept mastery work
 * ([[0081]]) consume. It is deliberately NOT a drills-only silo: it reuses the
 * {@link ../history/store.IndexedDbHandHistoryStore} pattern verbatim — a tiny typed interface, an
 * injectable `IDBFactory` resolved LAZILY (so merely constructing the store off the main UI thread never
 * throws), a versioned DB + `onupgradeneeded`, and `fake-indexeddb` in tests — so M6 stats extend ONE
 * storage approach rather than inventing a second.
 *
 * **Why per-concept aggregate, not a spot log.** See {@link ../drills/record.DrillProgressRecord}: both
 * consumers (re-queue here, mastery in [[0081]]) ask per-concept questions, the {@link Concept} keyspace
 * is a small fixed set, and aggregating keeps the store trivially bounded (one record per concept) — so
 * unlike the hand-history log it needs **no retention cap / pruning** at all.
 *
 * **Graceful degradation is mandatory.** A storage failure (private mode, quota, disabled IndexedDB,
 * malformed data) must NEVER throw to the drill loop. Every method on the IndexedDB impl can reject; the
 * recording/re-queue seam in {@link ../components/DrillsBranch} wraps every call so a failure is swallowed
 * with a `console.warn` and the drill loop carries on in-memory — exactly the
 * {@link ../learn/progressStore} / {@link ../history/store} idiom. (The wrapping lives at the seam, like
 * the history store, so the store itself stays a thin, honest IndexedDB binding.)
 */

import type { Concept } from '@holdem/coach'
import {
  DRILL_PROGRESS_SCHEMA_VERSION,
  type DrillProgressRecord,
  type DrillSpotOutcome,
} from './record.js'

/**
 * Durable, per-concept aggregate of drill progress. All methods are async (IndexedDB is async) and may
 * reject on a storage failure — the seam in {@link ../components/DrillsBranch} wraps every call so a
 * failure degrades gracefully and never blocks the drill loop.
 */
export interface DrillProgressStore {
  /**
   * Fold one finished session's per-spot outcomes into the durable per-concept aggregate, stamping each
   * touched concept's recency with `now` (epoch ms). Resolves when committed. Idempotent in shape (one
   * record per concept) but NOT in value — calling it twice double-counts, exactly like an append.
   */
  recordOutcomes(outcomes: readonly DrillSpotOutcome[], now: number): Promise<void>
  /** Every per-concept record (order unspecified — callers select what they need). */
  list(): Promise<DrillProgressRecord[]>
}

/** IndexedDB database + object-store names. Bump the version to trigger an `onupgradeneeded` migration. */
const DB_NAME = 'holdem-drill-progress'
const DB_VERSION = 1
const STORE_NAME = 'concepts'

/**
 * Open (creating/upgrading as needed) the drill-progress database. The object store is keyed **in-line**
 * on `concept` (the record's own field) so a record IS its own key — there is exactly one row per
 * concept and {@link recordOutcomes} `put`s the merged aggregate back under the same key. Factory is
 * injectable so tests pass `fake-indexeddb`'s factory; defaults to the global `indexedDB`.
 */
function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // In-line key on `concept`: one record per concept, merged in place. Distinct from the
        // hand-history store's autoincrement out-of-line key precisely because this store aggregates
        // (upsert-by-concept) rather than appends an ever-growing log.
        db.createObjectStore(STORE_NAME, { keyPath: 'concept' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('failed to open drill-progress DB'))
  })
}

/**
 * Fold one spot outcome into a concept's running record. Pure (no I/O): given the existing record (or
 * `undefined` for a concept's first-ever spot) and one outcome at time `now`, return the next record.
 * `missStreak` resets to `0` on a correct answer and increments on a miss; `lastMissedAt` advances only
 * on a miss. Exported so the merge math is unit-testable without IndexedDB.
 */
export function foldOutcome(
  prev: DrillProgressRecord | undefined,
  outcome: DrillSpotOutcome,
  now: number,
): DrillProgressRecord {
  const base = prev ?? {
    schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
    concept: outcome.concept,
    total: 0,
    correct: 0,
    missStreak: 0,
    lastDrilledAt: 0,
    lastMissedAt: 0,
  }
  return {
    schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
    concept: outcome.concept,
    total: base.total + 1,
    correct: base.correct + (outcome.correct ? 1 : 0),
    missStreak: outcome.correct ? 0 : base.missStreak + 1,
    lastDrilledAt: now,
    lastMissedAt: outcome.correct ? base.lastMissedAt : now,
  }
}

/**
 * The IndexedDB-backed {@link DrillProgressStore}. Opens the DB lazily on first use and caches the
 * connection. The `factory` defaults to the global `indexedDB`; tests inject `fake-indexeddb`. Mirrors
 * {@link ../history/store.IndexedDbHandHistoryStore} (the shared pattern) bar the upsert-by-concept merge.
 */
export class IndexedDbDrillProgressStore implements DrillProgressStore {
  private dbPromise: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory | undefined

  /**
   * `factory` defaults to the global `indexedDB`, resolved LAZILY (not in the constructor) so merely
   * constructing the store in an environment without IndexedDB (e.g. a jsdom test that never opens the
   * DB) does not throw — the failure surfaces only on an actual read/write, where the seam already
   * catches it. No retention cap: the concept keyspace is fixed and small (see the module doc).
   */
  constructor(factory?: IDBFactory) {
    this.factory = factory
  }

  private getDb(): Promise<IDBDatabase> {
    const factory = this.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined)
    if (factory === undefined) {
      return Promise.reject(new Error('IndexedDB is not available in this environment'))
    }
    this.dbPromise ??= openDb(factory)
    return this.dbPromise
  }

  async recordOutcomes(outcomes: readonly DrillSpotOutcome[], now: number): Promise<void> {
    if (outcomes.length === 0) return
    const db = await this.getDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      // Fold every outcome into its concept's record IN ORDER, within ONE transaction so the whole
      // session's merge is atomic (a mid-merge failure aborts and the seam degrades it). We keep a
      // per-tx in-memory view of each concept's latest record so multiple spots of the same concept in
      // one session compound correctly without awaiting a round-trip between each.
      const pending = new Map<Concept, DrillProgressRecord>()
      let i = 0
      const step = (): void => {
        if (i >= outcomes.length) return
        const outcome = outcomes[i]!
        const cached = pending.get(outcome.concept)
        if (cached !== undefined) {
          const next = foldOutcome(cached, outcome, now)
          pending.set(outcome.concept, next)
          store.put(next)
          i += 1
          step()
          return
        }
        const getReq = store.get(outcome.concept)
        getReq.onsuccess = () => {
          const existing = getReq.result as DrillProgressRecord | undefined
          // Tolerate a record written by an INCOMPATIBLE future schema by treating it as absent (start
          // fresh) rather than merging into a shape we do not understand — the version-tolerance the
          // history/progress stores also keep.
          const prev =
            existing !== undefined && existing.schemaVersion === DRILL_PROGRESS_SCHEMA_VERSION
              ? existing
              : undefined
          const next = foldOutcome(prev, outcome, now)
          pending.set(outcome.concept, next)
          store.put(next)
          i += 1
          step()
        }
        getReq.onerror = () => reject(getReq.error ?? new Error('drill-progress read failed'))
      }
      step()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('drill-progress merge failed'))
      tx.onabort = () => reject(tx.error ?? new Error('drill-progress merge aborted'))
    })
  }

  /** Read every per-concept record, skipping any written by an incompatible future schema version. */
  async list(): Promise<DrillProgressRecord[]> {
    const db = await this.getDb()
    return new Promise<DrillProgressRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        const all = (req.result as DrillProgressRecord[]).filter(
          (r) => r.schemaVersion === DRILL_PROGRESS_SCHEMA_VERSION,
        )
        resolve(all)
      }
      req.onerror = () => reject(req.error ?? new Error('drill-progress list failed'))
    })
  }

  /**
   * Drop every stored concept record. Not part of the {@link DrillProgressStore} contract — the explicit
   * "reset my drill progress" affordance a settings screen ([[0081]]/M6) wires to a button, kept here so
   * the IndexedDB lifecycle stays owned in one place (mirrors the history store's `clear`).
   */
  async clear(): Promise<void> {
    const db = await this.getDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('drill-progress clear failed'))
      tx.onabort = () => reject(tx.error ?? new Error('drill-progress clear aborted'))
    })
  }
}

/**
 * Select the concepts the learner is currently **weak** at, most-recently-failed first — the "review"
 * input the re-queue feeds into {@link composeSession}'s bias. A concept is weak iff its current
 * {@link DrillProgressRecord.missStreak} is at least `1` (the learner has missed it without a correct
 * answer since), capturing *recency* of failure rather than a lifetime average (a concept they once
 * struggled with but have since mastered is not resurfaced). Pure (no I/O): the store reads the records,
 * this selects from them, keeping the policy testable and reusable by [[0081]].
 *
 * @param records Every per-concept record (from {@link DrillProgressStore.list}).
 * @param limit Cap on how many weak concepts to return (the re-queue keeps the bias light — a few
 *   review concepts, not the whole history — so it augments the session rather than swamping it).
 */
export function weakConcepts(records: readonly DrillProgressRecord[], limit: number): Concept[] {
  return records
    .filter((r) => r.missStreak >= 1)
    .sort((a, b) => b.lastMissedAt - a.lastMissedAt)
    .slice(0, Math.max(0, limit))
    .map((r) => r.concept)
}
