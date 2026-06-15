import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card, type LegalActions } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'

import {
  classifyStartingHand,
  describeHandClass,
  gradePreflop,
  PREFLOP_CHART,
  CHART_RANKS,
  startingHandChart,
  handClassLabel,
  type PreflopTier,
  type StartingHandVerdict,
} from './preflop.js'

/** Parse a glued two-card string into a hole-card tuple, e.g. "AsKh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return [a!, b!]
}

/**
 * Build a preflop {@link DecisionContext} for grading. Only the fields {@link gradePreflop} reads —
 * `holeCards` and the seat geometry that determines late position (`seat` / `buttonIndex` /
 * `numPlayers`) — matter; the rest are plausible filler so the context type-checks.
 */
function preflopCtx(over: {
  holeCards: readonly [Card, Card]
  seat?: number
  buttonIndex?: number
  numPlayers?: number
}): DecisionContext {
  const seat = over.seat ?? 0
  const numPlayers = over.numPlayers ?? 2
  const buttonIndex = over.buttonIndex ?? 0
  const legal: LegalActions = {
    fold: true,
    check: false,
    call: { amount: 2 },
    bet: null,
    raise: null,
  }
  return {
    seat,
    holeCards: over.holeCards,
    board: [],
    street: 'preflop',
    legalActions: legal,
    pot: 3,
    currentBet: 2,
    toCall: 2,
    stack: 1000,
    committed: 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex,
    isButton: seat === buttonIndex,
    numPlayers,
    numActive: numPlayers,
    opponents: [],
  }
}

const FOLD: Action = { type: 'fold' }
const CALL: Action = { type: 'call' }
const RAISE: Action = { type: 'raise', amount: 6 }
const CHECK: Action = { type: 'check' }

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

