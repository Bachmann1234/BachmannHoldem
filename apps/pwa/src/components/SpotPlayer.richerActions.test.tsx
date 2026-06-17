// @vitest-environment jsdom
/**
 * SpotPlayer richer-actions test (ticket 0078) — proves a Call/Raise/Fold coach spot renders its third
 * button and grades it through the SHARED {@link SpotPlayer} pieces, with correctness derived ENTIRELY
 * from the live coach (`gradeSpot` → `coachDecision`), never an authored "raise is right" key.
 *
 * The load-bearing assertion: Raise and Call grade IDENTICALLY (both are coach continues) — so on a spot
 * where continuing is correct, BOTH light up correct, exactly as the coach would rule at the table.
 */

import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { generateSpot } from '@holdem/drills'
import { gradeSpot, type CoachSpot, type GradeResult } from '@holdem/curriculum'
import { ResultSheet, SpotAnswers, SpotView } from './SpotPlayer.js'

afterEach(cleanup)

/** A generated Call/Raise/Fold coach spot for a fixed seed — deterministic, graded by the live coach. */
function raiseSpot(seed: number): CoachSpot {
  return generateSpot(seed, {
    kind: 'coach',
    priceMode: 'priced',
    actions: 'call-raise-fold',
  }) as CoachSpot
}

function Harness({ spot }: { readonly spot: CoachSpot }): React.JSX.Element {
  const [chosen, setChosen] = useState<number | null>(null)
  const [result, setResult] = useState<GradeResult | null>(null)
  return (
    <>
      <SpotView spot={spot} />
      <SpotAnswers
        spot={spot}
        chosen={chosen}
        result={result}
        onPick={(i) => {
          setChosen(i)
          setResult(gradeSpot(spot, i))
        }}
      />
      {result !== null ? (
        <ResultSheet
          result={result}
          spot={spot}
          title="Drill review"
          ctaLabel="Next spot →"
          ariaLabel="Drill review"
          onAdvance={() => {}}
          onClose={() => {}}
        />
      ) : null}
    </>
  )
}

describe('SpotPlayer — richer actions (Call / Raise / Fold)', () => {
  it('renders all three buttons in order', () => {
    const spot = raiseSpot(7)
    render(<Harness spot={spot} />)
    const answers = screen.getByTestId('answers')
    expect(within(answers).getByTestId('answer-0').textContent).toBe('Call')
    expect(within(answers).getByTestId('answer-1').textContent).toBe('Raise')
    expect(within(answers).getByTestId('answer-2').textContent).toBe('Fold')
  })

  it('Raise grades exactly like Call (coach-derived) — both correct when continuing is right', () => {
    // Find a seed where the coach blesses continuing (Call is correct). Raise must grade the same way,
    // because the coach scores both as non-fold continues — proof the third button is coach-derived.
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((s) => gradeSpot(raiseSpot(s), 0).correct)
    expect(seed).toBeDefined()
    const spot = raiseSpot(seed!)

    // Call (0) and Raise (1) grade identically through the real engine.
    expect(gradeSpot(spot, 0).correct).toBe(true)
    expect(gradeSpot(spot, 1).correct).toBe(true)

    render(<Harness spot={spot} />)
    fireEvent.click(screen.getByTestId('answer-1')) // tap Raise
    expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe('good')
  })

  it('renders all three buttons and grading a Raise surfaces the result sheet (render-layer parity)', () => {
    // A second render-layer pin: the three-button spot renders Call/Raise/Fold AND tapping Raise drives the
    // shared ResultSheet up with the coach's ruling on the player's OWN action — exactly the pick→grade→sheet
    // round-trip DrillSession runs, so the richer action set is wired through the shared pieces, not special-
    // cased. The verdict is whatever the live coach rules (no answer key); we assert the sheet appears and
    // mirrors gradeSpot, not a hardcoded outcome.
    const spot = raiseSpot(7)
    const raiseGrade = gradeSpot(spot, 1) // the coach's ruling on the Raise the player will tap

    render(<Harness spot={spot} />)
    const answers = screen.getByTestId('answers')
    expect(within(answers).getByTestId('answer-0').textContent).toBe('Call')
    expect(within(answers).getByTestId('answer-1').textContent).toBe('Raise')
    expect(within(answers).getByTestId('answer-2').textContent).toBe('Fold')
    // No sheet before the player answers.
    expect(screen.queryByTestId('result-sheet')).toBeNull()

    fireEvent.click(within(answers).getByTestId('answer-1')) // tap Raise

    // The sheet is now up, reflecting the live grade of the Raise — verdict straight from gradeSpot, never
    // authored copy. The coach spot renders its verdict-label headline and the deterministic "why" line
    // separately, so the gradeSpot explanation (LABEL + why line) ends with the rendered "why".
    expect(screen.getByTestId('result-sheet')).toBeTruthy()
    expect(screen.getByTestId('result-verdict').getAttribute('data-verdict')).toBe(
      raiseGrade.verdict!.verdict,
    )
    const why = screen.getByTestId('result-why').textContent!
    expect(why.length).toBeGreaterThan(0)
    expect(raiseGrade.explanation).toContain(why) // the rendered why is the tail of gradeSpot's explanation
  })
})
