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
import type { DecisionVerdict } from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '@holdem/session'
import { CoachDrawer } from './CoachDrawer.js'

afterEach(cleanup)

/** Build a `verdict` CoachResult around a `DecisionVerdict`, optionally with a preflop rationale. */
function verdictResult(
  verdict: DecisionVerdict,
  rationale?: string,
): Extract<CoachResult, { kind: 'verdict' }> {
  return rationale === undefined
    ? { kind: 'verdict', verdict }
    : { kind: 'verdict', verdict, preflop: { tier: 'premium', rationale } }
}

/** A facing-a-bet verdict: equity beats the price, a positive call EV, graded good. */
const GOOD: DecisionVerdict = {
  equity: 0.625,
  potOddsThreshold: 0.333,
  callEv: 4,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'good',
}

/** A leak: the math pointed to folding, a negative call EV. */
const LEAK: DecisionVerdict = {
  equity: 0.21,
  potOddsThreshold: 0.4,
  callEv: -3.5,
  correctDecision: 'fold',
  heroContinued: true,
  verdict: 'leak',
}

/** A break-even coin-flip. */
const BREAKEVEN: DecisionVerdict = {
  equity: 0.5,
  potOddsThreshold: 0.5,
  callEv: 0,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'breakEven',
}

/** A free check: no bet to call, so `potOddsThreshold === 0`. */
const FREE_CHECK: DecisionVerdict = {
  equity: 0.48,
  potOddsThreshold: 0,
  callEv: 0,
  correctDecision: 'continue',
  heroContinued: true,
  verdict: 'good',
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

  it('renders the preflop starting-hand rationale when present', () => {
    render(
      <CoachDrawer
        coach={verdictResult(GOOD, 'Premium — open for a raise.')}
        open
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByTestId('coach-preflop').textContent).toContain('Premium — open for a raise.')
  })

  it('omits the preflop line when absent (postflop decision)', () => {
    render(<CoachDrawer coach={verdictResult(GOOD)} open onClose={vi.fn()} />)
    expect(screen.queryByTestId('coach-preflop')).toBeNull()
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
