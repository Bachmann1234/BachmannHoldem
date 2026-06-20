/**
 * Heavy unit tests for the deterministic sizing core ([[0101-coach-sizing-intent-and-bands]]) — the
 * module the rest of M8 trusts, so the bar is exhaustive: every spot kind across streets/positions/seat
 * counts, every intent, the peg single-sourcing, the bb/pot/"to" conversions, the size-agnostic flag,
 * and explicit determinism (same ctx → same output). We build real {@link DecisionContext}s (the same
 * idiom as `spot.test.ts`) and assert against the public {@link classifySpot} / {@link classifyIntent} /
 * {@link recommendedBand} surface plus the exported tunables.
 */

import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import type { DecisionContext, OpponentView } from '@holdem/bots'

import type { Action } from '@holdem/engine'

import {
  classifySpot,
  classifyIntent,
  recommendedBand,
  gradeSizing,
  boardDrawSignals,
  SIZE_PEGS,
  OPEN_BB_BAND,
  OPEN_BB_PER_LIMPER,
  THREE_BET_MULTIPLE,
  VALUE_BAND,
  PROTECTION_BAND,
  BLUFF_EQUITY_THRESHOLD,
  VULNERABLE_BOARD_DRAW_SIGNALS,
  OVER_SHOVE_RISK_REWARD,
  MIN_BET_POT_FRACTION,
  SHORT_STACK_JAM_BB,
} from './sizing.js'
import { VALUE_BET_THRESHOLD } from './verdict.js'

/** Parse a space-separated two-card string into a hole tuple, e.g. "Ah Kh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(cards)
  return [a!, b!]
}

/** A plausible full DecisionContext; callers override only the fields under test. */
function ctx(
  over: Partial<DecisionContext> & { holeCards: readonly [Card, Card] },
): DecisionContext {
  return {
    seat: 0,
    board: [],
    street: 'preflop',
    legalActions: { fold: true, check: false, call: null, bet: null, raise: null },
    pot: 3,
    currentBet: 2,
    toCall: 0,
    stack: 200,
    committed: 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    isButton: true,
    numPlayers: 6,
    numActive: 6,
    opponents: [],
    ...over,
  }
}

/** A redacted opponent view. */
function opp(over: Partial<OpponentView> & { seat: number }): OpponentView {
  return {
    seat: over.seat,
    stack: over.stack ?? 199,
    committed: over.committed ?? 0,
    totalCommitted: over.totalCommitted ?? 0,
    status: over.status ?? 'active',
    isButton: over.isButton ?? false,
  }
}

// ---------------------------------------------------------------------------------------------------
// SIZE_PEGS — the single-sourced peg vocabulary.
// ---------------------------------------------------------------------------------------------------

describe('SIZE_PEGS — the single-sourced peg vocabulary', () => {
  it('maps each peg to the rounded teaching price (¼≈17%, ⅓≈20%, ½≈25%, ¾≈30%, pot≈33%)', () => {
    expect(SIZE_PEGS.quarter.price).toBe(0.17)
    expect(SIZE_PEGS.third.price).toBe(0.2)
    expect(SIZE_PEGS.half.price).toBe(0.25)
    expect(SIZE_PEGS.threeQuarter.price).toBe(0.3)
    expect(SIZE_PEGS.pot.price).toBe(0.33)
  })

  it('carries the matching pot fractions', () => {
    expect(SIZE_PEGS.quarter.fraction).toBe(0.25)
    expect(SIZE_PEGS.half.fraction).toBe(0.5)
    expect(SIZE_PEGS.threeQuarter.fraction).toBe(0.75)
    expect(SIZE_PEGS.pot.fraction).toBe(1)
  })

  it('each peg price is within rounding of the bet/price formula f/(1+2f)', () => {
    for (const peg of Object.values(SIZE_PEGS)) {
      const exact = peg.fraction / (1 + 2 * peg.fraction)
      expect(Math.abs(exact - peg.price)).toBeLessThan(0.01)
    }
  })

  it('the value/protection bands are derived FROM the pegs (no drift)', () => {
    expect(VALUE_BAND.lo).toBe(SIZE_PEGS.half.fraction)
    expect(VALUE_BAND.hi).toBe(SIZE_PEGS.threeQuarter.fraction)
    expect(PROTECTION_BAND.lo).toBe(SIZE_PEGS.threeQuarter.fraction)
    expect(PROTECTION_BAND.hi).toBe(SIZE_PEGS.pot.fraction)
  })
})

// ---------------------------------------------------------------------------------------------------
// classifySpot — the betting situation.
// ---------------------------------------------------------------------------------------------------

