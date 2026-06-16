/**
 * Unit tests for the shared coach value formatters. The percent + signed-chip + verdict-label
 * coverage moved here from the two clients (`apps/cli/src/table.test.ts` and
 * `apps/tui/src/components/CoachPanel.test.tsx`) when the formatters were consolidated
 * (ticket 0030): the bare-`0` / no-signed-zero rule and the trailing-`.0` trim matter and are now
 * asserted once, at the helpers' home.
 */

import { describe, it, expect } from 'vitest'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import {
  evMetric,
  explainDecision,
  explainPreflop,
  pct,
  priceComparison,
  signedChips,
  VERDICT_LABEL,
} from './coachValues.js'

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
    heroBet: false,
    concept: 'equity-vs-price',
    trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
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
        heroBet: false,
      }),
    )
    expect(s).toContain('62.0%')
    expect(s.toLowerCase()).toContain('ahead')
    expect(s.toLowerCase()).toContain('bet for value')
    // Still no +EV/price claim on a free decision.
    expect(s).not.toContain('+EV')
  })

  it('describes a value bet (not a free check) when the hero bet into the unbet pot — BUG-0009', () => {
    // Same unbet pot (potOddsThreshold 0), but the hero BET rather than checked: the line must
    // describe the value bet and never claim the hero took a free card for nothing.
    const s = explainDecision(
      verdict({
        equity: 0.529,
        potOddsThreshold: 0,
        callEv: 106.8,
        verdict: 'good',
        missedValueBet: false,
        heroBet: true,
      }),
    )
    expect(s).toContain('52.9%')
    expect(s.toLowerCase()).toContain('value bet')
    // The bug: a bet was narrated as "taking the free card … for nothing".
    expect(s.toLowerCase()).not.toContain('free card')
    expect(s.toLowerCase()).not.toContain('for nothing')
    // Still a free decision — no break-even %/+EV-of-call framing.
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
        heroBet: false,
      }),
    )
    expect(s.toLowerCase()).toContain('free')
    expect(s.toLowerCase()).not.toContain('bet for value')
  })
})

describe('priceComparison', () => {
  /** Reuse the explainDecision fixture shape — only the price/equity/verdict fields matter here. */
  const verdict = (v: Partial<DecisionVerdict>): DecisionVerdict => ({
    equity: 0.5,
    potOddsThreshold: 0.33,
    callEv: 1,
    correctDecision: 'continue',
    heroContinued: true,
    verdict: 'good',
    missedValueBet: false,
    heroBet: false,
    concept: 'equity-vs-price',
    trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
    ...v,
  })

  it('contrasts had-vs-needed on a clear fold ("short of the price, so it\'s a fold")', () => {
    const s = priceComparison(
      verdict({ equity: 0.28, potOddsThreshold: 0.33, correctDecision: 'fold', verdict: 'leak' }),
    )
    expect(s).toContain('28.0%')
    expect(s).toContain('33.0%')
    expect(s).toContain('short of the price')
    expect(s).toContain('fold')
  })

  it('contrasts had-vs-needed on a clear continue ("clear of the price, so continuing")', () => {
    const s = priceComparison(
      verdict({ equity: 0.6, potOddsThreshold: 0.3, correctDecision: 'continue', verdict: 'good' }),
    )
    expect(s).toContain('60.0%')
    expect(s).toContain('30.0%')
    expect(s).toContain('clear of the price')
    expect(s).toContain('continuing')
  })

  it('distinguishes a break-even spot as a coin-flip, not a mistake (close vs clear)', () => {
    const s = priceComparison(
      verdict({ equity: 0.32, potOddsThreshold: 0.33, callEv: 0, verdict: 'breakEven' }),
    )
    expect(s).toContain('32.0%')
    expect(s).toContain('33.0%')
    expect(s!.toLowerCase()).toContain('coin-flip')
    expect(s!.toLowerCase()).toContain('equally fine')
  })

  it('returns null on a free check — no price to compare equity against', () => {
    expect(priceComparison(verdict({ potOddsThreshold: 0, verdict: 'good' }))).toBeNull()
  })

  it('is label-free (no Good/Leak prefix — the client pairs it with its own headline)', () => {
    const s = priceComparison(verdict({ verdict: 'good' }))
    expect(s).not.toContain('Good')
    expect(s).not.toContain('Leak')
  })
})

