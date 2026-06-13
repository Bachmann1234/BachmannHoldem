import { describe, it, expect } from 'vitest'
import type { LegalActions } from '@holdem/engine'
import type { DecisionVerdict, StartingHandVerdict } from '@holdem/coach'
import { parseAction, renderCoachFeedback } from './table.js'

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

/** A postflop verdict the hero played correctly: a +EV call that agreed with the math. */
const goodCall: DecisionVerdict = {
  equity: 0.625,
  potOddsThreshold: 0.25,
  callEv: 4,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'good',
}

/** A leak: the hero called off below the pot-odds threshold. */
const leakCall: DecisionVerdict = {
  equity: 0.18,
  potOddsThreshold: 0.33,
  callEv: -1.5,
  correctDecision: 'fold',
  heroContinued: true,
  verdict: 'leak',
}

const premium: StartingHandVerdict = {
  tier: 'premium',
  rationale: 'Premium holding — always raise; you want chips in.',
}

describe('renderCoachFeedback', () => {
  it('renders the postflop math view in the section style', () => {
    const out = renderCoachFeedback(goodCall)
    expect(out).toContain('── Coach ')
    // Equity and pot odds as one-decimal percents, EV as a signed chip number.
    expect(out).toContain('Equity 62.5%')
    expect(out).toContain('pot odds 25.0%')
    expect(out).toContain('EV(call) +4')
    expect(out).toContain('EV-correct: continue')
    expect(out).toContain('Good')
  })

  it('flags a leak and shows the EV-correct fold', () => {
    const out = renderCoachFeedback(leakCall)
    expect(out).toContain('EV(call) -1.5')
    expect(out).toContain('EV-correct: fold')
    expect(out).toContain('Leak')
  })

  it('omits the starting-hand line when no preflop verdict is given', () => {
    expect(renderCoachFeedback(goodCall)).not.toContain('Starting hand')
  })

  it('leads with the starting-hand chart rationale preflop', () => {
    const out = renderCoachFeedback(goodCall, premium)
    expect(out).toContain('Starting hand: Premium holding')
    // The math view still renders alongside the chart line.
    expect(out).toContain('Equity 62.5%')
  })

  it('renders a near-zero / break-even EV as a bare 0, never a signed zero', () => {
    // A break-even coin-flip: equity sits on the threshold and the chip EV rounds to ~0.
    const breakEven: DecisionVerdict = {
      equity: 0.5,
      potOddsThreshold: 0.5,
      callEv: -0.04, // rounds to 0; must not print "-0"
      correctDecision: 'continue',
      heroContinued: true,
      verdict: 'breakEven',
    }
    const out = renderCoachFeedback(breakEven)
    expect(out).toContain('EV(call) 0')
    expect(out).not.toContain('-0')
    expect(out).not.toContain('+0')
    // The free-check / on-threshold boundary still renders cleanly as a percent.
    expect(out).toContain('pot odds 50.0%')
    expect(out).toContain('Break-even')
  })
})
