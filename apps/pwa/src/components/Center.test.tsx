// @vitest-environment jsdom
/**
 * Center pot-display tests (ticket 0090). The repo's vitest defaults to the `node` environment, so
 * this file opts into `jsdom` via the docblock above.
 *
 * Covers the two pot-region states:
 *  - the common SINGLE pot → the unchanged `data-testid="pot"` figure (no `.pot-pod`, no tray);
 *  - a multi-pot all-in (`hand.pots.length > 1`) → one labelled pod per pot, amounts read straight
 *    from `hand.pots` and summing to `potTotal(hand)`, main pod first.
 *
 * The multi-pot hand is a real 3-way all-in at stacks 20/50/100, driven through `createHand` +
 * `applyAction` so the engine's `collectPots` produces the pots — we never hand-build them.
 */

import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyAction,
  createHand,
  parseCards,
  potTotal,
  type Card,
  type HandConfig,
} from '@holdem/engine'
import { Center } from './Center.js'

afterEach(cleanup)

/** Build a deck dealing the given hole cards + board (mirrors the engine test helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

function config(overrides: Partial<HandConfig> & Pick<HandConfig, 'stacks' | 'deck'>): HandConfig {
  return { buttonIndex: 0, smallBlind: 1, bigBlind: 2, ...overrides }
}

const props = { heroSeat: 0, seatLabel: (s: number) => `P${s}` }

describe('Center pot display', () => {
  it('renders the single, unchanged pot figure for an ordinary hand', () => {
    const deck = buildDeck(2, 0, ['As Ks', 'Qd Jd'], '2c 3d 4h 5s 7c')
    const hand = createHand(config({ stacks: [100, 100], deck }))
    expect(hand.pots.length).toBeLessThan(2) // sanity: ordinary in-progress hand has no side pots

    const { getByTestId, queryByTestId } = render(<Center hand={hand} {...props} />)

    const pot = getByTestId('pot')
    expect(pot.textContent).toContain(String(potTotal(hand)))
    expect(queryByTestId('pot-tray')).toBeNull()
    expect(queryByTestId('pot-pod-0')).toBeNull()
  })

  it('renders one labelled pod per pot for a multi-way all-in, summing to the total', () => {
    // 3-way all-in at 20/50/100 → main pot 60 (all three eligible) + side pot 60 (seats 1 & 2).
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    let hand = createHand(config({ stacks: [20, 50, 100], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 20 }) // seat0 shoves 20
    hand = applyAction(hand, { type: 'raise', amount: 50 }) // seat1 shoves 50
    hand = applyAction(hand, { type: 'call' }) // seat2 calls 50

    expect(hand.pots.length).toBe(2) // sanity: the engine really produced a main + side pot

    const { getByTestId, queryByTestId } = render(<Center hand={hand} {...props} />)

    // No single-pot figure once there are multiple pots; a labelled tray takes its place.
    expect(queryByTestId('pot')).toBeNull()
    getByTestId('pot-tray')

    const main = getByTestId('pot-pod-0')
    const side = getByTestId('pot-pod-1')
    expect(within(main).getByText('Main')).toBeTruthy()
    expect(within(side).getByText('Side')).toBeTruthy()

    // Amounts are read straight from each pot and sum to potTotal.
    expect(main.textContent).toContain(String(hand.pots[0]!.amount))
    expect(side.textContent).toContain(String(hand.pots[1]!.amount))
    const shown = hand.pots.reduce((sum, p) => sum + p.amount, 0)
    expect(shown).toBe(potTotal(hand))
  })

  it('shows contested chips only — an over-shove returns the uncalled bet, so pods sum below potTotal', () => {
    // seat0 shoves 200 into stacks 20/50 behind it: only 50 of it can ever be matched, so the top
    // 150 is a returned uncalled bet (BUG-0002) that `collectPots` peels OUT of the pots. The pods
    // therefore read the *contested* chips (main 60 + side 60 = 120), not the raw potTotal (270).
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    let hand = createHand(config({ stacks: [200, 20, 50], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 200 }) // seat0 (UTG) shoves 200
    hand = applyAction(hand, { type: 'call' }) // seat1 (SB) calls all-in 20
    hand = applyAction(hand, { type: 'call' }) // seat2 (BB) calls all-in 50

    expect(hand.pots.length).toBe(2)
    const contested = hand.pots.reduce((sum, p) => sum + p.amount, 0)
    expect(contested).toBeLessThan(potTotal(hand)) // 120 < 270: the 150 over-shove was returned

    const { getByTestId } = render(<Center hand={hand} {...props} />)
    expect(getByTestId('pot-pod-0').textContent).toContain(String(hand.pots[0]!.amount))
    expect(getByTestId('pot-pod-1').textContent).toContain(String(hand.pots[1]!.amount))
  })

  it('abbreviates multiple side pods as S1, S2, … (label-naming helper)', () => {
    // 4-way all-in at stacks 20/50/100/200. UTG (seat3, the deepest) shoves 200; the three shorter
    // stacks each call all-in for their whole stack, so the engine layers three pots (main + S1 + S2).
    const deck = buildDeck(4, 0, ['As Ks', 'Qs Js', 'Ts 9s', '8s 7s'], '2c 3d 4h 6s 7c')
    let hand = createHand(config({ stacks: [20, 50, 100, 200], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 200 }) // UTG seat3 shoves 200
    hand = applyAction(hand, { type: 'call' }) // seat0 calls all-in (20)
    hand = applyAction(hand, { type: 'call' }) // seat1 calls all-in (50)
    hand = applyAction(hand, { type: 'call' }) // seat2 calls all-in (100)

    expect(hand.pots.length).toBe(3)

    const { getByTestId } = render(<Center hand={hand} {...props} />)
    expect(within(getByTestId('pot-pod-0')).getByText('Main')).toBeTruthy()
    expect(within(getByTestId('pot-pod-1')).getByText('S1')).toBeTruthy()
    expect(within(getByTestId('pot-pod-2')).getByText('S2')).toBeTruthy()
  })
})
