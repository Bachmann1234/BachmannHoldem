/**
 * The live-session store round-trips a game snapshot and degrades gracefully (mid-game save/resume).
 *
 * Mirrors the lesson-progress store test: an in-memory fake `Storage` (and a throwing fake), no real
 * `localStorage`. Covers the round-trip, the versioned envelope shape, `clear`, the in-memory variant,
 * and every malformed/stale/failing case the resume path must tolerate (all degrade to "no saved game").
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeDeck } from '@holdem/engine'
import { createInitialModel, reducer } from '@holdem/session'
import {
  InMemoryLiveSessionStore,
  LocalStorageLiveSessionStore,
  parseSnapshot,
  SESSION_ENVELOPE_VERSION,
  SESSION_STORAGE_KEY,
  type LiveSessionSnapshot,
} from './store.js'

/** A minimal in-memory `Storage` backed by a Map — enough for the store's get/set/remove of one key. */
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
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom }
}

/** A real live snapshot: deal a hand from a fresh heads-up setup, with no hero decisions yet. */
function liveSnapshot(): LiveSessionSnapshot {
  const model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck: makeDeck() })
  return { model, decisions: [] }
}

afterEach(() => vi.restoreAllMocks())

describe('LocalStorageLiveSessionStore', () => {
  it('round-trips a snapshot through the store (save → load)', () => {
    const store = new LocalStorageLiveSessionStore(fakeStorage())
    expect(store.load()).toBeNull()
    const snap = liveSnapshot()
    store.save(snap)
    const loaded = store.load()
    expect(loaded?.model.phase).toBe('playing')
    expect(loaded?.model).toEqual(snap.model) // the whole hand round-trips losslessly
  })

  it('persists across a fresh store on the same storage, and clear() drops it', () => {
    const storage = fakeStorage()
    const snap = liveSnapshot()
    new LocalStorageLiveSessionStore(storage).save(snap)
    expect(new LocalStorageLiveSessionStore(storage).load()?.model.phase).toBe('playing')
    new LocalStorageLiveSessionStore(storage).clear()
    expect(new LocalStorageLiveSessionStore(storage).load()).toBeNull()
  })

  it('writes the versioned envelope shape', () => {
    const storage = fakeStorage()
    new LocalStorageLiveSessionStore(storage).save(liveSnapshot())
    const raw = storage.getItem(SESSION_STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.v).toBe(SESSION_ENVELOPE_VERSION)
    expect(parsed.model.phase).toBe('playing')
  })

  it('round-trips the session id (schema v3) when present', () => {
    const store = new LocalStorageLiveSessionStore(fakeStorage())
    store.save({ ...liveSnapshot(), sessionId: 'sess-xyz' })
    expect(store.load()?.sessionId).toBe('sess-xyz')
  })

  it('a throwing storage degrades gracefully (load → null, save/clear → no throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new LocalStorageLiveSessionStore(throwingStorage())
    expect(store.load()).toBeNull()
    expect(() => store.save(liveSnapshot())).not.toThrow()
    expect(() => store.clear()).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})

describe('parseSnapshot', () => {
  it('returns null for null, non-JSON, and non-object JSON', () => {
    expect(parseSnapshot(null)).toBeNull()
    expect(parseSnapshot('{')).toBeNull()
    expect(parseSnapshot('42')).toBeNull()
  })

  it('returns null for a stale version or a missing/malformed model', () => {
    expect(parseSnapshot(JSON.stringify({ v: 999, model: { phase: 'playing' } }))).toBeNull()
    expect(parseSnapshot(JSON.stringify({ v: SESSION_ENVELOPE_VERSION, model: {} }))).toBeNull()
    expect(parseSnapshot(JSON.stringify({ v: SESSION_ENVELOPE_VERSION, model: 'nope' }))).toBeNull()
  })

  it('defaults a missing/non-array decisions buffer to []', () => {
    const snap = parseSnapshot(
      JSON.stringify({ v: SESSION_ENVELOPE_VERSION, model: { phase: 'playing' } }),
    )
    expect(snap?.decisions).toEqual([])
  })

  it('reads a string sessionId and drops a non-string/absent one (pre-v3 saves)', () => {
    const base = { v: SESSION_ENVELOPE_VERSION, model: { phase: 'playing' } }
    expect(parseSnapshot(JSON.stringify({ ...base, sessionId: 'sess-1' }))?.sessionId).toBe(
      'sess-1',
    )
    expect(parseSnapshot(JSON.stringify(base))?.sessionId).toBeUndefined()
    expect(parseSnapshot(JSON.stringify({ ...base, sessionId: 42 }))?.sessionId).toBeUndefined()
  })
})

describe('InMemoryLiveSessionStore', () => {
  it('round-trips a seeded snapshot and clears it', () => {
    const snap = liveSnapshot()
    const store = new InMemoryLiveSessionStore(snap)
    expect(store.load()).toBe(snap)
    store.clear()
    expect(store.load()).toBeNull()
    store.save(snap)
    expect(store.load()).toBe(snap)
  })
})
