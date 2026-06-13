import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createHand,
  isComplete,
  legalActions,
  parseCards,
  type Action,
  type Card,
  type HandConfig,
  type HandState,
  type LegalActions,
} from '@holdem/engine'
import { decisionContext } from './context.js'
import { callingStation, mulberry32, randomBot, rock, type Opponent } from './opponent.js'

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

/** Assert an action is one the legal-actions snapshot permits, amounts included. */
function isLegal(action: Action, legal: LegalActions): boolean {
  switch (action.type) {
    case 'fold':
      return legal.fold
    case 'check':
      return legal.check
    case 'call':
      return legal.call !== null
    case 'bet':
      return legal.bet !== null && action.amount >= legal.bet.min && action.amount <= legal.bet.max
    case 'raise':
      return (
        legal.raise !== null && action.amount >= legal.raise.min && action.amount <= legal.raise.max
      )
  }
}

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
  it('returns floats in [0, 1)', () => {
    const next = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const x = next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('callingStation', () => {
  it('checks when checking is free', () => {
    const ctx = decisionContext(headsUp(), 0)
    // Force a check spot: postflop, no bet. Easiest is to fabricate via legalActions shape.
    const checkCtx = { ...ctx, legalActions: { ...ctx.legalActions, check: true, call: null } }
    expect(callingStation.decide(checkCtx)).toEqual({ type: 'check' })
  })
  it('calls when facing a bet (never folds, never raises)', () => {
    const ctx = decisionContext(headsUp(), 0)
    expect(callingStation.decide(ctx)).toEqual({ type: 'call' })
  })
  it('has a display name', () => {
    expect(callingStation.name).toBe('Calling Station')
  })
})

describe('rock', () => {
  it('folds whenever folding is legal', () => {
    const ctx = decisionContext(headsUp(), 0)
    expect(rock.decide(ctx)).toEqual({ type: 'fold' })
  })
  it('checks when there is nothing to fold to', () => {
    const ctx = decisionContext(headsUp(), 0)
    const checkCtx = {
      ...ctx,
      legalActions: { ...ctx.legalActions, fold: false, check: true, call: null },
    }
    expect(rock.decide(checkCtx)).toEqual({ type: 'check' })
  })
})

describe('randomBot', () => {
  it('is reproducible for a given seed', () => {
    const ctx = decisionContext(headsUp(), 0)
    const a = randomBot(123).decide(ctx)
    const b = randomBot(123).decide(ctx)
    expect(a).toEqual(b)
  })
  it('only ever returns legal actions across many seeds and spots', async () => {
    // Drive a few hands with the random bot and check legality at every decision point.
    for (let seed = 0; seed < 25; seed++) {
      let state = headsUp()
      const bot = randomBot(seed)
      let guard = 0
      while (!isComplete(state) && guard++ < 200) {
        const legal = legalActions(state)
        const action = await Promise.resolve(bot.decide(decisionContext(state, state.toAct!)))
        expect(isLegal(action, legal)).toBe(true)
        state = applyAction(state, action)
      }
      expect(isComplete(state)).toBe(true)
    }
  })
})

describe('reference bots return only legal actions', () => {
  const bots: Opponent[] = [callingStation, rock, randomBot(99)]
  it('never produces an illegal action when driven through a hand', async () => {
    for (const bot of bots) {
      let state = headsUp()
      let guard = 0
      while (!isComplete(state) && guard++ < 200) {
        const legal = legalActions(state)
        const action = await Promise.resolve(bot.decide(decisionContext(state, state.toAct!)))
        expect(isLegal(action, legal)).toBe(true)
        state = applyAction(state, action)
      }
      expect(isComplete(state)).toBe(true)
    }
  })
})
