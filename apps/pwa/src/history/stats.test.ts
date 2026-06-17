/**
 * Play-side hero stats — the pure read-side projection of the hand-history log (ticket 0087). All
 * pure functions over hand-crafted {@link HandHistoryRecord} arrays, so this pins the stat
 * definitions: VPIP/PFR/AF math (including calls===0), the subtle fold-to-3bet derivation (open =
 * first preflop raise into an UNRAISED pot, `facing.currentBet === bigBlind`; a cold 3bet is NOT an
 * open; the fold-to-3bet numerator is the IMMEDIATE response to the 3bet, so a later fold to a
 * 4bet/5bet does not count; open + faced 3bet + folded = counted; + called/4bet = denominator only;
 * open + never 3bet = excluded; never opened = excluded), the by-position split (reusing
 * `classifyPosition`), empty input, and v1-record tolerance (missing `buttonIndex` / `bigBlind` /
 * `facing`). No DOM, no IndexedDB — the policy is tested in isolation, exactly as `mastery.ts` is.
 */

import { describe, expect, it } from 'vitest'
import type { Action, Street } from '@holdem/engine'
import { HAND_HISTORY_SCHEMA_VERSION } from './record.js'
import type { DecisionFacing, HandHistoryRecord, HeroDecision } from './record.js'
import { aggregateHeroStats } from './stats.js'

/** A hero decision with optional facing context — terse builder for the hand-crafted records below. */
function dec(street: Street, action: Action, facing?: DecisionFacing): HeroDecision {
  return facing === undefined ? { street, action } : { street, action, facing }
}

/**
 * Build a record with the given decisions. `buttonIndex` is optional (omit to simulate a v1 record);
 * `heroSeat`/`seatCount` default to a 6-max table with the hero on the button when `buttonIndex` is
 * set, so position-bucket tests are predictable. `bigBlind` defaults to `1` so the fold-to-3bet
 * "open into an unraised pot" test (`facing.currentBet === bigBlind`) works out of the box; pass
 * `bigBlind: undefined` explicitly to simulate a record that lacks it. The outcome is inert filler —
 * stats never read it.
 */
function record(
  decisions: readonly HeroDecision[],
  opts: {
    heroSeat?: number
    seatCount?: number
    buttonIndex?: number
    schemaVersion?: number
    bigBlind?: number
  } = {},
): HandHistoryRecord {
  const heroSeat = opts.heroSeat ?? 0
  const seatCount = opts.seatCount ?? 6
  const bigBlind = 'bigBlind' in opts ? opts.bigBlind : 1
  return {
    schemaVersion: opts.schemaVersion ?? HAND_HISTORY_SCHEMA_VERSION,
    id: `hand-${Math.random()}`,
    playedAt: 0,
    handNumber: 1,
    seatCount,
    players: [],
    heroSeat,
    ...(opts.buttonIndex !== undefined ? { buttonIndex: opts.buttonIndex } : {}),
    ...(bigBlind !== undefined ? { bigBlind } : {}),
    decisions,
    outcome: { board: [], endReason: null, payouts: {}, players: [], heroNet: 0 },
  }
}

const fold: Action = { type: 'fold' }
const check: Action = { type: 'check' }
const call: Action = { type: 'call' }
const raiseTo = (amount: number): Action => ({ type: 'raise', amount })
const betTo = (amount: number): Action => ({ type: 'bet', amount })

