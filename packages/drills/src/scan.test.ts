import { describe, expect, it } from 'vitest'
import { scanCumulativeWeights } from './scan.js'

describe('scanCumulativeWeights — the shared cumulative-weight scan', () => {
  // The contract both callers depend on: return the first index whose cumulative weight sum EXCEEDS the
  // threshold, with the last index as the `threshold → total` fallback. Pinned at the three boundaries the
  // two seeded draws (weightedPick's float, pickByDifficulty's int) actually stress.

  it('threshold 0 lands in the first bucket (the floor)', () => {
    // A zero threshold goes negative as soon as the first positive weight is subtracted → index 0.
    expect(scanCumulativeWeights([1, 1, 1], 0)).toBe(0)
    expect(scanCumulativeWeights([5, 2, 3], 0)).toBe(0)
  })

  it('a threshold just below the total lands in the LAST bucket', () => {
    // total = 3; 2.999 walks past buckets 0 and 1 (sums 1, 2) and goes negative inside bucket 2.
    expect(scanCumulativeWeights([1, 1, 1], 2.999)).toBe(2)
    // Uneven weights: total = 10; 9.5 falls inside the final weight-3 bucket [7, 10).
    expect(scanCumulativeWeights([5, 2, 3], 9.5)).toBe(2)
  })

  it('a threshold AT (or past) the total hits the final-element fallback', () => {
    // The `r → 1` edge a float draw can reach (r * total === total): the running sum never goes negative,
    // so the loop falls through to the last index rather than returning -1 / overrunning.
    expect(scanCumulativeWeights([1, 1, 1], 3)).toBe(2)
    expect(scanCumulativeWeights([5, 2, 3], 10)).toBe(2)
    expect(scanCumulativeWeights([5, 2, 3], 11)).toBe(2)
  })

  it('lands in the interior bucket the running sum first passes (uniform weights = a plain floor)', () => {
    // With all-1 weights the scan reduces to floor(threshold) — the byte-for-byte uniform-draw reduction
    // weightedPick / pickByDifficulty rely on when every weight is 1.
    expect(scanCumulativeWeights([1, 1, 1, 1], 0.5)).toBe(0)
    expect(scanCumulativeWeights([1, 1, 1, 1], 1)).toBe(1)
    expect(scanCumulativeWeights([1, 1, 1, 1], 2.4)).toBe(2)
  })

  it('respects a boundary at an exact cumulative sum (the upper bucket wins)', () => {
    // total to the end of bucket 0 is 5; a threshold of exactly 5 has not gone negative yet (5 - 5 === 0,
    // not < 0), so it belongs to the NEXT bucket — the same half-open behaviour the inline loops had.
    expect(scanCumulativeWeights([5, 2, 3], 5)).toBe(1)
  })
})
