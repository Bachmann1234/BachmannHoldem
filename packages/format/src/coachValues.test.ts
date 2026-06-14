/**
 * Unit tests for the shared coach value formatters. The percent + signed-chip + verdict-label
 * coverage moved here from the two clients (`apps/cli/src/table.test.ts` and
 * `apps/tui/src/components/CoachPanel.test.tsx`) when the formatters were consolidated
 * (ticket 0030): the bare-`0` / no-signed-zero rule and the trailing-`.0` trim matter and are now
 * asserted once, at the helpers' home.
 */

import { describe, it, expect } from 'vitest'
import { pct, signedChips, VERDICT_LABEL } from './coachValues.js'

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
})

describe('VERDICT_LABEL', () => {
  it('has a human headline keyed by every verdict tag', () => {
    expect(VERDICT_LABEL.good).toContain('Good')
    expect(VERDICT_LABEL.leak).toContain('Leak')
    expect(VERDICT_LABEL.breakEven).toContain('Break-even')
  })
})
