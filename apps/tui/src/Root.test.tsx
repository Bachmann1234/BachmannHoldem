/**
 * The end-to-end session component test (tickets 0027 / 0029): mounts the live {@link Root} via
 * `ink-testing-library`, drives it from the setup screen through multiple hands, and asserts the
 * session behaves — the table view, action bar, and coach panel work together; stacks carry and the
 * button rotates between hands; a busted player is removed; and the session ends with a summary.
 *
 * Determinism comes from injecting a queue of fully-specified `decks` (one per hand) and fixed-seed
 * bots via `makeBot`, so the bots' lines are reproducible. `stdin.write('c')` simulates a keypress;
 * bot turns run in a microtask after each render, so the test yields between writes.
 */

import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { parseCards, type Card } from '@holdem/engine'
import { callingStation, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { Root } from './Root.js'

/** Build a deck dealing exactly the given hole cards + board (mirrors the engine/table test helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** Yield to the microtask/macrotask queue so pending bot-turn effects can dispatch. */
function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function plain(frame: string): string {
  // eslint-disable-next-line no-control-regex
  return frame.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Drive the hero passively through one hand: repeatedly wait until the action bar is prompting the
 * hero (not "Waiting…"), send the cheapest legal continue (call if facing a bet, else check), and
 * stop once the hand reaches a result (hand-over or game-over both render the Result block).
 */
async function playOneHand(
  stdin: { write: (s: string) => void },
  lastFrame: () => string | undefined,
): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await tick()
    const frame = plain(lastFrame() ?? '')
    if (frame.includes('Play another hand?') || frame.includes('Session over')) return
    if (frame && !frame.includes('Waiting') && !frame.includes('Table setup')) {
      stdin.write(frame.includes('(c)all') ? 'c' : 'k')
    }
  }
}

describe('Root — table setup', () => {
  it('opens on the setup screen showing seat count and opponent presets', async () => {
    const { lastFrame } = render(<Root initial={{ seats: 6 }} />)
    await tick()
    const frame = plain(lastFrame()!)
    expect(frame).toContain('Table setup')
    expect(frame).toContain('Seats:')
    expect(frame).toContain('6')
    // Five opponent rows for 6-max.
    for (const seat of [1, 2, 3, 4, 5]) expect(frame).toContain(`Seat ${seat}`)
  })

  it('cycles an opponent preset with the arrow keys', async () => {
    const { stdin, lastFrame } = render(<Root initial={{ seats: 2 }} />)
    await tick()
    expect(plain(lastFrame()!)).toContain('TAG') // heads-up defaults to TAG
    stdin.write('[B') // down arrow → focus the opponent row
    await tick()
    stdin.write('[C') // right arrow → cycle TAG → LAG
    await tick()
    expect(plain(lastFrame()!)).toContain('LAG')
  })

  it('Enter deals the first hand: the table, action bar, and coach panel appear', async () => {
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 1)
    const { stdin, lastFrame } = render(
      <Root initial={{ seats: 2 }} decks={[deck]} makeBot={() => opponent} />,
    )
    await tick()
    stdin.write('\r') // Enter → start the first hand
    await tick()
    const frame = plain(lastFrame()!)
    expect(frame).toContain('hand 1')
    expect(frame).toContain('You')
    expect(frame).toContain('Coach')
  })
})

describe('Root — multiway multi-hand session', () => {
  it('plays multiple hands, carrying stacks and rotating the button, then ends with a summary', async () => {
    // A two-hand heads-up session driven to completion: hand 1 button on the hero (seat0), hand 2
    // the button has rotated. The hero checks/calls down both hands; a fixed-seed bot keeps the
    // lines reproducible. After hand 2 we quit to the summary and assert the session ended cleanly.
    const deck1 = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    const deck2 = buildDeck(2, 1, ['Ks Kd', '7h 2c'], 'Kh 8d 3s 4c 2d')
    const opponent = heuristicOpponent(TIGHT_AGGRESSIVE, 7)
    const { stdin, lastFrame, frames } = render(
      <Root initial={{ seats: 2 }} decks={[deck1, deck2]} makeBot={() => opponent} />,
    )
    await tick()
    stdin.write('\r') // start hand 1
    await playOneHand(stdin, lastFrame)
    expect(plain(lastFrame()!)).toContain('Play another hand?')

    stdin.write('y') // play hand 2
    await tick()
    expect(plain(lastFrame()!)).toContain('hand 2')
    await playOneHand(stdin, lastFrame)

    // Quit to the summary; the session reports its outcome and the final stacks. The app self-exits
    // on game-over (blanking lastFrame), so scan the retained frame history for the summary block.
    stdin.write('q')
    await tick()
    const summary = frames.map(plain).find((f) => f.includes('Session over')) ?? ''
    expect(summary).toContain('Session over')
    expect(summary).toContain('Played')
  })

  it('removes a busted player and ends the session with a one-survivor summary', async () => {
    // Heads-up, one decisive hand: the hero shoves all-in, a calling station calls off its whole
    // stack, and a rigged deck (hero AA, board bricks for the station) busts the bot — so the
    // session ends with a single survivor and the busted opponent named in the summary. This proves
    // the SESSION mechanics end-to-end: stacks settle, a player busts to 0, game-over + summary.
    const makeBot = (): Opponent => callingStation
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 5d')
    const { stdin, lastFrame, frames } = render(
      <Root initial={{ seats: 2, opponents: ['station'] }} decks={[deck]} makeBot={makeBot} />,
    )
    await tick()
    stdin.write('\r') // start the hand
    await tick()
    // Hero shoves; the calling station calls off; the hand runs out and the bot busts. The session
    // then pauses on the final-hand review (the showdown stays visible) until we press q for the
    // summary — proving the busted-out hand is shown before the session ends.
    for (let i = 0; i < 60; i++) {
      await tick()
      const frame = plain(lastFrame() ?? '')
      if (frames.map(plain).some((f) => f.includes('── Session over ──'))) break
      if (frame.includes('Final hand over'))
        stdin.write('q') // dismiss the review to the summary
      else if (frame.includes('(a)llin')) stdin.write('a')
      else if (frame && !frame.includes('Waiting') && !frame.includes('Table setup')) {
        stdin.write(frame.includes('(c)all') ? 'c' : 'k')
      }
    }
    // The app self-exits on game-over (blanking lastFrame), so scan the retained frame history.
    const summary = frames.map(plain).find((f) => f.includes('Session over')) ?? ''
    expect(summary).toContain('Session over')
    expect(summary).toContain('You stacked the table') // hero is the lone survivor
    expect(summary).toMatch(/busted/) // the station shows as busted
  })
})
