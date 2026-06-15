/**
 * Co-located unit tests for the preflop position model (ticket 0058 extracted it from `preflop.ts`).
 * The *exhaustive* `classifyPosition` seat-geometry suite lives in `preflop.test.ts` (it also proves
 * the re-export that keeps the `@holdem/coach` API unchanged); these are focused checks against the
 * module directly — a smoke test per bucket plus the pure {@link isInPosition} / {@link WIDENING_POSITIONS}
 * helpers that have no other direct coverage.
 */

import { describe, expect, it } from 'vitest'
import type { DecisionContext } from '@holdem/bots'
import { classifyPosition, isInPosition, WIDENING_POSITIONS, type Position } from './position.js'

/**
 * Build the minimal {@link DecisionContext} {@link classifyPosition} reads — it consults only
 * `seat` / `buttonIndex` / `numPlayers`, so the rest is irrelevant to the geometry under test (cast
 * as the codebase's test helpers do, e.g. `preflop.test.ts`).
 */
function posCtx(seat: number, buttonIndex: number, numPlayers: number): DecisionContext {
  return { seat, buttonIndex, numPlayers } as unknown as DecisionContext
}

describe('classifyPosition — smoke (full geometry suite in preflop.test.ts)', () => {
  it('classes each 6-max bucket (button on seat 0)', () => {
    expect(classifyPosition(posCtx(0, 0, 6))).toBe('late') // BTN
    expect(classifyPosition(posCtx(5, 0, 6))).toBe('late') // CO
    expect(classifyPosition(posCtx(1, 0, 6))).toBe('small-blind') // SB
    expect(classifyPosition(posCtx(2, 0, 6))).toBe('big-blind') // BB
    expect(classifyPosition(posCtx(3, 0, 6))).toBe('early') // UTG
  })

  it('heads-up: the button(=SB) is late, the other seat is the big blind', () => {
    expect(classifyPosition(posCtx(0, 0, 2))).toBe('late')
    expect(classifyPosition(posCtx(1, 0, 2))).toBe('big-blind')
  })
})

describe('isInPosition', () => {
  it('is true only in late position', () => {
    expect(isInPosition('late')).toBe(true)
    const notInPosition: Position[] = ['early', 'middle', 'small-blind', 'big-blind']
    for (const p of notInPosition) {
      expect(isInPosition(p)).toBe(false)
    }
  })
})

describe('WIDENING_POSITIONS', () => {
  it('contains the steal seats (late / small-blind) and excludes early/middle/big-blind', () => {
    expect(WIDENING_POSITIONS.has('late')).toBe(true)
    expect(WIDENING_POSITIONS.has('small-blind')).toBe(true)
    expect(WIDENING_POSITIONS.has('early')).toBe(false)
    expect(WIDENING_POSITIONS.has('middle')).toBe(false)
    // The big blind is deliberately NOT a widening seat (the SB↔BB conflation fix).
    expect(WIDENING_POSITIONS.has('big-blind')).toBe(false)
  })
})