describe('aggregateHeroStats — VPIP / PFR (preflop voluntary money-in)', () => {
  it('counts a preflop call/bet/raise as VPIP; a raise is also PFR', () => {
    const stats = aggregateHeroStats([
      record([dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 })]), // vpip + pfr
      record([dec('preflop', call, { toCall: 1, currentBet: 1 })]), // vpip only
      record([dec('preflop', fold, { toCall: 1, currentBet: 1 })]), // neither
    ])
    expect(stats.overall.hands).toBe(3)
    expect(stats.overall.vpip).toEqual({ count: 2, denominator: 3, fraction: 2 / 3 })
    expect(stats.overall.pfr).toEqual({ count: 1, denominator: 3, fraction: 1 / 3 })
  })

  it('a folded big blind (no decisions) is a played hand but not VPIP/PFR — blind posts never count', () => {
    const stats = aggregateHeroStats([record([])])
    expect(stats.overall.hands).toBe(1)
    expect(stats.overall.vpip.count).toBe(0)
    expect(stats.overall.pfr.count).toBe(0)
    expect(stats.overall.vpip.fraction).toBe(0)
  })

  it('a postflop bet does not count toward VPIP/PFR (preflop only)', () => {
    const stats = aggregateHeroStats([
      record([dec('preflop', check, { toCall: 0, currentBet: 0 }), dec('flop', betTo(5))]),
    ])
    expect(stats.overall.vpip.count).toBe(0)
    expect(stats.overall.pfr.count).toBe(0)
  })
})

describe('aggregateHeroStats — aggression factor ((bets + raises) / calls, all streets)', () => {
  it('counts bets + raises over calls across every street', () => {
    const stats = aggregateHeroStats([
      record([
        dec('preflop', raiseTo(3)), // raise
        dec('flop', betTo(5)), // bet
        dec('turn', call), // call
        dec('river', call), // call
      ]),
    ])
    const af = stats.overall.aggressionFactor
    expect(af.aggressive).toBe(2)
    expect(af.calls).toBe(2)
    expect(af.ratio).toBe(1)
    expect(af.hands).toBe(1)
  })

  it('calls === 0 with aggression yields a null ratio (no Infinity/NaN) but keeps the counts', () => {
    const stats = aggregateHeroStats([record([dec('preflop', raiseTo(3)), dec('flop', betTo(5))])])
    const af = stats.overall.aggressionFactor
    expect(af.aggressive).toBe(2)
    expect(af.calls).toBe(0)
    expect(af.ratio).toBeNull()
  })

  it('calls === 0 and aggression === 0 (all checks/folds) is still a null ratio, both counts zero', () => {
    const stats = aggregateHeroStats([record([dec('preflop', check), dec('flop', check)])])
    const af = stats.overall.aggressionFactor
    expect(af.aggressive).toBe(0)
    expect(af.calls).toBe(0)
    expect(af.ratio).toBeNull()
  })
})

