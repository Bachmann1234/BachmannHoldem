/**
 * Proves the MVU core is testable independent of Ink (ticket 0025): the reducer is a pure
 * function over the model, so these run with no JSX transform and no terminal. Component tests
 * (via `ink-testing-library`) arrive with the table view in ticket 0026.
 */

import { describe, it, expect } from 'vitest'
import { makeDeck, potTotal, type Card } from '@holdem/engine'
import { createInitialModel } from './model.js'
import { reducer } from './reducer.js'

// A fixed, unshuffled deck keeps these deterministic — the reducer cares about model identity,
// not the cards, so the order is irrelevant beyond being a legal full deck.
const FIXED_DECK: readonly Card[] = makeDeck()

describe('reducer', () => {
  it('is the identity on a noop, returning the same model reference', () => {
    const model = createInitialModel({ seats: 6, deck: FIXED_DECK })
    const next = reducer(model, { type: 'noop' })
    expect(next).toBe(model)
  })

  it('does not mutate the model it is handed', () => {
    const model = createInitialModel({ seats: 2, deck: FIXED_DECK })
    const before = JSON.stringify(model.hand)
    reducer(model, { type: 'noop' })
    expect(JSON.stringify(model.hand)).toBe(before)
  })

  it('applies a legal action through the engine, advancing the hand into a fresh model', () => {
    const model = createInitialModel({ seats: 2, deck: FIXED_DECK })
    const next = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    // A fresh model + fresh hand (immutable), with the call reflected in the pot.
    expect(next).not.toBe(model)
    expect(next.hand).not.toBe(model.hand)
    expect(potTotal(next.hand)).toBeGreaterThan(potTotal(model.hand))
    // The original model is untouched.
    expect(JSON.stringify(model.hand)).toBe(
      JSON.stringify(createInitialModel({ seats: 2, deck: FIXED_DECK }).hand),
    )
  })

  it('throws (does not swallow) when handed an illegal action — the shell must pre-validate', () => {
    const model = createInitialModel({ seats: 2, deck: FIXED_DECK })
    // Preflop facing the big blind, the SB cannot check — the engine throws, by design.
    expect(() => reducer(model, { type: 'apply-action', action: { type: 'check' } })).toThrow()
  })
})

describe('createInitialModel', () => {
  it('seats the table generically from the seat count (no heads-up assumption)', () => {
    expect(createInitialModel({ seats: 2, deck: FIXED_DECK }).hand.players).toHaveLength(2)
    expect(createInitialModel({ seats: 6, deck: FIXED_DECK }).hand.players).toHaveLength(6)
  })

  it('seats the hero at seat 0 and starts a real in-progress hand', () => {
    const model = createInitialModel({ seats: 6, deck: FIXED_DECK })
    expect(model.heroSeat).toBe(0)
    expect(model.hand.street).toBe('preflop')
    expect(model.hand.toAct).not.toBeNull()
  })
})
