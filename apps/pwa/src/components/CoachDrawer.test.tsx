// @vitest-environment jsdom
/**
 * CoachDrawer component test (ticket 0036): the bottom sheet lays out all three `CoachResult` states
 * and reuses the shared `@holdem/format` helpers for every number/label (so the PWA and TUI can
 * never phrase a verdict differently). It is purely presentational, so we hand it plain
 * `CoachResult` records — the exact shape the reducer stores on `model.coach` — never an engine
 * `HandState`. We assert the rendered numbers equal what the `@holdem/format` helpers produce.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import type { DecisionContext } from '@holdem/bots'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '@holdem/session'
import { CoachDrawer } from './CoachDrawer.js'

afterEach(cleanup)

/**
 * A real-shaped spot the graded `CoachResult` variants now carry, so the "Copy ruling" button can
 * `serializeSpot(coach.ctx, coach.action, coach.verdict)`. Most presentational assertions never read
 * it (they render the verdict); the copy-ruling test does, so it carries real cards/board.
 */
const SPOT_CTX: DecisionContext = {
  seat: 0,
  holeCards: parseCards('Ah Kh') as [Card, Card],
  board: parseCards('Qh Jh 2c'),
  street: 'flop',
  legalActions: { fold: true, check: false, call: { amount: 10 }, bet: null, raise: null },
  pot: 30,
  currentBet: 10,
  toCall: 10,
  stack: 190,
  committed: 0,
  smallBlind: 1,
  bigBlind: 2,
  buttonIndex: 0,
  isButton: true,
  numPlayers: 2,
  numActive: 2,
  opponents: [
    { seat: 1, stack: 180, committed: 10, totalCommitted: 20, status: 'active', isButton: false },
  ],
}
const SPOT_ACTION: Action = { type: 'call' }

/** Build a postflop `verdict` CoachResult around a `DecisionVerdict` (with a captured spot). */
function verdictResult(verdict: DecisionVerdict): Extract<CoachResult, { kind: 'verdict' }> {
  return { kind: 'verdict', verdict, ctx: SPOT_CTX, action: SPOT_ACTION }
}

/** Build a preflop `preflop` CoachResult around a `PreflopVerdict` (with a captured spot). */
function preflopResult(verdict: PreflopVerdict): Extract<CoachResult, { kind: 'preflop' }> {
  return { kind: 'preflop', verdict, ctx: SPOT_CTX, action: SPOT_ACTION }
}

/** A facing-a-bet verdict: equity beats the price, a positive call EV, graded good. */
const GOOD: DecisionVerdict = {
  equity: 0.625,
  potOddsThreshold: 0.333,
  callEv: 4,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'good',
  missedValueBet: false,
  concept: 'equity-vs-price',
  trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5 },
}

/** A leak: the math pointed to folding, a negative call EV. */
const LEAK: DecisionVerdict = {
  equity: 0.21,
  potOddsThreshold: 0.4,
  callEv: -3.5,
  correctDecision: 'fold',
  heroContinued: true,
  verdict: 'leak',
  missedValueBet: false,
  concept: 'equity-vs-price',
  trace: { assumedRange: 'ultraTight', lineReason: 'barreled', betFraction: 0.75 },
}

/** A break-even coin-flip. */
const BREAKEVEN: DecisionVerdict = {
  equity: 0.5,
  potOddsThreshold: 0.5,
  callEv: 0,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'breakEven',
  missedValueBet: false,
  concept: 'equity-vs-price',
  trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5 },
}

/** A free check: no bet to call, so `potOddsThreshold === 0`. */
const FREE_CHECK: DecisionVerdict = {
  equity: 0.48,
  potOddsThreshold: 0,
  callEv: 0,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'good',
  missedValueBet: false,
  concept: 'equity',
  trace: { assumedRange: 'medium', lineReason: 'unbet', betFraction: null },
}

