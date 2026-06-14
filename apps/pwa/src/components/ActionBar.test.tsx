// @vitest-environment jsdom
/**
 * ActionBar component test (ticket 0035): proves the controls render the legal moves for the spot
 * and commit the correct engine {@link Action} — especially the bet/raise "to" amount within
 * `[min, max]` — and that illegal moves are never offered. Hands are built ONLY via the engine
 * (`createHand` + `legalActions`); we never fabricate `HandState`.
 */

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyAction,
  createHand,
  legalActions,
  makeDeck,
  type Action,
  type HandState,
} from '@holdem/engine'
import { ActionBar } from './ActionBar.js'

afterEach(cleanup)

/** A fresh heads-up hand (button on seat 0). Deck is the ordered makeDeck — fine, we never showdown. */
function freshHand(): HandState {
  return createHand({
    stacks: [200, 200],
    buttonIndex: 0,
    smallBlind: 1,
    bigBlind: 2,
    deck: makeDeck(),
  })
}

describe('ActionBar — facing-bet spot (preflop, SB to act)', () => {
  it('offers Fold, Call, and a Raise with a bet-size control; commits a legal raise-to', () => {
    const hand = freshHand()
    const seat = hand.toAct! // preflop, the SB (button heads-up) acts first
    const legal = legalActions(hand)
    expect(legal.call).not.toBeNull() // facing the BB
    expect(legal.raise).not.toBeNull()

    const onAction = vi.fn<(a: Action) => void>()
    render(
      <ActionBar
        hand={hand}
        legal={legal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={onAction}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Call/ })).toBeTruthy()
    // Facing a bet → no "Check" button.
    expect(screen.queryByRole('button', { name: /^Check$/ })).toBeNull()

    // The "all-in" quick button sets the slider to the legal max; committing raises to that total.
    act(() => screen.getByRole('button', { name: 'all-in' }).click())
    act(() => screen.getByRole('button', { name: /^Raise to/ }).click())

    expect(onAction).toHaveBeenCalledOnce()
    const action = onAction.mock.calls[0]![0]
    expect(action.type).toBe('raise')
    if (action.type === 'raise') {
      expect(action.amount).toBe(legal.raise!.max)
      expect(action.amount).toBeGreaterThanOrEqual(legal.raise!.min)
      expect(action.amount).toBeLessThanOrEqual(legal.raise!.max)
    }
  })

  it('commits a Call with no amount field', () => {
    const hand = freshHand()
    const seat = hand.toAct!
    const legal = legalActions(hand)
    const onAction = vi.fn<(a: Action) => void>()
    render(
      <ActionBar
        hand={hand}
        legal={legal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={onAction}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    screen.getByRole('button', { name: /^Call/ }).click()
    expect(onAction).toHaveBeenCalledWith({ type: 'call' })
  })
})

describe('ActionBar — check spot (postflop, no bet)', () => {
  it('offers Check (not Call) and a Bet; the min quick button is hidden when opening', () => {
    // Reach the flop with both players checked-through: SB calls, BB checks → flop, BB to act with
    // no bet to call → a check/bet spot.
    let hand = freshHand()
    hand = applyAction(hand, { type: 'call' }) // SB completes
    hand = applyAction(hand, { type: 'check' }) // BB checks → flop
    const seat = hand.toAct!
    const legal = legalActions(hand)
    expect(legal.check).toBe(true)
    expect(legal.call).toBeNull()
    expect(legal.bet).not.toBeNull()

    const onAction = vi.fn<(a: Action) => void>()
    render(
      <ActionBar
        hand={hand}
        legal={legal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={onAction}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /^Check$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Call/ })).toBeNull()
    // Opening the betting → no "min" quick button (that's a raise-only affordance), but ½/pot/all-in.
    expect(screen.queryByRole('button', { name: 'min' })).toBeNull()
    expect(screen.getByRole('button', { name: 'all-in' })).toBeTruthy()

    // A pot-sized bet commits within [min, max].
    act(() => screen.getByRole('button', { name: 'pot' }).click())
    act(() => screen.getByRole('button', { name: /^Bet/ }).click())
    const action = onAction.mock.calls[0]![0]
    expect(action.type).toBe('bet')
    if (action.type === 'bet') {
      expect(action.amount).toBeGreaterThanOrEqual(legal.bet!.min)
      expect(action.amount).toBeLessThanOrEqual(legal.bet!.max)
    }
  })
})

describe('ActionBar — non-hero / between-hands states', () => {
  it('shows a Waiting placeholder when it is not the hero turn', () => {
    const hand = freshHand()
    render(
      <ActionBar
        hand={hand}
        legal={null}
        heroSeat={hand.toAct!}
        isHeroTurn={false}
        handOver={false}
        onAction={() => {}}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    expect(screen.getByText('Waiting…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fold' })).toBeNull()
  })

  it('shows the Deal-next-hand + End-session CTAs between hands', () => {
    const hand = freshHand()
    const onNext = vi.fn()
    const onQuit = vi.fn()
    render(
      <ActionBar
        hand={hand}
        legal={null}
        heroSeat={hand.toAct!}
        isHeroTurn={false}
        handOver
        onAction={() => {}}
        onNext={onNext}
        onQuit={onQuit}
      />,
    )
    screen.getByRole('button', { name: /Deal next hand/ }).click()
    expect(onNext).toHaveBeenCalledOnce()
    screen.getByRole('button', { name: /End session/ }).click()
    expect(onQuit).toHaveBeenCalledOnce()
  })
})