describe('gradePreflop — chart-driven verdict (BUG-0001)', () => {
  it('opening a charted hand is GOOD; folding it is a LEAK (the bug: AJs on the button)', () => {
    // The exact spot in the ticket: AJs folded to the button is a clear open, not a fold.
    const ctx = preflopCtx({ holeCards: hole('AhJh') })
    expect(gradePreflop(ctx, CALL).verdict).toBe('good')
    expect(gradePreflop(ctx, RAISE).verdict).toBe('good')
    expect(gradePreflop(ctx, FOLD).verdict).toBe('leak')
  })

  it('premium / strong / playable are all "open" regardless of position', () => {
    // Even in early position (seat 1 of 3, button on seat 0), the chart opens these tiers.
    const early = { seat: 1, buttonIndex: 0, numPlayers: 3 }
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh'), ...early }), CALL).advice).toBe(
      'open',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('KsQs'), ...early }), CALL).advice).toBe(
      'open',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h6h'), ...early }), CALL).advice).toBe(
      'open',
    )
  })

  it('a free check (big-blind option) is GOOD for ANY hand — never a leak (BUG-0003)', () => {
    // The bug: in the BB with no raise to call, checking trash was graded a leak because the chart
    // says "fold". But a free check strictly dominates folding — you see a free flop. Checking is
    // never a mistake regardless of tier, and folding away a free look would be the pathological
    // leak.
    const trash = preflopCtx({ holeCards: hole('Kh8h'), seat: 1, buttonIndex: 0, numPlayers: 2 })
    expect(gradePreflop(trash, CHECK).verdict).toBe('good')
    // True across the ladder — checking premium/marginal in the BB is also fine (not maximally
    // aggressive, but not a leak; the coach grades continue-vs-fold, not raise sizing).
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh'), seat: 1 }), CHECK).verdict).toBe(
      'good',
    )
    expect(gradePreflop(preflopCtx({ holeCards: hole('7c2d'), seat: 1 }), CHECK).verdict).toBe(
      'good',
    )
    // The rationale explains the free flop rather than contradicting the "Good" grade with "fold".
    expect(gradePreflop(trash, CHECK).rationale).toMatch(/free flop/i)
  })

  it('trash is "fold": folding is GOOD, entering is a LEAK', () => {
    const ctx = preflopCtx({ holeCards: hole('7h2c') })
    expect(gradePreflop(ctx, FOLD).verdict).toBe('good')
    expect(gradePreflop(ctx, CALL).verdict).toBe('leak')
  })

  it('marginal opens only in late position (button/cutoff), folds in early position', () => {
    const marginal = hole('KsJd') // KJo — marginal tier
    // Button (seat 0) and cutoff (seat 2) of a 3-handed table are late position → open.
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 0, buttonIndex: 0, numPlayers: 3 }),
        CALL,
      ).advice,
    ).toBe('open')
    expect(
      gradePreflop(
        preflopCtx({ holeCards: marginal, seat: 2, buttonIndex: 0, numPlayers: 3 }),
        CALL,
      ).advice,
    ).toBe('open')
    // Early position (seat 1) → the chart folds it.
    const early = preflopCtx({ holeCards: marginal, seat: 1, buttonIndex: 0, numPlayers: 3 })
    expect(gradePreflop(early, CALL).advice).toBe('fold')
    expect(gradePreflop(early, CALL).verdict).toBe('leak') // opening it early is the leak
    expect(gradePreflop(early, FOLD).verdict).toBe('good') // folding it early is correct
  })

  it('carries the tier and rationale through from the chart', () => {
    const v = gradePreflop(preflopCtx({ holeCards: hole('AsAh') }), CALL)
    const chart = classifyStartingHand(hole('AsAh'))
    expect(v.tier).toBe(chart.tier)
    expect(v.rationale).toBe(chart.rationale)
    expect(v.heroContinued).toBe(true)
  })

  it('throws on a malformed holding (the same card twice), like classifyStartingHand', () => {
    const dup = parseCards('As As') as [Card, Card]
    expect(() => gradePreflop(preflopCtx({ holeCards: dup }), CALL)).toThrow(RangeError)
  })

  it('tags every preflop verdict with the ranges concept (the chart IS the ranges idea)', () => {
    // True across the open, fold, and free-check paths and across tiers — preflop is always graded
    // off the strength-tier chart, never the postflop equity-vs-price lens.
    expect(gradePreflop(preflopCtx({ holeCards: hole('AsAh') }), CALL).concept).toBe('ranges')
    expect(gradePreflop(preflopCtx({ holeCards: hole('7h2c') }), FOLD).concept).toBe('ranges')
    expect(gradePreflop(preflopCtx({ holeCards: hole('7c2d'), seat: 1 }), CHECK).concept).toBe(
      'ranges',
    )
  })
})

describe('startingHandChart', () => {
  const chart = startingHandChart()

  it('is a 13×13 grid indexed by CHART_RANKS (A→2)', () => {
    expect(CHART_RANKS).toHaveLength(13)
    expect(chart).toHaveLength(13)
    for (const row of chart) expect(row).toHaveLength(13)
  })

  it('lays out pairs on the diagonal, suited upper-right, offsuit lower-left', () => {
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const cell = chart[r]![c]!
        if (r === c) expect(cell.kind).toBe('pair')
        else if (c > r) expect(cell.kind).toBe('suited')
        else expect(cell.kind).toBe('offsuit')
      }
    }
  })

  it('labels each class in standard notation (higher rank first)', () => {
    expect(chart[0]![0]!.label).toBe('AA') // top-left pair
    expect(chart[0]![1]!.label).toBe('AKs') // suited, upper-right
    expect(chart[1]![0]!.label).toBe('AKo') // offsuit, lower-left (same A-K class)
    expect(chart[12]![12]!.label).toBe('22') // bottom-right pair
  })

  it('classifies every cell into a tier that matches the live coach', () => {
    for (const row of chart) {
      for (const cell of row) {
        expect(['premium', 'strong', 'playable', 'marginal', 'trash']).toContain(cell.tier)
      }
    }
    // Spot-check against classifyStartingHand — the chart IS that function, so they cannot diverge.
    expect(chart[0]![0]!.tier).toBe('premium') // AA
    expect(chart[0]![1]!.tier).toBe(classifyStartingHand(hole('AhKh')).tier) // AKs
    expect(chart[1]![0]!.tier).toBe(classifyStartingHand(hole('AhKs')).tier) // AKo
  })

  it('puts the worst hands in trash (72o) and small pairs in playable (22)', () => {
    const seven = CHART_RANKS.indexOf('7')
    const two = CHART_RANKS.indexOf('2')
    // 72 offsuit is the lower-left cell (row 2, col 7): higher rank (7) leads the label.
    const cell72o = chart[two]![seven]!
    expect(cell72o.label).toBe('72o')
    expect(cell72o.kind).toBe('offsuit')
    expect(cell72o.tier).toBe('trash')
    expect(chart[12]![12]!.tier).toBe('playable') // 22
  })
})

