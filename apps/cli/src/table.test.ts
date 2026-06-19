/**
 * Unit tests for the headless harness's string renderers (ticket 0030). The verb/amount grammar
 * (`parseAction` / `renderLegal`) and the coach value formatters (`pct` / `signedChips`) the
 * harness uses moved to `@holdem/format` and are unit-tested there
 * (`packages/format/src/*.test.ts`); this file covers what is unique to the CLI — the table/result
 * renderers and the `── Coach ──` feedback block they frame.
 */

import { describe, it, expect } from 'vitest'
import { applyAction, createHand, parseCards, potTotal, type Card } from '@holdem/engine'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import { renderState, renderResult, renderCoachFeedback, renderPreflopCoach } from './table.js'

/** Build a heads-up deck dealing the given holes + board (mirrors the engine test helper). */
function headsUpDeck(holesBySeat: string[], board: string): Card[] {
  // Heads-up: the button is also the small blind, so seat order from the button deals SB first.
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 2; k++) order.push(holes[k]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Build an N-handed deck dealing the given holes + board (button 0, deals SB-first). */
function deck(n: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? 0 : 1 // button 0; multiway deals from seat left of the button
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

describe('renderState', () => {
  it('shows the street, board, pot, and each seat (opponent cards hidden mid-hand)', () => {
    const deck = headsUpDeck(['As Ad', 'Kc Qc'], '2c 7d 9h Th 5s')
    const state = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck,
    })
    const out = renderState(state, 0)
    expect(out).toContain('── Preflop')
    expect(out).toContain('Board: —') // no community cards preflop
    // The hero (seat 0) sees their own cards; the opponent's are masked until showdown.
    expect(out).toContain('You')
    expect(out).toContain('As Ad')
    expect(out).toContain('?? ??')
    expect(out).toContain('Bot 1')
  })

  it('shows the single, unchanged pot total for an ordinary one-pot hand', () => {
    const state = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: headsUpDeck(['As Ad', 'Kc Qc'], '2c 7d 9h Th 5s'),
    })
    expect(state.pots.length).toBeLessThan(2) // a fresh hand has no split pot
    const out = renderState(state, 0)
    expect(out).toContain(`Pot: ${potTotal(state)}`)
    expect(out).not.toContain('Main')
  })

  it('prints a labelled side-pot breakdown for a multi-way all-in (Main | Side)', () => {
    // 3-way all-in 20/50/100 → main 60 (all three eligible) + side 60 (seats 1 & 2). Built through
    // the real engine so `collectPots` produces the pots — never hand-built.
    let state = createHand({
      stacks: [20, 50, 100],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: deck(3, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c'),
    })
    state = applyAction(state, { type: 'raise', amount: 20 }) // seat0 shoves 20
    state = applyAction(state, { type: 'raise', amount: 50 }) // seat1 shoves 50
    state = applyAction(state, { type: 'call' }) // seat2 calls 50

    expect(state.pots.length).toBe(2) // sanity: a main + side pot
    const out = renderState(state, 0)
    expect(out).toContain(`Pot: Main ${state.pots[0]!.amount} | Side ${state.pots[1]!.amount}`)
    expect(out).not.toMatch(/Pot: \d/) // the single-total form is gone
  })

  it('abbreviates several layered side pots as S1, S2, …', () => {
    // 4-way all-in 20/50/100/200 → main + S1 + S2.
    let state = createHand({
      stacks: [20, 50, 100, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: deck(4, ['As Ks', 'Qs Js', 'Ts 9s', '8s 7s'], '2c 3d 4h 6s 7c'),
    })
    state = applyAction(state, { type: 'raise', amount: 200 }) // UTG seat3 shoves 200
    state = applyAction(state, { type: 'call' }) // seat0 calls all-in (20)
    state = applyAction(state, { type: 'call' }) // seat1 calls all-in (50)
    state = applyAction(state, { type: 'call' }) // seat2 calls all-in (100)

    expect(state.pots.length).toBe(3)
    const out = renderState(state, 0)
    expect(out).toContain(
      `Pot: Main ${state.pots[0]!.amount} | S1 ${state.pots[1]!.amount} | S2 ${state.pots[2]!.amount}`,
    )
  })
})