describe('aggregateHeroStats — fold-to-3bet (open-raise then faced a re-raise)', () => {
  it('hero opens, faces a 3bet, and folds: counted in numerator AND denominator', () => {
    const stats = aggregateHeroStats([
      record([
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }), // open to 3
        dec('preflop', fold, { toCall: 6, currentBet: 9 }), // faces a 3bet to 9, folds
      ]),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 1, denominator: 1, fraction: 1 })
  })

  it('hero opens, faces a 3bet, and calls: in the denominator but NOT the numerator', () => {
    const stats = aggregateHeroStats([
      record([
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
        dec('preflop', call, { toCall: 6, currentBet: 9 }), // faces 3bet to 9, calls
      ]),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 1, fraction: 0 })
  })

  it('hero opens but is never 3bet: excluded from the denominator entirely', () => {
    const stats = aggregateHeroStats([
      record([dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 })]),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 0, fraction: null })
  })

  it('hero never opens (just calls a raise and folds): excluded — facing a 3bet needs an open first', () => {
    const stats = aggregateHeroStats([
      record([
        dec('preflop', call, { toCall: 3, currentBet: 3 }), // limp/cold-call, no open-raise
        dec('preflop', fold, { toCall: 6, currentBet: 9 }), // faces a raise, folds
      ]),
    ])
    expect(stats.overall.foldToThreeBet.denominator).toBe(0)
  })

  it('a 4bet line (open, face 3bet, re-raise) still counts the hand as "faced a 3bet", not folded', () => {
    const stats = aggregateHeroStats([
      record([
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }), // open
        dec('preflop', raiseTo(27), { toCall: 6, currentBet: 9 }), // faces 3bet to 9, 4bets to 27
      ]),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 1, fraction: 0 })
  })

  it('hero cold-3bets from the blinds (first raise faces currentBet > bigBlind) then folds to a 4bet: NOT counted (Bug 1)', () => {
    const stats = aggregateHeroStats([
      record(
        [
          // First preflop raise, but the pot was already raised (currentBet 3 > bigBlind 1): this is a
          // cold 3bet, NOT an open — so the hand cannot be a fold-to-3bet at all.
          dec('preflop', raiseTo(9), { toCall: 2, currentBet: 3 }),
          dec('preflop', fold, { toCall: 18, currentBet: 27 }), // folds to a 4bet to 27
        ],
        { bigBlind: 1 },
      ),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 0, fraction: null })
  })

  it('hero opens, faces a 3bet, 4bets, then folds to a 5bet: faced=yes denominator, folded=NO numerator (Bug 2)', () => {
    const stats = aggregateHeroStats([
      record(
        [
          dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }), // open into unraised pot
          dec('preflop', raiseTo(27), { toCall: 6, currentBet: 9 }), // faces 3bet to 9, 4bets to 27
          dec('preflop', fold, { toCall: 54, currentBet: 81 }), // folds to a 5bet — NOT a fold-to-3bet
        ],
        { bigBlind: 1 },
      ),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 1, fraction: 0 })
  })

  it('a record missing bigBlind cannot identify the open: excluded from fold-to-3bet, no crash', () => {
    const stats = aggregateHeroStats([
      record(
        [
          dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
          dec('preflop', fold, { toCall: 6, currentBet: 9 }),
        ],
        { bigBlind: undefined },
      ),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 0, fraction: null })
  })

  it('the open over limpers (currentBet still === bigBlind) still qualifies as an open', () => {
    const stats = aggregateHeroStats([
      record(
        [
          // A limped pot keeps currentBet at the BB, so this iso-raise is a genuine open.
          dec('preflop', raiseTo(5), { toCall: 1, currentBet: 1 }),
          dec('preflop', fold, { toCall: 14, currentBet: 19 }), // faces a 3bet, folds
        ],
        { bigBlind: 1 },
      ),
    ])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 1, denominator: 1, fraction: 1 })
  })

  it('aggregates fold-to-3bet across many hands', () => {
    const open3betFold = (): HandHistoryRecord =>
      record([
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
        dec('preflop', fold, { toCall: 6, currentBet: 9 }),
      ])
    const open3betCall = (): HandHistoryRecord =>
      record([
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
        dec('preflop', call, { toCall: 6, currentBet: 9 }),
      ])
    const stats = aggregateHeroStats([open3betFold(), open3betFold(), open3betCall()])
    expect(stats.overall.foldToThreeBet).toEqual({ count: 2, denominator: 3, fraction: 2 / 3 })
  })
})

describe('aggregateHeroStats — by-position split (reusing classifyPosition)', () => {
  it('buckets each record by the hero position derived from buttonIndex + heroSeat + seatCount', () => {
    // 6-max. buttonIndex 0 ⇒ SB = seat 1, BB = seat 2, button (late) = seat 0.
    const onButton = record([dec('preflop', raiseTo(3))], { heroSeat: 0, buttonIndex: 0 })
    const inBigBlind = record([dec('preflop', fold)], { heroSeat: 2, buttonIndex: 0 })
    const stats = aggregateHeroStats([onButton, inBigBlind])

    expect([...stats.byPosition.keys()].sort()).toEqual(['big-blind', 'late'])
    expect(stats.byPosition.get('late')!.hands).toBe(1)
    expect(stats.byPosition.get('late')!.vpip.count).toBe(1)
    expect(stats.byPosition.get('big-blind')!.hands).toBe(1)
    expect(stats.byPosition.get('big-blind')!.vpip.count).toBe(0)
    // Overall still spans both records.
    expect(stats.overall.hands).toBe(2)
  })

  it('a position the hero never played is absent from the map (unseen, not zeroed)', () => {
    const stats = aggregateHeroStats([
      record([dec('preflop', fold)], { heroSeat: 0, buttonIndex: 0 }),
    ])
    expect(stats.byPosition.has('late')).toBe(true)
    expect(stats.byPosition.has('early')).toBe(false)
    expect(stats.byPosition.has('small-blind')).toBe(false)
  })

  it('fold-to-3bet is computed per position too', () => {
    const stats = aggregateHeroStats([
      record(
        [
          dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
          dec('preflop', fold, { toCall: 6, currentBet: 9 }),
        ],
        { heroSeat: 0, buttonIndex: 0 },
      ),
    ])
    expect(stats.byPosition.get('late')!.foldToThreeBet).toEqual({
      count: 1,
      denominator: 1,
      fraction: 1,
    })
  })
})

