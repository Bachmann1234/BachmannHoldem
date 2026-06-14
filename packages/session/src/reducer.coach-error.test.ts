/**
 * Locks the reducer's coach-error degrade path (ticket 0041): when the coach throws while grading a
 * hero decision, the reducer swallows it into `coach.kind === 'error'` so a coaching failure never
 * crashes the hand. The HandState is real (`createInitialModel` + `start-hand` + a legal call); only
 * the coach dependency is forced to throw — this is the one branch a real `DecisionContext` can't
 * reach (it always has `numActive >= 2`, so `coachDecision`/`gradePreflop` never throw in practice).
 *
 * Isolated in its own file so the module mock doesn't leak into the other reducer tests, which
 * assert real verdicts.
 */

import { describe, it, expect, vi } from 'vitest'
import { makeDeck } from '@holdem/engine'
import { createInitialModel } from './model.js'
import { reducer } from './reducer.js'

// Force the preflop grader to throw; keep every other coach export real. vitest hoists this above
// the imports so `reducer.js` binds to the mocked module.
vi.mock('@holdem/coach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@holdem/coach')>()),
  gradePreflop: () => {
    throw new Error('boom')
  },
}))

describe('reducer — coach-error degrade (ticket 0041)', () => {
  it("degrades to coach.kind 'error' when grading throws, without crashing the hand", () => {
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck: makeDeck() })
    expect(model.phase).toBe('playing')
    expect(model.hand!.toAct).toBe(model.heroSeat) // heads-up, the hero acts first

    // The hero calls — a legal action, so the hand still advances — but grading throws.
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })

    // The throw is swallowed into an advisory error notice, not propagated.
    expect(model.coach.kind).toBe('error')
    if (model.coach.kind === 'error') {
      expect(model.coach.message).toContain('Coaching unavailable')
      expect(model.coach.message).toContain('boom')
    }
    // Coaching failing did NOT crash the hand: it advanced past the hero's call to the opponent.
    expect(model.hand).not.toBeNull()
    expect(model.hand!.toAct).not.toBe(model.heroSeat)
  })
})
