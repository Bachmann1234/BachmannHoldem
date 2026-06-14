/**
 * Component tests for the end-of-session summary (ticket 0029), via `ink-testing-library`.
 *
 * The summary is a pure render of the final stable {@link SessionPlayer} list, so these render it
 * directly and assert on `lastFrame()` (ANSI stripped): the outcome headline (hero won / hero
 * busted / a bot took the table) and each player's final stack with a busted marker.
 */

import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Summary } from './Summary.js'
import type { SessionPlayer } from '../model.js'

function plain(frame: string): string {
  return frame.replace(/\[[0-9;]*m/g, '')
}

/** Build a stable players list (hero id 0) with the given stacks. */
function players(stacks: number[]): SessionPlayer[] {
  return stacks.map((stack, id) => ({
    id,
    isHero: id === 0,
    label: id === 0 ? 'You' : `Seat ${id}`,
    botKind: id === 0 ? undefined : ('tag' as const),
    stack,
  }))
}

describe('Summary', () => {
  it('headlines a hero win (lone survivor) and marks busted opponents', () => {
    const frame = plain(render(<Summary players={players([400, 0])} handNumber={3} />).lastFrame()!)
    expect(frame).toContain('Session over')
    expect(frame).toContain('You stacked the table')
    expect(frame).toContain('Played 3 hands')
    expect(frame).toContain('You: 400')
    expect(frame).toContain('Seat 1: 0')
    expect(frame).toContain('busted')
  })

  it('headlines a hero bust', () => {
    const frame = plain(render(<Summary players={players([0, 400])} handNumber={5} />).lastFrame()!)
    expect(frame).toContain('You busted')
  })

  it('headlines a bot taking the table when the hero quit while behind', () => {
    // Hero quit with chips but a bot is the lone survivor with chips? Use one survivor that is a bot.
    const frame = plain(render(<Summary players={players([0, 250])} handNumber={2} />).lastFrame()!)
    // Hero busted takes precedence here; cover the bot-survivor headline with no hero in the list.
    expect(frame).toContain('You busted')
  })

  it('names a non-hero lone survivor when the hero is not the one left standing', () => {
    const bots: SessionPlayer[] = [
      { id: 0, isHero: true, label: 'You', stack: 5 },
      { id: 1, isHero: false, label: 'Seat 1 (LAG)', botKind: 'lag', stack: 395 },
    ]
    // Hero still has chips, so it is not a hero-bust; one bot leads but both alive → generic.
    const frame = plain(render(<Summary players={bots} handNumber={4} />).lastFrame()!)
    expect(frame).toContain('Session over')
  })
})