describe('explainPreflop', () => {
  /** Build a PreflopVerdict fixture; `trace` overrides merge onto a sensible unraised-open default. */
  const verdict = (
    v: Partial<Omit<PreflopVerdict, 'trace'>> & { trace?: Partial<PreflopVerdict['trace']> },
  ): PreflopVerdict => ({
    tier: 'premium',
    rationale: 'Premium holding — always raise; you want chips in.',
    advice: 'open',
    heroContinued: true,
    verdict: 'good',
    concept: 'ranges',
    ...v,
    trace: {
      position: 'late',
      facingRaise: false,
      raiseBb: 1,
      band: 'unraised',
      mode: 'open',
      stealSpot: false,
      ...v.trace,
    },
  })

  it('explains the big-blind free option: nothing to call, take the free flop', () => {
    const s = explainPreflop(
      verdict({
        tier: 'trash',
        advice: 'open',
        rationale: 'Big-blind option — no raise to call, so check and take the free flop.',
        trace: { position: 'big-blind', mode: 'bb-option' },
      }),
    )
    expect(s.toLowerCase()).toContain('free flop')
    expect(s.toLowerCase()).toContain('big blind')
  })

  it('explains a premium open: strong enough to play for value from any seat', () => {
    const s = explainPreflop(verdict({ tier: 'premium', advice: 'open' }))
    expect(s.toLowerCase()).toContain('premium')
    expect(s.toLowerCase()).toContain('open')
    // It recommends opening — never tells the hero to fold.
    expect(s.toLowerCase()).not.toContain('fold')
  })

  it('explains a steal-promotion open AND says folding it is fine (the optional steal — 0060)', () => {
    // A trash hand promoted to open by the steal range: opening is good, folding is fine too.
    const s = explainPreflop(
      verdict({
        tier: 'trash',
        advice: 'open',
        trace: { position: 'late', stealSpot: true, mode: 'open' },
      }),
    )
    expect(s.toLowerCase()).toContain('steal')
    expect(s.toLowerCase()).toContain('open')
    // The nuance the grade fix unlocks: folding the bottom of a steal range is fine, not a mistake.
    expect(s.toLowerCase()).toContain('folding it is fine')
    expect(s.toLowerCase()).toContain('optional')
  })

  it('explains a playable hand folded from early position (too loose to open here)', () => {
    const s = explainPreflop(
      verdict({
        tier: 'playable',
        advice: 'fold',
        heroContinued: false,
        verdict: 'good',
        trace: { position: 'early', mode: 'open' },
      }),
    )
    expect(s.toLowerCase()).toContain('early position')
    expect(s.toLowerCase()).toContain('fold')
    expect(s.toLowerCase()).toContain('too loose')
  })

  it('explains a big-blind defend vs a small raise (the discount + closing the action — BUG-0007)', () => {
    const s = explainPreflop(
      verdict({
        tier: 'marginal',
        advice: 'open',
        trace: {
          position: 'big-blind',
          facingRaise: true,
          raiseBb: 3,
          band: 'small-raise',
          mode: 'bb-defend',
        },
      }),
    )
    expect(s.toLowerCase()).toContain('big blind')
    expect(s).toContain('a 3x raise')
    expect(s.toLowerCase()).toContain('defend')
  })

  it('explains a cold-call fold vs a 3-bet, naming the 3-bet (band-aware raise phrase)', () => {
    const s = explainPreflop(
      verdict({
        tier: 'playable',
        advice: 'fold',
        heroContinued: false,
        verdict: 'leak',
        trace: {
          position: 'middle',
          facingRaise: true,
          raiseBb: 10,
          band: '3bet',
          mode: 'cold-call',
        },
      }),
    )
    expect(s).toContain('a 10x raise (a 3-bet)')
    expect(s.toLowerCase()).toContain('cold-call')
    expect(s.toLowerCase()).toContain('fold')
  })

  it('explains a cold-call of a strong hand vs a raise (value worth calling)', () => {
    const s = explainPreflop(
      verdict({
        tier: 'strong',
        advice: 'open',
        trace: {
          position: 'late',
          facingRaise: true,
          raiseBb: 3,
          band: 'small-raise',
          mode: 'cold-call',
        },
      }),
    )
    expect(s.toLowerCase()).toContain('strong')
    expect(s.toLowerCase()).toContain('call')
  })

  it('is label-free (no Good/Leak prefix — clients pair it with their own headline)', () => {
    expect(explainPreflop(verdict({ verdict: 'good' }))).not.toContain('Good')
    expect(
      explainPreflop(verdict({ tier: 'trash', advice: 'fold', verdict: 'leak' })),
    ).not.toContain('Leak')
  })

  it('never contradicts the verdict: a fold-advice explanation recommends folding', () => {
    // Across the fold paths, the explanation must tell the hero to fold (never frame it as an open).
    const foldCases: PreflopVerdict[] = [
      verdict({ tier: 'playable', advice: 'fold', trace: { position: 'early', mode: 'open' } }),
      verdict({ tier: 'marginal', advice: 'fold', trace: { position: 'middle', mode: 'open' } }),
      verdict({ tier: 'trash', advice: 'fold', trace: { position: 'early', mode: 'open' } }),
      verdict({
        tier: 'playable',
        advice: 'fold',
        trace: {
          position: 'middle',
          facingRaise: true,
          raiseBb: 6,
          band: 'large-raise',
          mode: 'cold-call',
        },
      }),
    ]
    for (const v of foldCases) {
      expect(explainPreflop(v).toLowerCase()).toContain('fold')
    }
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
    heroBet: false,
    concept: 'equity-vs-price',
    trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
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
