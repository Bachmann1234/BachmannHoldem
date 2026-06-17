/**
 * Play-side leak detection ([[0088-leak-detection]]) — the pedagogy guard of M6. Pure functions over the
 * {@link AggregatedHeroStats} the aggregation produces, so these tests pin the single most important
 * property of the milestone: the tri-state sample-size gate. They never build the hand log — they build
 * the stats directly (the detector reasons ONLY over stats), exactly as `mastery.test.ts` builds records
 * directly. No DOM, no IndexedDB.
 *
 * Coverage, per the ticket's "verify before returning":
 * - a leak FIRES (confirmed) when sample + threshold are both met;
 * - a stat that is genuinely TRENDING leak-ward but below sample returns pending with the correct
 *   hands-needed (NOT confirmed, NOT clear);
 * - the clear case (adequate sample, not crossing) returns nothing;
 * - the no-data edge cases are SILENT (clear), never a directional cue: absent position slice, null
 *   fraction, null AF ratio, and a fresh 0-hand player (no contradictory dual-VPIP pending).
 */

import { describe, expect, it } from 'vitest'
import type { Position } from '@holdem/coach'
import {
  AGGRESSION_SAMPLE_THRESHOLD,
  FOLD_TO_THREE_BET_SAMPLE_THRESHOLD,
  OVER_FOLD_BIG_BLIND_THRESHOLD,
  TOO_LOOSE_VPIP_THRESHOLD,
  TOO_PASSIVE_AF_THRESHOLD,
  TOO_TIGHT_VPIP_THRESHOLD,
  VPIP_SAMPLE_THRESHOLD,
  detectLeaks,
  type DetectedLeak,
  type LeakKey,
} from './leaks.js'
import type { AggregatedHeroStats, AggressionStat, HeroStats, RateStat } from './stats.js'

// --- builders -------------------------------------------------------------------------------------

/** A {@link RateStat} from numerator/denominator (mirrors stats.ts `rate` — null fraction at denom 0). */
function rate(count: number, denominator: number): RateStat {
  return { count, denominator, fraction: denominator === 0 ? null : count / denominator }
}

/** An {@link AggressionStat} from raw counts (mirrors stats.ts — null ratio when calls === 0). */
function af(aggressive: number, calls: number, hands: number): AggressionStat {
  return { aggressive, calls, ratio: calls === 0 ? null : aggressive / calls, hands }
}

/**
 * A {@link HeroStats} slice. Only the fields a given test exercises matter; the rest default to a benign
 * "clear / no sample" shape (zero hands → all stats below their gates and not trending) so a test that
 * cares only about VPIP doesn't accidentally trip the AF or fold-to-3bet rules.
 */
function heroStats(overrides: Partial<HeroStats> = {}): HeroStats {
  return {
    hands: 0,
    vpip: rate(0, 0),
    pfr: rate(0, 0),
    aggressionFactor: af(0, 0, 0),
    foldToThreeBet: rate(0, 0),
    ...overrides,
  }
}

/** An {@link AggregatedHeroStats} from an overall slice + optional per-position slices. */
function agg(
  overall: HeroStats,
  byPosition: ReadonlyArray<readonly [Position, HeroStats]> = [],
): AggregatedHeroStats {
  return { overall, byPosition: new Map(byPosition) }
}

/** Find the one leak with `key`, or undefined. */
function leakFor(leaks: readonly DetectedLeak[], key: LeakKey): DetectedLeak | undefined {
  return leaks.find((l) => l.key === key)
}

// --- over-fold the big blind (the canonical leak; gated on the NARROW fold-to-3bet denominator) --------

