import { describe, expect, it } from 'vitest'

import type { RangeWidth } from './handReading.js'
import {
  DEFAULT_PERSONALITY,
  LOOSE_AGGRESSIVE,
  LOOSE_PASSIVE,
  PERSONALITIES,
  TIGHT_AGGRESSIVE,
  TIGHT_PASSIVE,
  validatePersonality,
  type Personality,
} from './personality.js'

const ALL: readonly Personality[] = [
  TIGHT_AGGRESSIVE,
  LOOSE_AGGRESSIVE,
  TIGHT_PASSIVE,
  LOOSE_PASSIVE,
]

describe('presets — well-formed', () => {
  it('every preset passes validation', () => {
    for (const p of ALL) {
      expect(() => validatePersonality(p)).not.toThrow()
      expect(validatePersonality(p)).toBe(p) // returned unchanged for pipelining
    }
  })

  it('the default is the TAG preset', () => {
    expect(DEFAULT_PERSONALITY).toBe(TIGHT_AGGRESSIVE)
  })

  it('PERSONALITIES indexes all four quadrants', () => {
    expect(PERSONALITIES.tag).toBe(TIGHT_AGGRESSIVE)
    expect(PERSONALITIES.lag).toBe(LOOSE_AGGRESSIVE)
    expect(PERSONALITIES.rock).toBe(TIGHT_PASSIVE)
    expect(PERSONALITIES.station).toBe(LOOSE_PASSIVE)
  })

  it('each preset has a non-empty display name', () => {
    for (const p of ALL) expect(p.name.length).toBeGreaterThan(0)
  })
})

describe('presets — meaningfully distinct', () => {
  it('tight bots demand more equity to continue than loose bots', () => {
    // Tight quadrant thresholds both exceed both loose quadrant thresholds.
    expect(TIGHT_PASSIVE.tightness.continueEquity).toBeGreaterThan(
      LOOSE_AGGRESSIVE.tightness.continueEquity,
    )
    expect(TIGHT_PASSIVE.tightness.continueEquity).toBeGreaterThan(
      LOOSE_PASSIVE.tightness.continueEquity,
    )
    expect(TIGHT_AGGRESSIVE.tightness.continueEquity).toBeGreaterThan(
      LOOSE_AGGRESSIVE.tightness.continueEquity,
    )
    expect(TIGHT_AGGRESSIVE.tightness.continueEquity).toBeGreaterThan(
      LOOSE_PASSIVE.tightness.continueEquity,
    )
  })

  it('aggressive bots bet/raise more often than passive bots', () => {
    expect(TIGHT_AGGRESSIVE.aggression.betFrequency).toBeGreaterThan(
      TIGHT_PASSIVE.aggression.betFrequency,
    )
    expect(LOOSE_AGGRESSIVE.aggression.betFrequency).toBeGreaterThan(
      LOOSE_PASSIVE.aggression.betFrequency,
    )
    expect(LOOSE_AGGRESSIVE.aggression.betFrequency).toBeGreaterThan(
      TIGHT_PASSIVE.aggression.betFrequency,
    )
  })

  it('aggressive bots size up at least as large as passive bots', () => {
    expect(TIGHT_AGGRESSIVE.aggression.betSizing).toBeGreaterThan(
      TIGHT_PASSIVE.aggression.betSizing,
    )
    expect(LOOSE_AGGRESSIVE.aggression.betSizing).toBeGreaterThan(
      LOOSE_PASSIVE.aggression.betSizing,
    )
  })

  it('the assumed villain range widens from tight presets to loose presets', () => {
    // Encode the RangeWidth ordering and assert tight presets sit at/under loose ones.
    const order: Record<RangeWidth, number> = {
      ultraTight: 0,
      tight: 1,
      medium: 2,
      loose: 3,
      anyTwo: 4,
    }
    expect(order[TIGHT_PASSIVE.tightness.assumedVillainRange]).toBeLessThan(
      order[LOOSE_PASSIVE.tightness.assumedVillainRange],
    )
    expect(order[TIGHT_AGGRESSIVE.tightness.assumedVillainRange]).toBeLessThan(
      order[LOOSE_AGGRESSIVE.tightness.assumedVillainRange],
    )
  })
})

describe('validatePersonality — rejects out-of-range knobs', () => {
  // A known-good base to perturb one knob at a time.
  const base = TIGHT_AGGRESSIVE

  const withTightness = (patch: Partial<Personality['tightness']>): Personality => ({
    ...base,
    tightness: { ...base.tightness, ...patch },
  })
  const withAggression = (patch: Partial<Personality['aggression']>): Personality => ({
    ...base,
    aggression: { ...base.aggression, ...patch },
  })

  it('rejects continueEquity below 0', () => {
    expect(() => validatePersonality(withTightness({ continueEquity: -0.01 }))).toThrow(
      /continueEquity must be a fraction in 0\.\.1/,
    )
  })

  it('rejects continueEquity above 1', () => {
    expect(() => validatePersonality(withTightness({ continueEquity: 1.5 }))).toThrow(
      /continueEquity must be a fraction in 0\.\.1/,
    )
  })

  it('rejects a non-finite continueEquity', () => {
    expect(() => validatePersonality(withTightness({ continueEquity: NaN }))).toThrow(
      /continueEquity must be a fraction in 0\.\.1/,
    )
  })

  it('rejects an unknown assumedVillainRange', () => {
    expect(() =>
      validatePersonality(withTightness({ assumedVillainRange: 'nonsense' as RangeWidth })),
    ).toThrow(/assumedVillainRange must be a valid RangeWidth/)
  })

  it('rejects betFrequency out of 0..1', () => {
    expect(() => validatePersonality(withAggression({ betFrequency: 1.2 }))).toThrow(
      /betFrequency must be a fraction in 0\.\.1/,
    )
  })

  it('rejects zero betSizing', () => {
    expect(() => validatePersonality(withAggression({ betSizing: 0 }))).toThrow(
      /betSizing must be a number > 0/,
    )
  })

  it('rejects negative betSizing', () => {
    expect(() => validatePersonality(withAggression({ betSizing: -1 }))).toThrow(
      /betSizing must be a number > 0/,
    )
  })

  it('rejects a non-finite betSizing', () => {
    expect(() => validatePersonality(withAggression({ betSizing: Infinity }))).toThrow(
      /betSizing must be a number > 0/,
    )
  })

  it('accepts the boundary fractions 0 and 1', () => {
    expect(() => validatePersonality(withTightness({ continueEquity: 0 }))).not.toThrow()
    expect(() => validatePersonality(withAggression({ betFrequency: 1 }))).not.toThrow()
  })
})
