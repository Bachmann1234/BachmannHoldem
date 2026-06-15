/**
 * Unit tests for the harness's pure analysis helpers (the Tier-1..3 testing enhancements): position
 * naming, the ground-truth equity read, and the coach-vs-truth divergence flag. These are the
 * instrument the `--json` sweep is built on, so they are worth pinning directly.
 */

import { describe, it, expect } from 'vitest'
import { createHand, parseCards, type Card } from '@holdem/engine'
import {
  positionName,
  groundTruthEquity,
  assessTruth,
  coachMisleads,
  POSITION_LABELS,
} from './analysis.js'

describe('positionName', () => {
  it('labels heads-up: the button is the SB, the other seat the BB', () => {
    expect(positionName(0, 0, 2)).toBe('BTN')
    expect(positionName(1, 0, 2)).toBe('BB')
    // Move the button: the hero (seat 0) becomes the BB.
    expect(positionName(0, 1, 2)).toBe('BB')
  })

  it('labels a 6-handed table by steps from the button', () => {
    // Button on seat 3: SB=4, BB=5, UTG=0, MP=1, CO=2.
    expect(positionName(3, 3, 6)).toBe('BTN')
    expect(positionName(4, 3, 6)).toBe('SB')
    expect(positionName(5, 3, 6)).toBe('BB')
    expect(positionName(0, 3, 6)).toBe('UTG')
    expect(positionName(1, 3, 6)).toBe('MP')
    expect(positionName(2, 3, 6)).toBe('CO')
  })

  it('has a label set for every supported table size, sized to that table', () => {
    for (let n = 2; n <= 6; n++) expect(POSITION_LABELS[n]).toHaveLength(n)
  })
})

describe('assessTruth', () => {
  it('a free check is always a continue regardless of equity', () => {
    expect(assessTruth(0.01, 10, 0).correct).toBe('continue')
  })

  it('a priced spot continues when the call is +EV and folds when it is -EV', () => {
    // Pot 10, call 5: break-even equity is 5/15 ≈ 0.333.
    expect(assessTruth(0.5, 10, 5).correct).toBe('continue')
    expect(assessTruth(0.1, 10, 5).correct).toBe('fold')
    const ev = assessTruth(0.5, 10, 5).callEv
    expect(ev).toBeGreaterThan(0)
  })
})

describe('coachMisleads', () => {
  const truthFold = { equity: 0, callEv: -5, correct: 'fold' as const }
  const truthContinue = { equity: 0.8, callEv: 5, correct: 'continue' as const }

  it('flags a priced spot where the coach says continue but the truth is fold', () => {
    expect(coachMisleads('continue', truthFold, 8)).toBe(true)
  })

  it('does not flag agreement', () => {
    expect(coachMisleads('continue', truthContinue, 8)).toBe(false)
    expect(coachMisleads('fold', truthFold, 8)).toBe(false)
  })

  it('never flags a free check (toCall === 0) — both always continue', () => {
    expect(coachMisleads('continue', truthFold, 0)).toBe(false)
  })
})

/** Deal a heads-up hand with the given holes + board (mirrors the table-test helper). */
function headsUpDeck(holesBySeat: string[], board: string): Card[] {
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < 2; k++) order.push(holes[k]![round]!)
  }
  return [...order, ...parseCards(board)]
}

describe('groundTruthEquity', () => {
  it('reads exact equity vs the villain’s actual cards (a drawing-dead river is 0%)', () => {
    // Hero pair of threes vs villain pair of sixes on a settled river — hero is dead.
    const deck = headsUpDeck(['Kc 3d', 'Kd 6d'], '5d 3s 7s 6h 8h')
    const state = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck,
    })
    const river = { ...state, board: parseCards('5d 3s 7s 6h 8h'), street: 'river' as const }
    expect(groundTruthEquity(river, 0)).toBe(0)
  })

  it('gives the made hand 100% when the villain is drawing dead', () => {
    const deck = headsUpDeck(['Kd 6d', 'Kc 3d'], '5d 3s 7s 6h 8h')
    const state = createHand({
      stacks: [200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck,
    })
    const river = { ...state, board: parseCards('5d 3s 7s 6h 8h'), street: 'river' as const }
    expect(groundTruthEquity(river, 0)).toBe(1)
  })

  it('ignores folded villains, reading only against live opponents', () => {
    // Three-handed, but seat 2 has folded. Set hole cards directly so the read is independent of the
    // deal order: hero (3s) vs a live villain (6s), with seat 2 holding the aces but folded.
    const deck = headsUpDeck(['Kc 3d', 'Kd 6d'], '5d 3s 7s 6h 8h')
    const base = createHand({
      stacks: [200, 200, 200],
      buttonIndex: 0,
      smallBlind: 1,
      bigBlind: 2,
      deck: [...deck, ...parseCards('2h 2s')],
    })
    const holes: Record<number, [Card, Card]> = {
      0: parseCards('Kc 3d') as [Card, Card],
      1: parseCards('Kd 6d') as [Card, Card],
      2: parseCards('Ah Ac') as [Card, Card],
    }
    const river = {
      ...base,
      board: parseCards('5d 3s 7s 6h 8h'),
      street: 'river' as const,
      players: base.players.map((p) => ({
        ...p,
        holeCards: holes[p.seat]!,
        status: p.seat === 2 ? ('folded' as const) : p.status,
      })),
    }
    // Vs only the live villain (pair of sixes) hero is dead; the folded aces are excluded.
    expect(groundTruthEquity(river, 0)).toBe(0)
  })
})
