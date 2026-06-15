/**
 * Co-located unit tests for the preflop rationale builders (ticket 0058 extracted them from
 * `preflop.ts`). The builders are also exercised end-to-end through `gradePreflop`'s `.rationale`
 * assertions in `preflop.test.ts`; these are direct unit checks of the pure string output — including
 * the {@link openFoldRationale} defensive fallback that `gradePreflop` never reaches (premium/strong
 * never fold via the open path), so it has no other coverage.
 */

import { describe, expect, it } from 'vitest'
import { formatRaiseSize, openFoldRationale, TIER_RATIONALE } from './rationale.js'

describe('formatRaiseSize', () => {
  it('renders the rounded big-blind multiple as an "Nx raise" phrase', () => {
    expect(formatRaiseSize(3)).toBe('a 3x raise')
    expect(formatRaiseSize(10)).toBe('a 10x raise')
  })
})

describe('TIER_RATIONALE', () => {
  it('has a strength descriptor for every tier, with no false "makes no money" absolute on trash', () => {
    expect(TIER_RATIONALE.premium).toMatch(/premium/i)
    expect(TIER_RATIONALE.trash).toMatch(/trash/i)
    // 0056: trash is described as the unconnected tail, never "it makes no money over time".
    expect(TIER_RATIONALE.trash).not.toMatch(/makes no money/i)
  })
})

describe('openFoldRationale', () => {
  it('opens: premium/strong keep their strength label; marginal/playable name the open', () => {
    expect(openFoldRationale('premium', 'late', 'open', false)).toBe(TIER_RATIONALE.premium)
    expect(openFoldRationale('marginal', 'late', 'open', false)).toMatch(/open it/i)
    expect(openFoldRationale('playable', 'late', 'open', false)).toMatch(/open it from here/i)
  })

  it('opens trash via the steal line (the STEAL_OPEN_RANGE promotion)', () => {
    expect(openFoldRationale('trash', 'late', 'open', true)).toMatch(/steal/i)
  })

  it('folds: a position-relative line that never asserts a false universal', () => {
    expect(openFoldRationale('playable', 'early', 'fold', false)).toMatch(/early position/i)
    expect(openFoldRationale('marginal', 'early', 'fold', false)).toMatch(/fold from earlier/i)
  })

  it('folds trash: canStealLater splits the steal hand from the never-open tail', () => {
    // A steal-range trash hand folding here may honestly note it steals elsewhere…
    expect(openFoldRationale('trash', 'early', 'fold', true)).toMatch(/steal/i)
    // …but the never-open tail (canStealLater=false) must NOT claim a steal or "opens later".
    const tail = openFoldRationale('trash', 'early', 'fold', false)
    expect(tail).not.toMatch(/steal/i)
    expect(tail).toMatch(/fold it/i)
  })

  it('falls back to the strength label for any other fold (premium/strong — unreachable via gradePreflop)', () => {
    // premium/strong never fold through the open path in gradePreflop, so this defensive branch has
    // no integration coverage; exercise it directly here.
    expect(openFoldRationale('premium', 'late', 'fold', false)).toBe(TIER_RATIONALE.premium)
    expect(openFoldRationale('strong', 'middle', 'fold', false)).toBe(TIER_RATIONALE.strong)
  })
})
