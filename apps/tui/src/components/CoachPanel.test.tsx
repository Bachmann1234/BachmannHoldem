/**
 * Component + formatter tests for the live coach panel (ticket 0028), via `ink-testing-library`.
 *
 * The panel is a pure render of the {@link CoachResult} the reducer stores, so these tests build
 * deterministic spots with a fixed deck, drive them through the *real* reducer (`apply-action`) so
 * the capture-context-before-applying path and the seeded `@holdem/coach` verdict are exercised
 * end-to-end, and then assert on the panel's `lastFrame()`. They lock in the three verdict colours'
 * headlines (good / leak / break-even), the preflop starting-hand line, the laid-out numbers, and
 * the advisory-error degradation. `lastFrame()` strips ANSI, so colour is asserted through the text
 * the headline carries, never on escape bytes. The pure value formatters it renders with
 * (`pct` / `signedChips` / `VERDICT_LABEL`) are unit-tested at their shared home in `@holdem/format`
 * (ticket 0030 moved them there), so this file covers only the panel's rendering.
 */

import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { parseCards, type Card, type HandState } from '@holdem/engine'
import { CoachPanel } from './CoachPanel.js'
import { createInitialModel, type Model } from '@holdem/session'
import { reducer } from '@holdem/session'

/** Build a deck dealing exactly the given hole cards and board (mirrors the engine test helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Strip ANSI escape codes so structural assertions ignore colour. */
function plain(frame: string): string {
  // eslint-disable-next-line no-control-regex
  return frame.replace(/\[[0-9;]*m/g, '')
}

/**
 * A `'playing'` model with the given deck dealt — the reducer's `start-hand` from a fresh setup is
 * how the live app deals, so we drive it the same way (keeping the coach grading exercised exactly
 * as in production). The hero is seat 0, on the button (heads-up SB), to act first.
 */
function dealtModel(seats: number, deck: Card[]): Model {
  return reducer(createInitialModel({ seats }), { type: 'start-hand', deck })
}

/**
 * Drive a model through the reducer's `apply-action` so the coach grades the spot exactly as the
 * live app does — capturing the `DecisionContext` before applying — and return the resulting frame.
 */
function frameAfter(model: Model, actions: Parameters<typeof reducer>[1][]): string {
  const next = actions.reduce((m, msg) => reducer(m, msg), model)
  return plain(render(<CoachPanel coach={next.coach} />).lastFrame()!)
}

describe('CoachPanel placeholder / error states', () => {
  it('renders a dim placeholder before any decision is graded', () => {
    const frame = plain(render(<CoachPanel coach={{ kind: 'none' }} />).lastFrame()!)
    expect(frame).toContain('Coach')
    expect(frame).toContain('No decision yet')
  })

  it('degrades a coach error to a one-line advisory notice (never crashes)', () => {
    const frame = plain(
      render(
        <CoachPanel coach={{ kind: 'error', message: 'Coaching unavailable — boom' }} />,
      ).lastFrame()!,
    )
    expect(frame).toContain('Coaching unavailable — boom')
  })
})

describe('CoachPanel verdicts (graded through the real reducer)', () => {
  it('preflop: shows the chart tier line and a GREEN good headline, no pot-odds math (AA opens)', () => {
    // Hero AA in the SB/button (seat 0), to act first heads-up; entering with a premium is good.
    const deck = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    const model = dealtModel(2, deck)
    const frame = frameAfter(model, [{ type: 'apply-action', action: { type: 'call' } }])
    // The starting-hand chart tier leads, rendered as the self-contained rationale sentence.
    expect(frame).toContain('Starting hand: Premium holding')
    expect(frame).toContain('Good — your action agreed with the math.')
    // BUG-0001: preflop is graded off the chart, so NO equity / pot-odds / EV-correct line that
    // would contradict it.
    expect(frame).not.toContain('Equity')
    expect(frame).not.toContain('EV-correct')
  })

  it('preflop: folding a premium is a RED leak headline', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    const model = dealtModel(2, deck)
    const frame = frameAfter(model, [{ type: 'apply-action', action: { type: 'fold' } }])
    expect(frame).toContain('Starting hand: Premium holding')
    expect(frame).toContain('Leak — the math pointed the other way.')
  })

  it('postflop: calling a big bet with trash is a RED leak (EV-correct fold)', () => {
    // Hero 72o on a missed board, faces a half-pot bet — a clearly −EV continue.
    const deck = buildDeck(2, 0, ['7s 2d', 'Kd Qc'], 'Ac Jh 9c Th 5s')
    let model = dealtModel(2, deck)
    // SB(seat0) completes, BB checks → flop; the bot seat (1) bets; then hero calls.
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    model = reducer(model, { type: 'apply-action', action: { type: 'bet', amount: 50 } })
    const frame = frameAfter(model, [{ type: 'apply-action', action: { type: 'call' } }])
    expect(frame).toContain('EV-correct: fold')
    expect(frame).toContain('Leak — the math pointed the other way.')
    // Postflop has no starting-hand line.
    expect(frame).not.toContain('Starting hand:')
  })

  it('postflop: a coin-flip-priced call is a YELLOW break-even, EV rendered as a bare 0', () => {
    // Hero T9s on a J82 flop faces a bet that prices the call right on the threshold. The coach
    // narrows the read on the betting line (ticket 0052): the 17-into-12 flop bet is a ~1.4x-pot
    // overbet (betFraction 17/12 ≈ 1.42 ≥ LARGE_BET_POT_FRACTION), well past the barreled knob ⇒
    // the tighter 'ultraTight' read, against which T9s sits ~0.369 — and the price (call 17 into
    // a pot that includes the bet, pot odds 17/46 ≈ 0.370) lands within EPSILON of that equity, a
    // genuine coin-flip. The pot is built up preflop (hero raises to 6, bot calls → pot 12) so the
    // integer flop bet can land EV within the bare-0 rounding window.
    const deck = buildDeck(2, 0, ['Th 9h', 'Ad Ac'], 'Jc 8d 2s Qs 5c')
    let model = dealtModel(2, deck)
    model = reducer(model, { type: 'apply-action', action: { type: 'raise', amount: 6 } })
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    model = reducer(model, { type: 'apply-action', action: { type: 'bet', amount: 17 } })
    const frame = frameAfter(model, [{ type: 'apply-action', action: { type: 'call' } }])
    expect(frame).toContain('Break-even — a coin-flip spot; either way is fine.')
    // Near-zero EV renders the bare, unsigned `0` (the bare-0 formatting contract).
    expect(frame).toContain('EV(call) 0')
  })

  it('postflop: a free check (nothing to call) relabels the metric "Pot equity", not "EV(call)" (ticket 0055)', () => {
    // On a free check callEv is pot-equity, not call-EV, so the shared evMetric relabels it.
    const frame = plain(
      render(
        <CoachPanel
          coach={{
            kind: 'verdict',
            verdict: {
              equity: 0.62,
              potOddsThreshold: 0,
              callEv: 2.5,
              correctDecision: 'continue',
              heroContinued: true,
              verdict: 'good',
              missedValueBet: true,
              concept: 'equity',
            },
          }}
        />,
      ).lastFrame()!,
    )
    expect(frame).toContain('Pot equity +2.5')
    expect(frame).not.toContain('EV(call)')
    // The over-passivity nudge surfaces through the shared explainDecision why-line.
    expect(frame.toLowerCase()).toContain('bet for value')
  })
})

