/**
 * Component tests for the presentational table view (ticket 0026), via `ink-testing-library`.
 *
 * These render real {@link HandState}s — built by the engine's `createHand` + `applyAction` from a
 * fixed, fully-specified deck so every frame is deterministic — and assert on `lastFrame()`. They
 * lock in the things that matter most: the reveal rule (hero cards shown, opponents hidden until
 * the hand completes), the seat marks (button / to-act / folded / all-in), suit colouring, and the
 * showdown result (hands + payouts). `lastFrame()` strips ANSI, so colour is asserted through the
 * pure `suitColor` helper the `<Card>` uses rather than on brittle escape bytes.
 */

import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import {
  applyAction,
  createHand,
  parseCards,
  type Card,
  type HandConfig,
  type HandState,
} from '@holdem/engine'
import { Table } from './Table.js'
import { Seat } from './Seat.js'
import { suitColor } from './Card.js'

/**
 * Build a deck dealing exactly the given hole cards and board — mirrors the engine test helper.
 * Hole cards are consumed one-at-a-time, two rounds, starting at the small blind.
 */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) {
      order.push(holes[(sbIndex + k) % n]![round]!)
    }
  }
  return [...order, ...parseCards(board)]
}

function config(overrides: Partial<HandConfig> & Pick<HandConfig, 'stacks' | 'deck'>): HandConfig {
  return { buttonIndex: 0, smallBlind: 1, bigBlind: 2, ...overrides }
}

