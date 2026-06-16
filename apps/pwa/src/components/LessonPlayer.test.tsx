// @vitest-environment jsdom
/**
 * LessonPlayer component test (ticket 0047) — the read → ask → grade → explain loop. Mirrors the
 * Testing Library idiom of the other PWA tests (`render`, `getByTestId`, `fireEvent`).
 *
 * The cardinal assertion: the rendered result reflects the REAL `gradeSpot` from `@holdem/curriculum`,
 * not hardcoded copy — every number/label is cross-checked against the engine's own output via the
 * shared `@holdem/format` helpers (`pct`/`signedChips`), so the primer phrases a verdict identically
 * to the live coach. We never assert literal equity/EV strings; we assert they equal what the engine
 * + format produce.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FOUNDATIONS, gradeSpot } from '@holdem/curriculum'
import { pct, signedChips } from '@holdem/format'
import { LessonPlayer } from './LessonPlayer.js'

afterEach(cleanup)

/** The six lessons by id, for readable test setup. */
const EQUITY = FOUNDATIONS.find((l) => l.id === 'foundations-equity')!
const POT_ODDS = FOUNDATIONS.find((l) => l.id === 'foundations-pot-odds')!
const CONTINUE = FOUNDATIONS.find((l) => l.id === 'foundations-equity-vs-price')!
const POSITION = FOUNDATIONS.find((l) => l.id === 'foundations-position')!
const RANGES = FOUNDATIONS.find((l) => l.id === 'foundations-ranges')!

/** Render a lesson player with no-op callbacks unless overridden. */
function renderPlayer(
  lesson = CONTINUE,
  onComplete = vi.fn(),
  onBack = vi.fn(),
): typeof onComplete {
  render(<LessonPlayer lesson={lesson} n={1} total={6} onBack={onBack} onComplete={onComplete} />)
  return onComplete
}

