// @vitest-environment jsdom
/**
 * GlossaryOverlay component test: the poker-shorthand reference renders its decoded sections, keeps
 * its hand-class meanings in lock-step with `@holdem/coach`'s `describeHandClass`, and dismisses via
 * the close button, the scrim, and Escape (the shared overlay a11y bar). Presentational — no state.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeHandClass } from '@holdem/coach'
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

  it('defines the draw and board terms the lessons assume (flush draw, overcard, …)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByText('Draws and the board')).toBeTruthy()
    const body = screen.getByTestId('glossary-body')
    for (const term of [
      'Made hand',
      'Flush draw',
      'Gutshot',
      'Open-ended',
      'Overcard',
      'Top pair',
      'Overpair',
      'Underpair',
    ]) {
      expect(body.textContent).toContain(term)
    }
  })

  it('no longer asserts trash "makes no money" (no false universal, ticket 0056)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('glossary-body').textContent).not.toMatch(/makes no money/i)
  })

  it('highlights the row when opened on a focusTerm (deep-link from a chart explanation)', () => {
    render(<GlossaryOverlay onClose={vi.fn()} focusTerm="dominated" />)
    const row = screen.getByTestId('glossary-body').querySelector('[data-term-id="dominated"]')
    expect(row?.className).toContain('is-focused')
    expect(row?.getAttribute('aria-current')).toBe('true')
  })
})
