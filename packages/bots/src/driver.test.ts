import { describe, expect, it } from 'vitest'
import {
  createHand,
  isComplete,
  parseCards,
  type Action,
  type Card,
  type HandConfig,
  type HandState,
} from '@holdem/engine'
import type { DecisionContext } from './context.js'
import { callingStation, randomBot, rock, type Opponent } from './opponent.js'
import { applyOpponentAction, playBotHand } from './driver.js'

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

function headsUp(): HandState {
  const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
  return createHand(config({ stacks: [100, 100], deck }))
}

describe('applyOpponentAction', () => {
  it('advances the hand by one action using the seat-on-turn bot', async () => {
    const state = headsUp() // seat 0 to act
    const next = await applyOpponentAction(state, { 0: callingStation, 1: callingStation })
    // The calling station called the blind: it is no longer seat 0's turn, pot grew.
    expect(next).not.toBe(state)
    expect(next.players[0]!.committed).toBeGreaterThanOrEqual(state.players[0]!.committed)
  })

  it('accepts a function lookup as well as a record', async () => {
    const state = headsUp()
    const next = await applyOpponentAction(state, () => callingStation)
    expect(next.toAct).not.toBeNull()
  })

  it('supports an async (Promise-returning) bot via the seam', async () => {
    const asyncBot: Opponent = {
      name: 'Async',
      decide: (ctx: DecisionContext): Promise<Action> =>
        Promise.resolve(ctx.legalActions.check ? { type: 'check' } : { type: 'call' }),
    }
    const next = await applyOpponentAction(headsUp(), { 0: asyncBot, 1: asyncBot })
    expect(next.toAct).not.toBeNull()
  })

  it('throws when the hand awaits no action', async () => {
    const complete = await playBotHand(headsUp(), { 0: rock, 1: callingStation })
    await expect(applyOpponentAction(complete, { 0: rock, 1: rock })).rejects.toThrow(
      /not awaiting/,
    )
  })

  it('throws when no bot is registered for the seat on turn', async () => {
    await expect(applyOpponentAction(headsUp(), { 1: callingStation })).rejects.toThrow(
      /no opponent registered/,
    )
  })
})

describe('playBotHand — a bot-vs-bot hand runs to completion', () => {
  it('reaches street === complete with two calling stations (showdown)', async () => {
    const final = await playBotHand(headsUp(), { 0: callingStation, 1: callingStation })
    expect(final.street).toBe('complete')
    expect(isComplete(final)).toBe(true)
    expect(final.endReason).toBe('showdown')
    // No money is lost: the chips paid out equal the chips wagered into the pot. (Both
    // stations check/call down, so the pot is just the matched blinds = 4.)
    const wagered = final.players.reduce((sum, p) => sum + p.totalCommitted, 0)
    const paid = Object.values(final.payouts).reduce((a, b) => a + b, 0)
    expect(paid).toBe(wagered)
    // Seat 0 holds AA over KK and scoops it all.
    expect(final.payouts[0]).toBe(wagered)
  })

  it('completes when a rock folds preflop (fold ending)', async () => {
    const final = await playBotHand(headsUp(), { 0: rock, 1: callingStation })
    expect(final.street).toBe('complete')
    expect(final.endReason).toBe('fold')
  })

  it('completes for several seeded random-bot hands', async () => {
    for (let seed = 0; seed < 15; seed++) {
      const final = await playBotHand(headsUp(), { 0: randomBot(seed), 1: randomBot(seed + 100) })
      expect(final.street).toBe('complete')
    }
  })

  it('trips the guard if a hand cannot complete in time', async () => {
    // maxActions of 0 forces the guard before any action is applied.
    await expect(
      playBotHand(headsUp(), { 0: callingStation, 1: callingStation }, 0),
    ).rejects.toThrow(/did not complete/)
  })
})
