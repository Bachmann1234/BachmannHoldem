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
  describeHand,
  parseCards,
  potTotal,
  type Card,
  type HandConfig,
} from '@holdem/engine'
import { Center, ResultBanner } from './Center.js'
import { CENTER } from './layout.js'

afterEach(cleanup)

/** Drive N equal stacks to an all-in showdown (first actor shoves, the rest call) → a completed hand. */
function completedAllIn(n: number) {
  const holes = ['As Ks', 'Qd Qs', 'Td 9d', '7c 7h', '5c 5d', '3c 3d'].slice(0, n)
  const deck = buildDeck(n, 0, holes, '2c 3d 4h 6s 8s')
  let hand = createHand(config({ stacks: Array(n).fill(2000), deck }))
  hand = applyAction(hand, { type: 'raise', amount: 2000 })
  for (let k = 1; k < n; k++) hand = applyAction(hand, { type: 'call' })
  return hand
}

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

/**
 * ResultBanner showdown attribution (ticket 0091). Single-pot hands keep the original two-line
 * who/what banner; a multi-pot all-in renders a per-pot attribution grid reading `pot.winningSeats`
 * (the truth of who won each pot) + `pot.amount` + the per-winner showdown hand description.
 *
 * The headline two-pot and split-side-pot hands are driven through the real engine so `collectPots`
 * and `decideWinners` produce the `winningSeats` — we never hand-build the pots.
 */
/**
 * Showdown lift direction (layout bug fix). The completed-hand banner grows *downward* from the
 * board, so the vertically-centred block has to move to keep the banner off the bottom seats —
 * but which way depends on where the opponents sit:
 *  - ≤4-max: every opponent flanks or sits ABOVE the board (the upper arc), so the block must DROP
 *    into the open felt below — lifting it would drive the board up into those seats (the bug).
 *  - 5/6-max: the lower wings sit below the board, so the block LIFTS to clear the banner off them.
 */
describe('Center showdown lift direction', () => {
  it('drops the block below felt-centre at ≤4-max (no upper-arc collision)', () => {
    for (const n of [2, 3, 4]) {
      const hand = completedAllIn(n)
      const { container } = render(<Center hand={hand} {...props} />)
      const top = parseFloat((container.querySelector('.center') as HTMLElement).style.top)
      expect(top, `${n}-max should drop, not lift`).toBeGreaterThan(CENTER[1])
      cleanup()
    }
  })

  it('lifts the block above felt-centre at 5/6-max (clears the lower wings)', () => {
    for (const n of [5, 6]) {
      const hand = completedAllIn(n)
      const { container } = render(<Center hand={hand} {...props} />)
      const top = parseFloat((container.querySelector('.center') as HTMLElement).style.top)
      expect(top, `${n}-max should lift`).toBeLessThan(CENTER[1])
      cleanup()
    }
  })
})

