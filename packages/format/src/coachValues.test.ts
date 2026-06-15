/**
 * Unit tests for the shared coach value formatters. The percent + signed-chip + verdict-label
 * coverage moved here from the two clients (`apps/cli/src/table.test.ts` and
 * `apps/tui/src/components/CoachPanel.test.tsx`) when the formatters were consolidated
 * (ticket 0030): the bare-`0` / no-signed-zero rule and the trailing-`.0` trim matter and are now
 * asserted once, at the helpers' home.
 */

import { describe, it, expect } from 'vitest'
import type { DecisionVerdict } from '@holdem/coach'
import { evMetric, explainDecision, pct, signedChips, VERDICT_LABEL } from './coachValues.js'

describe('pct', () => {
  it('renders a 0..1 fraction as a one-decimal percent', () => {
    expect(pct(0.625)).toBe('62.5%')
    expect(pct(0.25)).toBe('25.0%')
    expect(pct(0.5)).toBe('50.0%')
    expect(pct(0)).toBe('0.0%')
    expect(pct(1)).toBe('100.0%')
  })
})

describe('signedChips', () => {
  it('signs a non-zero EV and trims a trailing .0', () => {
    expect(signedChips(4)).toBe('+4')
    expect(signedChips(-1.5)).toBe('-1.5')
    expect(signedChips(2.3)).toBe('+2.3')
  })

  it('renders a near-zero EV as a bare 0, never a signed zero', () => {
    // Round to one decimal first: -0.04 must render "0", not "-0".
    expect(signedChips(-0.04)).toBe('0')
    expect(signedChips(0)).toBe('0')
    expect(signedChips(0.04)).toBe('0')
    expect(signedChips(-0)).toBe('0')
  })

  it('rounds to one decimal *before* the bare-0 check (the boundary just past zero)', () => {
    // A value that rounds to ±0.1 is NOT near-zero — it keeps its sign and tenth.
    expect(signedChips(-0.051)).toBe('-0.1')
    expect(signedChips(0.051)).toBe('+0.1')
  })
})

describe('VERDICT_LABEL', () => {
  it('has a human headline keyed by every verdict tag', () => {
    expect(VERDICT_LABEL.good).toContain('Good')
    expect(VERDICT_LABEL.leak).toContain('Leak')
    expect(VERDICT_LABEL.breakEven).toContain('Break-even')
  })
})

describe('explainDecision', () => {
  /** Build a DecisionVerdict fixture for a branch (only the fields the why-line reads matter). */
  const verdict = (v: Partial<DecisionVerdict>): DecisionVerdict => ({
    equity: 0.5,
    potOddsThreshold: 0.33,
    callEv: 1,
    correctDecision: 'continue',
    heroContinued: true,
    verdict: 'good',
    missedValueBet: false,
    concept: 'equity-vs-price',
    ...v,
  })

  it('explains a priced continue: equity beats the price, calling is +EV', () => {
    const s = explainDecision(
      verdict({ equity: 0.6, potOddsThreshold: 0.3, callEv: 12, verdict: 'good' }),
    )
    expect(s).toContain('60.0%')
    expect(s).toContain('30.0%')
    expect(s).toContain('+EV')
    expect(s).toContain('continuing')
    expect(s).toContain(`${signedChips(12)} chips`)
  })

  it('explains a priced fold: equity falls short of the price', () => {
    const s = explainDecision(
      verdict({
        equity: 0.25,
        potOddsThreshold: 0.4,
        callEv: -8,
        correctDecision: 'fold',
        verdict: 'leak',
      }),
    )
    expect(s).toContain('25.0%')
    expect(s).toContain('40.0%')
    expect(s).toContain('folding')
    expect(s).toContain('+EV')
    expect(s).toContain(`${signedChips(-8)} chips`)
  })

  it('explains a free check: no price, any equity continues (no EV/price claim)', () => {
    const s = explainDecision(
      verdict({ equity: 0.59, potOddsThreshold: 0, callEv: 59, verdict: 'good' }),
    )
    expect(s).toContain('59.0%')
    expect(s.toLowerCase()).toContain('free')
    // No price to weigh against, so the line never mentions a break-even % or the +EV framing.
    expect(s).not.toContain('+EV')
  })

  it('explains a break-even spot: equity on the price, a coin-flip', () => {
    const s = explainDecision(
      verdict({ equity: 0.32, potOddsThreshold: 0.33, callEv: 0, verdict: 'breakEven' }),
    )
    expect(s).toContain('32.0%')
    expect(s).toContain('33.0%')
    expect(s.toLowerCase()).toContain('coin-flip')
    expect(s).not.toContain('+EV')
  })

  it('is label-free (no Good/Leak prefix — clients pair it with their own headline)', () => {
    const s = explainDecision(verdict({ verdict: 'good' }))
    expect(s).not.toContain('Good')
    expect(s).not.toContain('Leak')
  })

  it('adds the value-bet nudge on a checked unbet pot with missedValueBet set', () => {
    // Free check (potOddsThreshold 0) but the hero is comfortably ahead and just checked: the
    // line keeps the "free card is fine" framing and adds the "bet for value" nudge (ticket 0055).
    const s = explainDecision(
      verdict({
        equity: 0.62,
        potOddsThreshold: 0,
        callEv: 62,
        verdict: 'good',
        missedValueBet: true,
      }),
    )
    expect(s).toContain('62.0%')
    expect(s.toLowerCase()).toContain('ahead')
    expect(s.toLowerCase()).toContain('bet for value')
    // Still no +EV/price claim on a free decision.
    expect(s).not.toContain('+EV')
  })

  it('a free check WITHOUT missedValueBet keeps the plain free-card line (no nudge)', () => {
    const s = explainDecision(
      verdict({
        equity: 0.4,
        potOddsThreshold: 0,
        callEv: 40,
        verdict: 'good',
        missedValueBet: false,
      }),
    )
    expect(s.toLowerCase()).toContain('free')
    expect(s.toLowerCase()).not.toContain('bet for value')
  })
})

describe('evMetric', () => {
  /** Build a DecisionVerdict fixture (only the fields the metric reads matter). */
  const verdict = (v: Partial<DecisionVerdict>): DecisionVerdict => ({
    equity: 0.5,
    potOddsThreshold: 0.33,
    callEv: 4,
    correctDecision: 'continue',
    heroContinued: true,
    verdict: 'good',
    missedValueBet: false,
    concept: 'equity-vs-price',
    ...v,
  })

  it('labels a priced spot "EV(call)" with the signed chip value', () => {
    const m = evMetric(verdict({ potOddsThreshold: 0.33, callEv: 4 }))
    expect(m.label).toBe('EV(call)')
    expect(m.value).toBe(signedChips(4))
  })

  it('relabels to "Pot equity" when there is nothing to call (potOddsThreshold === 0)', () => {
    // A free check / a bet: callEv is really pot-equity (equity×pot), not the EV of a call.
    const m = evMetric(verdict({ potOddsThreshold: 0, callEv: 62 }))
    expect(m.label).toBe('Pot equity')
    // The VALUE is unchanged — only the label moves.
    expect(m.value).toBe(signedChips(62))
  })

  it('keeps "EV(call)" for a priced fold (a real call to weigh, just a −EV one)', () => {
    const m = evMetric(verdict({ potOddsThreshold: 0.4, callEv: -8, correctDecision: 'fold' }))
    expect(m.label).toBe('EV(call)')
    expect(m.value).toBe(signedChips(-8))
  })
})
