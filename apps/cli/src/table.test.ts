import { describe, it, expect } from 'vitest'
import type { LegalActions } from '@holdem/engine'
import { parseAction } from './table.js'

/** A legal-actions snapshot facing a bet: can fold, call 10, or raise to 20-100. */
const facingBet: LegalActions = {
  fold: true,
  check: false,
  call: { amount: 10 },
  bet: null,
  raise: { min: 20, max: 100 },
}

/** No outstanding bet: can check or open a bet of 2-100. */
const canCheck: LegalActions = {
  fold: true,
  check: true,
  call: null,
  bet: { min: 2, max: 100 },
  raise: null,
}

describe('parseAction', () => {
  it('reads single-letter and full-word verbs', () => {
    expect(parseAction('f', facingBet)).toEqual({ ok: true, action: { type: 'fold' } })
    expect(parseAction('call', facingBet)).toEqual({ ok: true, action: { type: 'call' } })
    expect(parseAction('K', canCheck)).toEqual({ ok: true, action: { type: 'check' } })
  })

  it('parses bet amounts attached or spaced', () => {
    expect(parseAction('b50', canCheck)).toEqual({ ok: true, action: { type: 'bet', amount: 50 } })
    expect(parseAction('bet 50', canCheck)).toEqual({
      ok: true,
      action: { type: 'bet', amount: 50 },
    })
  })

  it('defaults a bare bet/raise to the minimum', () => {
    expect(parseAction('b', canCheck)).toEqual({ ok: true, action: { type: 'bet', amount: 2 } })
    expect(parseAction('r', facingBet)).toEqual({ ok: true, action: { type: 'raise', amount: 20 } })
  })

  it('treats all-in as betting/raising the maximum', () => {
    expect(parseAction('a', canCheck)).toEqual({ ok: true, action: { type: 'bet', amount: 100 } })
    expect(parseAction('allin', facingBet)).toEqual({
      ok: true,
      action: { type: 'raise', amount: 100 },
    })
  })

  it('rejects amounts outside the legal range', () => {
    const r = parseAction('r 5', facingBet)
    expect(r.ok).toBe(false)
  })

  it('rejects actions that are not legal in this spot', () => {
    expect(parseAction('check', facingBet).ok).toBe(false)
    expect(parseAction('bet 10', facingBet).ok).toBe(false)
  })

  it('rejects gibberish', () => {
    expect(parseAction('', facingBet).ok).toBe(false)
    expect(parseAction('xyz', facingBet).ok).toBe(false)
  })
})
