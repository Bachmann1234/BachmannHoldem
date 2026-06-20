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
import { decisionContext } from '@holdem/bots'
import { recommendedBand } from '@holdem/coach'
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

describe('ActionBar — bet-size clamp (ticket 0041)', () => {
  it('clamps a stale bet-to down into the legal range when the raise max shrinks', () => {
    // A deep hero whose raise can go all the way to 200.
    const wide = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: makeDeck(),
    })
    const seat = wide.toAct! // SB (heads-up button) acts first preflop
    const wideLegal = legalActions(wide)

    const onAction = vi.fn<(a: Action) => void>()
    const { rerender } = render(
      <ActionBar
        hand={wide}
        legal={wideLegal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={onAction}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    // Push the slider all the way to the wide max (200).
    act(() => screen.getByRole('button', { name: 'all-in' }).click())
    const betTo = () => Number(screen.getByTestId('bet-to').textContent!.trim().split(/\s+/)[0])
    expect(betTo()).toBe(wideLegal.raise!.max)

    // The same decision point (preflop, same seat to act, same 2-chip bet to match) but a shorter
    // hero stack → the legal raise max drops to 50. The reseed effect keys on
    // (isHeroTurn, street, toAct, currentBet) — all unchanged — so it does NOT re-fire, leaving
    // `betTo` stale at 200, above the new max. The render-time clamp must rescue it.
    const short = createHand({
      stacks: [50, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: makeDeck(),
    })
    const shortLegal = legalActions(short)
    expect(shortLegal.raise!.max).toBe(50)
    expect(shortLegal.raise!.max).toBeLessThan(wideLegal.raise!.max)

    rerender(
      <ActionBar
        hand={short}
        legal={shortLegal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={onAction}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    // The displayed "to" amount is clamped down to the new max...
    expect(betTo()).toBe(shortLegal.raise!.max)
    // ...and committing sends the clamped amount, never the stale over-max value.
    act(() => screen.getByRole('button', { name: /^Raise to/ }).click())
    const action = onAction.mock.calls.at(-1)![0]
    expect(action.type).toBe('raise')
    if (action.type === 'raise') {
      expect(action.amount).toBe(shortLegal.raise!.max)
      expect(action.amount).toBeLessThanOrEqual(shortLegal.raise!.max)
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
    // The Deal-next CTA is one-tap; End session is guarded by a confirm modal (see below).
    expect(onQuit).not.toHaveBeenCalled()
  })
})

describe('ActionBar — live-session quit confirm (ticket 0082)', () => {
  /** Render the between-hands bar with a stubbed quit and return the spies. */
  function renderBetweenHands() {
    const hand = freshHand()
    const onQuit = vi.fn()
    render(
      <ActionBar
        hand={hand}
        legal={null}
        heroSeat={hand.toAct!}
        isHeroTurn={false}
        handOver
        onAction={() => {}}
        onNext={() => {}}
        onQuit={onQuit}
      />,
    )
    return { onQuit }
  }

  it('opens a confirm modal (instead of quitting) and dispatches quit only on confirm', () => {
    const { onQuit } = renderBetweenHands()

    // Tapping "End session" does NOT quit — it opens the dialog, and the session is not yet over.
    act(() => screen.getByRole('button', { name: 'End session' }).click())
    expect(onQuit).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'End session' })
    expect(dialog).toBeTruthy()

    // Confirming inside the dialog dispatches the existing quit.
    act(() => screen.getByTestId('quit-confirm-end').click())
    expect(onQuit).toHaveBeenCalledOnce()
  })

  it('cancelling the modal leaves the session untouched (still playing)', () => {
    const { onQuit } = renderBetweenHands()

    act(() => screen.getByRole('button', { name: 'End session' }).click())
    expect(screen.queryByRole('dialog')).not.toBeNull()

    // "Keep playing" dismisses the modal without quitting.
    act(() => screen.getByTestId('quit-confirm-cancel').click())
    expect(onQuit).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    // The between-hands controls are still live.
    expect(screen.getByRole('button', { name: 'End session' })).toBeTruthy()
  })

  it('dismisses on Escape and on scrim click without quitting', () => {
    const { onQuit } = renderBetweenHands()

    // Escape closes.
    act(() => screen.getByRole('button', { name: 'End session' }).click())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onQuit).not.toHaveBeenCalled()

    // Scrim click closes.
    act(() => screen.getByRole('button', { name: 'End session' }).click())
    act(() => screen.getByTestId('quit-confirm-scrim').click())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onQuit).not.toHaveBeenCalled()
  })

  it('the session-over "View summary →" path stays one-tap (no modal)', () => {
    const hand = freshHand()
    const onQuit = vi.fn()
    render(
      <ActionBar
        hand={hand}
        legal={null}
        heroSeat={hand.toAct!}
        isHeroTurn={false}
        handOver
        sessionOver
        onAction={() => {}}
        onNext={() => {}}
        onQuit={onQuit}
      />,
    )
    act(() => screen.getByRole('button', { name: /View summary/ }).click())
    expect(onQuit).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ActionBar — sizing anchoring (ticket 0104)', () => {
  /** A heads-up hand checked through to the flop: BB to act with no bet — a postflop *bet* spot. */
  function flopBetSpot(): { hand: HandState; seat: number } {
    let hand = freshHand()
    hand = applyAction(hand, { type: 'call' }) // SB completes
    hand = applyAction(hand, { type: 'check' }) // BB checks → flop
    return { hand, seat: hand.toAct! }
  }

  /** A heads-up flop spot where the hero faces a bet — a postflop *raise* spot. */
  function flopRaiseSpot(): { hand: HandState; seat: number } {
    let hand = freshHand()
    hand = applyAction(hand, { type: 'call' }) // SB completes
    hand = applyAction(hand, { type: 'check' }) // BB checks → flop
    hand = applyAction(hand, { type: 'bet', amount: 6 }) // first-to-act leads
    return { hand, seat: hand.toAct! } // the other seat faces the bet → a raise spot
  }

  /** A 3-handed limped pot the hero is flat-calling into — a *size-agnostic* overcall spot. */
  function overcallSpot(): { hand: HandState; seat: number } {
    let hand = createHand({
      stacks: [200, 200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: makeDeck(),
    })
    hand = applyAction(hand, { type: 'call' }) // button limps
    return { hand, seat: hand.toAct! } // SB faces a limped pot → an overcall
  }

  it('shows the recommended band region + intent label on a postflop BET spot', () => {
    const { hand, seat } = flopBetSpot()
    const legal = legalActions(hand)
    expect(legal.bet).not.toBeNull()
    // Sanity: the coach reads this as a precise (non-agnostic) value band, so a region must shade.
    const band = recommendedBand(decisionContext(hand, seat))
    expect(band.sizeAgnostic).toBe(false)

    render(
      <ActionBar
        hand={hand}
        legal={legal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={vi.fn()}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )

    // The anchor label is copy-matched to the 0103 drawer ("Value · ½–¾ pot").
    const anchor = screen.getByTestId('sizing-anchor')
    expect(anchor.textContent).toContain('Value')
    expect(anchor.textContent).toContain('pot')
    // A precise shaded region is drawn (not the agnostic no-band treatment).
    expect(screen.getByTestId('band-region')).toBeTruthy()
    expect(anchor.getAttribute('data-agnostic')).toBe('false')
  })

  it('shows the band region on a postflop RAISE spot', () => {
    const { hand, seat } = flopRaiseSpot()
    const legal = legalActions(hand)
    expect(legal.raise).not.toBeNull()

    render(
      <ActionBar
        hand={hand}
        legal={legal}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={vi.fn()}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    expect(screen.getByTestId('sizing-anchor')).toBeTruthy()
    expect(screen.getByTestId('band-region')).toBeTruthy()
  })

  it('gives the ½ / pot pegs their pot-odds price and min / all-in a purpose word', () => {
    const { hand, seat } = flopRaiseSpot()
    render(
      <ActionBar
        hand={hand}
        legal={legalActions(hand)}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={vi.fn()}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    // The pegs teach: ½/pot carry the pot-odds price they lay (25% / 33%), min/all-in a purpose word.
    expect(screen.getByRole('button', { name: /½/ }).textContent).toContain('lays 25%')
    expect(screen.getByRole('button', { name: /pot/ }).textContent).toContain('lays 33%')
    expect(screen.getByRole('button', { name: /min/ }).textContent).toContain('re-open')
    expect(screen.getByRole('button', { name: /all-in/ }).textContent).toContain('commit')
  })

  it('shows the neutral no-band treatment on a size-agnostic overcall (no precise region)', () => {
    const { hand, seat } = overcallSpot()
    const band = recommendedBand(decisionContext(hand, seat))
    expect(band.sizeAgnostic).toBe(true) // the overcall — you match the bet, you pick no number

    render(
      <ActionBar
        hand={hand}
        legal={legalActions(hand)}
        heroSeat={seat}
        isHeroTurn
        handOver={false}
        onAction={vi.fn()}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    // The anchor still appears (it IS the hero's turn with a raise option) but reads as neutral copy...
    const anchor = screen.getByTestId('sizing-anchor')
    expect(anchor.getAttribute('data-agnostic')).toBe('true')
    expect(anchor.textContent).toContain('any reasonable size')
    // ...and NO precise shaded region is drawn — anchoring a sliver there would be misleadingly precise.
    expect(screen.queryByTestId('band-region')).toBeNull()
  })

  it('is ABSENT on a non-hero turn and between hands', () => {
    const hand = freshHand()
    const { rerender } = render(
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
    expect(screen.queryByTestId('sizing-anchor')).toBeNull()
    expect(screen.queryByTestId('band-region')).toBeNull()

    // Between hands: no anchoring either (the play-again CTA renders instead).
    rerender(
      <ActionBar
        hand={hand}
        legal={null}
        heroSeat={hand.toAct!}
        isHeroTurn={false}
        handOver
        onAction={() => {}}
        onNext={() => {}}
        onQuit={() => {}}
      />,
    )
    expect(screen.queryByTestId('sizing-anchor')).toBeNull()
    expect(screen.queryByTestId('band-region')).toBeNull()
  })

  it('the anchoring is reference-only: it never changes the seeded size or what a commit sends', () => {
    // The flop bet spot seeds the slider at ~⅔ pot regardless of the band (which is ½–¾ pot here). The
    // anchoring must NOT snap the value to the band, and committing must send the slider value verbatim.
    const { hand, seat } = flopBetSpot()
    const legal = legalActions(hand)
    const pot = hand.players.reduce((s, p) => s + p.totalCommitted, 0)
    const expectedSeed = Math.round(pot * 0.66) // DEFAULT_BET_FRACTION, clamped is a no-op in this range

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
    const betTo = () => Number(screen.getByTestId('bet-to').textContent!.trim().split(/\s+/)[0])
    // The seed is the ⅔-pot default — NOT snapped to the band's toLo/toHi.
    expect(betTo()).toBe(expectedSeed)

    // Committing sends exactly the slider value, never the band.
    act(() => screen.getByRole('button', { name: /^Bet/ }).click())
    const action = onAction.mock.calls[0]![0]
    expect(action.type).toBe('bet')
    if (action.type === 'bet') expect(action.amount).toBe(expectedSeed)
  })
})
