// @vitest-environment jsdom
/**
 * DrillsBranch component test (tickets 0067 → 0068) — the Drills route: a theme **picker** lobby, the
 * running {@link DrillSession}, and the by-**concept** end-of-session **summary**. Proves the picker's
 * multi-select + empty-selection guard, that a full session reaches a summary with correct per-concept
 * tallies, and that "Drill again" restarts.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRILL_THEMES } from '@holdem/drills'
import type { DrillProgressRecord, DrillProgressStore, DrillSpotOutcome } from '../drills/index.js'
import { foldOutcome } from '../drills/store.js'
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

/**
 * An in-memory {@link DrillProgressStore} for the wiring tests — aggregates exactly like the real
 * IndexedDB store (via the shared `foldOutcome`) but synchronously, so no IndexedDB/fake-indexeddb is
 * needed in a jsdom component test. `records` exposes the merged aggregate for assertions.
 */
function makeFakeStore(): DrillProgressStore & {
  records: Map<string, DrillProgressRecord>
  calls: { recordOutcomes: number; list: number }
} {
  const records = new Map<string, DrillProgressRecord>()
  const calls = { recordOutcomes: 0, list: 0 }
  return {
    records,
    calls,
    async recordOutcomes(outcomes: readonly DrillSpotOutcome[], now: number): Promise<void> {
      calls.recordOutcomes += 1
      for (const o of outcomes) {
        records.set(o.concept, foldOutcome(records.get(o.concept), o, now))
      }
    },
    async list(): Promise<DrillProgressRecord[]> {
      calls.list += 1
      return [...records.values()]
    },
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

describe('DrillsBranch — spaced repetition (ticket 0080)', () => {
  it('records the finished session per-concept on complete (the durable store)', async () => {
    const store = makeFakeStore()
    render(<DrillsBranch onNavigate={vi.fn()} progressStore={store} now={() => 1000} />)
    // Single theme + short length for a deterministic, quick run.
    for (const theme of DRILL_THEMES.slice(1))
      fireEvent.click(screen.getByTestId(`theme-${theme.id}`))
    fireEvent.click(screen.getByTestId('length-5'))
    fireEvent.click(screen.getByTestId('drills-start'))
    runToSummary()

    const concept = DRILL_THEMES[0]!.concept
    await waitFor(() => {
      expect(store.calls.recordOutcomes).toBe(1)
      const rec = store.records.get(concept)
      expect(rec).toBeDefined()
      // All 5 spots of the one concept were folded into a single aggregate.
      expect(rec!.total).toBe(5)
      expect(rec!.lastDrilledAt).toBe(1000)
    })
  })

  it('reads weak concepts on mount and re-reads after recording (the re-queue input)', async () => {
    const store = makeFakeStore()
    render(<DrillsBranch onNavigate={vi.fn()} progressStore={store} now={() => 1000} />)
    // Loaded once on mount for the FIRST session's bias.
    await waitFor(() => expect(store.calls.list).toBeGreaterThanOrEqual(1))

    fireEvent.click(screen.getByTestId('length-5'))
    fireEvent.click(screen.getByTestId('drills-start'))
    const listsBefore = store.calls.list
    runToSummary()
    // After recording, the review set is refreshed so the NEXT session re-queues the just-drilled
    // concepts — the spaced-repetition loop closes.
    await waitFor(() => expect(store.calls.list).toBeGreaterThan(listsBefore))
  })

  it('a throwing store NEVER breaks the loop — the session still reaches its summary', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwingStore: DrillProgressStore = {
      async recordOutcomes(): Promise<void> {
        throw new Error('quota exceeded')
      },
      async list(): Promise<DrillProgressRecord[]> {
        throw new Error('IndexedDB blocked')
      },
    }
    render(<DrillsBranch onNavigate={vi.fn()} progressStore={throwingStore} />)
    fireEvent.click(screen.getByTestId('length-5'))
    fireEvent.click(screen.getByTestId('drills-start'))
    runToSummary()
    // The drill loop is unaffected — it reaches the summary even though every store call threw.
    expect(screen.getByTestId('drills-over')).toBeTruthy()
    await waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })
})