describe('aggregateHeroStats — empty input', () => {
  it('returns zeroed overall stats and an empty by-position map', () => {
    const stats = aggregateHeroStats([])
    expect(stats.overall.hands).toBe(0)
    expect(stats.overall.vpip).toEqual({ count: 0, denominator: 0, fraction: null })
    expect(stats.overall.pfr).toEqual({ count: 0, denominator: 0, fraction: null })
    expect(stats.overall.aggressionFactor).toEqual({
      aggressive: 0,
      calls: 0,
      ratio: null,
      hands: 0,
    })
    expect(stats.overall.foldToThreeBet).toEqual({ count: 0, denominator: 0, fraction: null })
    expect(stats.byPosition.size).toBe(0)
  })
})

describe('aggregateHeroStats — v1-record tolerance (missing buttonIndex / facing)', () => {
  it('a v1 record (no buttonIndex) counts overall for VPIP/PFR/AF but is in no position bucket', () => {
    const v1 = record([dec('preflop', raiseTo(3)), dec('flop', betTo(5)), dec('turn', call)], {
      schemaVersion: 1,
      bigBlind: undefined,
      // no buttonIndex
    })
    const stats = aggregateHeroStats([v1])
    expect(stats.overall.hands).toBe(1)
    expect(stats.overall.vpip.count).toBe(1)
    expect(stats.overall.pfr.count).toBe(1)
    expect(stats.overall.aggressionFactor.aggressive).toBe(2)
    expect(stats.overall.aggressionFactor.calls).toBe(1)
    expect(stats.byPosition.size).toBe(0)
  })

  it('a v1 record (no per-decision facing) cannot qualify for fold-to-3bet — excluded, never crashes', () => {
    const v1 = record(
      [dec('preflop', raiseTo(3)), dec('preflop', fold)], // open then fold, but no facing context
      { schemaVersion: 1, bigBlind: undefined },
    )
    const stats = aggregateHeroStats([v1])
    expect(stats.overall.foldToThreeBet.denominator).toBe(0)
    // VPIP/PFR/AF still derive from decisions alone.
    expect(stats.overall.vpip.count).toBe(1)
    expect(stats.overall.pfr.count).toBe(1)
  })

  it('mixes v1 and v2 records without crashing — each counts where its data supports it', () => {
    const v2 = record(
      [
        dec('preflop', raiseTo(3), { toCall: 1, currentBet: 1 }),
        dec('preflop', fold, { toCall: 6, currentBet: 9 }),
      ],
      { heroSeat: 0, buttonIndex: 0 },
    )
    const v1 = record([dec('preflop', call)], { schemaVersion: 1, bigBlind: undefined })
    const stats = aggregateHeroStats([v2, v1])
    expect(stats.overall.hands).toBe(2)
    expect(stats.overall.foldToThreeBet).toEqual({ count: 1, denominator: 1, fraction: 1 })
    // Only the v2 record is bucketed by position.
    expect(stats.byPosition.get('late')!.hands).toBe(1)
  })
})
