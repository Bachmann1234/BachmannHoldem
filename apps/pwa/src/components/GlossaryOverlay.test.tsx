// @vitest-environment jsdom
/**
 * GlossaryOverlay component test: the poker-shorthand reference renders its decoded sections, keeps
 * its hand-class meanings in lock-step with `@holdem/coach`'s `describeHandClass`, and dismisses via
 * the close button, the scrim, and Escape (the shared overlay a11y bar). Presentational — no state.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeHandClass } from '@holdem/coach'
import { outsToEquity, potOdds } from '@holdem/odds'
import { GlossaryOverlay } from './GlossaryOverlay.js'

afterEach(cleanup)

describe('GlossaryOverlay', () => {
  it('renders the dialog with the shorthand sections', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    const dialog = screen.getByTestId('glossary-modal')
    expect(dialog.getAttribute('role')).toBe('dialog')
    for (const title of ['Starting hands', 'Strength tiers', 'Table positions', 'Cards']) {
      expect(screen.getByText(title)).toBeTruthy()
    }
  })

  it('decodes hand-class shorthand through the same coach helper as the chart', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    const body = screen.getByTestId('glossary-body')
    // The meaning text is sourced from describeHandClass, so it cannot drift from the chart caption.
    expect(body.textContent).toContain(describeHandClass('JTo')) // 'Jack-Ten offsuit'
    expect(body.textContent).toContain(describeHandClass('AKs')) // 'Ace-King suited'
    expect(body.textContent).toContain(describeHandClass('AA')) // 'pair of Aces'
  })

  it('explains the position tags shown on the felt', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    const body = screen.getByTestId('glossary-body')
    for (const tag of ['BTN', 'SB', 'BB']) {
      expect(body.textContent).toContain(tag)
    }
  })

  it('closes via the close button, the scrim, and Escape', () => {
    const onClose = vi.fn()
    render(<GlossaryOverlay onClose={onClose} />)
    fireEvent.click(screen.getByTestId('glossary-close'))
    fireEvent.click(screen.getByTestId('glossary-scrim'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('renders the hand-strength concepts section (ticket 0064)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByText('Hand strength')).toBeTruthy()
    const body = screen.getByTestId('glossary-body')
    for (const term of ['Nuts', 'Kicker', 'Dominated', 'Set', 'Suited connector']) {
      expect(body.textContent).toContain(term)
    }
  })

  it('no longer asserts trash "makes no money" (no false universal, ticket 0056)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('glossary-body').textContent).not.toMatch(/makes no money/i)
  })

  it('renders the number-sense cheat-sheet vocabulary (ticket 0081)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByText('Number sense')).toBeTruthy()
    const body = screen.getByTestId('glossary-body')
    for (const term of ['Equity', 'Pot odds', 'Break-even equity', 'Outs', 'EV']) {
      expect(body.textContent).toContain(term)
    }
  })

  it('renders the pot-odds → equity table with values DERIVED from @holdem/odds (ticket 0081)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('cheatsheet-pot-odds')).toBeTruthy()
    // The half-pot row's required equity must equal potOdds for that bet — never a hand-typed literal.
    const halfPotExpected = `${Math.round(potOdds(0.5, 1.5) * 100)}%` // 25%
    const row = screen.getByTestId('peg-0.500')
    expect(row.textContent).toContain('Half pot')
    expect(row.textContent).toContain(halfPotExpected)
    // The pot-sized row reads 33% (potOdds(1, 2)).
    expect(screen.getByTestId('peg-1.000').textContent).toContain(
      `${Math.round(potOdds(1, 2) * 100)}%`,
    )
  })

  it('renders the rule-of-2-and-4 table with values DERIVED from outsToEquity (ticket 0081)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('cheatsheet-outs')).toBeTruthy()
    // A 9-out flush draw: flop ×4 / turn ×2, both straight from outsToEquity — never typed.
    const flush = screen.getByTestId('outs-9')
    expect(flush.textContent).toContain(`${Math.round(outsToEquity(9, 2) * 100)}%`) // 36%
    expect(flush.textContent).toContain(`${Math.round(outsToEquity(9, 1) * 100)}%`) // 18%
  })

  it('highlights the row when opened on a focusTerm (deep-link from a chart explanation)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} focusTerm="dominated" />)
    const row = screen.getByTestId('glossary-body').querySelector('[data-term-id="dominated"]')
    expect(row?.className).toContain('is-focused')
    expect(row?.getAttribute('aria-current')).toBe('true')
  })
})
