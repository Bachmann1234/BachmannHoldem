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
})