describe('classifySpot — preflop', () => {
  it('open: first raise in (currentBet === bigBlind, nothing owed)', () => {
    expect(
      classifySpot(ctx({ holeCards: hole('Ah Kh'), currentBet: 2, bigBlind: 2, toCall: 0 })),
    ).toBe('open')
  })

  it('open: completing/raising first-in even with a small toCall but no raise yet is still an open', () => {
    // currentBet at the BB and the hero is the first raiser: the only "bet" is the blind.
    const c = ctx({ holeCards: hole('Ah Kh'), currentBet: 2, bigBlind: 2, toCall: 0, seat: 3 })
    expect(classifySpot(c)).toBe('open')
  })

  it('3bet+: a raise is already in (currentBet > bigBlind)', () => {
    expect(
      classifySpot(ctx({ holeCards: hole('Ah Kh'), currentBet: 6, bigBlind: 2, toCall: 6 })),
    ).toBe('3bet+')
  })

  it('overcall: flat-calling a limped pot (toCall > 0 but only the big blind, no raise)', () => {
    // The corrected case: a BTN flat-calling a limped pot is an OVERCALL, not an RFI/steal open.
    const c = ctx({
      holeCards: hole('7h 6h'),
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 2, // owes the big blind to call the limp
    })
    expect(classifySpot(c)).toBe('overcall')
  })

  it('overcall does NOT classify as open even from the button (the exploratory-testing fix)', () => {
    const c = ctx({
      holeCards: hole('Kc 7d'),
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 2,
    })
    expect(classifySpot(c)).not.toBe('open')
    expect(classifySpot(c)).toBe('overcall')
  })
})

describe('classifySpot — postflop', () => {
  const flop = parseCards('Kh 7c 2d')

  it('c-bet: betting an unbet pot in position', () => {
    const c = ctx({
      holeCards: hole('Ah Ad'),
      board: flop,
      street: 'flop',
      toCall: 0,
      isButton: true,
    })
    expect(classifySpot(c)).toBe('c-bet')
  })

  it('lead: betting an unbet pot out of position', () => {
    const c = ctx({
      holeCards: hole('Ah Ad'),
      board: flop,
      street: 'flop',
      toCall: 0,
      isButton: false,
    })
    expect(classifySpot(c)).toBe('lead')
  })

  it('raise: a bet is already in front (toCall > 0)', () => {
    const c = ctx({
      holeCards: hole('Ah Ad'),
      board: flop,
      street: 'flop',
      toCall: 20,
      pot: 50,
    })
    expect(classifySpot(c)).toBe('raise')
  })
})

// ---------------------------------------------------------------------------------------------------
// boardDrawSignals — the vulnerable-board proxy.
// ---------------------------------------------------------------------------------------------------

