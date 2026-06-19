// @vitest-environment jsdom
/**
 * CoachFab component test (ticket 0036): the corner FAB's ring reflects `model.coach` — `?` when no
 * decision is graded (`none`/`error`), and a quiet ✓/!/· dot per the post-action verdict — and
 * clicking it opens the drawer. Pure presentational: we hand it plain `CoachResult` records (the
 * shape the reducer stores), never an engine `HandState`.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionVerdict } from '@holdem/coach'
import type { DecisionContext } from '@holdem/bots'
import type { CoachResult } from '@holdem/session'
import { CoachFab } from './CoachFab.js'

afterEach(cleanup)

/**
 * A throwaway spot for the graded `CoachResult` literals: the FAB only reads `coach.kind`/the verdict
 * tag, never the `ctx`/`action` the spot-capture path carries, so any well-typed pair will do.
 */
const STUB_CTX: DecisionContext = {
  seat: 0,
  holeCards: parseCards('As Ad') as [Card, Card],
  board: [],
  street: 'flop',
  legalActions: { fold: true, check: true, call: null, bet: null, raise: null },
  pot: 10,
  currentBet: 0,
  toCall: 0,
  stack: 200,
  committed: 0,
  smallBlind: 1,
  bigBlind: 2,
  buttonIndex: 0,
  isButton: true,
  numPlayers: 2,
  numActive: 2,
  opponents: [],
}
const STUB_ACTION: Action = { type: 'check' }

/** A `verdict` CoachResult with the given verdict tag (other fields are plausible filler). */
function verdictResult(tag: DecisionVerdict['verdict']): CoachResult {
  return {
    kind: 'verdict',
    verdict: {
      equity: 0.6,
      potOddsThreshold: 0.33,
      callEv: 4,
      correctDecision: 'continue',
      heroContinued: true,
      verdict: tag,
      missedValueBet: false,
      heroBet: false,
      shortAllIn: null,
      concept: 'equity-vs-price',
      trace: { assumedRange: 'tight', lineReason: 'facing-bet', betFraction: 0.5, polarized: null },
    },
    ctx: STUB_CTX,
    action: STUB_ACTION,
  }
}

describe('CoachFab — ring reflects the coach state', () => {
  it('shows "?" when no decision is graded yet (none)', () => {
    render(<CoachFab coach={{ kind: 'none' }} onOpen={vi.fn()} />)
    const ring = screen.getByTestId('coach-fab-ring')
    expect(ring.textContent).toBe('?')
    expect(ring.className).toContain('ring-neutral')
  })

  it('shows "?" for an error result', () => {
    render(<CoachFab coach={{ kind: 'error', message: 'boom' }} onOpen={vi.fn()} />)
    expect(screen.getByTestId('coach-fab-ring').textContent).toBe('?')
  })

  it('shows ✓ (good) coloured good', () => {
    render(<CoachFab coach={verdictResult('good')} onOpen={vi.fn()} />)
    const ring = screen.getByTestId('coach-fab-ring')
    expect(ring.textContent).toBe('✓')
    expect(ring.className).toContain('ring-good')
  })

  it('shows ! (leak) coloured bad', () => {
    render(<CoachFab coach={verdictResult('leak')} onOpen={vi.fn()} />)
    const ring = screen.getByTestId('coach-fab-ring')
    expect(ring.textContent).toBe('!')
    expect(ring.className).toContain('ring-leak')
  })

  it('shows · (breakEven) coloured neutral/accent', () => {
    render(<CoachFab coach={verdictResult('breakEven')} onOpen={vi.fn()} />)
    const ring = screen.getByTestId('coach-fab-ring')
    expect(ring.textContent).toBe('·')
    expect(ring.className).toContain('ring-neutral')
  })

  it('reads a preflop chart grade the same as a postflop verdict (✓ good)', () => {
    const coach: CoachResult = {
      kind: 'preflop',
      verdict: {
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
      },
      ctx: STUB_CTX,
      action: STUB_ACTION,
    }
    render(<CoachFab coach={coach} onOpen={vi.fn()} />)
    const ring = screen.getByTestId('coach-fab-ring')
    expect(ring.textContent).toBe('✓')
    expect(ring.className).toContain('ring-good')
  })

  it('opens the drawer when clicked', () => {
    const onOpen = vi.fn()
    render(<CoachFab coach={{ kind: 'none' }} onOpen={onOpen} />)
    fireEvent.click(screen.getByTestId('coach-fab'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
