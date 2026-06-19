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
import { parseCards, type Action, type Card } from '@holdem/engine'
import {
  callingStation,
  heuristicOpponent,
  TIGHT_AGGRESSIVE,
  type DecisionContext,
  type Opponent,
} from '@holdem/bots'
import { App } from './App.js'
import type { HandHistoryRecord, HandHistoryStore } from './history/index.js'
import { InMemoryLiveSessionStore } from './session/store.js'

afterEach(cleanup)

/**
 * A fully scripted opponent: pops the next action off a fixed queue each time it is asked to decide,
 * falling back to a passive check/call once the script is exhausted. Lets the facing-context tests pin
 * the EXACT betting the hero faces each street (open / 3bet) without depending on a heuristic's seed.
 */
function scriptedBot(actions: readonly Action[]): Opponent {
  let i = 0
  return {
    decide(ctx: DecisionContext): Action {
      const scripted = actions[i++]
      if (scripted !== undefined) return scripted
      // Exhausted: continue cheaply so the hand can run out without further scripting.
      return ctx.legalActions.check ? { type: 'check' } : { type: 'call' }
    },
  }
}

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

  it('captures the dealer buttonIndex, hero hole cards, and a session id on the record (schema v2/v3)', async () => {
    const store = new FakeStore()
    // Hand 1 always seats the button on the hero (the reducer opens every session at buttonId 0), so
    // the captured buttonIndex pins to seat 0 — enough, with heroSeat + seatCount, to derive position.
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
    expect(store.appended).toHaveLength(1)
    const rec = store.appended[0]!
    expect(rec.buttonIndex).toBe(0)
    expect(rec.schemaVersion).toBe(3)
    // Schema v3: the hero (seat 0) was dealt Ks Kd, and the record is stamped with a session id.
    expect(rec.holeCards).toEqual(parseCards('Ks Kd'))
    expect(typeof rec.sessionId).toBe('string')
    expect(rec.sessionId!.length).toBeGreaterThan(0)
  })

  it('captures per-decision facing context: unraised, facing an open, facing a 3bet (schema v2)', async () => {
    const store = new FakeStore()
    // Heads-up, button (= SB) on the hero (seat 0). Blinds 1/2. The bot 3bets preflop, then we run a
    // second hand to reach a clean unraised postflop spot — so across the two records we observe all
    // three facing shapes the M6 fold-to-3bet / position work needs.
    const decks = [
      // Hand 1: hero (SB) opens (the default min-raise to 4) → bot (BB) 3bets to 18 → hero folds.
      // Two preflop hero decisions.
      buildDeck(2, 0, ['Ah Kh', 'Qs Qd'], 'Kc 8d 3s 4c 2h'),
      // Hand 2: button rotates to seat 1; the bot (now SB/button) just calls, hero (BB) checks the
      // option, then both check the flop — giving an unraised (toCall 0, currentBet 0) hero decision.
      buildDeck(2, 1, ['Ah Kh', 'Qs Qd'], 'Kc 8d 3s 4c 2h'),
    ]
    // Hand 1 script: bot is BB and 3bets to 18; hand 2 script: bot is SB/button and limp-calls.
    const bot = scriptedBot([{ type: 'raise', amount: 18 }])
    render(
      <App
        initial={{ seats: 2 }}
        decks={decks}
        makeBot={() => bot}
        botDelayMs={0}
        historyStore={store}
        sessionStore={new InMemoryLiveSessionStore()}
      />,
    )

    // --- Hand 1: hero opens (min-raise to 4), faces the 3bet, folds ---
    await act(async () => screen.getByRole('button', { name: /Deal in/ }).click())
    await flush()
    // Hero (SB) is first to act preflop, facing the BB: open the pot (the default min-raise to 4).
    await act(async () => screen.getByRole('button', { name: /^Raise to/ }).click())
    // Bot 3bets to 18 (its script); wait for the hero to be back on turn facing it, then fold. Poll
    // (the bot's dispatch resolves in a delayed microtask) rather than assuming a fixed flush count.
    const fold = await screen.findByRole('button', { name: /^Fold$/ })
    await act(async () => fold.click())
    await flush()
    expect(screen.getByRole('button', { name: /Deal next hand/ })).toBeTruthy()

    expect(store.appended).toHaveLength(1)
    const hand1 = store.appended[0]!
    expect(hand1.decisions).toHaveLength(2)
    // Decision 0: facing the BB's 2 as the SB who has posted 1 → toCall 1 over a currentBet of 2.
    expect(hand1.decisions[0]!.action).toEqual({ type: 'raise', amount: 4 })
    expect(hand1.decisions[0]!.facing).toEqual({ toCall: 1, currentBet: 2 })
    // Decision 1: facing the 3bet to 18 having already put in 4 → toCall 14 over a currentBet of 18.
    expect(hand1.decisions[1]!.action).toEqual({ type: 'fold' })
    expect(hand1.decisions[1]!.facing).toEqual({ toCall: 14, currentBet: 18 })

    // --- Hand 2: reach an unraised hero decision (toCall 0, currentBet 0) ---
    await act(async () => screen.getByRole('button', { name: /Deal next hand/ }).click())
    // Drive the hero passively (check/call) until the next play-again CTA: every check the hero makes
    // facing no bet is an unraised decision we can assert on from the record.
    for (let i = 0; i < 40; i++) {
      await flush()
      if (screen.queryByRole('button', { name: /Deal next hand/ })) break
      const check = screen.queryByRole('button', { name: /^Check$/ })
      const call = screen.queryByRole('button', { name: /^Call/ })
      if (check) await act(async () => check.click())
      else if (call) await act(async () => call.click())
    }

    expect(store.appended).toHaveLength(2)
    const hand2 = store.appended[1]!
    // At least one hero decision in hand 2 was made facing no bet — an unraised spot.
    const unraised = hand2.decisions.find((d) => d.facing?.currentBet === 0)
    expect(unraised).toBeDefined()
    expect(unraised!.facing).toEqual({ toCall: 0, currentBet: 0 })
    // Every captured decision carries plain-number facing (round-trips through save/resume as data).
    for (const d of hand2.decisions) {
      expect(typeof d.facing?.toCall).toBe('number')
      expect(typeof d.facing?.currentBet).toBe('number')
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
    // Schema v3: both hands of the one sitting share a single session id (grouping the export).
    const sessionIds = store.appended.map((r) => r.sessionId)
    expect(sessionIds[0]).toBeTruthy()
    expect(new Set(sessionIds).size).toBe(1)
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
        revealDelayMs={0}
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
