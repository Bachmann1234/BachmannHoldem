// @vitest-environment jsdom
/**
 * SetupScreen component test (ticket 0035): proves the touch controls dispatch the right reducer
 * messages and re-render the selection. We drive the real `@holdem/session` reducer through a tiny
 * harness so the test exercises the actual edit path (not a mock), mirroring the model the shell holds.
 */

import { useReducer } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialModel, reducer } from '@holdem/session'
import { SetupScreen } from './SetupScreen.js'

afterEach(cleanup)

/** A harness wiring SetupScreen to the real reducer so edits re-render the live selection. */
function Harness({ seats, onStart }: { seats: number; onStart?: () => void }): React.JSX.Element {
  const [model, dispatch] = useReducer(reducer, { seats }, createInitialModel)
  return (
    <SetupScreen
      setup={model.setup}
      dispatch={dispatch}
      onStart={onStart ?? (() => {})}
      onNavigate={() => {}}
    />
  )
}

describe('SetupScreen', () => {
  /** Sum the four archetype count chips currently rendered. */
  function mixTotal(): number {
    return ['tag', 'lag', 'rock', 'station']
      .map((k) => Number(screen.getByTestId(`mix-${k}`).textContent))
      .reduce((a, b) => a + b, 0)
  }

  it('renders the seat count and a count per archetype that sums to seats - 1', () => {
    render(<Harness seats={6} />)
    expect(screen.getByTestId('seat-count').textContent).toBe('6')
    // One count row per archetype (not per seat); the mix sums to the 5 non-hero seats.
    for (const k of ['tag', 'lag', 'rock', 'station']) {
      expect(screen.getByTestId(`mix-${k}`)).toBeTruthy()
    }
    expect(mixTotal()).toBe(5)
  })

  it('increments / decrements the seat count via the stepper', () => {
    render(<Harness seats={3} />)
    expect(screen.getByTestId('seat-count').textContent).toBe('3')
    act(() => screen.getByRole('button', { name: 'More seats' }).click())
    expect(screen.getByTestId('seat-count').textContent).toBe('4')
    act(() => screen.getByRole('button', { name: 'Fewer seats' }).click())
    expect(screen.getByTestId('seat-count').textContent).toBe('3')
  })

  it('disables the decrement at the minimum seat count', () => {
    render(<Harness seats={2} />)
    expect(screen.getByRole('button', { name: 'Fewer seats' })).toHaveProperty('disabled', true)
  })

  it('disables the increment at the maximum seat count', () => {
    render(<Harness seats={6} />)
    expect(screen.getByRole('button', { name: 'More seats' })).toHaveProperty('disabled', true)
  })

  it('adjusts an archetype count, keeping the mix summed to seats - 1', () => {
    render(<Harness seats={4} />) // 3 opponents
    expect(mixTotal()).toBe(3)
    const stationBefore = Number(screen.getByTestId('mix-station').textContent)
    act(() => screen.getByRole('button', { name: 'More Station' }).click())
    expect(Number(screen.getByTestId('mix-station').textContent)).toBe(stationBefore + 1)
    expect(mixTotal()).toBe(3) // total preserved — a slot moved from another archetype
  })

  it('disables an archetype decrement at 0 and the increment once it fills the table', () => {
    render(<Harness seats={2} />) // 1 opponent, defaults to a single TAG
    expect(screen.getByRole('button', { name: 'More TAG' })).toHaveProperty('disabled', true) // tag=1=total
    expect(screen.getByRole('button', { name: 'Fewer LAG' })).toHaveProperty('disabled', true) // lag=0
  })

  it('randomizes the mix without changing the table size', () => {
    render(<Harness seats={5} />) // 4 opponents
    act(() => screen.getByTestId('randomize').click())
    expect(screen.getByTestId('seat-count').textContent).toBe('5')
    expect(mixTotal()).toBe(4)
  })

  it('renders no blind-level picker — blinds are fixed at 1/2 — and shows it in the stack hint', () => {
    render(<Harness seats={2} />)
    expect(screen.queryByTestId('blinds-1-2')).toBeNull()
    expect(screen.queryByTestId('blinds-5-10')).toBeNull()
    // The fixed 1/2 level is still surfaced in the stack-depth hint (100bb deep at 1/2 → 200 chips).
    expect(screen.getByTestId('stack-100').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/100bb deep · blinds 1\/2/)).toBeTruthy()
  })

  it('fires onStart when the Deal CTA is tapped', () => {
    const onStart = vi.fn()
    render(<Harness seats={2} onStart={onStart} />)
    screen.getByRole('button', { name: /Deal in/ }).click()
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('defaults to tournament mode and toggles to cash, surfacing each format hint', () => {
    render(<Harness seats={2} />)
    const cash = screen.getByTestId('mode-cash')
    const tourney = screen.getByTestId('mode-tournament')
    expect(tourney.className).toContain('active')
    expect(cash.getAttribute('aria-pressed')).toBe('false')
    // Tournament: the format hint mentions the escalation cadence.
    expect(screen.getByText(/blinds rise every \d+ hands/)).toBeTruthy()

    act(() => cash.click())
    expect(cash.className).toContain('active')
    expect(tourney.getAttribute('aria-pressed')).toBe('false')
    // Cash: the format hint says the blinds stay fixed all session.
    expect(screen.getByText(/blinds stay fixed all session/)).toBeTruthy()
  })
})
