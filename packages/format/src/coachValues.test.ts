/**
 * Unit tests for the shared coach value formatters. The percent + signed-chip + verdict-label
 * coverage moved here from the two clients (`apps/cli/src/table.test.ts` and
 * `apps/tui/src/components/CoachPanel.test.tsx`) when the formatters were consolidated
 * (ticket 0030): the bare-`0` / no-signed-zero rule and the trailing-`.0` trim matter and are now
 * asserted once, at the helpers' home.
 */

import { describe, it, expect } from 'vitest'
import type { DecisionVerdict, PreflopVerdict, SizeBand, SizingRead } from '@holdem/coach'
import {
  evMetric,
  explainContinue,
  explainDecision,
  explainPreflop,
  explainSizing,
  formatBand,
  INTENT_LABEL,
  pct,
  priceComparison,
  signedChips,
  SIZE_GRADE_LABEL,
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
    shortAllIn: null,
    sizing: null,
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

  it('appends the short-all-in side-pot note to a priced line when shortAllIn is set (ticket 0092)', () => {
    const s = explainDecision(
      verdict({
        equity: 0.6,
        potOddsThreshold: 0.33,
        correctDecision: 'continue',
        verdict: 'good',
        shortAllIn: { allInFor: 20, mainPot: 60 },
      }),
    )
    // The base priced "why" sentence is still there...
    expect(s).toContain('+EV play')
    // ...plus the side-pot eligibility note naming both numbers.
    expect(s).toContain("You're all-in for 20")
    expect(s).toContain('60 main pot')
    expect(s.toLowerCase()).toContain("side pot you're not eligible for")
  })

  it('omits the side-pot note when shortAllIn is null', () => {
    const s = explainDecision(
      verdict({ potOddsThreshold: 0.33, correctDecision: 'continue', shortAllIn: null }),
    )
    expect(s.toLowerCase()).not.toContain('side pot')
    expect(s.toLowerCase()).not.toContain('all-in')
  })

  // --- The sizing line (ticket 0102): the graded `sizing` read's `why`, appended after the
  //     continue-decision sentence, distinguishing intent and never mis-describing a leak. ---

  /** A minimal placeholder band — only `intent`/`spot` matter to the explanation. */
  const band = (intent: SizeBand['intent']): SizeBand => ({
    spot: 'c-bet',
    intent,
    lo: 0.5,
    hi: 0.75,
    bbLo: null,
    bbHi: null,
    toLo: 50,
    toHi: 75,
    sizeAgnostic: false,
  })
  const sizing = (v: Partial<SizingRead> & { intent: SizingRead['intent'] }): SizingRead => ({
    band: band(v.intent),
    verdict: 'good',
    why: 'WHY-PLACEHOLDER',
    ...v,
  })

  it('appends the sizing why-line after the continue sentence when sizing is set', () => {
    const s = explainDecision(
      verdict({
        equity: 0.6,
        potOddsThreshold: 0.3,
        callEv: 12,
        verdict: 'good',
        correctDecision: 'continue',
        sizing: sizing({ intent: 'value', verdict: 'good', why: 'A solid value size.' }),
      }),
    )
    // The continue sentence is still there, and the sizing why follows it.
    expect(s).toContain('continuing is the +EV play')
    expect(s).toContain('A solid value size.')
    expect(s.indexOf('A solid value size.')).toBeGreaterThan(s.indexOf('+EV play'))
  })

  it('renders the risk/reward why on an out-of-band (too-big) size, no fabricated optimal number', () => {
    const s = explainDecision(
      verdict({
        equity: 0.55,
        potOddsThreshold: 0,
        callEv: 110,
        verdict: 'good',
        heroBet: true,
        sizing: sizing({
          intent: 'value',
          verdict: 'too-big',
          why: 'You risked 200 to win 3 — only worse hands fold and only better hands call.',
        }),
      }),
    )
    expect(s.toLowerCase()).toContain('risked 200 to win 3')
    // Still the value-bet description for the continue half (the size leak rides alongside, no flip).
    expect(s.toLowerCase()).toContain('value bet')
  })

  it('does not mis-describe a protection bet as value (intent-distinguished wording rides through)', () => {
    const s = explainDecision(
      verdict({
        equity: 0.55,
        potOddsThreshold: 0,
        callEv: 110,
        verdict: 'good',
        heroBet: true,
        sizing: sizing({
          intent: 'protection',
          verdict: 'good',
          why: 'A big protection size: it charges the board’s draws a steep price to chase.',
        }),
      }),
    )
    expect(s.toLowerCase()).toContain('protection size')
    expect(s.toLowerCase()).toContain('charges the board')
  })

  it('appends NO sizing line when sizing is null (fold/call/check)', () => {
    const s = explainDecision(
      verdict({
        equity: 0.25,
        potOddsThreshold: 0.4,
        callEv: -8,
        correctDecision: 'fold',
        verdict: 'leak',
        sizing: null,
      }),
    )
    // The fold sentence is the whole line — nothing about a size purpose or risk/reward.
    expect(s).toContain('folding is the +EV play')
    expect(s.toLowerCase()).not.toContain('value size')
    expect(s.toLowerCase()).not.toContain('risked')
    expect(s.toLowerCase()).not.toContain('size to pick')
  })

  it('appends the short-all-in note on an UNBET all-in bet, not only priced lines (ticket 0092)', () => {
    // An open-shove into an unbet street is `potOddsThreshold === 0` + `heroBet`, yet it can still
    // be a short all-in when 2+ opponents already went all-in for more on a prior street. The note
    // must survive that branch — it was silently dropped before (caught in review).
    const s = explainDecision(
      verdict({
        equity: 0.55,
        potOddsThreshold: 0,
        heroBet: true,
        correctDecision: 'continue',
        verdict: 'good',
        shortAllIn: { allInFor: 20, mainPot: 60 },
      }),
    )
    expect(s).toContain('value bet') // the base unbet-pot sentence is preserved
    expect(s).toContain("You're all-in for 20")
    expect(s).toContain('60 main pot')
  })

  // --- The 0103 refactor: explainDecision is now explainContinue + explainSizing, and its combined
  //     output must be byte-identical to before (the CLI/TUI render the combined string). ---

  it('combined output equals explainContinue + the sizing sentence (byte-identical, ticket 0103)', () => {
    const v = verdict({
      equity: 0.6,
      potOddsThreshold: 0.3,
      callEv: 12,
      verdict: 'good',
      correctDecision: 'continue',
      sizing: sizing({ intent: 'value', verdict: 'good', why: 'A solid value size.' }),
    })
    expect(explainDecision(v)).toBe(`${explainContinue(v)} ${explainSizing(v)}`)
  })

  it('combined output equals explainContinue exactly when there is no sizing (byte-identical)', () => {
    const v = verdict({
      potOddsThreshold: 0.4,
      correctDecision: 'fold',
      verdict: 'leak',
      sizing: null,
    })
    expect(explainSizing(v)).toBeNull()
    expect(explainDecision(v)).toBe(explainContinue(v))
  })
})

