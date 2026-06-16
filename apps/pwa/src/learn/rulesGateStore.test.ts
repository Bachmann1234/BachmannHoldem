// @vitest-environment jsdom
/**
 * Tests for the rules-gate seen-flag store (ticket 0075) — mirrors progressStore.test's coverage of
 * the round-trip and the graceful-degradation idiom shared with the progress seam.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageRulesGateStore, RULES_GATE_STORAGE_KEY } from './rulesGateStore.js'

/** A minimal in-memory Storage stand-in (only the methods the store touches). */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
}

afterEach(() => vi.restoreAllMocks())

describe('LocalStorageRulesGateStore', () => {
  it('reads unseen by default, then seen after markSeen (round-trip)', () => {
    const store = new LocalStorageRulesGateStore(fakeStorage())
    expect(store.seen()).toBe(false)
    store.markSeen()
    expect(store.seen()).toBe(true)
  })

  it('persists under the versioned key', () => {
    const storage = fakeStorage()
    new LocalStorageRulesGateStore(storage).markSeen()
    expect(storage.getItem(RULES_GATE_STORAGE_KEY)).toBeTruthy()
  })

  it('degrades to "unseen" when a read throws, swallowing the error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    const store = new LocalStorageRulesGateStore(throwing)
    expect(store.seen()).toBe(false)
    // A write failure is swallowed too — never throws to the caller.
    expect(() => store.markSeen()).not.toThrow()
    expect(warn).toHaveBeenCalled()
  })
})
