/**
 * The lesson-progress store round-trips completed lesson ids and degrades gracefully (ticket 0048).
 *
 * Exercised against an in-memory fake `Storage` (and a throwing fake), mirroring how the hand-history
 * store test injects `fake-indexeddb` — no real `localStorage`, no browser. Covers the round-trip, the
 * versioned envelope shape, and every malformed/failing case the §5.4 store must tolerate.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LocalStorageLessonProgressStore,
  PROGRESS_ENVELOPE_VERSION,
  PROGRESS_STORAGE_KEY,
  parseProgress,
  type LessonProgressStore,
} from './progressStore.js'

/** A minimal in-memory `Storage` backed by a Map — enough for the store's get/set of one key. */
function fakeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(initial ? Object.entries(initial) : [])
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (key: string) => map.delete(key),
    setItem: (key: string, value: string) => map.set(key, value),
  }
}

/** A `Storage` whose every read/write throws — to prove the seam swallows failures. */
function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error('storage unavailable')
  }
  return {
    length: 0,
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('LocalStorageLessonProgressStore', () => {
  it('round-trips completed ids through the store (save → load)', () => {
    const store: LessonProgressStore = new LocalStorageLessonProgressStore(fakeStorage())
    expect(store.load()).toEqual([])
    store.save(['foundations-equity', 'foundations-pot-odds'])
    expect(store.load()).toEqual(['foundations-equity', 'foundations-pot-odds'])
  })

  it('persists a fresh store opened on the same storage (durability)', () => {
    const storage = fakeStorage()
    new LocalStorageLessonProgressStore(storage).save(['foundations-equity'])
    const reopened = new LocalStorageLessonProgressStore(storage)
    expect(reopened.load()).toEqual(['foundations-equity'])
  })

  it('writes the versioned envelope shape', () => {
    const storage = fakeStorage()
    new LocalStorageLessonProgressStore(storage).save(['a', 'b'])
    const raw = storage.getItem(PROGRESS_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({ v: PROGRESS_ENVELOPE_VERSION, completed: ['a', 'b'] })
  })

  it('a throwing storage degrades gracefully (load → [], save → no throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new LocalStorageLessonProgressStore(throwingStorage())
    expect(store.load()).toEqual([])
    expect(() => store.save(['anything'])).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })

  it('tolerates a malformed blob (returns [])', () => {
    expect(
      new LocalStorageLessonProgressStore(
        fakeStorage({ [PROGRESS_STORAGE_KEY]: 'not json' }),
      ).load(),
    ).toEqual([])
  })

  it('tolerates a wrong-shaped envelope (returns [])', () => {
    const storage = fakeStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({ v: 1, completed: 'nope' }),
    })
    expect(new LocalStorageLessonProgressStore(storage).load()).toEqual([])
  })
})

describe('parseProgress', () => {
  it('returns [] for null (key absent)', () => {
    expect(parseProgress(null)).toEqual([])
  })

  it('returns [] for non-JSON and non-object JSON', () => {
    expect(parseProgress('{')).toEqual([])
    expect(parseProgress('42')).toEqual([])
    expect(parseProgress('null')).toEqual([])
  })

  it('returns [] when completed is missing or not an array', () => {
    expect(parseProgress(JSON.stringify({ v: 1 }))).toEqual([])
    expect(parseProgress(JSON.stringify({ v: 1, completed: {} }))).toEqual([])
  })

  it('coerces to a clean string[] (drops non-string entries)', () => {
    expect(parseProgress(JSON.stringify({ v: 1, completed: ['a', 2, null, 'b'] }))).toEqual([
      'a',
      'b',
    ])
  })
})
