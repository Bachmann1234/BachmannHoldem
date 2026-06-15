/**
 * Spot-capture round-trip tests: the whole point of {@link serializeSpot} / {@link parseSpot} is
 * that a *captured spot reproduces the ruling exactly*. The coach is a pure function of
 * `(DecisionContext, action)`, so for both lenses we build a real context, grade it, serialise →
 * parse → re-grade, and assert the re-graded verdict deep-equals the original. We exercise a
 * preflop spot (with opponents, so the steal-spot read is in play) and a postflop spot.
 */

import { describe, expect, it } from 'vitest'
import { parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionContext, OpponentView } from '@holdem/bots'

import { coachDecision } from './verdict.js'
import { gradePreflop } from './preflop.js'
import { serializeSpot, parseSpot } from './spot.js'

/** Parse a space-separated two-card string into a hole tuple, e.g. "Ah Kh". */
function hole(cards: string): readonly [Card, Card] {
  const [a, b] = parseCards(cards)
  return [a!, b!]
}

/** A plausible full DecisionContext; callers override only the fields the grader under test reads. */
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

describe('serializeSpot / parseSpot — round-trip reproduces the ruling exactly', () => {
  it('postflop: a priced river call re-grades to the identical verdict + trace', () => {
    const spotCtx = ctx({
      holeCards: hole('Ah Kh'),
      board: parseCards('Qh Jh 2c 5d 9s'),
      street: 'river',
      pot: 30,
      toCall: 10,
      currentBet: 10,
      numActive: 2,
      opponents: [opp({ seat: 1, committed: 10, totalCommitted: 20 })],
    })
    const action: Action = { type: 'call' }
    const original = coachDecision(spotCtx, action)

    const blob = serializeSpot(spotCtx, action, original)
    const round = parseSpot(blob)
    const regraded = coachDecision(round.ctx, round.action)

    expect(regraded).toEqual(original)
    expect(round.action).toEqual(action)
  })

  it('preflop: a button steal (opponents present → isStealSpot exercised) re-grades identically', () => {
    // Folded to the button (button seat 0, hero seat 0). Opponents have only posted blinds, so the
    // pot is folded to the hero — the steal-spot read must see no voluntary entrant.
    const spotCtx = ctx({
      seat: 0,
      holeCards: hole('Kc 7d'), // trash on the chart, a button steal when folded to
      buttonIndex: 0,
      numPlayers: 3,
      numActive: 3,
      currentBet: 2,
      bigBlind: 2,
      smallBlind: 1,
      toCall: 2,
      pot: 3,
      opponents: [
        opp({ seat: 1, committed: 1, totalCommitted: 1 }), // small blind
        opp({ seat: 2, committed: 2, totalCommitted: 2 }), // big blind (involuntary)
      ],
    })
    const action: Action = { type: 'raise', amount: 6 }
    const original = gradePreflop(spotCtx, action)

    const blob = serializeSpot(spotCtx, action, original)
    const round = parseSpot(blob)
    const regraded = gradePreflop(round.ctx, round.action)

    expect(regraded).toEqual(original)
    expect(round.action).toEqual(action)
  })

  it('produces readable JSON: cards as strings, action in the shared grammar, verdict carried', () => {
    const spotCtx = ctx({ holeCards: hole('As Ad'), board: parseCards('Kh 7c 2d'), street: 'flop' })
    const blob = serializeSpot(
      spotCtx,
      { type: 'bet', amount: 50 },
      coachDecision(spotCtx, { type: 'bet', amount: 50 }),
    )
    expect(blob).toContain('"holeCards": "As Ad"')
    expect(blob).toContain('"board": "Kh 7c 2d"')
    expect(blob).toContain('"action": "bet 50"')
    expect(blob).toContain('"verdict"')
    // Pretty-printed at 2-space indent.
    expect(blob).toContain('\n  "seat"')
  })

  it('omits the verdict when none is passed', () => {
    const spotCtx = ctx({ holeCards: hole('As Ad') })
    expect(serializeSpot(spotCtx, { type: 'fold' })).not.toContain('"verdict"')
  })

  it('serialises an empty board as "" preflop and round-trips it to no board cards', () => {
    const spotCtx = ctx({ holeCards: hole('As Ad') })
    const blob = serializeSpot(spotCtx, { type: 'call' })
    expect(blob).toContain('"board": ""')
    expect(parseSpot(blob).ctx.board).toEqual([])
  })

  it('throws a clear error on invalid JSON', () => {
    expect(() => parseSpot('not json')).toThrow(/malformed spot: not valid JSON/)
  })

  it('throws a clear error on a missing field', () => {
    expect(() => parseSpot('{"holeCards":"As Ad"}')).toThrow(/malformed spot/)
  })

  it('throws a clear error on a sized action missing its amount', () => {
    const spotCtx = ctx({ holeCards: hole('As Ad') })
    const blob = serializeSpot(spotCtx, { type: 'call' }).replace('"call"', '"bet"')
    expect(() => parseSpot(blob)).toThrow(/needs a numeric amount/)
  })

  it('throws a clear error on an unknown action verb', () => {
    const spotCtx = ctx({ holeCards: hole('As Ad') })
    const blob = serializeSpot(spotCtx, { type: 'call' }).replace('"call"', '"dance"')
    expect(() => parseSpot(blob)).toThrow(/unknown action verb/)
  })
})
