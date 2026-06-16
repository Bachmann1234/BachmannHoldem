// @vitest-environment jsdom
/**
 * DrillsBranch component test (ticket 0067) — the minimal Drills route: a lobby Start CTA, the running
 * {@link DrillSession}, and the minimal "session over" recap. The real theme picker + by-concept
 * summary are ticket 0068; this proves only the thin bookends + that a full session reaches its recap.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DrillsBranch } from './DrillsBranch.js'

afterEach(cleanup)

describe('DrillsBranch — entry + recap', () => {
  it('shows the lobby with a Start CTA, then launches the immersive session', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    expect(screen.getByTestId('drills')).toBeTruthy()
    // The tab bar is present on the lobby (a lobby surface).
    expect(screen.getByTestId('tabbar')).toBeTruthy()

    fireEvent.click(screen.getByTestId('drills-start'))
    expect(screen.getByTestId('drill-session')).toBeTruthy()
    // The running session is immersive — no tab bar, no lobby.
    expect(screen.queryByTestId('drills')).toBeNull()
    expect(screen.queryByTestId('tabbar')).toBeNull()
  })

  it('the lobby tab bar navigates away', () => {
    const onNavigate = vi.fn()
    render(<DrillsBranch onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('tab-play'))
    expect(onNavigate).toHaveBeenCalledWith('play')
  })

  it('runs the session to the recap, which reports a count and offers Drill again', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('drills-start'))

    // Answer + advance until the session ends and the recap appears.
    for (let guard = 0; guard < 50; guard++) {
      if (screen.queryByTestId('drills-over') !== null) break
      fireEvent.click(screen.getByTestId('answer-0'))
      fireEvent.click(screen.getByTestId('result-cta'))
    }

    const over = screen.getByTestId('drills-over')
    expect(over).toBeTruthy()
    // The recap reports "<n> of <N> right".
    expect(screen.getByTestId('drills-score').textContent).toMatch(/\d+ of \d+ right/)

    // "Drill again" launches a fresh session.
    fireEvent.click(screen.getByTestId('drills-again'))
    expect(screen.getByTestId('drill-session')).toBeTruthy()
  })
})
