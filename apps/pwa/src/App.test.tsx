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

import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { callingStation, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { App, DEFAULT_RUNOUT_STREET_MS } from './App.js'
import { InMemoryLiveSessionStore } from './session/store.js'

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
    render(
      <App
        initial={{ seats: 2 }}
        decks={[deck]}
        makeBot={() => opponent}
        botDelayMs={0}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    expect(screen.getByTestId('setup')).toBeTruthy()
    expect(screen.getByTestId('seat-count').textContent).toBe('2')

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // The table is live: the hero seat is face-up and shows the hero's stack.
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
    render(
      <App
        initial={{ seats: 2 }}
        decks={[deck]}
        makeBot={() => opponent}
        botDelayMs={0}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

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
        revealDelayMs={0}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // Hero shoves (all-in size), then calls down the rest; the station calls off and busts. Once the
    // session ends we land on the final-hand review ("View summary") which we dismiss to the summary.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByTestId('summary')) break
      const viewSummary = screen.queryByRole('button', { name: /View summary/ })
      const allIn = screen.queryByRole('button', { name: 'all-in' })
      const raise = screen.queryByRole('button', { name: /^Raise to/ })
      const call = screen.queryByRole('button', { name: /^Call/ })
      const check = screen.queryByRole('button', { name: /^Check$/ })
      if (viewSummary) {
        await act(async () => viewSummary.click())
      } else if (allIn && raise) {
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

  it('shows the busted-out final hand (showdown) before the summary', async () => {
    // The reported bug: when the HERO busts, jump straight to the summary and the final hand is
    // never seen. Hero shoves 7-2 into the station's AA and loses; we must land on the final-hand
    // review — the showdown result-banner visible, the summary NOT yet shown — until we dismiss it.
    const makeBot = (): Opponent => callingStation
    const deck = buildDeck(2, 0, ['7h 2c', 'As Ad'], 'Ah Kd 9s 4c 3d')
    render(
      <App
        initial={{ seats: 2, opponents: ['station'] }}
        decks={[deck]}
        makeBot={makeBot}
        botDelayMs={0}
        revealDelayMs={0}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })

    // Drive the hero all-in; the station calls off; the board runs out and the hero busts.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByRole('button', { name: /View summary/ })) break
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

    // The final hand is still on the table: the showdown banner is visible and the summary is NOT.
    // `findBy` (not `getBy`) so the all-in runout's `revealDelayMs={0}` timers flush — the loop above
    // breaks the moment the session-over CTA appears, which can precede the runout's final reveal.
    expect(await screen.findByTestId('result-banner')).toBeTruthy()
    expect(screen.queryByTestId('summary')).toBeNull()

    // Dismissing the review reveals the summary, with the hero shown busted.
    await act(async () => {
      screen.getByRole('button', { name: /View summary/ }).click()
    })
    await waitFor(() => expect(screen.getByTestId('summary')).toBeTruthy())
    const standings = within(screen.getByTestId('standings'))
    expect(standings.getByText('BUSTED')).toBeTruthy()
  })
})

describe('App — all-in runout reveal (ticket 0093)', () => {
  // The board is rendered inside the felt's `data-testid="board"`; count the face-up `card` testids
  // there (seat cards live elsewhere) to read how many community cards are currently revealed.
  function boardCardCount(): number {
    return within(screen.getByTestId('board')).queryAllByTestId('card').length
  }

  // A bot that always continues cheaply (check, else call) — lets the hero's shove get called so the
  // engine settles every remaining street in one `apply-action`.
  function passiveBot(): Opponent {
    return {
      decide: (ctx) => (ctx.legalActions.check ? { type: 'check' } : { type: 'call' }),
    }
  }

  // Advance a single bot turn under fake timers: fire the bot effect's `setTimeout`, then flush the
  // microtask its `Promise.resolve(decide).then(dispatch)` resolves in.
  async function stepBots(): Promise<void> {
    await act(async () => {
      vi.advanceTimersByTime(0)
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('reveals the board street by street and withholds the banner until the river', async () => {
    vi.useFakeTimers()
    try {
      // Heads-up, button (= SB) on the hero. Hero shoves preflop; the passive bot (BB) calls all-in,
      // so the engine deals flop+turn+river and finalizes at showdown in one step — the runout case.
      const deck = buildDeck(2, 0, ['As Ad', 'Kd Kc'], '2c 3d 4h 7s 9h')
      render(
        <App
          initial={{ seats: 2 }}
          decks={[deck]}
          makeBot={passiveBot}
          botDelayMs={0}
          revealDelayMs={DEFAULT_RUNOUT_STREET_MS}
          sessionStore={new InMemoryLiveSessionStore()}
        />,
      )

      await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())
      // Hero shoves all-in preflop.
      await act(async () => screen.getByRole('button', { name: 'all-in' }).click())
      await act(async () => screen.getByRole('button', { name: /^Raise to/ }).click())
      // Bot calls all-in → the engine settles the whole runout; the reveal takes over.
      await stepBots()

      // Immediately after completion: still pre-runout (preflop = empty board), and NO result banner.
      expect(boardCardCount()).toBe(0)
      expect(screen.queryByTestId('result-banner')).toBeNull()

      // Tick 1 → the flop appears as one beat of three cards. Still no banner.
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(3)
      expect(screen.queryByTestId('result-banner')).toBeNull()

      // Tick 2 → the turn (4th card). Still no banner.
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(4)
      expect(screen.queryByTestId('result-banner')).toBeNull()

      // Tick 3 → the river (5th card). The full board is shown but the banner is STILL withheld for
      // one final beat (the result must land last).
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(5)
      expect(screen.queryByTestId('result-banner')).toBeNull()

      // Final hold → the runout ends and the result banner appears, last of all.
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(5)
      expect(screen.getByTestId('result-banner')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('triggers correctly under StrictMode (render-phase trigger fires once, no banner flash)', async () => {
    // The production app mounts inside <StrictMode> (main.tsx), which double-invokes the render body —
    // and the runout trigger runs DURING render, mutating refs + calling setState. This pins that the
    // double-invoke neither double-fires the runout, captures a stale `prevBoardLen`, nor flashes the
    // full board/banner before the reveal takes over.
    vi.useFakeTimers()
    try {
      const deck = buildDeck(2, 0, ['As Ad', 'Kd Kc'], '2c 3d 4h 7s 9h')
      render(
        <StrictMode>
          <App
            initial={{ seats: 2 }}
            decks={[deck]}
            makeBot={passiveBot}
            botDelayMs={0}
            revealDelayMs={DEFAULT_RUNOUT_STREET_MS}
            sessionStore={new InMemoryLiveSessionStore()}
          />
        </StrictMode>,
      )

      await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())
      await act(async () => screen.getByRole('button', { name: 'all-in' }).click())
      await act(async () => screen.getByRole('button', { name: /^Raise to/ }).click())
      await stepBots()

      // The completing render withholds the board + banner (no full-board/banner flash under the
      // double-invoke), and the reveal then walks the board up to the river before the banner lands.
      expect(boardCardCount()).toBe(0)
      expect(screen.queryByTestId('result-banner')).toBeNull()

      // Step one beat at a time (each `act` flushes the re-render that schedules the next timer):
      // flop → turn → river → final hold. The banner then appears exactly once, last.
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(3)
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(4)
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(boardCardCount()).toBe(5)
      expect(screen.queryByTestId('result-banner')).toBeNull()
      await act(async () => vi.advanceTimersByTime(DEFAULT_RUNOUT_STREET_MS))
      expect(screen.getAllByTestId('result-banner')).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not pace a normal river showdown (board already current → banner shows immediately)', async () => {
    vi.useFakeTimers()
    try {
      // Heads-up checked down street by street to a river showdown: the board was revealed through
      // live betting, so the completing transition deals NO new cards — not a runout, not paced.
      const deck = buildDeck(2, 0, ['As Ad', 'Kd Kc'], '2c 3d 4h 7s 9h')
      render(
        <App
          initial={{ seats: 2 }}
          decks={[deck]}
          makeBot={passiveBot}
          botDelayMs={0}
          revealDelayMs={DEFAULT_RUNOUT_STREET_MS}
          sessionStore={new InMemoryLiveSessionStore()}
        />,
      )

      await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())
      // Drive the hero passively (check/call) to showdown, stepping bot turns under fake timers.
      for (let i = 0; i < 30; i++) {
        await stepBots()
        if (screen.queryByRole('button', { name: /Deal next hand/ })) break
        const call = screen.queryByRole('button', { name: /^Call/ })
        const check = screen.queryByRole('button', { name: /^Check$/ })
        if (call) await act(async () => call.click())
        else if (check) await act(async () => check.click())
      }

      // Reached showdown the normal way: the full board AND the banner are up with no reveal ticks.
      expect(boardCardCount()).toBe(5)
      expect(screen.getByTestId('result-banner')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not pace a fold (no board run-out → banner shows immediately)', async () => {
    vi.useFakeTimers()
    try {
      // Heads-up where the bot 3bets and the hero folds preflop: the hand ends on a fold with no new
      // board cards — never a runout.
      const deck = buildDeck(2, 0, ['7h 2c', 'As Ad'], '2c 3d 4h 7s 9h')
      const bot: Opponent = { decide: () => ({ type: 'raise', amount: 50 }) }
      render(
        <App
          initial={{ seats: 2 }}
          decks={[deck]}
          makeBot={() => bot}
          botDelayMs={0}
          revealDelayMs={DEFAULT_RUNOUT_STREET_MS}
          sessionStore={new InMemoryLiveSessionStore()}
        />,
      )

      await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())
      // Hero (SB) just calls; bot (BB) raises to 50; hero folds → fold completion, no run-out.
      await act(async () => screen.getByRole('button', { name: /^Call/ }).click())
      await stepBots()
      await act(async () => screen.getByRole('button', { name: /^Fold$/ }).click())

      // Fold-win banner is up immediately (no reveal ticks); the board never ran out (0 cards).
      expect(boardCardCount()).toBe(0)
      expect(screen.getByTestId('result-banner')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('exports the cadence as a named constant (tunable, ~readable beat)', () => {
    expect(DEFAULT_RUNOUT_STREET_MS).toBeGreaterThanOrEqual(650)
    expect(DEFAULT_RUNOUT_STREET_MS).toBeLessThanOrEqual(750)
  })
})