describe('handClassLabel', () => {
  it('labels pairs, suited, and offsuit in standard notation (higher rank first)', () => {
    expect(handClassLabel(hole('AsAh'))).toBe('AA')
    expect(handClassLabel(hole('AhKh'))).toBe('AKs')
    expect(handClassLabel(hole('AhKs'))).toBe('AKo')
    expect(handClassLabel(hole('7c2d'))).toBe('72o')
    expect(handClassLabel(hole('Th9h'))).toBe('T9s')
  })

  it('orders by rank regardless of card order', () => {
    expect(handClassLabel(hole('KsAs'))).toBe('AKs')
    expect(handClassLabel(hole('2d7c'))).toBe('72o')
  })

  it('matches the label of the cell the hand falls in (so a chart can highlight it)', () => {
    // For a sample of hands, the class label equals the matching chart cell's label.
    const grid = startingHandChart()
    const cellLabels = new Set(grid.flat().map((c) => c.label))
    for (const cards of ['AsAh', 'AhKh', 'AhKs', '7c2d', 'Th9h', 'Js9c', 'Qd2d']) {
      expect(cellLabels.has(handClassLabel(hole(cards)))).toBe(true)
    }
  })
})

describe('describeHandClass', () => {
  it('decodes pairs as "pair of <plural rank>"', () => {
    expect(describeHandClass('AA')).toBe('pair of Aces')
    expect(describeHandClass('KK')).toBe('pair of Kings')
    expect(describeHandClass('TT')).toBe('pair of Tens')
    expect(describeHandClass('22')).toBe('pair of Twos')
  })

  it('uses the irregular plural for pocket sixes', () => {
    expect(describeHandClass('66')).toBe('pair of Sixes')
  })

  it('decodes suited and offsuit hands with the rank words and "suited"/"offsuit"', () => {
    expect(describeHandClass('AKs')).toBe('Ace-King suited')
    expect(describeHandClass('JTo')).toBe('Jack-Ten offsuit')
    expect(describeHandClass('T9s')).toBe('Ten-Nine suited')
    expect(describeHandClass('72o')).toBe('Seven-Two offsuit')
  })

  it('decodes every label the chart renders (no cell reads as raw shorthand)', () => {
    for (const cell of startingHandChart().flat()) {
      const decoded = describeHandClass(cell.label)
      // A decoded label is real prose, never the bare token echoed back.
      expect(decoded).not.toBe(cell.label)
      expect(decoded).toMatch(/pair of |suited|offsuit/)
    }
  })

  it('round-trips with handClassLabel — a dealt hand decodes to a sensible phrase', () => {
    expect(describeHandClass(handClassLabel(hole('AhKh')))).toBe('Ace-King suited')
    expect(describeHandClass(handClassLabel(hole('JdTc')))).toBe('Jack-Ten offsuit')
  })

  it('returns the input unchanged for unrecognisable strings', () => {
    expect(describeHandClass('')).toBe('')
    expect(describeHandClass('XY')).toBe('XY')
    expect(describeHandClass('AKx')).toBe('AKx')
  })
})
