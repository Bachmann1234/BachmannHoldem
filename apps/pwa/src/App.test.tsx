// @vitest-environment jsdom
/**
 * The end-to-end session component test (ticket 0035) — the DOM analog of the TUI's `Root.test`.
 * Mounts the live {@link App}, drives it from the setup screen through a scripted hand to completion,
 * and asserts the session behaves: the table + action bar render, the hero acts, the bots act (one
 * decision per state), and the hand reaches `'hand-over'` / `'game-over'` with a summary/standings.
 *
 * Determinism: injected `decks` (one per hand) + fixed-seed bots via `makeBot`, and `botDelayMs={0}`
 * so bot turns run promptly and never depend on the wall clock. Bot turns resolve in a microtask
 * after each render, so we `await` (via findBy / act flushes) between hero actions.
 */

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { callingStation, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { App } from './App.js'

afterEach(cleanup)

/** Build a deck dealing exactly the given hole cards + board (mirrors the engine/Root test helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Flush pending microtasks (the bot-turn effect dispatches in a `Promise.resolve().then`). */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('App — setup → deal', () => {
  it('opens on the setup screen and deals the first hand on the CTA', async () => {
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 1)
    render(<App initial={{ seats: 2 }} decks={[deck]} makeBot={() => opponent} botDelayMs={0} />)

    expect(screen.getByTestId('setup')).toBeTruthy()
    expect(screen.getByTestId('seat-count').textContent).toBe('2')

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // The table is live: the hero bank + the hero seat face-up.
    expect(screen.getByTestId('bank').textContent).toContain('BANK')
    const hero = within(screen.getByTestId('seat-0'))
    expect(hero.getByText('You')).toBeTruthy()
  })
})

describe('App — scripted session', () => {
  it('plays a hand to completion: hero checks/calls down, bots act, reaches hand-over', async () => {
    // Heads-up, button on the hero. Hero passively checks/calls; a fixed-seed TAG keeps it
    // reproducible. We drive until the action bar offers "Deal next hand" (hand-over).
    const deck = buildDeck(2, 0, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    render(<App initial={{ seats: 2 }} decks={[deck]} makeBot={() => opponent} botDelayMs={0} />)

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // Drive the hero passively: the cheapest legal continue (call if facing a bet, else check),
    // flushing bot turns between actions, until the play-again CTA appears.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByRole('button', { name: /Deal next hand/ })) break
      const call = screen.queryByRole('button', { name: /^Call/ })
      const check = screen.queryByRole('button', { name: /^Check$/ })
      if (call) {
        await act(async () => call.click())
      } else if (check) {
        await act(async () => check.click())
      }
    }

    expect(screen.getByRole('button', { name: /Deal next hand/ })).toBeTruthy()
  })

  it('busts the opponent and ends the session with a one-survivor summary', async () => {
    // Heads-up: hero AA shoves, a calling station calls off its stack, the board bricks → the bot
    // busts and the session ends game-over with the station shown busted in the standings.
    const makeBot = (): Opponent => callingStation
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 5d')
    render(
      <App
        initial={{ seats: 2, opponents: ['station'] }}
        decks={[deck]}
        makeBot={makeBot}
        botDelayMs={0}
      />,
    )

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // Hero shoves (all-in size), then calls down the rest; the station calls off and busts.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByTestId('summary')) break
      const allIn = screen.queryByRole('button', { name: 'all-in' })
      const raise = screen.queryByRole('button', { name: /^Raise to/ })
      const call = screen.queryByRole('button', { name: /^Call/ })
      const check = screen.queryByRole('button', { name: /^Check$/ })
      if (allIn && raise) {
        await act(async () => allIn.click())
        await act(async () => raise.click())
      } else if (call) {
        await act(async () => call.click())
      } else if (check) {
        await act(async () => check.click())
      }
    }

    await waitFor(() => expect(screen.getByTestId('summary')).toBeTruthy())
    expect(screen.getByText('You stacked the table. Nice.')).toBeTruthy()
    const standings = within(screen.getByTestId('standings'))
    expect(standings.getByText('BUSTED')).toBeTruthy()
  })
})
