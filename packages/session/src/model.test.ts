/**
 * Focused unit tests for the pure session helpers that the reducer's tests do not exercise
 * directly — chiefly {@link shuffledDeck}, the one non-pure helper in the core (it draws from
 * `Math.random`, so the shell calls it and dispatches the deck in, but the permutation invariant
 * is worth pinning here). The reducer + session state machine are covered by `reducer.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { makeDeck, formatCard } from '@holdem/engine'
import { shuffledDeck } from './model.js'

describe('shuffledDeck', () => {
  it('returns a full 52-card permutation of a fresh deck (no missing or duplicate cards)', () => {
    const shuffled = shuffledDeck()
    expect(shuffled).toHaveLength(52)
    const seen = new Set(shuffled.map(formatCard))
    expect(seen.size).toBe(52) // all distinct
    // It is exactly the set of cards a fresh deck has — a permutation, nothing added or dropped.
    const expected = new Set(makeDeck().map(formatCard))
    expect(seen).toEqual(expected)
  })
})