describe('explainContinue', () => {
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
    shortAllIn: null,
    sizing: null,
    ...v,
  })

  it('is the continue narration with the sizing sentence stripped (never carries the why)', () => {
    const s = explainContinue(
      verdict({
        equity: 0.6,
        potOddsThreshold: 0.3,
        callEv: 12,
        verdict: 'good',
        correctDecision: 'continue',
        sizing: {
          intent: 'value',
          band: {
            spot: 'c-bet',
            intent: 'value',
            lo: 0.5,
            hi: 0.75,
            bbLo: null,
            bbHi: null,
            toLo: 50,
            toHi: 75,
            sizeAgnostic: false,
          },
          verdict: 'too-big',
          why: 'You risked 200 to win 3.',
        },
      }),
    )
    expect(s).toContain('continuing is the +EV play')
    // The sizing why is NOT in the continue half — that is what keeps the drawer's why un-duplicated.
    expect(s).not.toContain('You risked 200 to win 3.')
  })

  it('still carries the short-all-in side-pot note (it belongs to the continue half)', () => {
    const s = explainContinue(
      verdict({
        equity: 0.6,
        potOddsThreshold: 0.33,
        correctDecision: 'continue',
        verdict: 'good',
        shortAllIn: { allInFor: 20, mainPot: 60 },
      }),
    )
    expect(s).toContain("You're all-in for 20")
  })
})

describe('explainSizing', () => {
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
    shortAllIn: null,
    sizing: null,
    ...v,
  })

  it('returns the graded why verbatim when sizing is present', () => {
    const s = explainSizing(
      verdict({
        sizing: {
          intent: 'value',
          band: {
            spot: 'c-bet',
            intent: 'value',
            lo: 0.5,
            hi: 0.75,
            bbLo: null,
            bbHi: null,
            toLo: 50,
            toHi: 75,
            sizeAgnostic: false,
          },
          verdict: 'good',
          why: 'A solid value size.',
        },
      }),
    )
    expect(s).toBe('A solid value size.')
  })

  it('returns null when sizing is null (a fold/call/check)', () => {
    expect(explainSizing(verdict({ sizing: null }))).toBeNull()
  })
})

describe('formatBand', () => {
  const base = (v: Partial<SizeBand>): SizeBand => ({
    spot: 'c-bet',
    intent: 'value',
    lo: null,
    hi: null,
    bbLo: null,
    bbHi: null,
    toLo: 0,
    toHi: 0,
    sizeAgnostic: false,
    ...v,
  })

  it('renders a postflop value band in the peg words ("½–¾ pot")', () => {
    expect(formatBand(base({ lo: 0.5, hi: 0.75 }))).toBe('½–¾ pot')
  })

  it('renders the protection band with the "pot" high end ("¾–pot")', () => {
    expect(formatBand(base({ intent: 'protection', lo: 0.75, hi: 1 }))).toBe('¾–pot')
  })

  it('renders a preflop open band in big blinds ("2–2.5bb")', () => {
    expect(formatBand(base({ spot: 'open', bbLo: 2, bbHi: 2.5 }))).toBe('2–2.5bb')
  })

  it('renders "any reasonable size" for a size-agnostic spot (the overcall)', () => {
    expect(formatBand(base({ spot: 'overcall', sizeAgnostic: true, lo: 0.25, hi: 1 }))).toBe(
      'any reasonable size',
    )
  })

  it('collapses a single-peg band to the lone word', () => {
    expect(formatBand(base({ lo: 1, hi: 1 }))).toBe('pot')
  })
})

describe('INTENT_LABEL / SIZE_GRADE_LABEL', () => {
  it('has a display word for every intent and every size grade', () => {
    expect(INTENT_LABEL.value).toBe('Value')
    expect(INTENT_LABEL.bluff).toBe('Bluff')
    expect(INTENT_LABEL.protection).toBe('Protection')
    expect(INTENT_LABEL.steal).toBe('Steal')
    expect(SIZE_GRADE_LABEL.good).toContain('Good')
    expect(SIZE_GRADE_LABEL['too-big']).toContain('big')
    expect(SIZE_GRADE_LABEL['too-small']).toContain('small')
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
    shortAllIn: null,
    sizing: null,
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
    shortAllIn: null,
    sizing: null,
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
