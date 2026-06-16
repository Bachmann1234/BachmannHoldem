// @vitest-environment jsdom
/**
 * The setup-screen stack-depth control + the mid-game save/resume seam wired into the live {@link App}.
 *
 * Three behaviours: (1) the stack-depth presets toggle the chosen depth on the setup screen; (2) a
 * saved live game silently auto-resumes the exact hand on next launch (no setup screen); (3) ending a
 * session (the "End session" quit) clears the save, so the next launch is a fresh setup. An injected
 * {@link InMemoryLiveSessionStore} stands in for the real `localStorage` store (deterministic, no real
 * storage), and a seeded snapshot simulates "the hero reopened the app mid-game".
 */

import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeDeck } from '@holdem/engine'
import { createInitialModel, reducer, type Model } from '@holdem/session'
import { heuristicOpponent, TIGHT_AGGRESSIVE } from '@holdem/bots'
import { App } from './App.js'
import { InMemoryLiveSessionStore, type LiveSessionSnapshot } from './session/store.js'

afterEach(cleanup)

/** A heads-up model dealt from a fresh setup (the hero, on the button, is first to act preflop). */
function dealtModel(): Model {
  return reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck: makeDeck() })
}

describe('App — stack-depth presets', () => {
  it('defaults to 100bb and lets the hero pick a shallower depth', async () => {
    render(
      <App initial={{ seats: 2 }} botDelayMs={0} sessionStore={new InMemoryLiveSessionStore()} />,
    )

    // The deep default is selected; the shallow presets are not.
    expect(screen.getByTestId('stack-100').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('stack-25').getAttribute('aria-pressed')).toBe('false')

    await act(async () => screen.getByTestId('stack-25').click())

    // The selection moves to 25bb; 100bb is no longer pressed.
    expect(screen.getByTestId('stack-25').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('stack-100').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('App — mid-game save/resume', () => {
  it('saves the live game once a hand is dealt', async () => {
    const store = new InMemoryLiveSessionStore()
    render(<App initial={{ seats: 2 }} botDelayMs={0} sessionStore={store} />)

    expect(store.load()).toBeNull() // nothing saved on the setup screen
    await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())

    expect(store.load()?.model.phase).toBe('playing') // the live hand is now persisted
  })

  it('silently auto-resumes a saved hand instead of showing setup', () => {
    const snapshot: LiveSessionSnapshot = { model: dealtModel(), decisions: [] }
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 1)
    render(
      <App
        botDelayMs={0}
        makeBot={() => opponent}
        sessionStore={new InMemoryLiveSessionStore(snapshot)}
      />,
    )

    // Straight into the live hand — the setup screen is skipped, the felt + action bar are up.
    expect(screen.queryByTestId('setup')).toBeNull()
    expect(screen.getByTestId('actionbar')).toBeTruthy()
    expect(within(screen.getByTestId('seat-0')).getByText('You')).toBeTruthy()
  })

  it('clears the save when the hero ends the session (quit), so the next launch is fresh', async () => {
    // Seed a between-hands snapshot (hero folded heads-up; the hand is complete, the session is not).
    const handOver = reducer(dealtModel(), { type: 'apply-action', action: { type: 'fold' } })
    expect(handOver.phase).toBe('hand-over')
    const store = new InMemoryLiveSessionStore({ model: handOver, decisions: [] })
    render(<App botDelayMs={0} sessionStore={store} />)

    // We resumed between hands; "End session" opens the quit-confirm (ticket 0082), and confirming
    // quits to the summary and discards the save.
    await act(async () => screen.getByRole('button', { name: /End session/ }).click())
    await act(async () => screen.getByTestId('quit-confirm-end').click())

    expect(screen.getByTestId('summary')).toBeTruthy()
    expect(store.load()).toBeNull()
  })
})
