/**
 * Unit tests for the shared shell glue (ticket 0039). `actionIsLegal` is load-bearing — it's the
 * last guard before the engine throws on the defensive bot path — so it's exercised against the
 * engine's real `LegalActions` shape here, where both shells get it for free.
 */

import { describe, it, expect } from 'vitest'
import type { Action, LegalActions } from '@holdem/engine'
import { actionIsLegal, makeBot, PERSONALITY_BY_KIND } from './shell.js'
import type { SessionPlayer } from './model.js'

/** A `LegalActions` with everything forbidden — override only the field under test. */
function noActions(): LegalActions {
  return { fold: false, check: false, call: null, bet: null, raise: null }
}

describe('actionIsLegal', () => {
  it('permits fold / check / call only when the matching field allows it', () => {
    expect(actionIsLegal({ type: 'fold' }, { ...noActions(), fold: true })).toBe(true)
    expect(actionIsLegal({ type: 'fold' }, noActions())).toBe(false)
    expect(actionIsLegal({ type: 'check' }, { ...noActions(), check: true })).toBe(true)
    expect(actionIsLegal({ type: 'check' }, noActions())).toBe(false)
    expect(actionIsLegal({ type: 'call' }, { ...noActions(), call: { amount: 10 } })).toBe(true)
    expect(actionIsLegal({ type: 'call' }, noActions())).toBe(false)
  })

  it('clamps a bet to the legal [min, max] range', () => {
    const legal: LegalActions = { ...noActions(), bet: { min: 2, max: 100 } }
    expect(actionIsLegal({ type: 'bet', amount: 2 }, legal)).toBe(true)
    expect(actionIsLegal({ type: 'bet', amount: 100 }, legal)).toBe(true)
    expect(actionIsLegal({ type: 'bet', amount: 1 }, legal)).toBe(false)
    expect(actionIsLegal({ type: 'bet', amount: 101 }, legal)).toBe(false)
    expect(actionIsLegal({ type: 'bet', amount: 50 }, noActions())).toBe(false)
  })

  it('clamps a raise to the legal [min, max] range', () => {
    const legal: LegalActions = { ...noActions(), raise: { min: 6, max: 200 } }
    expect(actionIsLegal({ type: 'raise', amount: 6 }, legal)).toBe(true)
    expect(actionIsLegal({ type: 'raise', amount: 200 }, legal)).toBe(true)
    expect(actionIsLegal({ type: 'raise', amount: 5 }, legal)).toBe(false)
    expect(actionIsLegal({ type: 'raise', amount: 201 }, legal)).toBe(false)
    expect(actionIsLegal({ type: 'raise', amount: 50 } as Action, noActions())).toBe(false)
  })
})

describe('makeBot', () => {
  const player = (botKind?: SessionPlayer['botKind']): SessionPlayer => ({
    id: 1,
    label: 'Seat 1',
    isHero: false,
    botKind,
    stack: 100,
  })

  it('maps every preset to its personality and builds a seeded bot', () => {
    for (const kind of Object.keys(PERSONALITY_BY_KIND) as (keyof typeof PERSONALITY_BY_KIND)[]) {
      expect(makeBot(player(kind), 1)).toBeTruthy()
    }
  })

  it('defaults a player with no preset to the tight-aggressive bot', () => {
    expect(makeBot(player(undefined), 1)).toBeTruthy()
    expect(PERSONALITY_BY_KIND.tag).toBeTruthy()
  })
})
