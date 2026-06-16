// @vitest-environment jsdom
/**
 * The hand-history recording seam (ticket 0037) wired into the live {@link App}: it appends exactly
 * one record per completed hand (guarded against the classic effect double-write + the React 19
 * StrictMode double-invoke), captures the hero's decisions, and degrades gracefully when the store
 * rejects. Drives the real session with injected decks + fixed-seed bots (deterministic, no clock).
 */

import { StrictMode } from 'react'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { callingStation, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { App } from './App.js'
import type { HandHistoryRecord, HandHistoryStore } from './history/index.js'
import { InMemoryLiveSessionStore } from './session/store.js'

afterEach(cleanup)

/** Build a deck dealing exactly the given hole cards + board (mirrors App.test's helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Flush pending microtasks (bot turns + the record effect's append promise). */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** An in-memory fake store recording appends; optionally rejecting them. */
class FakeStore implements HandHistoryStore {
  readonly appended: HandHistoryRecord[] = []
  constructor(private readonly rejectAppend = false) {}
  append(record: HandHistoryRecord): Promise<void> {
    if (this.rejectAppend) return Promise.reject(new Error('boom'))
    this.appended.push(record)
    return Promise.resolve()
  }
  list(): Promise<HandHistoryRecord[]> {
    return Promise.resolve([...this.appended].reverse())
  }
  recent(n: number): Promise<HandHistoryRecord[]> {
    return Promise.resolve([...this.appended].reverse().slice(0, n))
  }
}

/** Play one heads-up hand to hand-over by the hero passively checking/calling. */
async function playOneHandToOver(): Promise<void> {
  await act(async () => {
    screen.getByRole('button', { name: /Deal in/ }).click()
  })
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
}

describe('App — hand-history recording seam', () => {
  it('appends exactly one record per completed hand (and captures hero decisions)', async () => {
    const store = new FakeStore()
    const deck = buildDeck(2, 0, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    render(
      <App
        initial={{ seats: 2 }}
        decks={[deck]}
        makeBot={() => opponent}
        botDelayMs={0}
        historyStore={store}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    await playOneHandToOver()
    expect(screen.getByRole('button', { name: /Deal next hand/ })).toBeTruthy()

    // Exactly one record for the one completed hand.
    expect(store.appended).toHaveLength(1)
    const rec = store.appended[0]!
    expect(rec.handNumber).toBe(1)
    expect(rec.seatCount).toBe(2)
    expect(rec.outcome.endReason).toBeTruthy()
    // The hero acted at least once and every captured decision is a real (non-blind) action.
    expect(rec.decisions.length).toBeGreaterThan(0)
    for (const d of rec.decisions) {
      expect(['fold', 'check', 'call', 'bet', 'raise']).toContain(d.action.type)
    }
  })

  it('does not double-write under StrictMode + re-renders', async () => {
    const store = new FakeStore()
    const deck = buildDeck(2, 0, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    render(
      <StrictMode>
        <App
          initial={{ seats: 2 }}
          decks={[deck]}
          makeBot={() => opponent}
          botDelayMs={0}
          historyStore={store}
          sessionStore={new InMemoryLiveSessionStore()}
        />
      </StrictMode>,
    )

    await playOneHandToOver()
    // Force extra renders after completion (open/close the history view) — still one record.
    await act(async () => screen.getByTestId('history-open').click())
    await flush()
    await act(async () => screen.getByTestId('history-close').click())
    await flush()

    expect(store.appended).toHaveLength(1)
  })

  it('records each of two consecutive hands exactly once', async () => {
    const store = new FakeStore()
    const decks = [
      buildDeck(2, 0, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d'),
      buildDeck(2, 1, ['Qs Qd', '7h 2c'], 'Qh 8d 3s 4c 2d'),
    ]
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    render(
      <App
        initial={{ seats: 2 }}
        decks={decks}
        makeBot={() => opponent}
        botDelayMs={0}
        historyStore={store}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    await playOneHandToOver()
    expect(store.appended).toHaveLength(1)

    // Deal the next hand and play it out.
    await act(async () => screen.getByRole('button', { name: /Deal next hand/ }).click())
    for (let i = 0; i < 40; i++) {
      await flush()
      if (
        screen.queryByRole('button', { name: /Deal next hand/ }) ||
        screen.queryByTestId('summary')
      ) {
        break
      }
      const call = screen.queryByRole('button', { name: /^Call/ })
      const check = screen.queryByRole('button', { name: /^Check$/ })
      if (call) await act(async () => call.click())
      else if (check) await act(async () => check.click())
    }

    expect(store.appended).toHaveLength(2)
    expect(store.appended.map((r) => r.handNumber)).toEqual([1, 2])
  })

  it('degrades gracefully when the store append rejects (play not blocked)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = new FakeStore(true) // every append rejects
    const deck = buildDeck(2, 0, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    render(
      <App
        initial={{ seats: 2 }}
        decks={[deck]}
        makeBot={() => opponent}
        botDelayMs={0}
        historyStore={store}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    // The hand still completes (no throw out of the seam) and the play-again CTA appears.
    await playOneHandToOver()
    expect(screen.getByRole('button', { name: /Deal next hand/ })).toBeTruthy()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('history view reads recorded hands back through the store (round-trip)', async () => {
    const makeBot = (): Opponent => callingStation
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 5d')
    const store = new FakeStore()
    render(
      <App
        initial={{ seats: 2, opponents: ['station'] }}
        decks={[deck]}
        makeBot={makeBot}
        botDelayMs={0}
        historyStore={store}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    await act(async () => {
      screen.getByRole('button', { name: /Deal in/ }).click()
    })
    // Hero shoves AA; station busts → final-hand review → "View summary" → game-over summary.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByTestId('summary')) break
      const viewSummary = screen.queryByRole('button', { name: /View summary/ })
      const allIn = screen.queryByRole('button', { name: 'all-in' })
      const raise = screen.queryByRole('button', { name: /^Raise to/ })
      const call = screen.queryByRole('button', { name: /^Call/ })
      const check = screen.queryByRole('button', { name: /^Check$/ })
      if (viewSummary) await act(async () => viewSummary.click())
      else if (allIn && raise) {
        await act(async () => allIn.click())
        await act(async () => raise.click())
      } else if (call) await act(async () => call.click())
      else if (check) await act(async () => check.click())
    }

    expect(store.appended.length).toBeGreaterThanOrEqual(1)
    await act(async () => screen.getByTestId('history-open').click())
    await flush()
    const view = within(screen.getByTestId('history-view'))
    // The list rendered as many rows as the store has records.
    expect(view.getByTestId('history-list')).toBeTruthy()
    expect(view.getAllByText(/-max/).length).toBe(store.appended.length)
  })
})
