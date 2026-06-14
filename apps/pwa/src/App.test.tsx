// @vitest-environment jsdom
/**
 * App component test (ticket 0034) — proves the model→table wiring: rendering `<App/>` deals a hand
 * through the shared reducer on mount and renders it as the real `<Table>` (the hero's seat shows
 * face-up cards; opponents are concealed). The repo's vitest defaults to the `node` environment, so
 * this file opts into `jsdom` via the docblock above.
 */

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from './App.js'

afterEach(cleanup)

describe('App', () => {
  it('deals a hand on mount and renders it as a table with the hero face-up', () => {
    render(<App />)

    // The mount effect dispatched `start-hand`: a live hand renders the top bar + hero seat.
    expect(screen.getByTestId('bank').textContent).toContain('BANK')

    const hero = within(screen.getByTestId('seat-0'))
    expect(hero.getAllByTestId('card')).toHaveLength(2)
    // The hero is labelled "You".
    expect(hero.getByText('You')).toBeTruthy()
  })

  it('conceals at least one opponent (six-max default) before the hand completes', () => {
    render(<App />)
    // Default setup is 6-max, so seat 1 exists and is face-down pre-showdown.
    const opp = within(screen.getByTestId('seat-1'))
    expect(opp.getAllByTestId('card-back')).toHaveLength(2)
    expect(opp.queryAllByTestId('card')).toHaveLength(0)
  })
})