/** Strip ANSI escape codes so structural assertions ignore colour. */
function plain(frame: string): string {
  // eslint-disable-next-line no-control-regex
  return frame.replace(/\[[0-9;]*m/g, '')
}

/**
 * A heads-up hand at the very start (preflop, nobody all-in, hero seat 0 to act / SB). The board
 * pairs the hero's ace (`Ad`) so the showdown describes a concrete made hand (a pair of aces).
 */
function freshHeadsUp(): HandState {
  const deck = buildDeck(2, 0, ['As Kh', 'Qd Jc'], 'Ad 7d 9h Th 5s')
  return createHand(config({ stacks: [100, 100], deck }))
}

/** Drive that heads-up hand all the way to a showdown (check it down street by street). */
function headsUpShowdown(): HandState {
  let s = freshHeadsUp()
  s = applyAction(s, { type: 'call' }) // button/SB completes
  s = applyAction(s, { type: 'check' }) // BB checks -> flop
  for (let i = 0; i < 6; i++) s = applyAction(s, { type: 'check' }) // flop, turn, river checked down
  return s
}

describe('Table reveal rule', () => {
  it('shows the hero hole cards but hides every opponent pre-showdown', () => {
    const { lastFrame } = render(<Table hand={freshHeadsUp()} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    // Hero (seat 0) cards are face-up.
    expect(frame).toContain('As')
    expect(frame).toContain('Kh')
    // Opponent (seat 1) cards are concealed, never leaked.
    expect(frame).toContain('??')
    expect(frame).not.toContain('Qd')
    expect(frame).not.toContain('Jc')
  })

  it('reveals every opponent hand once the hand is complete (showdown)', () => {
    const { lastFrame } = render(<Table hand={headsUpShowdown()} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    expect(frame).toContain('As')
    expect(frame).toContain('Kh')
    // The opponent's cards are now shown and no face-down glyphs remain.
    expect(frame).toContain('Qd')
    expect(frame).toContain('Jc')
    expect(frame).not.toContain('??')
  })
})

describe('Seat marks', () => {
  it('marks the button, the seat to act, and shows stack/bet', () => {
    const hand = freshHeadsUp() // seat 0 is button+SB (committed 1) and to act
    const { lastFrame } = render(<Table hand={hand} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    expect(frame).toContain('BTN')
    expect(frame).toContain('<= to act')
    expect(frame).toContain('stack 99') // SB posted 1
    expect(frame).toContain('bet 1') // current-street commitment
  })

  it('marks a folded player', () => {
    const base = freshHeadsUp()
    const folded: HandState = {
      ...base,
      players: base.players.map((p) => (p.seat === 1 ? { ...p, status: 'folded' } : p)),
    }
    const { lastFrame } = render(<Table hand={folded} heroSeat={0} />)
    expect(plain(lastFrame()!)).toContain('folded')
  })

  it('marks an all-in player', () => {
    const base = freshHeadsUp()
    const allin: HandState = {
      ...base,
      players: base.players.map((p) => (p.seat === 1 ? { ...p, status: 'allin' } : p)),
    }
    const { lastFrame } = render(<Table hand={allin} heroSeat={0} />)
    expect(plain(lastFrame()!)).toContain('all-in')
  })
})

describe('Suit colour', () => {
  it('colours red suits (hearts/diamonds) and leaves black suits the default', () => {
    // The colour is derived from `suitOf`, not by slicing the formatted label: hearts and
    // diamonds are red, clubs and spades the terminal default. `lastFrame()` strips ANSI, so
    // colour is asserted through the same pure helper the `<Card>` component uses.
    expect(suitColor(parseCards('Ah')[0]!)).toBe('red') // hearts
    expect(suitColor(parseCards('Ad')[0]!)).toBe('red') // diamonds
    expect(suitColor(parseCards('As')[0]!)).toBeUndefined() // spades
    expect(suitColor(parseCards('Ac')[0]!)).toBeUndefined() // clubs
  })

  it('still renders the (coloured) cards in the frame', () => {
    const deck = buildDeck(2, 0, ['Ah Kd', 'Qd Jc'], '2c 7d 9h Th 5s')
    const hand = createHand(config({ stacks: [100, 100], deck }))
    const frame = plain(render(<Table hand={hand} heroSeat={0} />).lastFrame()!)
    expect(frame).toContain('Ah')
    expect(frame).toContain('Kd')
  })
})

describe('Board / street header', () => {
  it('shows a dash and Preflop before the flop, then the board after', () => {
    const pre = plain(render(<Table hand={freshHeadsUp()} heroSeat={0} />).lastFrame()!)
    expect(pre).toContain('Preflop')
    expect(pre).toContain('Board: —')

    const done = plain(render(<Table hand={headsUpShowdown()} heroSeat={0} />).lastFrame()!)
    expect(done).toContain('Ad')
    expect(done).toContain('Pot:')
  })
})

describe('Result view', () => {
  it('shows the showdown hands and the payouts of a completed hand', () => {
    const hand = headsUpShowdown()
    const { lastFrame } = render(<Table hand={hand} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    expect(frame).toContain('Result')
    // Hero's pair of aces wins; the result lists a described hand and a payout.
    expect(frame).toMatch(/pair/i)
    expect(frame).toContain('collect')
    // The winning seat collected exactly the engine's payout.
    const winner = Object.entries(hand.payouts).find(([, won]) => won > 0)!
    expect(frame).toContain(`collect ${winner[1]}`)
  })

  it('notes a fold-out hand instead of a showdown', () => {
    let s = freshHeadsUp()
    s = applyAction(s, { type: 'fold' }) // button/SB folds -> BB wins, no showdown
    const { lastFrame } = render(<Table hand={s} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    expect(frame).toContain('Everyone else folded.')
    expect(frame).toContain('collect')
  })
})

describe('Seat naming and N seats', () => {
  it('labels the hero You and opponents Seat N, rendering all six seats at a 6-max table', () => {
    const deck = buildDeck(
      6,
      0,
      ['As Ks', 'Qs Js', 'Ts 9s', '8s 7s', '6s 5s', '4s 3s'],
      '2c 3d 4h 5d 7c',
    )
    const hand = createHand(config({ stacks: [100, 100, 100, 100, 100, 100], deck }))
    const { lastFrame } = render(<Table hand={hand} heroSeat={0} />)
    const frame = plain(lastFrame()!)
    expect(frame).toContain('You')
    for (const seat of [1, 2, 3, 4, 5]) expect(frame).toContain(`Seat ${seat}`)
  })

  it('Seat renders in isolation as a pure function of its props', () => {
    const hand = freshHeadsUp()
    const { lastFrame } = render(
      <Seat
        player={hand.players[0]!}
        heroSeat={0}
        buttonIndex={hand.buttonIndex}
        toAct={hand.toAct}
        isComplete={false}
      />,
    )
    expect(plain(lastFrame()!)).toContain('You')
  })
})
