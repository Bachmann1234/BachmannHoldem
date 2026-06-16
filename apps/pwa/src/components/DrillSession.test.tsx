// @vitest-environment jsdom
/**
 * DrillSession component test (ticket 0067) — the drill analog of {@link LessonPlayer.test}: deal a
 * spot, answer, grade via the REAL `gradeSpot`, explain, advance, loop to the end. Mirrors the same
 * Testing Library idiom (`render`, `getByTestId`, `fireEvent`).
 *
 * The cardinal assertion (as in the lesson player test): the rendered result reflects the engine's
 * `gradeSpot`, never hardcoded copy. The session is composed by the SAME pure `composeSession` the
 * component drives, off a fixed `(themes, length, seed)`, so the test knows each spot's correct index
 * and the engine's verdict numbers and cross-checks them against the DOM. Progress is ephemeral; we
 * never touch persistence.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeSession, DRILL_THEMES } from '@holdem/drills'
import { gradeSpot } from '@holdem/curriculum'
import { explainDecision, pct } from '@holdem/format'
import { DrillSession, type DrillOutcome } from './DrillSession.js'

afterEach(cleanup)

const SEED = 12345
const LENGTH = 4

/** The exact session the component will run for SEED/LENGTH — its spots + their themes, in order. */
function fixedSession() {
  return composeSession(DRILL_THEMES, LENGTH, SEED)
}

/** Render a session over all themes with no-op callbacks unless overridden. */
function renderSession(
  onComplete: (o: readonly DrillOutcome[]) => void = vi.fn(),
  onExit = vi.fn(),
) {
  render(
    <DrillSession
      themes={DRILL_THEMES}
      length={LENGTH}
      seed={SEED}
      onComplete={onComplete}
      onExit={onExit}
    />,
  )
  return { onComplete, onExit }
}

/** Pick the answer at `index` and return the engine's grade for the current spot. */
function answer(spot: ReturnType<typeof fixedSession>[number]['spot'], index: number) {
  fireEvent.click(screen.getByTestId(`answer-${index}`))
  return gradeSpot(spot, index)
}

describe('DrillSession — the loop', () => {
  it('opens on the first spot with its answer choices and a "spot 1 of N" indicator', () => {
    renderSession()
    expect(screen.getByTestId('drill-session')).toBeTruthy()
    expect(screen.getByTestId('drill-progress').textContent).toBe(`SPOT 1 OF ${LENGTH}`)
    const session = fixedSession()
    const answers = screen.getByTestId('answers')
    // The first spot's choices render in order.
    session[0]!.spot.choices.forEach((choice, i) => {
      expect(within(answers).getByTestId(`answer-${i}`).textContent).toBe(choice.label)
    })
  })

  it('grades a pick with the engine and renders its verdict + explanation', () => {
    renderSession()
    const spot = fixedSession()[0]!.spot
    // Answer with the engine's correct index so the verdict is "good" deterministically.
    const expected = gradeSpot(spot, gradeSpot(spot, 0).correctIndex)
    const grade = answer(spot, gradeSpot(spot, 0).correctIndex)

    expect(screen.getByTestId('result-sheet')).toBeTruthy()
    expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe('good')
    expect(grade.correct).toBe(true)

    // The deterministic numbers/explanation come straight from the engine via @holdem/format.
    const verdict = expected.verdict
    if (verdict === undefined) {
      // A calculation spot (ticket 0077) carries no coach verdict — the derived answer bucket + the
      // show-the-math explanation are rendered instead, both straight off gradeSpot.
      expect(screen.getByTestId('metric-answer').textContent).toBe(
        spot.choices[expected.correctIndex]!.label,
      )
      expect(screen.getByTestId('result-why').textContent).toBe(expected.explanation)
    } else if ('potOddsThreshold' in verdict) {
      expect(screen.getByTestId('metric-equity').textContent).toBe(pct(verdict.equity))
      expect(screen.getByTestId('result-why').textContent).toBe(explainDecision(verdict))
    } else {
      // A preflop spot: the chart rationale stands in for the metric row.
      expect(screen.getByTestId('result-rationale').textContent).toContain(verdict.rationale)
    }
  })

  it('answering incorrectly shows the leak verdict (never "WRONG"), naming the correct line', () => {
    renderSession()
    const spot = fixedSession()[0]!.spot
    const correctIndex = gradeSpot(spot, 0).correctIndex
    // Pick a DIFFERENT index than the correct one to force a leak.
    const wrongIndex = spot.choices.findIndex((_c, i) => i !== correctIndex)
    const grade = answer(spot, wrongIndex)
    // Only assert the leak path when the engine actually rules this pick a leak.
    if (!grade.correct) {
      expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe('leak')
      const sheet = screen.getByTestId('result-sheet')
      expect(sheet.textContent).not.toContain('WRONG')
      expect(sheet.textContent).toContain(spot.choices[grade.correctIndex]!.label)
    }
  })

  it('advancing moves to the next spot and runs the whole session to completion', () => {
    const onComplete = vi.fn()
    renderSession(onComplete)
    const session = fixedSession()

    for (let i = 0; i < LENGTH; i++) {
      expect(screen.getByTestId('drill-progress').textContent).toBe(`SPOT ${i + 1} OF ${LENGTH}`)
      // Answer each spot at index 0; advance via the CTA.
      fireEvent.click(screen.getByTestId('answer-0'))
      const last = i === LENGTH - 1
      expect(screen.getByTestId('result-cta').textContent).toContain(last ? 'Finish' : 'Next spot')
      fireEvent.click(screen.getByTestId('result-cta'))
    }

    // The last advance completes the session, handing every spot's outcome (one per spot, themed).
    expect(onComplete).toHaveBeenCalledTimes(1)
    const outcomes = onComplete.mock.calls[0]![0] as readonly DrillOutcome[]
    expect(outcomes).toHaveLength(LENGTH)
    outcomes.forEach((o, i) => {
      expect(o.theme.id).toBe(session[i]!.theme.id)
      expect(o.result.correct).toBe(gradeSpot(session[i]!.spot, 0).correct)
    })
  })

  it('Escape advances the loop (a11y, mirroring the lesson player / coach drawer)', () => {
    renderSession()
    expect(screen.getByTestId('drill-progress').textContent).toBe(`SPOT 1 OF ${LENGTH}`)
    fireEvent.click(screen.getByTestId('answer-0'))
    fireEvent.keyDown(window, { key: 'Escape' })
    // Escape advanced past the first spot.
    expect(screen.getByTestId('drill-progress').textContent).toBe(`SPOT 2 OF ${LENGTH}`)
    expect(screen.queryByTestId('result-sheet')).toBeNull()
  })

  it('Back exits the session without completing it', () => {
    const onComplete = vi.fn()
    const onExit = vi.fn()
    renderSession(onComplete, onExit)
    fireEvent.click(screen.getByTestId('drill-back'))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