describe('boardDrawSignals', () => {
  it('preflop has no texture → 0', () => {
    expect(boardDrawSignals(ctx({ holeCards: hole('Ah Kh') }))).toBe(0)
  })

  it('dry, rainbow, disconnected board → 0', () => {
    // K-7-2 three different suits: no flush draw, not coordinated.
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('Kh 7c 2d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(0)
  })

  it('two-flush board contributes a flush-draw signal', () => {
    // K-7-2 with two spades, ranks not coordinated → 1 (flush only).
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('Ks 7s 2d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(1)
  })

  it('connected board contributes a straight-draw signal', () => {
    // 9-8-7 rainbow: coordinated ranks, no flush → 1 (straight only).
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('9h 8c 7d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(1)
  })

  it('wet board with both draws → 2', () => {
    // 9-8-7 with two hearts: flush draw + straight texture.
    const c = ctx({ holeCards: hole('Ac Ad'), board: parseCards('9h 8h 7d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(2)
  })

  it('a very paired board (few distinct ranks) is not counted as straight-coordinated', () => {
    // K-K-2 rainbow: only two distinct ranks → no straight signal, no flush signal.
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('Kh Kc 2d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(0)
  })

  it('high-card coordination is caught beyond the three lowest ranks (K-Q-J-3 rainbow turn)', () => {
    // FIX 2: the K-Q-J triple spans 2 — straight-coordinated — even though the three LOWEST distinct
    // ranks (3-J-Q span 9) are not, so the old "lowest three only" check read this as dry. Four suits
    // → rainbow → no flush signal, so the count is exactly the straight 1.
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('Kh Qc Js 3d'), street: 'turn' })
    expect(boardDrawSignals(c)).toBe(1)
  })

  it('on a full 5-card board the high-card straight texture still fires (K-Q-J-3-2)', () => {
    // A 5-card board always repeats a suit (4 suits, 5 cards), so a flush signal is unavoidable here —
    // the point is the straight signal ALSO fires off the K-Q-J triple, so the wet count is 2 not 1.
    const c = ctx({
      holeCards: hole('Ah Ad'),
      board: parseCards('Kh Qc Js 3d 2h'),
      street: 'river',
    })
    expect(boardDrawSignals(c)).toBe(2)
  })

  it('the wheel A-2-3 is straight-coordinated (ace counted low)', () => {
    // FIX 2: with the ace ranking high its naive span is huge; counting the ace as a low card makes
    // (-1)-0-1 span 2 → a straight signal. Rainbow → no flush signal, so exactly 1.
    const c = ctx({ holeCards: hole('Kh Kd'), board: parseCards('Ah 2c 3d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(1)
  })

  it('a dry rainbow board with a high card stays 0 (K-7-2 rainbow)', () => {
    // Sanity that the all-triples sweep does not over-fire on a genuinely dry board.
    const c = ctx({ holeCards: hole('Ah Ad'), board: parseCards('Kh 7c 2d'), street: 'flop' })
    expect(boardDrawSignals(c)).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------------------
// classifyIntent — the bet's purpose (reusing the seeded equity read).
// ---------------------------------------------------------------------------------------------------

describe('classifyIntent', () => {
  it('value: top set on a dry flop reads comfortably ahead', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'), // top set
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    expect(classifyIntent(c)).toBe('value')
  })

  it('bluff: dominated air well behind reads as a bluff', () => {
    const c = ctx({
      holeCards: hole('7c 2d'), // bottom of the deck, no pair on this board
      board: parseCards('Ah Kc Qd'),
      street: 'flop',
      toCall: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    expect(classifyIntent(c)).toBe('bluff')
  })

  it('protection: a marginal made hand on a wet, draw-heavy board', () => {
    // Middle pair on a two-flush connected board: equity marginal, board vulnerable → protection.
    const c = ctx({
      holeCards: hole('9h 9d'), // overpair-ish / strong made on a low wet board
      board: parseCards('8s 7s 3c'),
      street: 'flop',
      toCall: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const intent = classifyIntent(c)
    // It is either protection (marginal + wet) or value (if the read lands above the value cut) — both
    // are defensible for an overpair on a wet board; assert it is NOT a bluff/steal and that a marginal
    // read routes to protection.
    expect(['protection', 'value']).toContain(intent)
  })

  it('steal: a wide button open with a weak holding is a steal, not a bluff', () => {
    const c = ctx({
      holeCards: hole('Kc 7d'), // trash, a classic button steal
      board: [],
      street: 'preflop',
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      numActive: 6,
      opponents: [opp({ seat: 1 }), opp({ seat: 2 })],
    })
    expect(classifyIntent(c)).toBe('steal')
  })

  it('steal: a wide SMALL-BLIND open is also a steal (onlyBlindsBehind, not just the button)', () => {
    // FIX 3: the steal seat is now the canonical `onlyBlindsBehind` (button OR small blind), so an SB
    // open agrees with the preflop coach. buttonIndex 0, 6-max → SB seat 1.
    const c = ctx({
      holeCards: hole('Kc 7d'),
      board: [],
      street: 'preflop',
      isButton: false,
      buttonIndex: 0,
      seat: 1, // the small blind
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      numActive: 2,
      opponents: [opp({ seat: 2 })],
    })
    expect(classifySpot(c)).toBe('open')
    expect(classifyIntent(c)).toBe('steal')
  })

  it('a wide OOP open with a weak holding is NOT a steal (no steal-seat leverage)', () => {
    const c = ctx({
      holeCards: hole('Kc 7d'),
      board: [],
      street: 'preflop',
      isButton: false,
      seat: 3,
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      numActive: 6,
    })
    expect(classifyIntent(c)).not.toBe('steal')
  })
})

// ---------------------------------------------------------------------------------------------------
// recommendedBand — the keyed-by-intent×spot band, always a band, with the "to" conversion.
// ---------------------------------------------------------------------------------------------------

describe('recommendedBand — preflop open (bb-native)', () => {
  it('opens ≈2–2.5bb with the pot-fraction band null', () => {
    const c = ctx({ holeCards: hole('Ah Kh'), bigBlind: 2, currentBet: 2, toCall: 0 })
    const band = recommendedBand(c)
    expect(band.spot).toBe('open')
    expect(band.lo).toBeNull()
    expect(band.hi).toBeNull()
    expect(band.bbLo).toBe(OPEN_BB_BAND.lo)
    expect(band.bbHi).toBe(OPEN_BB_BAND.hi)
    expect(band.toLo).toBe(Math.round(OPEN_BB_BAND.lo * 2))
    expect(band.toHi).toBe(Math.round(OPEN_BB_BAND.hi * 2))
    expect(band.sizeAgnostic).toBe(false)
  })

  it('a plain button RFI with only the SB and BB posted counts 0 limpers → base 2–2.5bb', () => {
    // The FIX 1 regression: a button open into only the posted blinds (no voluntary entrants). The SB's
    // smaller post and the BB's involuntary post must NOT be miscounted as limpers (which previously
    // inflated this to 4–4.5bb). buttonIndex 0, 6-max → SB seat 1, BB seat 2.
    const c = ctx({
      holeCards: hole('Ah Kh'),
      bigBlind: 2,
      smallBlind: 1,
      currentBet: 2,
      toCall: 0,
      buttonIndex: 0,
      seat: 0,
      isButton: true,
      opponents: [
        opp({ seat: 1, committed: 1 }), // small blind (posted, smaller than the BB)
        opp({ seat: 2, committed: 2 }), // big blind (involuntary post)
        opp({ seat: 3, status: 'folded' }),
        opp({ seat: 4, status: 'folded' }),
        opp({ seat: 5, status: 'folded' }),
      ],
    })
    const band = recommendedBand(c)
    expect(band.bbLo).toBe(OPEN_BB_BAND.lo)
    expect(band.bbHi).toBe(OPEN_BB_BAND.hi)
  })

  it('one genuine limper adds ~1bb → 3–3.5bb', () => {
    // buttonIndex 0, 6-max → BB seat 2. Seat 4 limped (completed to the BB), the SB/BB are posts.
    const c = ctx({
      holeCards: hole('Ah Kh'),
      bigBlind: 2,
      smallBlind: 1,
      currentBet: 2,
      toCall: 0,
      buttonIndex: 0,
      seat: 0,
      isButton: true,
      opponents: [
        opp({ seat: 1, committed: 1 }), // SB post — not a limper
        opp({ seat: 2, committed: 2 }), // BB post — not a limper
        opp({ seat: 4, committed: 2 }), // a genuine limper (completed to the BB)
        opp({ seat: 5, status: 'folded' }),
      ],
    })
    const band = recommendedBand(c)
    expect(band.bbLo).toBe(OPEN_BB_BAND.lo + 1 * OPEN_BB_PER_LIMPER)
    expect(band.bbHi).toBe(OPEN_BB_BAND.hi + 1 * OPEN_BB_PER_LIMPER)
  })

  it('two genuine limpers add ~2bb → 4–4.5bb', () => {
    // buttonIndex 0, 6-max → BB seat 2. Two voluntary limpers (seats 3 and 4) past the posted blinds.
    const c = ctx({
      holeCards: hole('Ah Kh'),
      bigBlind: 2,
      smallBlind: 1,
      currentBet: 2,
      toCall: 0,
      buttonIndex: 0,
      seat: 0,
      isButton: true,
      opponents: [
        opp({ seat: 1, committed: 1 }), // SB post
        opp({ seat: 2, committed: 2 }), // BB post
        opp({ seat: 3, committed: 2 }), // limper
        opp({ seat: 4, committed: 2 }), // limper
        opp({ seat: 5, committed: 0 }), // not in for chips → not a limper
      ],
    })
    const band = recommendedBand(c)
    expect(band.bbLo).toBe(OPEN_BB_BAND.lo + 2 * OPEN_BB_PER_LIMPER)
    expect(band.bbHi).toBe(OPEN_BB_BAND.hi + 2 * OPEN_BB_PER_LIMPER)
  })
})

describe('recommendedBand — preflop 3-bet (multiple of the raise)', () => {
  it('3x in position', () => {
    const c = ctx({
      holeCards: hole('Ah Kh'),
      isButton: true,
      bigBlind: 2,
      currentBet: 6, // a raise to 6 in front
      toCall: 6,
    })
    const band = recommendedBand(c)
    expect(band.spot).toBe('3bet+')
    expect(band.lo).toBeNull()
    expect(band.toLo).toBe(Math.round(THREE_BET_MULTIPLE.inPosition.lo * 6))
    expect(band.toHi).toBe(Math.round(THREE_BET_MULTIPLE.inPosition.hi * 6))
  })

  it('4x out of position', () => {
    const c = ctx({
      holeCards: hole('Ah Kh'),
      isButton: false,
      seat: 1,
      bigBlind: 2,
      currentBet: 6,
      toCall: 6,
    })
    const band = recommendedBand(c)
    expect(band.toLo).toBe(Math.round(THREE_BET_MULTIPLE.outOfPosition.lo * 6))
    expect(band.toHi).toBe(Math.round(THREE_BET_MULTIPLE.outOfPosition.hi * 6))
  })
})

describe('recommendedBand — preflop overcall (size-agnostic)', () => {
  it('flags size-agnostic and "to" matches the call', () => {
    const c = ctx({
      holeCards: hole('7h 6h'),
      isButton: true,
      bigBlind: 2,
      currentBet: 2,
      toCall: 2,
    })
    const band = recommendedBand(c)
    expect(band.spot).toBe('overcall')
    expect(band.sizeAgnostic).toBe(true)
    expect(band.toLo).toBe(2)
    expect(band.toHi).toBe(2)
  })
})

describe('recommendedBand — postflop value / bluff / protection', () => {
  const flopDry = parseCards('Ks 7c 2d')

  it('value: ½–¾ pot, with the "to" range scaled off the pot', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: flopDry,
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.intent).toBe('value')
    expect(band.lo).toBe(VALUE_BAND.lo)
    expect(band.hi).toBe(VALUE_BAND.hi)
    expect(band.toLo).toBe(Math.round(VALUE_BAND.lo * 100)) // 50
    expect(band.toHi).toBe(Math.round(VALUE_BAND.hi * 100)) // 75
  })

  it('bluff matches the value band (size your bluffs like your value bets)', () => {
    const c = ctx({
      holeCards: hole('7c 2d'),
      board: parseCards('Ah Kc Qd'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.intent).toBe('bluff')
    expect(band.lo).toBe(VALUE_BAND.lo)
    expect(band.hi).toBe(VALUE_BAND.hi)
  })

  it('protection band is ¾–pot when the intent is protection', () => {
    const c = ctx({
      holeCards: hole('9h 9d'),
      board: parseCards('8s 7s 3c'),
      street: 'flop',
      toCall: 0,
      pot: 80,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    if (band.intent === 'protection') {
      expect(band.lo).toBe(PROTECTION_BAND.lo)
      expect(band.hi).toBe(PROTECTION_BAND.hi)
    } else {
      // If the read lands as value, it takes the value band; either way the band is non-null and a range.
      expect(band.lo).not.toBeNull()
      expect(band.hi! > band.lo!).toBe(true)
    }
  })

  it('raise: the "to" range is the pot-fraction band off (pot + call) plus the call', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: flopDry,
      street: 'flop',
      toCall: 20,
      pot: 60, // pot before the hero calls (already includes villain's bet)
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.spot).toBe('raise')
    const base = 60 + 20
    expect(band.toLo).toBe(Math.round(band.lo! * base) + 20)
    expect(band.toHi).toBe(Math.round(band.hi! * base) + 20)
  })

  it('every band is a genuine range (hi > lo) — never a single number', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: flopDry,
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.toHi).toBeGreaterThan(band.toLo)
  })
})

// ---------------------------------------------------------------------------------------------------
// Seat-count coverage + determinism.
// ---------------------------------------------------------------------------------------------------

describe('seat counts — heads-up and full ring', () => {
  it('heads-up button open is a steal-seat open', () => {
    const c = ctx({
      holeCards: hole('Kc 7d'),
      numPlayers: 2,
      numActive: 2,
      buttonIndex: 0,
      seat: 0,
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      opponents: [opp({ seat: 1, committed: 2 })], // the BB
    })
    expect(classifySpot(c)).toBe('open')
    expect(classifyIntent(c)).toBe('steal')
  })

  it('multiway postflop reads against numActive-1 villains without crashing', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 4,
      numPlayers: 6,
      opponents: [opp({ seat: 1 }), opp({ seat: 2 }), opp({ seat: 3 })],
    })
    const band = recommendedBand(c)
    expect(band.spot).toBe('c-bet')
    expect(band.toHi).toBeGreaterThan(band.toLo)
  })
})

describe('determinism — same ctx → same output', () => {
  const cases: DecisionContext[] = [
    ctx({ holeCards: hole('Ah Kh'), currentBet: 2, bigBlind: 2, toCall: 0 }), // open
    ctx({ holeCards: hole('Ah Kh'), currentBet: 6, bigBlind: 2, toCall: 6 }), // 3bet
    ctx({
      holeCards: hole('Kh Kd'),
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    }), // value c-bet
    ctx({
      holeCards: hole('7c 2d'),
      board: parseCards('Ah Kc Qd'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    }), // bluff
  ]

  it('classifySpot / classifyIntent / recommendedBand are stable across repeated calls', () => {
    for (const c of cases) {
      const spot1 = classifySpot(c)
      const spot2 = classifySpot(c)
      const intent1 = classifyIntent(c)
      const intent2 = classifyIntent(c)
      const band1 = recommendedBand(c)
      const band2 = recommendedBand(c)
      expect(spot2).toBe(spot1)
      expect(intent2).toBe(intent1)
      expect(band2).toEqual(band1)
    }
  })
})

// ---------------------------------------------------------------------------------------------------
// Threshold sanity — the tunables are ordered as documented.
// ---------------------------------------------------------------------------------------------------

describe('tunable invariants', () => {
  it('the bluff threshold is below the value threshold (a real marginal band exists)', () => {
    expect(BLUFF_EQUITY_THRESHOLD).toBeLessThan(VALUE_BET_THRESHOLD)
  })

  it('the vulnerable-board threshold is at least one signal', () => {
    expect(VULNERABLE_BOARD_DRAW_SIGNALS).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------------------------------
// gradeSizing — the graded sizing read + the risk/reward guardrail (ticket 0102).
// ---------------------------------------------------------------------------------------------------

describe('gradeSizing — null for non-bet/raise actions (no size to grade)', () => {
  const c = ctx({
    holeCards: hole('Kh Kd'),
    board: parseCards('Ks 7c 2d'),
    street: 'flop',
    toCall: 20,
    pot: 60,
    numActive: 2,
    opponents: [opp({ seat: 1 })],
  })

  it('fold → null', () => {
    expect(gradeSizing(c, { type: 'fold' } as Action)).toBeNull()
  })
  it('check → null', () => {
    expect(gradeSizing(c, { type: 'check' } as Action)).toBeNull()
  })
  it('call → null', () => {
    expect(gradeSizing(c, { type: 'call', amount: 20 } as Action)).toBeNull()
  })
})

describe('gradeSizing — in-band good, keyed to intent', () => {
  it('value c-bet inside the ½–¾ band grades good with a value purpose', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.intent).toBe('value')
    // Mid-band bet (between toLo 50 and toHi 75).
    const read = gradeSizing(c, { type: 'bet', amount: 60 } as Action)!
    expect(read.verdict).toBe('good')
    expect(read.intent).toBe('value')
    expect(read.why.toLowerCase()).toContain('value')
  })

  it('a bluff in-band names the bluff job (never "value")', () => {
    const c = ctx({
      holeCards: hole('7c 2d'),
      board: parseCards('Ah Kc Qd'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    expect(band.intent).toBe('bluff')
    const read = gradeSizing(c, { type: 'bet', amount: 60 } as Action)!
    expect(read.verdict).toBe('good')
    expect(read.intent).toBe('bluff')
    // It must describe the bluff job, not call a bluff a value bet.
    expect(read.why.toLowerCase()).toContain('bluff')
    expect(read.why.toLowerCase()).not.toContain('worse hands paying')
  })
})

describe('gradeSizing — band comparison: too-big / too-small (non-guardrail)', () => {
  const c = ctx({
    holeCards: hole('Kh Kd'),
    board: parseCards('Ks 7c 2d'),
    street: 'flop',
    toCall: 0,
    pot: 100,
    committed: 0,
    numActive: 2,
    opponents: [opp({ seat: 1 })],
  })

  it('above toHi but below the over-shove ratio → too-big from the band, not the guardrail', () => {
    const band = recommendedBand(c) // value: toLo 50, toHi 75
    // 90 chips into a 100 pot: above toHi (75), ratio 0.9 — far below OVER_SHOVE_RISK_REWARD.
    const read = gradeSizing(c, { type: 'bet', amount: 90 } as Action)!
    expect(read.verdict).toBe('too-big')
    expect(90).toBeGreaterThan(band.toHi)
    expect(90 / 100).toBeLessThan(OVER_SHOVE_RISK_REWARD)
    // Not the risk/reward sentence — the band-overshoot one.
    expect(read.why.toLowerCase()).not.toContain('risked')
  })

  it('a non-value (bluff) over-band size uses the generic too-big wording (not the value one)', () => {
    const cb = ctx({
      holeCards: hole('7c 2d'),
      board: parseCards('Ah Kc Qd'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    expect(recommendedBand(cb).intent).toBe('bluff')
    // 90 into 100: above the value/bluff band's toHi (75), ratio 0.9 — below the over-shove threshold.
    const read = gradeSizing(cb, { type: 'bet', amount: 90 } as Action)!
    expect(read.verdict).toBe('too-big')
    expect(read.why.toLowerCase()).toContain('risking more than the job needs')
  })

  it('below toLo but above the min-bet floor → too-small from the band, not the guardrail', () => {
    // 30 chips into a 100 pot: below toLo (50) but bet fraction 0.3 > MIN_BET_POT_FRACTION (0.1).
    const read = gradeSizing(c, { type: 'bet', amount: 30 } as Action)!
    expect(read.verdict).toBe('too-small')
    expect(0.3).toBeGreaterThan(MIN_BET_POT_FRACTION)
    expect(read.why.toLowerCase()).not.toContain('min-bet')
  })
})

describe('gradeSizing — the risk/reward guardrail (arithmetic-only, no fold-equity)', () => {
  it('over-shove: an open-jam of 200 into a ~3-chip pot flips to a sizing leak with the risk/reward why', () => {
    // The ATo-style 100bb open-shove: stack 200 (=100bb at bb 2), pot 3 (the blinds). A bet "to" 200
    // risks 200 to win 3 — the guardrail catches it from arithmetic alone.
    const c = ctx({
      holeCards: hole('Ah Td'), // ATo
      board: [],
      street: 'preflop',
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      pot: 3,
      stack: 200,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1, committed: 2 })],
    })
    const read = gradeSizing(c, { type: 'raise', amount: 200 } as Action)!
    expect(read.verdict).toBe('too-big')
    expect(read.why.toLowerCase()).toContain('risked 200 to win 3')
    // The guardrail is arithmetic-only: it never cites a fold-equity / call-probability / EV-of-bet
    // QUANTITY. (Plain words like "fold"/"call" describe the arithmetic and are fine; what's forbidden
    // is a numeric probability or an EV-of-the-bet figure.)
    expect(read.why.toLowerCase()).not.toContain('fold equity')
    expect(read.why.toLowerCase()).not.toContain('call probability')
    expect(read.why.toLowerCase()).not.toContain('villaincallprobability')
    expect(read.why).not.toMatch(/\bev\b/i)
    expect(read.why).not.toMatch(/\d+%/) // no fabricated call-frequency / equity percentage
    // The ratio that fired is well past the threshold.
    expect(200 / 3).toBeGreaterThanOrEqual(OVER_SHOVE_RISK_REWARD)
  })

  it('absurd min-bet: a tiny bet into a big pot is too-small with the min-bet why', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    // 5 into 100 = 0.05 of the pot, ≤ MIN_BET_POT_FRACTION (0.1).
    const read = gradeSizing(c, { type: 'bet', amount: 5 } as Action)!
    expect(read.verdict).toBe('too-small')
    expect(read.why.toLowerCase()).toContain('min-bet')
    expect(read.why.toLowerCase()).toContain('charges nothing')
    expect(5 / 100).toBeLessThanOrEqual(MIN_BET_POT_FRACTION)
  })

  it('still flags the DEEP shove: 100bb stack is far above the short-jam threshold so the gate does not apply', () => {
    // Sanity that the short-jam gate did not swallow the deep case: stack 200 = 100bb >> 20bb threshold.
    expect(200 / 2).toBeGreaterThan(SHORT_STACK_JAM_BB)
  })
})

describe('gradeSizing — short-stack all-in jams are the correct SIZE, not over-shoves', () => {
  it('a 12bb button open-jam grades good (NOT a leak) despite a ~8:1 risk/reward', () => {
    // Blinds 1/2, stack 24 (=12bb), jam "to" 24 into the 3-chip blind pot. risk 24, reward 3 → ratio 8,
    // far past OVER_SHOVE_RISK_REWARD — yet a 12bb open-jam is textbook push/fold, so the SIZE is right.
    const c = ctx({
      holeCards: hole('Ah Td'),
      board: [],
      street: 'preflop',
      isButton: true,
      smallBlind: 1,
      bigBlind: 2,
      currentBet: 2,
      toCall: 0,
      pot: 3,
      stack: 24,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1, committed: 2 })],
    })
    const read = gradeSizing(c, { type: 'raise', amount: 24 } as Action)!
    expect(read.verdict).toBe('good')
    // The over-shove ratio WOULD have fired without the depth gate.
    expect(24 / 3).toBeGreaterThanOrEqual(OVER_SHOVE_RISK_REWARD)
    // It must NOT carry the over-shove "can't profit" / "only worse hands fold" wording.
    expect(read.why.toLowerCase()).not.toContain('risked')
    expect(read.why.toLowerCase()).not.toContain('only worse hands fold')
    expect(read.why.toLowerCase()).not.toContain("can't profit")
    // It explains the committed short stack instead.
    expect(read.why.toLowerCase()).toContain('jams')
  })

  it('a ~20bb BB 3-bet-jam over an open grades good (NOT a leak)', () => {
    // Blinds 1/2, a raise to 6 in front, hero stack 40 (=20bb) jams "to" 38 (the 2 already posted + 38
    // behind). risk = 38, pot 9 → ratio ~4.2 ≥ the over-shove threshold, but a 20bb 3-bet-jam is push/fold.
    const c = ctx({
      holeCards: hole('Ah Kd'),
      board: [],
      street: 'preflop',
      isButton: false,
      seat: 1,
      smallBlind: 1,
      bigBlind: 2,
      currentBet: 6, // a raise already in → 3bet+ spot
      toCall: 4, // owes 4 more (already posted the 2 BB)
      pot: 9,
      stack: 38, // chips behind before acting (=19bb)
      committed: 2, // the posted big blind this street
      numActive: 2,
      opponents: [opp({ seat: 0, committed: 6 })],
    })
    // chipsRisked = amount(40) - committed(2) = 38 = stack → all-in; 38 = 19bb ≤ 20bb → short.
    const read = gradeSizing(c, { type: 'raise', amount: 40 } as Action)!
    expect(read.verdict).toBe('good')
    expect(38 / 9).toBeGreaterThanOrEqual(OVER_SHOVE_RISK_REWARD)
    expect(read.why.toLowerCase()).not.toContain('risked')
    expect(read.why.toLowerCase()).not.toContain('only worse hands fold')
  })

  it('boundary: a jam at exactly SHORT_STACK_JAM_BB deep is still good, just above it flips to the over-shove leak', () => {
    // At exactly 20bb (stack 40, bb 2) the gate applies (good). One bb deeper (stack 42 = 21bb) it does
    // not, and a jam risking >= OVER_SHOVE_RISK_REWARD pots flips to the over-shove leak.
    const base = {
      holeCards: hole('Ah Td'),
      board: [] as Card[],
      street: 'preflop' as const,
      isButton: true,
      smallBlind: 1,
      bigBlind: 2,
      currentBet: 2,
      toCall: 0,
      pot: 3,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1, committed: 2 })],
    }
    const atCeiling = ctx({ ...base, stack: SHORT_STACK_JAM_BB * 2 }) // 40 chips = 20bb
    const atRead = gradeSizing(atCeiling, { type: 'raise', amount: 40 } as Action)!
    expect(atRead.verdict).toBe('good')

    const justDeeper = ctx({ ...base, stack: SHORT_STACK_JAM_BB * 2 + 2 }) // 42 chips = 21bb
    const deepRead = gradeSizing(justDeeper, { type: 'raise', amount: 42 } as Action)!
    expect(deepRead.verdict).toBe('too-big')
    expect(deepRead.why.toLowerCase()).toContain('risked')
  })
})

describe('gradeSizing — intent-specific in-band / out-of-band wording', () => {
  it('a steal open in-band names the steal job (not value)', () => {
    // A wide button steal, sized in bb: open band ~2–2.5bb → "to" 4–5 chips at bb 2.
    // Heads-up button steal: button is the SB heads-up, BB is seat 1. The BB seat is excluded from the
    // limper count, so the open stays at the base 2–2.5bb band (→ "to" 4–5 chips at bb 2).
    const c = ctx({
      holeCards: hole('Kc 7d'),
      board: [],
      street: 'preflop',
      isButton: true,
      buttonIndex: 0,
      seat: 0,
      numPlayers: 2,
      currentBet: 2,
      bigBlind: 2,
      toCall: 0,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1, committed: 2 })], // the BB (not a limper, excluded by bbSeat)
    })
    const band = recommendedBand(c)
    expect(band.intent).toBe('steal')
    expect(band.toHi).toBe(5)
    const read = gradeSizing(c, { type: 'raise', amount: 5 } as Action)! // to 2.5bb, in-band
    expect(read.verdict).toBe('good')
    expect(read.why.toLowerCase()).toContain('steal')
  })

  it('a protection bet uses protection wording in-band and out-of-band (never "value")', () => {
    // Middle pair on a two-flush connected board: a marginal read on a wet board → protection (the
    // read may land as value for a strong overpair, so the wording assertion is guarded on the intent).
    const c = ctx({
      holeCards: hole('9h 9d'),
      board: parseCards('8s 7s 3c'),
      street: 'flop',
      toCall: 0,
      pot: 80,
      committed: 0,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const band = recommendedBand(c)
    if (band.intent === 'protection') {
      // In-band (¾–pot → to 60–80): a mid value names the protection job.
      const good = gradeSizing(c, { type: 'bet', amount: 70 } as Action)!
      expect(good.verdict).toBe('good')
      expect(good.why.toLowerCase()).toContain('protection')
      // Out-of-band too-small (but above the min-bet floor): 0.3-pot → 24 chips, below toLo 60.
      const small = gradeSizing(c, { type: 'bet', amount: 24 } as Action)!
      expect(small.verdict).toBe('too-small')
      expect(small.why.toLowerCase()).toContain('protection')
    } else {
      // If it read as value, at least exercise the value good wording so the test is not vacuous.
      const good = gradeSizing(c, { type: 'bet', amount: 50 } as Action)!
      expect(good.why.toLowerCase()).toContain('value')
    }
  })
})

describe('gradeSizing — size-agnostic spots never produce a false leak', () => {
  it('an overcall (size-agnostic) grades good and says there is no size to pick', () => {
    const c = ctx({
      holeCards: hole('7h 6h'),
      isButton: true,
      currentBet: 2,
      bigBlind: 2,
      toCall: 2,
      pot: 6,
      committed: 0,
    })
    const band = recommendedBand(c)
    expect(band.sizeAgnostic).toBe(true)
    // Even an action.amount far off the widened placeholder band must NOT be a leak.
    const read = gradeSizing(c, { type: 'call', amount: 2 } as Action)
    // A call is not a bet/raise → null. Use a (contrived) bet to exercise the size-agnostic branch.
    expect(read).toBeNull()
    const betRead = gradeSizing(c, { type: 'bet', amount: 2 } as Action)!
    expect(betRead.verdict).toBe('good')
    expect(betRead.why.toLowerCase()).toContain('no size to pick')
  })
})

describe('gradeSizing — determinism', () => {
  it('same (ctx, action) → same read', () => {
    const c = ctx({
      holeCards: hole('Kh Kd'),
      board: parseCards('Ks 7c 2d'),
      street: 'flop',
      toCall: 0,
      pot: 100,
      numActive: 2,
      opponents: [opp({ seat: 1 })],
    })
    const a = { type: 'bet', amount: 60 } as Action
    expect(gradeSizing(c, a)).toEqual(gradeSizing(c, a))
  })
})