describe('CoachDrawer — verdict state', () => {
  it('renders the good verdict: badge, the shared headline, the metric values via @holdem/format', () => {
    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)

    expect(screen.getByTestId('coach-verdict').className).toContain('good')
    // Headline is the SHARED VERDICT_LABEL (no PWA-local re-phrasing).
    expect(screen.getByText(VERDICT_LABEL.good)).toBeTruthy()

    // Every number is rendered through the @holdem/format helpers.
    expect(screen.getByTestId('metric-equity').textContent).toBe(pct(GOOD.equity))
    expect(screen.getByTestId('metric-potodds').textContent).toBe(pct(GOOD.potOddsThreshold))
    expect(screen.getByTestId('metric-ev').textContent).toBe(signedChips(GOOD.callEv))
    // Positive EV is coloured good.
    expect(screen.getByTestId('metric-ev').className).toContain('good')

    // The equity bar fill width is pct(equity).
    expect((screen.getByTestId('eq-win') as HTMLElement).style.width).toBe(pct(GOOD.equity))
  })

  it('renders a leak with the leak headline and a bad-coloured negative EV', () => {
    render(<CoachDrawer coach={verdictResult(LEAK)} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-verdict').className).toContain('leak')
    expect(screen.getByText(VERDICT_LABEL.leak)).toBeTruthy()
    expect(screen.getByTestId('metric-ev').textContent).toBe(signedChips(LEAK.callEv))
    expect(screen.getByTestId('metric-ev').className).toContain('bad')
  })

  it('renders a break-even spot with neutral styling', () => {
    render(<CoachDrawer coach={verdictResult(BREAKEVEN)} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-verdict').className).toContain('neutral')
    expect(screen.getByText(VERDICT_LABEL.breakEven)).toBeTruthy()
  })

  it('shows "—" for pot odds on a free check (potOddsThreshold === 0)', () => {
    render(<CoachDrawer coach={verdictResult(FREE_CHECK)} open onClose={vi.fn()} />)
    expect(screen.getByTestId('metric-potodds').textContent).toBe('—')
  })

  it('relabels the EV card "Pot equity" on a free check, value unchanged (ticket 0055)', () => {
    // Nothing to call ⇒ callEv is pot-equity, not call-EV: the shared evMetric relabels the card.
    render(<CoachDrawer coach={verdictResult(FREE_CHECK)} open onClose={vi.fn()} />)
    expect(screen.getByText('Pot equity')).toBeTruthy()
    expect(screen.queryByText('EV of call')).toBeNull()
    // The value (and its testid) is unchanged — only the label moved.
    expect(screen.getByTestId('metric-ev').textContent).toBe(signedChips(FREE_CHECK.callEv))
  })

  it('keeps the EV(call) card label on a priced spot', () => {
    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    expect(screen.getByText('EV(call)')).toBeTruthy()
    expect(screen.queryByText('Pot equity')).toBeNull()
  })

  it('surfaces the value-bet nudge in the why-line when missedValueBet is set (ticket 0055)', () => {
    // A checked unbet pot while comfortably ahead: explainDecision adds the "bet for value" nudge.
    const missed: DecisionVerdict = {
      ...FREE_CHECK,
      equity: 0.62,
      callEv: 6.2,
      missedValueBet: true,
    }
    render(<CoachDrawer coach={verdictResult(missed)} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-why').textContent?.toLowerCase()).toContain('bet for value')
  })

  it('shows no preflop starting-hand line postflop (the chart is preflop only)', () => {
    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    expect(screen.queryByTestId('coach-preflop')).toBeNull()
  })
})

describe('CoachDrawer — Copy ruling (spot capture)', () => {
  it('postflop: serialises the captured spot (hand + verdict) to the clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('copy-ruling'))

    expect(writeText).toHaveBeenCalledTimes(1)
    const blob = writeText.mock.calls[0]![0] as string
    // The blob is the serialised spot: the hero's hand + board as readable strings, the action, and
    // the verdict carried so the ruling is reviewable as-is.
    expect(blob).toContain('"holeCards": "Ah Kh"')
    expect(blob).toContain('"board": "Qh Jh 2c"')
    expect(blob).toContain('"action": "call"')
    expect(blob).toContain('"verdict"')

    vi.unstubAllGlobals()
  })

  it('does not throw when the clipboard API is unavailable', () => {
    vi.stubGlobal('navigator', {})
    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    expect(() => fireEvent.click(screen.getByTestId('copy-ruling'))).not.toThrow()
    vi.unstubAllGlobals()
  })
})

describe('CoachDrawer — preflop state', () => {
  /** A premium hand the hero correctly opened — graded off the chart. */
  const PREFLOP_GOOD: PreflopVerdict = {
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

  it('renders the chart rationale and the shared good headline', () => {
    render(<CoachDrawer coach={preflopResult(PREFLOP_GOOD)} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-verdict').className).toContain('good')
    expect(screen.getByText(VERDICT_LABEL.good)).toBeTruthy()
    expect(screen.getByTestId('coach-preflop').textContent).toContain('Premium holding')
  })

  it('renders the deterministic preflop "why" explainer (ticket 0060)', () => {
    render(<CoachDrawer coach={preflopResult(PREFLOP_GOOD)} open onClose={vi.fn()} />)
    // The beginner why-line is the preflop counterpart to postflop's coach-why explainer.
    expect(screen.getByTestId('coach-why-preflop').textContent?.toLowerCase()).toContain('premium')
  })

  it('flags folding a chart-open hand as a leak', () => {
    render(
      <CoachDrawer
        coach={preflopResult({ ...PREFLOP_GOOD, heroContinued: false, verdict: 'leak' })}
        open
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('coach-verdict').className).toContain('leak')
    expect(screen.getByText(VERDICT_LABEL.leak)).toBeTruthy()
  })

  it('shows no pot-odds metric cards preflop (the chart drives the verdict, not equity)', () => {
    // BUG-0001: preflop must not render the equity / pot-odds / EV cards that would contradict
    // the chart verdict.
    render(<CoachDrawer coach={preflopResult(PREFLOP_GOOD)} open onClose={vi.fn()} />)
    expect(screen.queryByTestId('metric-equity')).toBeNull()
    expect(screen.queryByTestId('metric-potodds')).toBeNull()
    expect(screen.queryByTestId('metric-ev')).toBeNull()
  })

  it('offers Copy ruling preflop too, serialising the spot + preflop verdict', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CoachDrawer coach={preflopResult(PREFLOP_GOOD)} open onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('copy-ruling'))
    const blob = writeText.mock.calls[0]![0] as string
    expect(blob).toContain('"action": "call"')
    expect(blob).toContain('"verdict"')
    vi.unstubAllGlobals()
  })

  it('offers "see the chart" and opens the starting-hand chart overlay (ticket 0050)', () => {
    render(<CoachDrawer coach={preflopResult(PREFLOP_GOOD)} open onClose={vi.fn()} />)
    expect(screen.queryByTestId('chart-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('open-chart'))
    expect(screen.getByTestId('chart-modal')).toBeTruthy()
    // The grid is the full 13×13 = 169 cells, straight from the pure enumerator.
    expect(screen.getByTestId('chart-grid').children).toHaveLength(169)
    fireEvent.click(screen.getByTestId('chart-close'))
    expect(screen.queryByTestId('chart-modal')).toBeNull()
  })

  it('highlights the hero’s current hand in the chart (ticket 0050)', () => {
    const [a, b] = parseCards('As Kd')
    render(
      <CoachDrawer
        coach={preflopResult(PREFLOP_GOOD)}
        open
        onClose={vi.fn()}
        heroHoleCards={[a!, b!] as [Card, Card]}
      />,
    )
    fireEvent.click(screen.getByTestId('open-chart'))
    // AsKd → "AKo"; its cell is ringed as the current hand.
    expect(screen.getByTestId('chart-current').textContent).toBe('AKo')
  })
})

describe('CoachDrawer — none and error states', () => {
  it('renders the placeholder for none (no live read)', () => {
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-none')).toBeTruthy()
    expect(screen.queryByTestId('coach-verdict')).toBeNull()
  })

  it('renders the advisory message for error', () => {
    render(
      <CoachDrawer
        coach={{ kind: 'error', message: 'Coach unavailable.' }}
        open
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('coach-error').textContent).toBe('Coach unavailable.')
  })
})

describe('CoachDrawer — open/close behaviour', () => {
  it('reflects open state on the drawer and scrim', () => {
    const { rerender } = render(
      <CoachDrawer coach={{ kind: 'none' }} open={false} onClose={vi.fn()} />,
    )
    expect(screen.getByTestId('coach-drawer').className).not.toContain('open')
    expect(screen.getByTestId('coach-scrim').className).not.toContain('show')

    rerender(<CoachDrawer coach={{ kind: 'none' }} open onClose={vi.fn()} />)
    expect(screen.getByTestId('coach-drawer').className).toContain('open')
    expect(screen.getByTestId('coach-scrim').className).toContain('show')
  })

  it('closes on the close button, the scrim, and Escape', () => {
    const onClose = vi.fn()
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={onClose} />)

    fireEvent.click(screen.getByTestId('coach-close'))
    fireEvent.click(screen.getByTestId('coach-scrim'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('focuses the close button on open', () => {
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByTestId('coach-close'))
  })

  it('is inert and hidden from the a11y tree when closed, modal when open', () => {
    const { rerender } = render(
      <CoachDrawer coach={verdictResult(GOOD)} open={false} onClose={vi.fn()} />,
    )
    const drawer = screen.getByTestId('coach-drawer')
    // Closed: still mounted (for the slide transition) but inert + aria-hidden, not a live modal.
    expect(drawer.hasAttribute('inert')).toBe(true)
    expect(drawer.getAttribute('aria-hidden')).toBe('true')
    expect(drawer.getAttribute('aria-modal')).toBeNull()

    rerender(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    expect(drawer.hasAttribute('inert')).toBe(false)
    expect(drawer.getAttribute('aria-hidden')).toBeNull()
    expect(drawer.getAttribute('aria-modal')).toBe('true')
  })

  it('dismisses when the grab handle is dragged down past the threshold', () => {
    const onClose = vi.fn()
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={onClose} />)
    const handle = screen.getByTestId('coach-grab')
    // A deliberate downward drag well past the 90px threshold.
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 140, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 230, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 230, pointerId: 1 })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('snaps back (does not dismiss) on a short drag below the threshold', () => {
    const onClose = vi.fn()
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={onClose} />)
    const handle = screen.getByTestId('coach-grab')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 130, pointerId: 1 }) // 30px — under threshold
    fireEvent.pointerUp(handle, { clientY: 130, pointerId: 1 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not dismiss on a plain tap of the handle (no drag)', () => {
    const onClose = vi.fn()
    render(<CoachDrawer coach={{ kind: 'none' }} open onClose={onClose} />)
    const handle = screen.getByTestId('coach-grab')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 100, pointerId: 1 })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to the opener when it closes', () => {
    // Stand in for the FAB that opens the sheet: focus it, open, then close.
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const onClose = vi.fn()
    const { rerender } = render(<CoachDrawer coach={{ kind: 'none' }} open onClose={onClose} />)
    expect(document.activeElement).toBe(screen.getByTestId('coach-close'))

    rerender(<CoachDrawer coach={{ kind: 'none' }} open={false} onClose={onClose} />)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