describe('CoachPanel through the reducer: ordering + advisory contract', () => {
  it('a bot action leaves the hero last grade in place', () => {
    // Grade the hero, then apply a bot action; the stored verdict must persist for the panel.
    const deck = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    let model = dealtModel(2, deck)
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } }) // hero (seat0) graded
    expect(model.coach.kind).toBe('preflop')
    const heroGrade = model.coach
    model = reducer(model, { type: 'apply-action', action: { type: 'check' } }) // bot (seat1) acts
    expect(model.coach).toBe(heroGrade) // same reference: the bot turn left it untouched
  })

  it('the initial model starts with no graded decision', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    expect(dealtModel(2, deck).coach).toEqual({ kind: 'none' })
  })

  it('a coach throw on a malformed spot degrades to a stored error notice (never crashes)', () => {
    // Force the advisory branch: a model whose hero seat is to-act but holds a corrupt holding
    // (the same card twice) makes `classifyStartingHand` / the equity read throw. The reducer must
    // catch it, store an `'error'`, and still apply the action (the hand continues).
    const deck = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    const base = dealtModel(2, deck)
    const corruptHole = parseCards('As As') as [Card, Card]
    const corrupt: Model = {
      ...base,
      hand: {
        ...base.hand!,
        players: base.hand!.players.map((p) =>
          p.seat === base.heroSeat ? { ...p, holeCards: corruptHole } : p,
        ),
      } as HandState,
    }
    const next = reducer(corrupt, { type: 'apply-action', action: { type: 'call' } })
    expect(next.coach.kind).toBe('error')
    // The hand still advanced despite the coach failure (advisory, never fatal).
    expect(next.hand).not.toBe(corrupt.hand)
    const frame = plain(render(<CoachPanel coach={next.coach} />).lastFrame()!)
    expect(frame).toContain('Coaching unavailable for this spot')
  })
})
