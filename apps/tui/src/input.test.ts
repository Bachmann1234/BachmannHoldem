/**
 * Unit tests for the TUI's terminal-specific input piece (ticket 0027): the character-by-character
 * {@link interpretKey} state machine. The verb/amount grammar it builds on (`parseAction` /
 * `renderLegal`) is exhaustively covered at its shared home in `@holdem/format`
 * (`packages/format/src/action.test.ts`), where it moved when the two clients' copies were
 * consolidated (ticket 0030); this file only covers the keystroke machine that is unique to the TUI.
 */

import { describe, it, expect } from 'vitest'
import type { LegalActions } from '@holdem/engine'
import { interpretKey, type KeyFlags } from './input.js'

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