describe('over-fold-big-blind — gates on the narrow fold-to-3bet denominator, not hands played', () => {
  it('CONFIRMS when the BB slice has enough fold-to-3bet spots AND folds too often', () => {
    // 12 of 15 folds = 0.80 >= 0.70, over exactly the sample threshold (15).
    const bb = heroStats({
      hands: 200,
      foldToThreeBet: rate(12, FOLD_TO_THREE_BET_SAMPLE_THRESHOLD),
    })
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 200 }), [['big-blind', bb]])),
      'over-fold-big-blind',
    )
    expect(leak?.status).toBe('confirmed')
    expect(leak?.value).toBeCloseTo(0.8, 9)
    expect(leak?.sample).toBe(FOLD_TO_THREE_BET_SAMPLE_THRESHOLD)
    expect(leak?.handsNeeded).toBe(0)
  })

  it('PENDING with the right hands-needed when the SAME high fold rate is below the narrow sample', () => {
    // 4 of 5 folds = 0.80 (would cross the threshold) but only 5 qualifying spots — below 15.
    const bb = heroStats({ hands: 200, foldToThreeBet: rate(4, 5) })
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 200 }), [['big-blind', bb]])),
      'over-fold-big-blind',
    )
    expect(leak?.status).toBe('pending')
    expect(leak?.value).toBeCloseTo(0.8, 9)
    expect(leak?.sample).toBe(5)
    expect(leak?.handsNeeded).toBe(FOLD_TO_THREE_BET_SAMPLE_THRESHOLD - 5) // need 10 more spots
  })

  it('does NOT cry wolf on a thin sample even when total hands played is huge', () => {
    // The classic trap: 200 hands played, but only 3 fold-to-3bet spots (all folds). Must be pending,
    // gated on the narrow denominator (3), NOT confirmed off the big hands-played count.
    const bb = heroStats({ hands: 200, foldToThreeBet: rate(3, 3) })
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 200 }), [['big-blind', bb]])),
      'over-fold-big-blind',
    )
    expect(leak?.status).toBe('pending')
    expect(leak?.handsNeeded).toBe(FOLD_TO_THREE_BET_SAMPLE_THRESHOLD - 3)
  })

  it('CLEAR (omitted) when enough sample but folding at an honest rate', () => {
    // 6 of 20 = 0.30 < 0.70, well over the sample threshold.
    const bb = heroStats({ hands: 200, foldToThreeBet: rate(6, 20) })
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 200 }), [['big-blind', bb]])),
      'over-fold-big-blind',
    )
    expect(leak).toBeUndefined()
  })

  it('absent big-blind slice (unseen position) → CLEAR (silent), never a pending or confirmed leak', () => {
    // No BB data at all: we make no directional over-fold claim. Silence beats a bad signal.
    const leak = leakFor(detectLeaks(agg(heroStats({ hands: 200 }))), 'over-fold-big-blind')
    expect(leak).toBeUndefined()
  })

  it('null fraction (zero fold-to-3bet opportunities in the BB slice) is no-data → CLEAR, never folds-0%', () => {
    // The slice exists but the hero never opened-then-faced a 3bet: null fraction. No data ⇒ no claim.
    const bb = heroStats({ hands: 200, foldToThreeBet: rate(0, 0) })
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 200 }), [['big-blind', bb]])),
      'over-fold-big-blind',
    )
    expect(leak).toBeUndefined()
  })
})

// --- too passive (low AF; calls === 0 edge) ----------------------------------------------------------

describe('too-passive — low aggression factor, gated on hands played, calls===0 handled', () => {
  it('CONFIRMS when AF is low over enough hands', () => {
    // AF 5/10 = 0.5 <= 1.0, over 50 hands (>= 30).
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 50, aggressionFactor: af(5, 10, 50) }))),
      'too-passive',
    )
    expect(leak?.status).toBe('confirmed')
    expect(leak?.value).toBeCloseTo(0.5, 9)
    expect(leak?.sample).toBe(50)
    expect(leak?.handsNeeded).toBe(0)
  })

  it('PENDING with the right hands-needed when AF is low but hands are below sample', () => {
    const hands = 10
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands, aggressionFactor: af(1, 4, hands) }))),
      'too-passive',
    )
    expect(leak?.status).toBe('pending')
    expect(leak?.handsNeeded).toBe(AGGRESSION_SAMPLE_THRESHOLD - hands) // need 20 more
  })

  it('CLEAR when AF is healthy over enough hands', () => {
    // AF 30/10 = 3.0 > 1.0.
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 50, aggressionFactor: af(30, 10, 50) }))),
      'too-passive',
    )
    expect(leak).toBeUndefined()
  })

  it('calls===0 (null AF ratio) is treated as maximally aggressive, never a passive leak', () => {
    // All bets/raises, zero calls — ratio null. Even over a big sample this must NOT fire too-passive.
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands: 100, aggressionFactor: af(40, 0, 100) }))),
      'too-passive',
    )
    expect(leak).toBeUndefined()
  })
})

// --- VPIP: too loose / too tight (mutually exclusive, gated on hands played) -------------------------

