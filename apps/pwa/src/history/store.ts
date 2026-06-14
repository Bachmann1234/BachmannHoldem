/**
 * The hand-history store contract + its IndexedDB implementation (ticket 0037).
 *
 * The contract ({@link HandHistoryStore}) is deliberately tiny: append a finished hand, read recent
 * hands newest-first. Defining it as an interface (rather than reaching for IndexedDB directly in the
 * shell) is the same "inject the platform-specific bit, keep the core testable" seam the odds package
 * uses for its worker (`packages/odds/src/equityAsync.ts`): the recording seam and M6 depend on this
 * contract, and tests swap in a fake / `fake-indexeddb` without a real browser DB.
 *
 * Records are ordered by {@link HandHistoryRecord.playedAt} (epoch ms supplied by the shell). The
 * IndexedDB impl stores them in an object store with an autoincrement key and a `playedAt` index, and
 * reads newest-first by walking that index in reverse.
 */

import type { HandHistoryRecord } from './record.js'

/**
 * Durable, append-only log of completed hands. All methods are async (IndexedDB is async) and may
 * reject on a storage failure — the recording seam wraps every call so a failure degrades gracefully
 * and never blocks play.
 */
export interface HandHistoryStore {
  /** Persist one completed-hand record. Resolves when committed. */
  append(record: HandHistoryRecord): Promise<void>
  /** All records, newest-first. */
  list(): Promise<HandHistoryRecord[]>
  /** The `n` most recent records, newest-first. */
  recent(n: number): Promise<HandHistoryRecord[]>
}

/** IndexedDB database + object-store names. Bump the version to trigger an `onupgradeneeded` migration. */
const DB_NAME = 'holdem-history'
const DB_VERSION = 1
const STORE_NAME = 'hands'
const PLAYED_AT_INDEX = 'playedAt'

/**
 * Open (creating/upgrading as needed) the history database. The object store uses an autoincrement
 * key and a `playedAt` index for newest-first reads. Factory is injectable so tests can pass
 * `fake-indexeddb`'s factory; defaults to the global `indexedDB`.
 */
function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Out-of-line autoincrement keys (no `keyPath`) so the stored value stays EXACTLY the record
        // — IndexedDB does not write a key field onto it. The `playedAt` index drives newest-first.
        const store = db.createObjectStore(STORE_NAME, { autoIncrement: true })
        store.createIndex(PLAYED_AT_INDEX, 'playedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('failed to open history DB'))
  })
}

/**
 * The IndexedDB-backed {@link HandHistoryStore}. Opens the DB lazily on first use and caches the
 * connection. The `factory` defaults to the global `indexedDB`; tests inject `fake-indexeddb`.
 */
export class IndexedDbHandHistoryStore implements HandHistoryStore {
  private dbPromise: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory | undefined

  /**
   * `factory` defaults to the global `indexedDB`, resolved LAZILY (not in the constructor) so merely
   * constructing the store in an environment without IndexedDB (e.g. a jsdom test that never opens
   * the DB) does not throw — the failure surfaces only on an actual read/write, where the seam
   * already catches it.
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

  async append(record: HandHistoryRecord): Promise<void> {
    const db = await this.getDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).add(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('history append failed'))
      tx.onabort = () => reject(tx.error ?? new Error('history append aborted'))
    })
  }

  /** Read records newest-first by walking the `playedAt` index in reverse; `limit` stops early. */
  private async read(limit: number | null): Promise<HandHistoryRecord[]> {
    const db = await this.getDb()
    return new Promise<HandHistoryRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const index = tx.objectStore(STORE_NAME).index(PLAYED_AT_INDEX)
      const out: HandHistoryRecord[] = []
      // 'prev' walks the index descending: highest playedAt (newest) first.
      const cursorReq = index.openCursor(null, 'prev')
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result
        if (cursor === null || (limit !== null && out.length >= limit)) {
          resolve(out)
          return
        }
        out.push(cursor.value as HandHistoryRecord)
        cursor.continue()
      }
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error('history read failed'))
    })
  }

  list(): Promise<HandHistoryRecord[]> {
    return this.read(null)
  }

  recent(n: number): Promise<HandHistoryRecord[]> {
    return this.read(Math.max(0, n))
  }
}
