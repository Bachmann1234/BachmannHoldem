/**
 * The record-assembly logic (ticket 0037) — turning a real completed hand + the hero's accumulated
 * decisions into a {@link HandHistoryRecord}. The hand is built via the real engine (`createHand` /
 * `applyAction`), never a fabricated `HandState`, so the outcome fields reflect actual engine output.
 */

import { describe, expect, it } from 'vitest'
import { applyAction, createHand, isComplete, parseCards, type HandState } from '@holdem/engine'
import type { Model, SessionPlayer } from '@holdem/session'
import { assembleRecord } from './assemble.js'
import type { HeroDecision } from './record.js'

/** Build a heads-up deck (button = seat 0 = SB) dealing the given holes + board. */
function buildDeck(holesBySeat: string[], board: string) {
  const sbIndex = 0 // heads-up, button on seat 0 is SB
  const n = 2
  const holes = holesBySeat.map((s) => parseCards(s))
  const order = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** A heads-up model with the hero on seat 0; seatToId is the identity for a 2-handed hand. */
function modelFor(hand: HandState): Model {
  const players: SessionPlayer[] = [
    { id: 0, isHero: true, label: 'You', stack: 200 },
    { id: 1, isHero: false, label: 'Seat 1 (TAG)', botKind: 'tag', stack: 200 },
  ]
  return {
    phase: 'hand-over',
    setup: { seats: 2, opponents: ['tag'] },
    players,
    hand,
    seatToId: [0, 1],
    heroSeat: 0,
    buttonId: 0,
    handNumber: 1,
    coach: { kind: 'none' },
  }
}

describe('assembleRecord', () => {
  it('captures decisions + outcome from a real completed (fold) hand', () => {
    // Heads-up: hero (SB/button) raises preflop, BB folds → fold end, hero wins the blinds.
    let hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: buildDeck(['As Ad', 'Kh Kc'], 'Qd Jh 9s 4c 3d'),
    })
    // Hero (seat 0) raises to 6.
    const decisions: HeroDecision[] = [{ street: 'preflop', action: { type: 'raise', amount: 6 } }]
    hand = applyAction(hand, { type: 'raise', amount: 6 })
    // BB (seat 1, a bot) folds.
    hand = applyAction(hand, { type: 'fold' })
    expect(isComplete(hand)).toBe(true)

    const rec = assembleRecord(modelFor(hand), hand, decisions, { id: 'rec-1', playedAt: 1234 })

    expect(rec.id).toBe('rec-1')
    expect(rec.playedAt).toBe(1234)
    expect(rec.handNumber).toBe(1)
    expect(rec.seatCount).toBe(2)
    expect(rec.heroSeat).toBe(0)
    // Schema v2: the dealer button seat is captured from the completed hand (here, seat 0).
    expect(rec.buttonIndex).toBe(0)
    // Schema v2 (0087): the big blind is captured so fold-to-3bet can identify a genuine open.
    expect(rec.bigBlind).toBe(2)
    expect(rec.schemaVersion).toBe(2)
    expect(rec.decisions).toEqual(decisions)
    expect(rec.outcome.endReason).toBe('fold')
    // Hero committed 6, won back 6 (uncalled) + 2 (BB) = 8 → net +2 (the big blind).
    expect(rec.outcome.heroNet).toBe(2)
    // Players carry stable id + label, hero first.
    expect(rec.players[0]).toEqual({ id: 0, label: 'You' })
    expect(rec.players[1]).toEqual({ id: 1, label: 'Seat 1 (TAG)', botKind: 'tag' })
  })

  it('records hero net as negative when the hero folds away chips', () => {
    let hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: buildDeck(['7h 2c', 'Ah Ad'], 'Qd Jh 9s 4c 3d'),
    })
    // Hero (SB) folds preflop, losing the posted small blind (1).
    const decisions: HeroDecision[] = [{ street: 'preflop', action: { type: 'fold' } }]
    hand = applyAction(hand, { type: 'fold' })
    expect(isComplete(hand)).toBe(true)

    const rec = assembleRecord(modelFor(hand), hand, decisions, { id: 'rec-2', playedAt: 1 })
    expect(rec.outcome.heroNet).toBe(-1)
    expect(rec.decisions).toEqual(decisions)
  })

  it('throws if the hand is not complete (a seam bug)', () => {
    const hand = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: buildDeck(['As Ad', 'Kh Kc'], 'Qd Jh 9s 4c 3d'),
    })
    expect(() => assembleRecord(modelFor(hand), hand, [], { id: 'x', playedAt: 0 })).toThrow(
      /not complete/,
    )
  })
})
