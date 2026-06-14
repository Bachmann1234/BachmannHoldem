/**
 * Unit tests for the pure input module (ticket 0027). These exercise the keystroke/grammar →
 * `Action` mapping exhaustively *without Ink* — every verb, amount bounds, illegal-here, all-in,
 * bare-verb-minimum, and garbage — plus the character-by-character {@link interpretKey} state
 * machine. The action bar's `useInput` is a thin wrapper over these, so they are the real coverage
 * of the input rules.
 */

import { describe, it, expect } from 'vitest'
import type { LegalActions } from '@holdem/engine'
import { interpretKey, parseAction, renderLegal, type KeyFlags } from './input.js'

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

const noKey: KeyFlags = {}

describe('parseAction — verbs', () => {
  it('parses fold (letter and word)', () => {
    expect(parseAction('f', FACING_BET)).toEqual({ ok: true, action: { type: 'fold' } })
    expect(parseAction('fold', FACING_BET)).toEqual({ ok: true, action: { type: 'fold' } })
  })

  it('parses check (k / check)', () => {
    expect(parseAction('k', OPEN)).toEqual({ ok: true, action: { type: 'check' } })
    expect(parseAction('check', OPEN)).toEqual({ ok: true, action: { type: 'check' } })
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

describe('interpretKey — one-shot verbs', () => {
  it('fires a zero-amount verb immediately on its letter', () => {
    expect(interpretKey('', 'f', noKey, FACING_BET)).toEqual({
      kind: 'action',
      action: { type: 'fold' },
    })
    expect(interpretKey('', 'c', noKey, FACING_BET)).toEqual({
      kind: 'action',
      action: { type: 'call' },
    })
    expect(interpretKey('', 'k', noKey, OPEN)).toEqual({
      kind: 'action',
      action: { type: 'check' },
    })
  })

  it('fires all-in immediately on a', () => {
    expect(interpretKey('', 'a', noKey, OPEN)).toEqual({
      kind: 'action',
      action: { type: 'bet', amount: 100 },
    })
  })
})

describe('interpretKey — amount entry', () => {
  it('buffers a bet verb then digits, committing on Enter as the typed amount', () => {
    let r = interpretKey('', 'b', noKey, OPEN)
    expect(r).toEqual({ kind: 'buffer', buffer: 'b' })
    r = interpretKey('b', '5', noKey, OPEN)
    expect(r).toEqual({ kind: 'buffer', buffer: 'b5' })
    r = interpretKey('b5', '0', noKey, OPEN)
    expect(r).toEqual({ kind: 'buffer', buffer: 'b50' })
    r = interpretKey('b50', '', { return: true }, OPEN)
    expect(r).toEqual({ kind: 'action', action: { type: 'bet', amount: 50 } })
  })

  it('commits a bare buffered bet verb on Enter as the minimum', () => {
    expect(interpretKey('b', '', { return: true }, OPEN)).toEqual({
      kind: 'action',
      action: { type: 'bet', amount: 2 },
    })
  })

  it('ignores a leading digit with no verb buffered', () => {
    expect(interpretKey('', '5', noKey, OPEN)).toEqual({ kind: 'ignore' })
  })

  it('ignores an empty Enter', () => {
    expect(interpretKey('', '', { return: true }, OPEN)).toEqual({ kind: 'ignore' })
  })

  it('backspace trims and escape clears the buffer', () => {
    expect(interpretKey('b50', '', { backspace: true }, OPEN)).toEqual({
      kind: 'buffer',
      buffer: 'b5',
    })
    expect(interpretKey('b50', '', { escape: true }, OPEN)).toEqual({ kind: 'buffer', buffer: '' })
  })

  it('returns an error hint when the buffered amount is out of range', () => {
    expect(interpretKey('b999', '', { return: true }, OPEN)).toEqual({
      kind: 'error',
      message: 'Bet must be to 2-100.',
    })
  })

  it('ignores control / arrow keys (non-printable input)', () => {
    expect(interpretKey('', '', noKey, OPEN)).toEqual({ kind: 'ignore' })
    expect(interpretKey('b5', '', noKey, OPEN)).toEqual({ kind: 'ignore' })
  })

  it('returns a gentle hint for an unknown letter rather than crashing or dispatching', () => {
    expect(interpretKey('', 'z', noKey, OPEN)).toEqual({
      kind: 'error',
      message: 'Unknown action "z".',
    })
  })

  it('returns a gentle hint for a verb that is illegal in this spot', () => {
    // Check is illegal when facing a bet — a hint, never a dispatched (illegal) action.
    expect(interpretKey('', 'k', noKey, FACING_BET)).toEqual({
      kind: 'error',
      message: 'Check is not legal here.',
    })
  })
})
