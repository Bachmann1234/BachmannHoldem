// @vitest-environment jsdom
/**
 * RulesOverlay component test: the poker-rules reference renders its four topics, sources the
 * hand-ranking names from the engine's `HAND_CATEGORY_NAMES` (so they cannot drift from how showdowns
 * are decided), shows the full ten-rung ladder, and dismisses via the close button, the scrim, and
 * Escape (the shared overlay a11y bar). Presentational reference — no graded spots, no state.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HAND_CATEGORY_NAMES } from '@holdem/engine'
import { RulesOverlay } from './RulesOverlay.js'

afterEach(cleanup)

describe('RulesOverlay', () => {
  it('renders the dialog with the four rules topics', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    const dialog = screen.getByTestId('rules-modal')
    expect(dialog.getAttribute('role')).toBe('dialog')
    for (const title of [
      'Hand rankings',
      'How a hand plays out',
      'Blinds and position',
      'Making your hand and showdown',
    ]) {
      expect(screen.getByText(title)).toBeTruthy()
    }
  })

  it('sources the ranking names from the engine evaluator (cannot drift from showdowns)', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    const body = screen.getByTestId('rules-body')
    // Every engine category name appears verbatim, plus the Royal Flush special case at the top.
    for (const name of HAND_CATEGORY_NAMES) {
      expect(body.textContent).toContain(name)
    }
    expect(body.textContent).toContain('Royal Flush')
  })

  it('shows the full ten-rung ladder, strongest first', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('rank-0').textContent).toContain('Royal Flush')
    // Ten rungs: indices 0..9 exist, 10 does not.
    expect(screen.getByTestId('rank-9')).toBeTruthy()
    expect(screen.queryByTestId('rank-10')).toBeNull()
  })

  it('explains how a hand plays out, street by street', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    const body = screen.getByTestId('rules-body')
    for (const street of ['Preflop', 'Flop', 'Turn', 'River', 'Showdown']) {
      expect(body.textContent).toContain(street)
    }
  })

  it('explains the blinds and the position tags', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    const body = screen.getByTestId('rules-body')
    for (const tag of ['BTN', 'SB', 'BB']) {
      expect(body.textContent).toContain(tag)
    }
  })

  it('offers a jump tab per topic', () => {
    render(<RulesOverlay onClose={vi.fn()} />)
    for (const id of ['rankings', 'flow', 'position', 'showdown']) {
      expect(screen.getByTestId(`rules-tab-${id}`)).toBeTruthy()
    }
  })

  it('closes via the close button, the scrim, and Escape', () => {
    const onClose = vi.fn()
    render(<RulesOverlay onClose={onClose} />)
    fireEvent.click(screen.getByTestId('rules-close'))
    fireEvent.click(screen.getByTestId('rules-scrim'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
