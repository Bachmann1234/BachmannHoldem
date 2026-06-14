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
  return <SetupScreen setup={model.setup} dispatch={dispatch} onStart={onStart ?? (() => {})} />
}

describe('SetupScreen', () => {
  it('renders the seat count and one preset cycler per opponent', () => {
    render(<Harness seats={6} />)
    expect(screen.getByTestId('seat-count').textContent).toBe('6')
    // 6-max → 5 opponent rows.
    for (let i = 0; i < 5; i++) expect(screen.getByTestId(`opponent-${i}`)).toBeTruthy()
    expect(screen.queryByTestId('opponent-5')).toBeNull()
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

  it('cycles an opponent preset through the four presets', () => {
    render(<Harness seats={2} />)
    const cycler = screen.getByTestId('opponent-0')
    expect(cycler.textContent).toBe('TAG') // heads-up defaults to TAG
    act(() => cycler.click())
    expect(screen.getByTestId('opponent-0').textContent).toBe('LAG')
    act(() => cycler.click())
    expect(screen.getByTestId('opponent-0').textContent).toBe('Rock')
  })

  it('fires onStart when the Deal CTA is tapped', () => {
    const onStart = vi.fn()
    render(<Harness seats={2} onStart={onStart} />)
    screen.getByRole('button', { name: /Deal in/ }).click()
    expect(onStart).toHaveBeenCalledOnce()
  })
})