describe('LessonPlayer — read state', () => {
  it('opens on the read state showing the lesson explanation and a start CTA', () => {
    renderPlayer()
    expect(screen.getByTestId('lesson-read')).toBeTruthy()
    expect(screen.getByText(CONTINUE.explanation)).toBeTruthy()
    expect(screen.getByTestId('lesson-start')).toBeTruthy()
    // No spot/answers until the checks start.
    expect(screen.queryByTestId('answers')).toBeNull()
  })

  it('shows the one-rule callout only for the continue-rule lesson', () => {
    renderPlayer(CONTINUE)
    expect(screen.getByTestId('teach-rule')).toBeTruthy()
    cleanup()
    renderPlayer(EQUITY)
    expect(screen.queryByTestId('teach-rule')).toBeNull()
  })

  it('shows the strength-tier breakdown only for the ranges lesson', () => {
    // Other lessons carry no tier breakdown.
    renderPlayer(EQUITY)
    expect(screen.queryByTestId('teach-tiers')).toBeNull()
    cleanup()
    // The ranges lesson names each tier (premium → trash) so the read view actually teaches them.
    renderPlayer(RANGES)
    const tiers = screen.getByTestId('teach-tiers')
    expect(tiers.textContent).toContain('Premium')
    expect(tiers.textContent).toContain('Trash')
  })

  it('bridges only the ranges lesson to the chart, opening it on tap (ticket 0064)', () => {
    // Other lessons have no chart bridge.
    renderPlayer(EQUITY)
    expect(screen.queryByTestId('lesson-open-chart')).toBeNull()
    cleanup()
    // The ranges lesson does — and tapping it opens the starting-hand chart where each grade is explained.
    renderPlayer(RANGES)
    expect(screen.queryByTestId('chart-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('lesson-open-chart'))
    expect(screen.getByTestId('chart-modal')).toBeTruthy()
  })
})

describe('LessonPlayer — ask state', () => {
  it('starting the check shows the spot and its answer choices', () => {
    renderPlayer()
    fireEvent.click(screen.getByTestId('lesson-start'))
    const answers = screen.getByTestId('answers')
    // The continue-rule spot offers Call / Fold, in order.
    expect(within(answers).getByTestId('answer-0').textContent).toBe('Call')
    expect(within(answers).getByTestId('answer-1').textContent).toBe('Fold')
  })

  it('renders the postflop felt with the To-call price chip', () => {
    renderPlayer(POT_ODDS)
    fireEvent.click(screen.getByTestId('lesson-start'))
    // POT_ODDS asks to call 75 — the chip shows the price (not "Free").
    expect(screen.getByTestId('price-chip').textContent).toContain('75')
  })

  it('shows a Free price chip for the equity (free-check) lesson', () => {
    renderPlayer(EQUITY)
    fireEvent.click(screen.getByTestId('lesson-start'))
    expect(screen.getByTestId('price-chip').textContent).toContain('Free')
  })
})

describe('LessonPlayer — grade (correct)', () => {
  it('answering correctly shows the ✓ result with the engine’s real numbers', () => {
    renderPlayer(CONTINUE)
    fireEvent.click(screen.getByTestId('lesson-start'))

    // The engine's own grade for the correct pick (Call = index 0) — never hardcoded.
    const spot = CONTINUE.spots[0]!
    const expected = gradeSpot(spot, 0)
    expect(expected.correct).toBe(true)

    fireEvent.click(screen.getByTestId('answer-0'))

    const sheet = screen.getByTestId('result-sheet')
    expect(sheet).toBeTruthy()
    expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe('good')

    // The metric row renders the engine's equity / price / EV via @holdem/format.
    const verdict = expected.verdict!
    if ('potOddsThreshold' in verdict) {
      expect(screen.getByTestId('metric-equity').textContent).toBe(pct(verdict.equity))
      expect(screen.getByTestId('metric-price').textContent).toBe(pct(verdict.potOddsThreshold))
      expect(screen.getByTestId('metric-ev').textContent).toBe(signedChips(verdict.callEv))
    } else {
      throw new Error('expected a postflop decision verdict')
    }
  })

  it('the chosen correct answer lights green and the other dims', () => {
    renderPlayer(CONTINUE)
    fireEvent.click(screen.getByTestId('lesson-start'))
    fireEvent.click(screen.getByTestId('answer-0'))
    expect(screen.getByTestId('answer-0').className).toContain('is-correct')
    expect(screen.getByTestId('answer-1').className).toContain('dim')
  })
})

describe('LessonPlayer — grade (incorrect)', () => {
  it('answering incorrectly shows the ! result naming the correct line', () => {
    renderPlayer(CONTINUE)
    fireEvent.click(screen.getByTestId('lesson-start'))

    const spot = CONTINUE.spots[0]!
    const wrong = gradeSpot(spot, 1) // Fold is the leak here
    expect(wrong.correct).toBe(false)
    const correctLabel = spot.choices[wrong.correctIndex]!.label // "Call"

    fireEvent.click(screen.getByTestId('answer-1'))

    expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe('leak')
    // The encouraging body names the correct line (never "WRONG").
    const sheet = screen.getByTestId('result-sheet')
    expect(sheet.textContent).toContain(correctLabel)
    expect(sheet.textContent).not.toContain('WRONG')
    // The wrong pick lit red; the correct one lit green.
    expect(screen.getByTestId('answer-1').className).toContain('is-wrong')
    expect(screen.getByTestId('answer-0').className).toContain('is-correct')
  })
})

describe('LessonPlayer — preflop (chart-graded)', () => {
  it('grades a preflop spot with the chart rationale and no metric cards', () => {
    renderPlayer(POSITION)
    // A seat ring stands in for the felt on preflop spots.
    fireEvent.click(screen.getByTestId('lesson-start'))
    expect(screen.getByTestId('seat-ring')).toBeTruthy()

    const spot = POSITION.spots[0]! // KJo on the button — Open is correct
    const expected = gradeSpot(spot, 0)
    expect(expected.correct).toBe(true)

    fireEvent.click(screen.getByTestId('answer-0'))

    // Preflop: the chart rationale, NO metric row.
    expect(screen.getByTestId('result-rationale')).toBeTruthy()
    expect(screen.queryByTestId('result-metrics')).toBeNull()
    const verdict = expected.verdict!
    if (!('potOddsThreshold' in verdict)) {
      expect(screen.getByTestId('result-rationale').textContent).toContain(verdict.rationale)
    } else {
      throw new Error('expected a preflop verdict')
    }
  })
})

describe('LessonPlayer — free check (equity lesson)', () => {
  it('shows equity only — price/EV as “—”/0 — for the free check', () => {
    renderPlayer(EQUITY)
    fireEvent.click(screen.getByTestId('lesson-start'))
    fireEvent.click(screen.getByTestId('answer-0')) // Check is correct

    const expected = gradeSpot(EQUITY.spots[0]!, 0)
    const verdict = expected.verdict!
    if ('potOddsThreshold' in verdict) {
      expect(screen.getByTestId('metric-equity').textContent).toBe(pct(verdict.equity))
      expect(verdict.potOddsThreshold).toBe(0)
    } else {
      throw new Error('expected a free-check decision verdict')
    }
    // The price cell reads the "n/a" placeholder, not a percentage.
    expect(screen.getByTestId('metric-price').textContent).toBe('n/a')
  })
})

describe('LessonPlayer — advancing and completion', () => {
  it('finishing a single-spot lesson calls onComplete', () => {
    const onComplete = renderPlayer(CONTINUE)
    fireEvent.click(screen.getByTestId('lesson-start'))
    fireEvent.click(screen.getByTestId('answer-0'))
    // The CTA says "Finish lesson" on the last spot.
    expect(screen.getByTestId('result-cta').textContent).toContain('Finish')
    fireEvent.click(screen.getByTestId('result-cta'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('advances through a multi-spot lesson before completing', () => {
    const onComplete = renderPlayer(POSITION) // two spots
    fireEvent.click(screen.getByTestId('lesson-start'))

    // First spot: the CTA advances to the next check (not finish), and onComplete is NOT called yet.
    fireEvent.click(screen.getByTestId('answer-0'))
    expect(screen.getByTestId('result-cta').textContent).toContain('Next check')
    fireEvent.click(screen.getByTestId('result-cta'))
    expect(onComplete).not.toHaveBeenCalled()

    // Second (last) spot: now finishing completes the lesson.
    expect(screen.queryByTestId('result-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('answer-1')) // KJo UTG — Fold is correct
    expect(screen.getByTestId('result-cta').textContent).toContain('Finish')
    fireEvent.click(screen.getByTestId('result-cta'))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('Escape advances the result loop (a11y, mirroring the coach drawer)', () => {
    const onComplete = renderPlayer(CONTINUE)
    fireEvent.click(screen.getByTestId('lesson-start'))
    fireEvent.click(screen.getByTestId('answer-0'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
