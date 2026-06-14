/**
 * Component tests for the table-setup screen (ticket 0029), via `ink-testing-library`.
 *
 * The screen is a pure render of the {@link SetupState} the reducer holds plus a focus cursor, so
 * these render it directly and assert on `lastFrame()` (ANSI stripped): the seat-count row, one
 * preset row per opponent, the `›` focus cursor, and the hint line. The input wiring that edits the
 * selection lives in {@link Root} (and is exercised by `Root.test.tsx`); here we lock the layout.
 */

import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { SetupScreen } from './SetupScreen.js'
import type { SetupState } from '../model.js'

/** Strip ANSI escape codes so structural assertions ignore colour. */
function plain(frame: string): string {
  return frame.replace(/\[[0-9;]*m/g, '')
}

describe('SetupScreen', () => {
  it('renders the seat count and one preset row per opponent', () => {
    const setup: SetupState = { seats: 6, opponents: ['tag', 'lag', 'rock', 'station', 'tag'] }
    const frame = plain(render(<SetupScreen setup={setup} cursor={0} />).lastFrame()!)
    expect(frame).toContain('Table setup')
    expect(frame).toContain('Seats: ')
    expect(frame).toContain('6')
    // Five opponent rows, each labelled with its preset.
    for (const seat of [1, 2, 3, 4, 5]) expect(frame).toContain(`Seat ${seat}:`)
    expect(frame).toContain('TAG')
    expect(frame).toContain('LAG')
    expect(frame).toContain('Rock')
    expect(frame).toContain('Station')
  })

  it('marks the focused row with a cursor', () => {
    const setup: SetupState = { seats: 2, opponents: ['tag'] }
    // Cursor on the seat-count row (0).
    const onSeats = plain(render(<SetupScreen setup={setup} cursor={0} />).lastFrame()!)
    expect(onSeats).toMatch(/›\s*Seats:/)
    // Cursor on the (only) opponent row (1).
    const onOpponent = plain(render(<SetupScreen setup={setup} cursor={1} />).lastFrame()!)
    expect(onOpponent).toMatch(/›\s*Seat 1:/)
  })

  it('shows the control hints (arrows / Enter / quit)', () => {
    const setup: SetupState = { seats: 2, opponents: ['tag'] }
    const frame = plain(render(<SetupScreen setup={setup} cursor={0} />).lastFrame()!)
    expect(frame).toContain('Enter to play')
    expect(frame).toMatch(/quit/)
  })
})
