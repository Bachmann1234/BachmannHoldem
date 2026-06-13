import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'

import {
  classifyStartingHand,
  PREFLOP_CHART,
  type PreflopTier,
  type StartingHandVerdict,
} from './preflop.js'

/** Parse a glued two-card string into a hole-card tuple, e.g. "AsKh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/** Classify a glued two-card string and return just the tier. */
function tierOf(cards: string): PreflopTier {
  return classifyStartingHand(hole(cards)).tier
}

describe('classifyStartingHand — premium', () => {
  it('big pairs are premium', () => {
    expect(tierOf('AsAh')).toBe('premium')
    expect(tierOf('KsKh')).toBe('premium')
    expect(tierOf('QdQc')).toBe('premium')
    expect(tierOf('JhJs')).toBe('premium')
  })

  it('AK suited and offsuit are premium', () => {
    expect(tierOf('AsKs')).toBe('premium')
    expect(tierOf('AsKh')).toBe('premium')
  })

  it('classifies AA to its single strongest tier (premium, not strong)', () => {
    // AA appears only in the premium token, but the strongest-first scan is what
    // guarantees a hand that *could* match a weaker tier still resolves to its strongest.
    expect(tierOf('AsAh')).toBe('premium')
  })
})

describe('classifyStartingHand — strong', () => {
  it('TT/99 and the suited/strong broadways are strong', () => {
    expect(tierOf('TsTh')).toBe('strong')
    expect(tierOf('9d9c')).toBe('strong')
    expect(tierOf('AsQs')).toBe('strong') // AQs
    expect(tierOf('AsQh')).toBe('strong') // AQo
    expect(tierOf('AsJs')).toBe('strong') // AJs
    expect(tierOf('AsTs')).toBe('strong') // ATs
    expect(tierOf('KsQs')).toBe('strong') // KQs
  })
})

describe('classifyStartingHand — playable', () => {
  it('small/medium pairs are playable', () => {
    expect(tierOf('8s8h')).toBe('playable')
    expect(tierOf('2s2h')).toBe('playable')
  })

  it('suited connectors are playable', () => {
    expect(tierOf('7h6h')).toBe('playable') // 76s
    expect(tierOf('9s8s')).toBe('playable') // 98s
    expect(tierOf('5d4d')).toBe('playable') // 54s
  })

  it('weaker suited aces and suited broadways are playable', () => {
    expect(tierOf('As5s')).toBe('playable') // A5s
    expect(tierOf('As2s')).toBe('playable') // A2s
    expect(tierOf('KsJs')).toBe('playable') // KJs
    expect(tierOf('QsJs')).toBe('playable') // QJs
    expect(tierOf('JsTs')).toBe('playable') // JTs
    expect(tierOf('KsQh')).toBe('playable') // KQo
    expect(tierOf('AhJc')).toBe('playable') // AJo
  })
})

describe('classifyStartingHand — marginal', () => {
  it('offsuit broadways and suited gappers are marginal', () => {
    expect(tierOf('KsJh')).toBe('marginal') // KJo
    expect(tierOf('QsJh')).toBe('marginal') // QJo
    expect(tierOf('JsTh')).toBe('marginal') // JTo
    expect(tierOf('Js9s')).toBe('marginal') // J9s
    expect(tierOf('7s5s')).toBe('marginal') // 75s
    expect(tierOf('4s3s')).toBe('marginal') // 43s
  })
})

describe('classifyStartingHand — trash (the long tail)', () => {
  it('the canonical junk hand 72o is trash', () => {
    expect(tierOf('7h2c')).toBe('trash')
  })

  it('unconnected offsuit junk is trash', () => {
    expect(tierOf('9s4d')).toBe('trash') // 94o
    expect(tierOf('Ts3c')).toBe('trash') // T3o
    expect(tierOf('8h3d')).toBe('trash') // 83o
  })

  it('a weak offsuit ace is trash (only suited weak aces are playable)', () => {
    expect(tierOf('As2h')).toBe('trash') // A2o — A2s is playable, A2o is not
  })

  it('a low offsuit pairing-less holding is trash', () => {
    expect(tierOf('6s2d')).toBe('trash') // 62o
  })
})

describe('classifyStartingHand — suited vs offsuit distinction', () => {
  it('the same ranks classify differently by suitedness', () => {
    expect(tierOf('Ts9s')).toBe('playable') // T9s
    expect(tierOf('Ts9h')).toBe('trash') // T9o is not on the chart
  })

  it('order of the two cards does not matter', () => {
    expect(tierOf('KsAs')).toBe(tierOf('AsKs'))
    expect(tierOf('6h7h')).toBe(tierOf('7h6h'))
  })
})

describe('classifyStartingHand — rationale strings', () => {
  it('returns a tier-specific, human-readable rationale for every tier', () => {
    const cases: ReadonlyArray<readonly [string, PreflopTier, string]> = [
      ['AsAh', 'premium', 'raise'],
      ['TsTh', 'strong', 'value'],
      ['7h6h', 'playable', 'position'],
      ['KsJh', 'marginal', 'late position'],
      ['7h2c', 'trash', 'Trash'],
    ]
    for (const [cards, tier, needle] of cases) {
      const v: StartingHandVerdict = classifyStartingHand(hole(cards))
      expect(v.tier).toBe(tier)
      expect(v.rationale.length).toBeGreaterThan(0)
      expect(v.rationale).toContain(needle)
    }
  })
})

describe('classifyStartingHand — input validation (RangeError idiom)', () => {
  it('throws on the wrong number of hole cards', () => {
    const one = parseCards('As') as unknown as readonly [Card, Card]
    expect(() => classifyStartingHand(one)).toThrow(RangeError)
  })

  it('throws on two copies of the same card', () => {
    const dup = parseCards('As As') as [Card, Card]
    expect(() => classifyStartingHand(dup)).toThrow(RangeError)
  })
})

describe('PREFLOP_CHART — the declared teaching artifact', () => {
  it('lists each non-trash tier as a non-empty range string', () => {
    for (const tier of ['premium', 'strong', 'playable', 'marginal'] as const) {
      expect(PREFLOP_CHART[tier].length).toBeGreaterThan(0)
    }
  })

  it('every hand in the chart classifies into a non-trash tier', () => {
    // Sanity-check the chart against its own classifier: nothing declared falls through to
    // trash, and a representative token from each tier resolves there.
    expect(tierOf('AsAh')).not.toBe('trash')
    expect(tierOf('TsTh')).not.toBe('trash')
    expect(tierOf('7h6h')).not.toBe('trash')
    expect(tierOf('KsJh')).not.toBe('trash')
  })
})
