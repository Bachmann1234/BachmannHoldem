// @vitest-environment jsdom
/**
 * Table component tests (ticket 0034) — built from REAL engine hands (`createHand` + a fixed deck),
 * never hand-fabricated `HandState`. Covers:
 *  - the reveal invariant (the load-bearing one): an opponent's hole cards are face-DOWN before the
 *    hand completes and face-UP at showdown — a bug here leaks the bots' cards mid-hand;
 *  - N-seat rendering (heads-up and 6-max render through the same code);
 *  - the BTN/SB/BB position tags.
 */

import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyAction,
  createHand,
  isComplete,
  makeDeck,
  parseCards,
  type Card as EngineCard,
  type HandState,
} from '@holdem/engine'
import { Table } from './Table.js'

afterEach(cleanup)

/** A fresh ordered deck (the engine is deterministic — it just deals from the front). */
function freshDeck(): EngineCard[] {
  return makeDeck()
}

/**
 * Build a deck that deals exactly the given hole cards and board (mirrors the engine test's
 * helper): hole cards one at a time, two rounds, starting at the small blind.
 */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): EngineCard[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: EngineCard[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Render a table for the given hand with a trivial `Seat N`/`You` label provider. */
function renderTable(hand: HandState, heroSeat = 0) {
  return render(
    <Table
      hand={hand}
      heroSeat={heroSeat}
      handNumber={1}
      seatLabel={(seat) => (seat === heroSeat ? 'You' : `Seat ${seat}`)}
    />,
  )
}

describe('Table reveal invariant', () => {
  it('hides every opponent hole card before the hand completes', () => {
    const hand = createHand({
      stacks: [200, 200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    expect(isComplete(hand)).toBe(false)

    const { getByTestId } = renderTable(hand, 0)

    // Hero (seat 0) shows two FACE-UP cards.
    const hero = within(getByTestId('seat-0'))
    expect(hero.getAllByTestId('card')).toHaveLength(2)
    expect(hero.queryAllByTestId('card-back')).toHaveLength(0)

    // Every opponent shows two FACE-DOWN backs and zero face-up cards.
    for (const seat of [1, 2]) {
      const opp = within(getByTestId(`seat-${seat}`))
      expect(opp.getAllByTestId('card-back')).toHaveLength(2)
      expect(opp.queryAllByTestId('card')).toHaveLength(0)
    }
  })

  it("reveals the opponent's cards at showdown", () => {
    // Heads-up, then check it down to a river showdown so the hand completes via showdown.
    let hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    // Play passively (call/check) until the hand is complete.
    let guard = 0
    while (!isComplete(hand) && guard++ < 50) {
      const next = applyAction(
        hand,
        hand.currentBet - hand.players[hand.toAct!]!.committed > 0
          ? { type: 'call' }
          : { type: 'check' },
      )
      hand = next
    }
    expect(isComplete(hand)).toBe(true)
    expect(hand.endReason).toBe('showdown')

    const { getByTestId } = renderTable(hand, 0)
    // The opponent (seat 1) is now face-up: two cards, no backs.
    const opp = within(getByTestId('seat-1'))
    expect(opp.getAllByTestId('card')).toHaveLength(2)
    expect(opp.queryAllByTestId('card-back')).toHaveLength(0)
    // The result banner is shown.
    expect(getByTestId('result-banner')).toBeTruthy()
  })
})

describe('Table N-seat rendering', () => {
  it('renders 2 seats for a heads-up hand', () => {
    const hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    const { getByTestId, queryByTestId } = renderTable(hand)
    expect(getByTestId('seat-0')).toBeTruthy()
    expect(getByTestId('seat-1')).toBeTruthy()
    expect(queryByTestId('seat-2')).toBeNull()
  })

  it('renders 6 seats for a 6-max hand', () => {
    const hand = createHand({
      stacks: [200, 200, 200, 200, 200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    const { getByTestId } = renderTable(hand)
    for (let seat = 0; seat < 6; seat++) {
      expect(getByTestId(`seat-${seat}`)).toBeTruthy()
    }
  })
})

describe('Table position tags', () => {
  it('shows BTN/SB/BB tags derived from the button index (3+ handed)', () => {
    const hand = createHand({
      stacks: [200, 200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    const { getByTestId } = renderTable(hand)
    // 3-handed: button = seat 0 → BTN; SB = seat 1; BB = seat 2.
    expect(within(getByTestId('seat-0')).getByText('BTN')).toBeTruthy()
    expect(within(getByTestId('seat-1')).getByText('SB')).toBeTruthy()
    expect(within(getByTestId('seat-2')).getByText('BB')).toBeTruthy()
  })

  it('tags the heads-up button BTN and the other seat BB', () => {
    const hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: freshDeck(),
    })
    const { getByTestId } = renderTable(hand)
    // Heads-up: the button (seat 0) is also the SB; we surface the conventional BTN tag for it,
    // and the other seat is the BB.
    expect(within(getByTestId('seat-0')).getByText('BTN')).toBeTruthy()
    expect(within(getByTestId('seat-1')).getByText('BB')).toBeTruthy()
  })
})

describe('Table winner highlight (BUG-0002)', () => {
  it('rings only the actual winner when the loser had an uncalled overbet returned', () => {
    // Hero (seat 0) shoves 100 over a 30-chip short stack; the short stack calls all-in and
    // wins with trip aces. The uncalled 70 is returned to the hero, so hero's payout is > 0 —
    // but hero is NOT a winner and must not be ringed green (the bug ringed both seats).
    const deck = buildDeck(2, 0, ['2c 7d', 'As Ad'], 'Ah Kd Qc Js 9h')
    let hand = createHand({ stacks: [100, 30], buttonIndex: 0, smallBlind: 1, bigBlind: 2, deck })
    hand = applyAction(hand, { type: 'raise', amount: 100 }) // hero shoves
    hand = applyAction(hand, { type: 'call' }) // short stack calls all-in for 30
    expect(isComplete(hand)).toBe(true)

    const { getByTestId } = renderTable(hand, 0)
    // Only seat 1's cards carry the winning highlight; hero's (seat 0) do not.
    expect(getByTestId('seat-1').querySelectorAll('.winning')).toHaveLength(2)
    expect(getByTestId('seat-0').querySelectorAll('.winning')).toHaveLength(0)
  })
})
