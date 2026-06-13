import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createHand,
  parseCards,
  legalActions,
  type Card,
  type HandConfig,
  type HandState,
} from '@holdem/engine'
import { decisionContext } from './context.js'

/**
 * Build a deck that deals exactly the given hole cards and board (same consumption order
 * as the engine: one card at a time, two rounds, starting at the small blind). Mirrors
 * the engine's own test helper.
 */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) {
      order.push(holes[(sbIndex + k) % n]![round]!)
    }
  }
  return [...order, ...parseCards(board)]
}

function config(overrides: Partial<HandConfig> & Pick<HandConfig, 'stacks' | 'deck'>): HandConfig {
  return { buttonIndex: 0, smallBlind: 1, bigBlind: 2, ...overrides }
}

/** A fresh heads-up hand: seat 0 (button = SB) to act first preflop. */
function headsUp(): HandState {
  const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
  return createHand(config({ stacks: [100, 100], deck }))
}

describe('decisionContext — the imperfect-information view', () => {
  it('exposes the acting seat its own hole cards', () => {
    const state = headsUp()
    const ctx = decisionContext(state, 0)
    expect(ctx.holeCards).toEqual(parseCards('As Ad'))
  })

  it('hides every opponent hole card', () => {
    const state = headsUp()
    const ctx = decisionContext(state, 0)
    // Structurally: an OpponentView carries no `holeCards` field at all.
    for (const opp of ctx.opponents) {
      expect('holeCards' in opp).toBe(false)
    }
    // And the serialized view must not contain the opponent's cards anywhere.
    expect(JSON.stringify(ctx)).not.toContain(JSON.stringify(parseCards('Ks Kd')))
  })

  it('reports the redacted opponent seats with visible info only', () => {
    const state = headsUp()
    const ctx = decisionContext(state, 0)
    expect(ctx.opponents).toHaveLength(1)
    const villain = ctx.opponents[0]!
    expect(villain.seat).toBe(1)
    expect(villain.committed).toBe(2) // posted the big blind
    expect(villain.status).toBe('active')
    expect(villain.isButton).toBe(false)
  })

  it('reports the correct call amount and matches legalActions', () => {
    const state = headsUp()
    const ctx = decisionContext(state, 0)
    // Heads-up: button/SB has posted 1, faces the big blind of 2 → must add 1 to call.
    expect(ctx.toCall).toBe(1)
    expect(ctx.legalActions).toEqual(legalActions(state))
    expect(ctx.legalActions.call).toEqual({ amount: 1 })
  })

  it('surfaces pot, blinds, street, stacks, and seat geometry', () => {
    const state = headsUp()
    const ctx = decisionContext(state, 0)
    expect(ctx.pot).toBe(3) // SB 1 + BB 2
    expect(ctx.currentBet).toBe(2)
    expect(ctx.smallBlind).toBe(1)
    expect(ctx.bigBlind).toBe(2)
    expect(ctx.street).toBe('preflop')
    expect(ctx.stack).toBe(99) // 100 − SB
    expect(ctx.committed).toBe(1)
    expect(ctx.buttonIndex).toBe(0)
    expect(ctx.isButton).toBe(true)
    expect(ctx.numPlayers).toBe(2)
    expect(ctx.numActive).toBe(2)
    expect(ctx.seat).toBe(0)
  })

  it('reports a free check (toCall 0) when the bot has matched the bet', () => {
    // 3-handed: the big blind (seat 2) can check the option preflop if everyone limps.
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Th 9h'], '2c 3d 4h 5s 7c')
    let state = createHand(config({ stacks: [100, 100, 100], deck }))
    // UTG (seat 0) calls, SB (seat 1) calls, action reaches the BB (seat 2) with the option.
    state = applyCall(state) // seat 0
    state = applyCall(state) // seat 1
    expect(state.toAct).toBe(2)
    const ctx = decisionContext(state, 2)
    expect(ctx.toCall).toBe(0)
    expect(ctx.legalActions.check).toBe(true)
  })

  it('rejects building a context for an out-of-range seat', () => {
    const state = headsUp()
    expect(() => decisionContext(state, 5)).toThrow(/out of range/)
  })

  it('rejects building a context for a seat that is not on turn', () => {
    const state = headsUp() // seat 0 is to act
    expect(() => decisionContext(state, 1)).toThrow(/not to act/)
  })
})

/** Apply a call for whoever is on turn (test convenience). */
function applyCall(state: HandState): HandState {
  return applyAction(state, { type: 'call' })
}
