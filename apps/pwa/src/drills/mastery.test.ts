/**
 * Per-concept mastery + the adaptive mastery→difficulty derivation (ticket 0081). All pure functions over
 * the durable store's {@link DrillProgressRecord}s — so this pins the aggregation (`correct / total`), the
 * mastery→difficulty mapping (rises with mastery, eases when it drops), the low-mastery bias selection, the
 * review+mastery merge (reusing 0080's single bias seam), and the per-theme difficulty baking. No DOM, no
 * IndexedDB — the policy is tested in isolation, exactly as the store's `foldOutcome`/`weakConcepts` are.
 */

import { describe, expect, it } from 'vitest'
import { DRILL_THEMES, resolveConfig } from '@holdem/drills'
import {
  applyDifficulty,
  difficultyForMastery,
  formatMastery,
  lowMasteryConcepts,
  masteryByConcept,
  mergeBiasConcepts,
  MASTERY_HARD_THRESHOLD,
  MASTERY_REPS_THRESHOLD,
  MASTERY_WEAK_THRESHOLD,
  type ConceptMastery,
} from './mastery.js'
import { DRILL_PROGRESS_SCHEMA_VERSION, type DrillProgressRecord } from './record.js'

/** Build a record for one concept with a given correct/total (recency fields inert for these tests). */
function rec(concept: string, correct: number, total: number): DrillProgressRecord {
  return {
    schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
    concept: concept as DrillProgressRecord['concept'],
    correct,
    total,
    missStreak: 0,
    lastDrilledAt: 0,
    lastMissedAt: 0,
  }
}

describe('masteryByConcept — the read-side aggregation (correct / total)', () => {
  it('projects each record to its mastery fraction + rep count, keyed by concept', () => {
    const m = masteryByConcept([rec('pot-odds', 28, 40), rec('equity', 5, 10)])
    expect(m.get('pot-odds')).toEqual({ concept: 'pot-odds', fraction: 0.7, reps: 40 })
    expect(m.get('equity')).toEqual({ concept: 'equity', fraction: 0.5, reps: 10 })
  })

  it('skips a degenerate empty (total === 0) record — no division by zero', () => {
    const m = masteryByConcept([rec('ev', 0, 0)])
    expect(m.has('ev')).toBe(false)
  })

  it('does not re-aggregate — it is a pure projection of the store records', () => {
    // One record per concept in, one mastery view out: the store already aggregated, this only divides.
    const m = masteryByConcept([rec('pot-odds', 7, 10)])
    expect(m.size).toBe(1)
    expect(m.get('pot-odds')!.fraction).toBeCloseTo(0.7, 9)
  })
})

describe('formatMastery — the readout ("70% over 40 reps")', () => {
  it('renders the percent and a pluralised rep count', () => {
    expect(formatMastery({ concept: 'pot-odds', fraction: 0.7, reps: 40 })).toEqual({
      percent: '70%',
      reps: '40 reps',
    })
    expect(formatMastery({ concept: 'equity', fraction: 1, reps: 1 })).toEqual({
      percent: '100%',
      reps: '1 rep',
    })
  })

  it('returns undefined for an unseen concept (so the UI shows "not drilled yet", not "0% over 0")', () => {
    expect(formatMastery(undefined)).toBeUndefined()
  })
})

describe('difficultyForMastery — adaptive: rises with mastery, eases when it drops', () => {
  it('an unseen concept is standard (a beginner starts gentle)', () => {
    expect(difficultyForMastery(undefined)).toBe('standard')
  })

  it('a high-mastery, well-sampled concept earns hard parameters', () => {
    const m: ConceptMastery = {
      concept: 'pot-odds',
      fraction: MASTERY_HARD_THRESHOLD,
      reps: MASTERY_REPS_THRESHOLD,
    }
    expect(difficultyForMastery(m)).toBe('hard')
  })

  it('a thin sample stays standard even at perfect accuracy (not enough evidence yet)', () => {
    const m: ConceptMastery = { concept: 'pot-odds', fraction: 1, reps: MASTERY_REPS_THRESHOLD - 1 }
    expect(difficultyForMastery(m)).toBe('standard')
  })

  it('eases back to standard the moment accuracy slips below the hard threshold', () => {
    const m: ConceptMastery = {
      concept: 'pot-odds',
      fraction: MASTERY_HARD_THRESHOLD - 0.01,
      reps: 50,
    }
    expect(difficultyForMastery(m)).toBe('standard')
  })
})

describe('lowMasteryConcepts — the chronic-weakness bias input', () => {
  it('selects well-sampled concepts below the weak threshold, weakest first', () => {
    const m = masteryByConcept([
      rec('pot-odds', 3, 20), // 15% — weak
      rec('equity', 5, 10), // 50% — weak
      rec('ranges', 9, 10), // 90% — strong
    ])
    expect(lowMasteryConcepts(m)).toEqual(['pot-odds', 'equity'])
  })

  it('excludes a thinly-sampled concept (a couple of early misses is not yet a leak)', () => {
    const m = masteryByConcept([rec('pot-odds', 0, MASTERY_REPS_THRESHOLD - 1)])
    expect(lowMasteryConcepts(m)).toEqual([])
  })

  it('a concept exactly at the weak threshold is not weak (strict <)', () => {
    const m = masteryByConcept([
      rec('equity', Math.round(MASTERY_WEAK_THRESHOLD * 20), 20), // exactly the threshold
    ])
    expect(lowMasteryConcepts(m)).toEqual([])
  })
})

describe('mergeBiasConcepts — reuses 0080’s single bias seam (union, deduped)', () => {
  it('unions review + low-mastery concepts, review-first, no duplicates', () => {
    expect(mergeBiasConcepts(['pot-odds', 'equity'], ['equity', 'ranges'])).toEqual([
      'pot-odds',
      'equity',
      'ranges',
    ])
  })

  it('is a no-op when both inputs are empty', () => {
    expect(mergeBiasConcepts([], [])).toEqual([])
  })
})

describe('applyDifficulty — bakes per-concept difficulty into the theme configs', () => {
  it('a mastered concept’s themes are dealt hard; the rest stay standard', () => {
    const mastery = masteryByConcept([rec('pot-odds', 38, 40)]) // 95% over 40 → hard
    const dealt = applyDifficulty([...DRILL_THEMES], mastery)
    for (const theme of dealt) {
      const expected = theme.concept === 'pot-odds' ? 'hard' : 'standard'
      expect(resolveConfig(theme.config).difficulty).toBe(expected)
    }
  })

  it('preserves the theme identity (id / title / concept) — only config.difficulty changes', () => {
    const dealt = applyDifficulty([...DRILL_THEMES], new Map())
    dealt.forEach((theme, i) => {
      expect(theme.id).toBe(DRILL_THEMES[i]!.id)
      expect(theme.concept).toBe(DRILL_THEMES[i]!.concept)
      // With no mastery, every concept resolves to the standard (default) difficulty.
      expect(resolveConfig(theme.config).difficulty).toBe('standard')
    })
  })
})