describe('too-loose-vpip / too-tight-vpip — gated on hands played, mutually exclusive', () => {
  it('CONFIRMS too-loose when VPIP is high over enough hands', () => {
    // 25/50 = 0.50 >= 0.40, over 50 hands.
    const leaks = detectLeaks(agg(heroStats({ hands: 50, vpip: rate(25, 50) })))
    expect(leakFor(leaks, 'too-loose-vpip')?.status).toBe('confirmed')
    expect(leakFor(leaks, 'too-tight-vpip')).toBeUndefined() // cannot fire both
  })

  it('CONFIRMS too-tight when VPIP is low over enough hands', () => {
    // 4/50 = 0.08 <= 0.15, over 50 hands.
    const leaks = detectLeaks(agg(heroStats({ hands: 50, vpip: rate(4, 50) })))
    expect(leakFor(leaks, 'too-tight-vpip')?.status).toBe('confirmed')
    expect(leakFor(leaks, 'too-loose-vpip')).toBeUndefined()
  })

  it('PENDING too-loose with the right hands-needed below sample', () => {
    const hands = 12
    const leak = leakFor(
      detectLeaks(agg(heroStats({ hands, vpip: rate(7, hands) }))),
      'too-loose-vpip',
    )
    expect(leak?.status).toBe('pending') // 7/12 ≈ 0.58 trending loose
    expect(leak?.handsNeeded).toBe(VPIP_SAMPLE_THRESHOLD - hands) // need 18 more
  })

  it('CLEAR when VPIP is healthy over enough hands (neither rule fires)', () => {
    // 12/50 = 0.24 — between the tight floor and loose ceiling.
    const leaks = detectLeaks(agg(heroStats({ hands: 50, vpip: rate(12, 50) })))
    expect(leakFor(leaks, 'too-loose-vpip')).toBeUndefined()
    expect(leakFor(leaks, 'too-tight-vpip')).toBeUndefined()
  })

  it('null VPIP fraction (zero hands) is no-data → CLEAR — no false too-tight 0% leak', () => {
    // A fresh player with 0 hands: VPIP fraction null. No data ⇒ no directional claim, so NEITHER the
    // too-tight (0% would look nit-tight) NOR the too-loose rule may fire — both must be silent.
    const leaks = detectLeaks(agg(heroStats({ hands: 0, vpip: rate(0, 0) })))
    expect(leakFor(leaks, 'too-tight-vpip')).toBeUndefined()
    expect(leakFor(leaks, 'too-loose-vpip')).toBeUndefined()
  })
})

// --- thresholds are sane named knobs ----------------------------------------------------------------

describe('thresholds — exported, documented tunable knobs', () => {
  it('sample thresholds are positive and the fold-to-3bet gate is the narrowest', () => {
    expect(VPIP_SAMPLE_THRESHOLD).toBeGreaterThan(0)
    expect(AGGRESSION_SAMPLE_THRESHOLD).toBeGreaterThan(0)
    expect(FOLD_TO_THREE_BET_SAMPLE_THRESHOLD).toBeGreaterThan(0)
    expect(FOLD_TO_THREE_BET_SAMPLE_THRESHOLD).toBeLessThan(VPIP_SAMPLE_THRESHOLD)
  })

  it('leak thresholds bound the VPIP rules so loose and tight cannot both fire', () => {
    expect(TOO_TIGHT_VPIP_THRESHOLD).toBeLessThan(TOO_LOOSE_VPIP_THRESHOLD)
    expect(OVER_FOLD_BIG_BLIND_THRESHOLD).toBeGreaterThan(0)
    expect(OVER_FOLD_BIG_BLIND_THRESHOLD).toBeLessThanOrEqual(1)
    expect(TOO_PASSIVE_AF_THRESHOLD).toBeGreaterThan(0)
  })
})

// --- the empty / fresh-player aggregate (everything pending or clear, nothing confirmed) -------------

describe('a fresh player (empty aggregate) is told NOTHING — silence beats a bad signal', () => {
  it('returns an EMPTY list on zero hands — no leaks of any status', () => {
    // Every stat is no-data (null fraction/ratio, absent BB slice). No directional claim is honest, so
    // the detector says nothing — in particular it does NOT emit the old contradictory dual-VPIP pending
    // (too-loose "too many hands" AND too-tight "too few hands" at once) or a backwards aggression nag.
    const leaks = detectLeaks(agg(heroStats({ hands: 0 })))
    expect(leaks).toEqual([])
  })

  it('a maximally aggressive player (calls===0) below sample is silent — no backwards too-passive pending', () => {
    // null AF ratio + thin sample: the OLD code emitted a "your aggression is looking low" pending. It must
    // now be clear (silent) — they are the most aggressive possible, the opposite of the cue.
    const leaks = detectLeaks(agg(heroStats({ hands: 5, aggressionFactor: af(20, 0, 5) })))
    expect(leakFor(leaks, 'too-passive')).toBeUndefined()
  })
})
