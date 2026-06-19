/**
 * Co-located unit tests for the preflop position model (ticket 0058 extracted it from `preflop.ts`).
 * The *exhaustive* `classifyPosition` seat-geometry suite lives in `preflop.test.ts` (it also proves
 * the re-export that keeps the `@holdem/coach` API unchanged); these are focused checks against the
 * module directly — a smoke test per bucket plus the pure {@link isInPosition} / {@link WIDENING_POSITIONS}
 * helpers that have no other direct coverage.
 */

import { describe, expect, it } from 'vitest'
import type { DecisionContext } from '@holdem/bots'
import {
  classifyPosition,
  isInPosition,
  onlyBlindsBehind,
  WIDENING_POSITIONS,
  type Position,
} from './position.js'

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

describe('onlyBlindsBehind — the blind-steal-seat gate (button / SB, never the cutoff)', () => {
  it('is true on the button and the small blind, false on the cutoff (6-max, button on seat 0)', () => {
    expect(onlyBlindsBehind(posCtx(0, 0, 6))).toBe(true) // BTN: only the two blinds behind
    expect(onlyBlindsBehind(posCtx(1, 0, 6))).toBe(true) // SB: only the BB behind
    expect(onlyBlindsBehind(posCtx(5, 0, 6))).toBe(false) // CO: the button still acts behind it
    expect(onlyBlindsBehind(posCtx(3, 0, 6))).toBe(false) // UTG
  })

  it('heads-up: true on the button(=SB), false on the big blind', () => {
    expect(onlyBlindsBehind(posCtx(0, 0, 2))).toBe(true) // button is the SB, only the BB behind
    expect(onlyBlindsBehind(posCtx(1, 0, 2))).toBe(false) // the big blind
  })

  it('4-handed: the lone first-to-act seat is the cutoff (false), not the button (true)', () => {
    // Button on seat 1 → sb=2, bb=3, and seat 0 is first to act: the cutoff (offset 1), classified
    // `late` but with the button still behind — so NOT a blind-steal seat. This is the reported spot.
    expect(classifyPosition(posCtx(0, 1, 4))).toBe('late')
    expect(onlyBlindsBehind(posCtx(0, 1, 4))).toBe(false) // the button (seat 1) acts behind the hero
    expect(onlyBlindsBehind(posCtx(1, 1, 4))).toBe(true) // the actual button
    expect(onlyBlindsBehind(posCtx(2, 1, 4))).toBe(true) // the small blind
  })
})
