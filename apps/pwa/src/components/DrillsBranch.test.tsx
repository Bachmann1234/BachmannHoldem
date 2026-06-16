// @vitest-environment jsdom
/**
 * DrillsBranch component test (tickets 0067 → 0068) — the Drills route: a theme **picker** lobby, the
 * running {@link DrillSession}, and the by-**concept** end-of-session **summary**. Proves the picker's
 * multi-select + empty-selection guard, that a full session reaches a summary with correct per-concept
 * tallies, and that "Drill again" restarts.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRILL_THEMES } from '@holdem/drills'
import { DrillsBranch } from './DrillsBranch.js'

afterEach(cleanup)

/** Answer every spot (first answer) + advance until the by-concept summary appears. */
function runToSummary(): void {
  for (let guard = 0; guard < 80; guard++) {
    if (screen.queryByTestId('drills-over') !== null) break
    fireEvent.click(screen.getByTestId('answer-0'))
    fireEvent.click(screen.getByTestId('result-cta'))
  }
}

describe('DrillsBranch — picker + summary', () => {
  it('shows the theme picker with a row per theme and the lobby tab bar', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    expect(screen.getByTestId('drills')).toBeTruthy()
    expect(screen.getByTestId('tabbar')).toBeTruthy()
    // A toggle per catalogue theme.
    for (const theme of DRILL_THEMES) {
      expect(screen.getByTestId(`theme-${theme.id}`)).toBeTruthy()
    }
  })

  it('disables Start only when no theme is selected, and the guard blocks an empty session', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    const start = screen.getByTestId('drills-start') as HTMLButtonElement
    // All themes are selected by default — Start is enabled.
    expect(start.disabled).toBe(false)

    // Deselect every theme — Start blunts.
    for (const theme of DRILL_THEMES) fireEvent.click(screen.getByTestId(`theme-${theme.id}`))
    expect((screen.getByTestId('drills-start') as HTMLButtonElement).disabled).toBe(true)
    // Clicking the disabled CTA does nothing (no session, the composeSession-empty guard).
    fireEvent.click(screen.getByTestId('drills-start'))
    expect(screen.queryByTestId('drill-session')).toBeNull()

    // Re-select one theme — Start is live again and launches the immersive (tab-less) session.
    fireEvent.click(screen.getByTestId(`theme-${DRILL_THEMES[0]!.id}`))
    expect((screen.getByTestId('drills-start') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('drills-start'))
    expect(screen.getByTestId('drill-session')).toBeTruthy()
    expect(screen.queryByTestId('drills')).toBeNull()
    expect(screen.queryByTestId('tabbar')).toBeNull()
  })

  it('toggling a theme flips its aria-pressed state', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    const pill = screen.getByTestId(`theme-${DRILL_THEMES[0]!.id}`)
    expect(pill.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(pill)
    expect(pill.getAttribute('aria-pressed')).toBe('false')
  })

  it('the lobby tab bar navigates away', () => {
    const onNavigate = vi.fn()
    render(<DrillsBranch onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('tab-play'))
    expect(onNavigate).toHaveBeenCalledWith('play')
  })

  it('a single-theme session summarises that one concept with a tally that sums to the spot count', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    // Drill ONLY the first theme: deselect the others, keep the first.
    for (const theme of DRILL_THEMES.slice(1))
      fireEvent.click(screen.getByTestId(`theme-${theme.id}`))
    // Choose the shortest length for a quick run.
    fireEvent.click(screen.getByTestId('length-5'))
    fireEvent.click(screen.getByTestId('drills-start'))

    runToSummary()

    const over = screen.getByTestId('drills-over')
    expect(over).toBeTruthy()
    expect(screen.getByTestId('drills-score').textContent).toMatch(/\d+ of \d+ right/)

    // The breakdown shows exactly one concept row — the single theme's concept — and its tally totals 5.
    const only = DRILL_THEMES[0]!
    const breakdown = screen.getByTestId('drills-breakdown')
    expect(breakdown.querySelectorAll('.recap-row')).toHaveLength(1)
    const tally = screen.getByTestId(`concept-tally-${only.concept}`).textContent ?? ''
    const m = tally.match(/(\d+) \/ (\d+)/)
    expect(m).not.toBeNull()
    const [, correct, total] = m!.map(Number)
    expect(total).toBe(5)
    expect(correct).toBeLessThanOrEqual(total!)
  })

  it('a mixed session breaks the score down per concept, and the per-concept totals sum to N', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    // All themes selected by default; length 10.
    fireEvent.click(screen.getByTestId('drills-start'))
    runToSummary()

    // Overall N from the headline.
    const scoreText = screen.getByTestId('drills-score').textContent ?? ''
    const n = Number(scoreText.match(/\d+ of (\d+) right/)![1])

    // Every concept row's total sums back to N (the breakdown partitions the session).
    const tallies = screen
      .getByTestId('drills-breakdown')
      .querySelectorAll('[data-testid^="concept-tally-"]')
    let summed = 0
    for (const el of tallies) {
      const t = Number((el.textContent ?? '').match(/\d+ \/ (\d+)/)![1])
      summed += t
    }
    expect(summed).toBe(n)
  })

  it('"Drill again" launches a fresh session', () => {
    render(<DrillsBranch onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByTestId('length-5'))
    fireEvent.click(screen.getByTestId('drills-start'))
    runToSummary()

    fireEvent.click(screen.getByTestId('drills-again'))
    expect(screen.getByTestId('drill-session')).toBeTruthy()
  })
})