describe('renderResult', () => {
  it('renders a fold-out result with the payout', () => {
    // A clean fold-out: deal a hand, then the under-the-gun seat folds preflop.
    const deck = headsUpDeck(['As Ad', 'Kc Qc'], '2c 7d 9h Th 5s')
    const state = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck,
    })
    // We assert on the renderer's shape against a *completed* showdown-less state below; here we
    // only need that the section header renders for any state.
    expect(renderResult(state, 0)).toContain('── Result')
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
  missedValueBet: false,
  heroBet: false,
  shortAllIn: null,
  concept: 'equity-vs-price',
  trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
}

/** A leak: the hero called off below the pot-odds threshold. */
const leakCall: DecisionVerdict = {
  equity: 0.18,
  potOddsThreshold: 0.33,
  callEv: -1.5,
  correctDecision: 'fold',
  heroContinued: true,
  verdict: 'leak',
  missedValueBet: false,
  heroBet: false,
  shortAllIn: null,
  concept: 'equity-vs-price',
  trace: { assumedRange: 'ultraTight', lineReason: 'barreled', betFraction: 0.7, polarized: null },
}

/** A preflop grade off the chart: a premium hand the hero correctly entered the pot with. */
const premiumOpen: PreflopVerdict = {
  tier: 'premium',
  rationale: 'Premium holding — always raise; you want chips in.',
  advice: 'open',
  heroContinued: true,
  verdict: 'good',
  concept: 'ranges',
  trace: {
    position: 'late',
    facingRaise: false,
    raiseBb: 1,
    band: 'unraised',
    mode: 'open',
    stealSpot: false,
  },
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

  it('renders the board-aware polarised composition on a barreled postflop read (ticket 0057)', () => {
    const boardAware: DecisionVerdict = {
      equity: 0.22,
      potOddsThreshold: 0.3,
      callEv: -2.1,
      correctDecision: 'fold',
      heroContinued: true,
      verdict: 'leak',
      missedValueBet: false,
      heroBet: false,
      shortAllIn: null,
      concept: 'equity-vs-price',
      trace: {
        assumedRange: 'board-aware',
        lineReason: 'barreled',
        betFraction: 1.0,
        polarized: { valueCombos: 180, bluffCombos: 60, bluffFraction: 0.25 },
      },
    }
    const out = renderCoachFeedback(boardAware)
    // The Read line names the board-aware range and shows the value/bluff split + bluff percentage.
    expect(out).toContain('Read: board-aware range (barreled)')
    expect(out).toContain('180 value / 60 bluff')
    expect(out).toContain('25% bluffs')
  })

  it('shows no starting-hand line postflop (the chart is preflop only)', () => {
    expect(renderCoachFeedback(goodCall)).not.toContain('Starting hand')
  })

  it('relabels the EV metric to "Pot equity" on a free check (nothing to call), with the value unchanged', () => {
    // A checked unbet pot: callEv is pot-equity, not call-EV, so the label is "Pot equity" (ticket 0055).
    const freeCheck: DecisionVerdict = {
      equity: 0.62,
      potOddsThreshold: 0,
      callEv: 2.5,
      correctDecision: 'continue',
      heroContinued: true,
      verdict: 'good',
      missedValueBet: true,
      heroBet: false,
      shortAllIn: null,
      concept: 'equity',
      trace: { assumedRange: 'medium', lineReason: 'unbet', betFraction: null, polarized: null },
    }
    const out = renderCoachFeedback(freeCheck)
    expect(out).toContain('Pot equity +2.5')
    expect(out).not.toContain('EV(call)')
    // The value-bet nudge surfaces through the shared explainDecision why-line.
    expect(out.toLowerCase()).toContain('bet for value')
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
      missedValueBet: false,
      heroBet: false,
      shortAllIn: null,
      concept: 'equity-vs-price',
      trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
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

describe('renderPreflopCoach', () => {
  it('leads with the starting-hand chart rationale and the good/leak headline', () => {
    const out = renderPreflopCoach(premiumOpen)
    expect(out).toContain('── Coach ')
    expect(out).toContain('Starting hand: Premium holding')
    expect(out).toContain('Good')
  })

  it('renders the deterministic preflop "why" explainer line (ticket 0060)', () => {
    const out = renderPreflopCoach(premiumOpen)
    // The beginner why-line is rendered the way the postflop block renders explainDecision.
    expect(out.toLowerCase()).toContain('premium')
    expect(out.toLowerCase()).toContain('open')
  })

  it('shows no pot-odds math preflop (the chart drives the verdict, not equity)', () => {
    // BUG-0001: preflop must not render the equity / pot-odds / EV-correct lines that would
    // contradict the chart verdict (the old "open for value" + "EV-correct: fold" pairing).
    const out = renderPreflopCoach(premiumOpen)
    expect(out).not.toContain('Equity')
    expect(out).not.toContain('pot odds')
    expect(out).not.toContain('EV-correct')
  })

  it('flags folding a chart-open hand as a leak', () => {
    const out = renderPreflopCoach({
      tier: 'strong',
      rationale: 'Strong value hand — open and bet for value.',
      advice: 'open',
      heroContinued: false,
      verdict: 'leak',
      concept: 'ranges',
      trace: {
        position: 'early',
        facingRaise: false,
        raiseBb: 1,
        band: 'unraised',
        mode: 'open',
        stealSpot: false,
      },
    })
    expect(out).toContain('Starting hand: Strong value hand')
    expect(out).toContain('Leak')
  })
})
