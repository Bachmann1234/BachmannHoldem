// @vitest-environment jsdom
/**
 * ChartOverlay component test (ticket 0050): the starting-hand chart modal renders the full 13×13
 * grid from the pure `@holdem/coach` enumerator, a five-tier legend, and dismisses via the close
 * button, the scrim, and Escape (the CoachDrawer a11y bar). Presentational — no engine state.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChartOverlay } from './ChartOverlay.js'

afterEach(cleanup)

describe('ChartOverlay', () => {
  it('renders the full 13×13 grid (169 cells) and a five-tier legend', () => {
    render(<ChartOverlay onClose={vi.fn()} />)
    expect(screen.getByTestId('chart-grid').children).toHaveLength(169)
    expect(screen.getByTestId('chart-legend').children).toHaveLength(5)
  })

  it('labels and colours the corners from the live coach classifier', () => {
    render(<ChartOverlay onClose={vi.fn()} />)
    // AA is the top-left cell and the strongest tier; 72o is trash.
    const aa = screen.getByTitle(/^AA —/)
    expect(aa.className).toContain('tier-premium')
    expect(aa.textContent).toBe('AA')
    expect(screen.getByTitle(/^72o —/).className).toContain('tier-trash')
  })

  it('closes via the close button, the scrim, and Escape', () => {
    const onClose = vi.fn()
    render(<ChartOverlay onClose={onClose} />)
    fireEvent.click(screen.getByTestId('chart-close'))
    fireEvent.click(screen.getByTestId('chart-scrim'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