describe('ResultBanner showdown attribution', () => {
  it('attributes each pot to its own winner when the hero wins main and loses the side', () => {
    // 3-way all-in 20/50/100. Hero (seat0) is short → eligible for the MAIN pot only, and holds the
    // best hand of all three (set of Ks) so it wins the main; the deeper seat1 (set of Qs) beats
    // seat2 (set of 7s) for the SIDE pot. So: hero wins main 60, loses side 60 to seat1.
    const deck = buildDeck(3, 0, ['Ks Kh', 'Qs Qh', '7s 7d'], 'Kc Qd 7h 2s 5c')
    let hand = createHand(config({ stacks: [20, 50, 100], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 20 }) // seat0 shoves 20
    hand = applyAction(hand, { type: 'raise', amount: 50 }) // seat1 shoves 50
    hand = applyAction(hand, { type: 'call' }) // seat2 calls 50

    expect(hand.pots.length).toBe(2)
    expect(hand.pots[0]!.winningSeats).toEqual([0]) // sanity: hero won the main pot
    expect(hand.pots[1]!.winningSeats).toEqual([1]) // sanity: seat1 won the side pot

    const { getByTestId } = render(<ResultBanner hand={hand} {...props} />)

    const main = getByTestId('pot-line-0')
    const side = getByTestId('pot-line-1')

    // Main: the hero ("You") for the main amount, coloured as a win (the `.win` modifier).
    expect(within(main).getByText('You')).toBeTruthy()
    expect(within(main).getByText('MAIN')).toBeTruthy()
    expect(main.textContent).toContain(String(hand.pots[0]!.amount)) // 60
    expect(main.className).toContain('win')

    // Side: seat1 ("P1") for the side amount, NOT coloured a win for the hero.
    expect(within(side).getByText('P1')).toBeTruthy()
    expect(within(side).getByText('SIDE')).toBeTruthy()
    expect(side.textContent).toContain(String(hand.pots[1]!.amount)) // 60
    expect(side.className).not.toContain('win')

    // Per-pot winner hand descriptions render (read from showdownHands[winnerSeat]).
    expect(main.textContent).toContain(describeHand(hand.showdownHands[0]!))
    expect(side.textContent).toContain(describeHand(hand.showdownHands[1]!))
  })

  it('renders both winners when a side pot is split', () => {
    // Hero (seat0, short) wins the MAIN with a flush; seats 1 & 2 both play the board straight and
    // TIE the SIDE pot → `winningSeats` has two seats, both must render on one line.
    const deck = buildDeck(3, 0, ['Tc Td', '2h 3h', '2s 3s'], '5c 6c 7c 8c 9d')
    let hand = createHand(config({ stacks: [20, 50, 100], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 20 })
    hand = applyAction(hand, { type: 'raise', amount: 50 })
    hand = applyAction(hand, { type: 'call' })

    expect(hand.pots.length).toBe(2)
    expect(hand.pots[1]!.winningSeats).toEqual([1, 2]) // sanity: the side pot is a two-way split

    const { getByTestId } = render(<ResultBanner hand={hand} {...props} />)

    const side = getByTestId('pot-line-1')
    // Both winners on the one (non-wrapping) line: "P1 + P2".
    expect(side.textContent).toContain('P1 + P2')
  })

  it('leaves the single-pot banner unchanged (the two-line who/what)', () => {
    // A heads-up showdown → one pot, so the banner keeps today's `.who` / `.what` structure and the
    // `result-banner` testid, with no per-pot attribution grid.
    const deck = buildDeck(2, 0, ['As Ks', 'Qd Jd'], '2c 3d 4h 5s 7c')
    let hand = createHand(config({ stacks: [100, 100], deck }))
    hand = applyAction(hand, { type: 'call' }) // SB/button completes
    hand = applyAction(hand, { type: 'check' }) // BB checks → flop
    hand = applyAction(hand, { type: 'check' })
    hand = applyAction(hand, { type: 'check' }) // turn
    hand = applyAction(hand, { type: 'check' })
    hand = applyAction(hand, { type: 'check' }) // river
    hand = applyAction(hand, { type: 'check' })
    hand = applyAction(hand, { type: 'check' }) // showdown

    expect(hand.pots.length).toBe(1)

    const { getByTestId, container, queryByTestId } = render(
      <ResultBanner hand={hand} {...props} />,
    )

    const banner = getByTestId('result-banner')
    expect(banner.className).not.toContain('result-banner--pots')
    expect(banner.querySelector('.who')).toBeTruthy()
    expect(banner.querySelector('.what')).toBeTruthy()
    expect(queryByTestId('pot-line-0')).toBeNull()
    expect(container.querySelector('.pot-line')).toBeNull()
  })

  // --- The +N more cap (ticket 0094) ---------------------------------------------------------------
  // A completed 3-way all-in gives real showdown hands for seats 0/1/2; we override its `pots` to a
  // deep ladder (more pots than the cap) to drive the collapse without hand-building a HandState.
  function completedThreeWay(): ReturnType<typeof createHand> {
    const deck = buildDeck(3, 0, ['Ks Kh', 'Qs Qh', '7s 7d'], 'Kc Qd 7h 2s 5c')
    let hand = createHand(config({ stacks: [20, 50, 100], deck }))
    hand = applyAction(hand, { type: 'raise', amount: 20 })
    hand = applyAction(hand, { type: 'raise', amount: 50 })
    hand = applyAction(hand, { type: 'call' })
    return hand
  }
  /** Five pots referencing only seats 0/1/2 (all have showdown hands); hero (0) wins `heroWinsIndex`. */
  function fivePots(heroWinsIndex: number) {
    return [0, 1, 2, 3, 4].map((i) => ({
      amount: 100 - i * 10,
      eligibleSeats: [0, 1, 2],
      winningSeats: [i === heroWinsIndex ? 0 : (i % 2) + 1],
    }))
  }

  it('caps the banner at 4 pot-lines + a "+N more" tail past the cap (ticket 0094)', () => {
    // Five pots, hero wins only the main: show main + the first three sides, collapse the fifth.
    const hand = { ...completedThreeWay(), pots: fivePots(0) }
    const { getByTestId, queryByTestId } = render(<ResultBanner hand={hand} {...props} />)
    expect(getByTestId('pot-line-0')).toBeTruthy()
    expect(getByTestId('pot-line-3')).toBeTruthy()
    expect(queryByTestId('pot-line-4')).toBeNull() // the 5th pot folded into the tail
    expect(getByTestId('pot-line-more').textContent).toContain('+1 more')
  })

  it('never collapses a hero-won pot — a late pot the hero took stays shown (ticket 0094)', () => {
    // Hero wins the LAST pot (index 4): it must be force-shown (with the win colour) while an earlier
    // non-hero pot collapses into the tail instead.
    const hand = { ...completedThreeWay(), pots: fivePots(4) }
    const { getByTestId, queryByTestId } = render(<ResultBanner hand={hand} {...props} />)
    expect(getByTestId('pot-line-4').className).toContain('win')
    expect(queryByTestId('pot-line-3')).toBeNull() // a non-hero pot collapsed in its place
    expect(getByTestId('pot-line-more').textContent).toContain('+1 more')
  })
})
