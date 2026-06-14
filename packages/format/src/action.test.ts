/**
 * Unit tests for the shared action-input grammar. These exercise the verb/amount → `Action`
 * mapping exhaustively — every verb, the amount bounds, illegal-here, the all-in shortcut, the
 * bare-verb-minimum, and garbage — plus the `renderLegal` menu. The coverage moved here from the
 * two clients' own suites (`apps/cli/src/table.test.ts` and `apps/tui/src/input.test.ts`) when the
 * grammar was consolidated (ticket 0030), so it travels with the code it covers.
 */

import { describe, it, expect } from 'vitest'
import type { LegalActions } from '@holdem/engine'
import { parseAction, renderLegal } from './action.js'

/** Legal actions for a spot where the hero faces a bet: fold/call, and may raise (not bet). */
const FACING_BET: LegalActions = {
  fold: true,
  check: false,
  call: { amount: 10 },
  bet: null,
  raise: { min: 20, max: 200 },
}

/** Legal actions for an open spot: check or bet (no fold/call/raise). */
const OPEN: LegalActions = {
  fold: false,
  check: true,
  call: null,
  bet: { min: 2, max: 100 },
  raise: null,
}

describe('parseAction — verbs', () => {
  it('parses fold (letter and word)', () => {
    expect(parseAction('f', FACING_BET)).toEqual({ ok: true, action: { type: 'fold' } })
    expect(parseAction('fold', FACING_BET)).toEqual({ ok: true, action: { type: 'fold' } })
  })

  it('parses check (k / check), case-insensitively', () => {
    expect(parseAction('k', OPEN)).toEqual({ ok: true, action: { type: 'check' } })
    expect(parseAction('check', OPEN)).toEqual({ ok: true, action: { type: 'check' } })
    expect(parseAction('K', OPEN)).toEqual({ ok: true, action: { type: 'check' } })
  })

  it('parses call (c / call)', () => {
    expect(parseAction('c', FACING_BET)).toEqual({ ok: true, action: { type: 'call' } })
    expect(parseAction('call', FACING_BET)).toEqual({ ok: true, action: { type: 'call' } })
  })
})

describe('parseAction — bet/raise amounts', () => {
  it('parses an explicit bet amount in several spellings', () => {
    for (const input of ['b50', 'b 50', 'bet 50', 'bet50']) {
      expect(parseAction(input, OPEN)).toEqual({ ok: true, action: { type: 'bet', amount: 50 } })
    }
  })

  it('bare bet/raise means the minimum', () => {
    expect(parseAction('b', OPEN)).toEqual({ ok: true, action: { type: 'bet', amount: 2 } })
    expect(parseAction('r', FACING_BET)).toEqual({
      ok: true,
      action: { type: 'raise', amount: 20 },
    })
  })

  it('parses an explicit raise-to amount', () => {
    expect(parseAction('r 75', FACING_BET)).toEqual({
      ok: true,
      action: { type: 'raise', amount: 75 },
    })
  })

  it('rejects amounts outside the legal range', () => {
    expect(parseAction('b1', OPEN)).toEqual({ ok: false, error: 'Bet must be to 2-100.' })
    expect(parseAction('b101', OPEN)).toEqual({ ok: false, error: 'Bet must be to 2-100.' })
    expect(parseAction('r10', FACING_BET)).toEqual({ ok: false, error: 'Raise must be to 20-200.' })
  })
})

describe('parseAction — all-in shortcut', () => {
  it('a/allin/shove means the max bet when betting is legal', () => {
    for (const input of ['a', 'allin', 'shove']) {
      expect(parseAction(input, OPEN)).toEqual({ ok: true, action: { type: 'bet', amount: 100 } })
    }
  })

  it('a means the max raise when raising is legal', () => {
    expect(parseAction('a', FACING_BET)).toEqual({
      ok: true,
      action: { type: 'raise', amount: 200 },
    })
  })

  it('a is illegal when neither bet nor raise is available', () => {
    const noAggression: LegalActions = {
      fold: true,
      check: true,
      call: null,
      bet: null,
      raise: null,
    }
    expect(parseAction('a', noAggression)).toEqual({
      ok: false,
      error: 'All-in is not legal here.',
    })
  })
})

describe('parseAction — illegal here and garbage', () => {
  it('rejects a verb that is not legal in this spot', () => {
    expect(parseAction('k', FACING_BET)).toEqual({ ok: false, error: 'Check is not legal here.' })
    expect(parseAction('c', OPEN)).toEqual({ ok: false, error: 'Call is not legal here.' })
    expect(parseAction('b', FACING_BET)).toEqual({ ok: false, error: 'Bet is not legal here.' })
    expect(parseAction('r', OPEN)).toEqual({ ok: false, error: 'Raise is not legal here.' })
  })

  it('rejects unparseable / empty / unknown input', () => {
    expect(parseAction('', OPEN).ok).toBe(false)
    expect(parseAction('   ', OPEN).ok).toBe(false)
    expect(parseAction('xyz', OPEN)).toEqual({ ok: false, error: 'Unknown action "xyz".' })
    expect(parseAction('!!', OPEN).ok).toBe(false)
  })
})

describe('renderLegal', () => {
  it('lists only the legal options with amounts', () => {
    expect(renderLegal(FACING_BET)).toBe('(f)old  (c)all 10  (r)aise to 20-200  (a)llin')
    expect(renderLegal(OPEN)).toBe('(k)check  (b)et 2-100  (a)llin')
  })
})
