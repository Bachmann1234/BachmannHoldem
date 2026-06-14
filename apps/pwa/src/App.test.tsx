// @vitest-environment jsdom
/**
 * Component test (ticket 0033) — proves the model→DOM wiring under test: rendering `<App/>` deals a
 * hand through the shared reducer and the resulting state shows up in the DOM. The repo's vitest
 * defaults to the `node` environment, so this file opts into `jsdom` via the docblock above (the
 * node/Ink tests keep their default).
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App.js'

describe('App', () => {
  it('deals a hand on mount and renders its state read-only', () => {
    render(<App />)

    // The mount effect dispatched `start-hand`, so the reducer advanced setup → playing.
    expect(screen.getByTestId('phase').textContent).toBe('playing')
    expect(screen.getByTestId('hand-number').textContent).toBe('1')

    // The hero's two hole cards are dealt and rendered as text (e.g. "As Kd").
    const heroCards = screen.getByTestId('hero-cards').textContent ?? ''
    expect(heroCards.trim().split(/\s+/)).toHaveLength(2)
  })
})
