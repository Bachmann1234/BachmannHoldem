import { describe, expect, it } from 'vitest'
import {
  createHand,
  parseCards,
  type Action,
  type Card,
  type HandConfig,
  type HandState,
  type LegalActions,
} from '@holdem/engine'

import type { DecisionContext } from './context.js'
import { callingStation, rock, type Opponent } from './opponent.js'
import { playBotHand } from './driver.js'
import {
  HeuristicOpponent,
  heuristicOpponent,
  HEURISTIC_ITERATIONS,
  BET_EQUITY_FLOOR,
} from './heuristic.js'
import {
  LOOSE_AGGRESSIVE,
  TIGHT_PASSIVE,
  TIGHT_AGGRESSIVE,
  LOOSE_PASSIVE,
  DEFAULT_PERSONALITY,
  type Personality,
} from './personality.js'

/** Parse a glued or spaced two-card string into a hole-card tuple, e.g. "AhKh". */
function hole(cards: string): readonly [Card, Card] {
  const glued = cards.replace(/\s+/g, '')
  const [a, b] = parseCards(`${glued.slice(0, 2)} ${glued.slice(2, 4)}`)
  return [a!, b!]
}

/**
 * Build a {@link DecisionContext} directly for a clean, controlled spot. Only the fields
 * the heuristic policy reads (holeCards, board, legalActions, pot, toCall, committed,
 * street) matter; the rest are filled with plausible defaults. `legal` overrides let a test
 * shape exactly what is offered (facing a bet vs an unbet pot).
 */
function ctx(over: {
  holeCards: readonly [Card, Card]
  board?: readonly Card[]
  pot: number
  toCall: number
  committed?: number
  legal: Partial<LegalActions>
}): DecisionContext {
  const board = over.board ?? []
  const legal: LegalActions = {
    fold: false,
    check: false,
    call: null,
    bet: null,
    raise: null,
    ...over.legal,
  }
  return {
    seat: 0,
    holeCards: over.holeCards,
    board,
    street: board.length === 0 ? 'preflop' : board.length === 3 ? 'flop' : 'turn',
    legalActions: legal,
    pot: over.pot,
    currentBet: over.toCall,
    toCall: over.toCall,
    stack: 1000,
    committed: over.committed ?? 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    isButton: true,
    numPlayers: 2,
    numActive: 2,
    opponents: [],
  }
}

describe('HeuristicOpponent — construction', () => {
  it('defaults to the TAG personality and seed 0', () => {
    const bot = new HeuristicOpponent()
    expect(bot.name).toBe(DEFAULT_PERSONALITY.name)
  })

  it('validates the personality at construction (throws on a bad knob)', () => {
    const bad: Personality = {
      name: 'Broken',
      tightness: { continueEquity: 2, assumedVillainRange: 'tight' },
      aggression: { betFrequency: 0.5, betSizing: 0.5 },
    }
    expect(() => new HeuristicOpponent(bad)).toThrow(/continueEquity/)
  })

  it('the factory mirrors the constructor', () => {
    const bot = heuristicOpponent(LOOSE_AGGRESSIVE, 7)
    expect(bot.name).toBe(LOOSE_AGGRESSIVE.name)
  })

  it('keeps the in-decision iteration count modest', () => {
    expect(HEURISTIC_ITERATIONS).toBeLessThan(4000)
  })
})

describe('HeuristicOpponent — pot-odds / EV drives the continue decision', () => {
  it('calls (or raises) a clear +EV spot facing a bet', () => {
    // The nuts on the river facing a tiny call into a big pot — overwhelmingly +EV.
    const bot = new HeuristicOpponent(TIGHT_AGGRESSIVE, 1)
    const spot = ctx({
      holeCards: hole('AhAd'),
      board: parseCards('Ac As Kd'),
      pot: 100,
      toCall: 2,
      legal: { fold: true, call: { amount: 2 } },
    })
    const action = bot.decide(spot)
    expect(['call', 'raise']).toContain(action.type)
  })

  it('folds a clear −EV spot facing a big bet with a weak hand', () => {
    // 7-2 offsuit on an ace-high board facing a pot-sized bet — clearly −EV to continue.
    const bot = new HeuristicOpponent(TIGHT_AGGRESSIVE, 1)
    const spot = ctx({
      holeCards: hole('7h2d'),
      board: parseCards('Ac Ks Qd'),
      pot: 100,
      toCall: 100,
      legal: { fold: true, call: { amount: 100 } },
    })
    expect(bot.decide(spot).type).toBe('fold')
  })

  it('a free call (toCall 0 but call offered) never folds', () => {
    // Pathological shape: call offered for 0 chips. callIsProfitable is always true here.
    const bot = new HeuristicOpponent(TIGHT_PASSIVE, 1)
    const spot = ctx({
      holeCards: hole('7h2d'),
      board: parseCards('Ac Ks Qd'),
      pot: 100,
      toCall: 0,
      legal: { fold: true, call: { amount: 0 } },
    })
    expect(bot.decide(spot).type).not.toBe('fold')
  })

  it('falls back to a call when continuing but no fold and no raise are offered', () => {
    // Weak hand, but fold not offered and only call available → must call (stay legal).
    const bot = new HeuristicOpponent(LOOSE_AGGRESSIVE, 3)
    const spot = ctx({
      holeCards: hole('AhAd'),
      board: parseCards('Ac As Kd'),
      pot: 100,
      toCall: 2,
      legal: { call: { amount: 2 } },
    })
    expect(bot.decide(spot).type).toBe('call')
  })

  it('folds when neither a call nor a check is offered (the total fallback)', () => {
    // Pathological shape where only fold is legal — the bot stays total and folds.
    const bot = new HeuristicOpponent(TIGHT_AGGRESSIVE, 1)
    const spot = ctx({
      holeCards: hole('AhAd'),
      board: parseCards('Ac As Kd'),
      pot: 100,
      toCall: 0,
      legal: { fold: true },
    })
    expect(bot.decide(spot).type).toBe('fold')
  })

  it('falls back to checking when an intended bet window is degenerate (min > max)', () => {
    // A malformed bet window (min above max) cannot be clamped to a legal amount, so the
    // bot abandons the bet and checks — never constructing an illegal action.
    const bot = new HeuristicOpponent(
      { ...LOOSE_AGGRESSIVE, aggression: { betFrequency: 1, betSizing: 1 } },
      0,
    )
    const spot = ctx({
      holeCards: hole('AhAd'),
      board: parseCards('Ac 7s 2d'),
      pot: 100,
      toCall: 0,
      legal: { check: true, bet: { min: 50, max: 10 } },
    })
    expect(bot.decide(spot).type).toBe('check')
  })
})

describe('HeuristicOpponent — aggression drives betting in an unbet pot', () => {
  const strong = (): { holeCards: readonly [Card, Card]; board: readonly Card[] } => ({
    holeCards: hole('AhAd'),
    board: parseCards('Ac 7s 2d'), // top set, very strong
  })

  it('an aggressive bot bets a strong hand far more often than a passive one', () => {
    let lagBets = 0
    let passiveBets = 0
    for (let seed = 0; seed < 40; seed++) {
      const s = strong()
      const spot = ctx({
        holeCards: s.holeCards,
        board: s.board,
        pot: 100,
        toCall: 0,
        legal: { check: true, bet: { min: 2, max: 1000 } },
      })
      if (new HeuristicOpponent(LOOSE_AGGRESSIVE, seed).decide(spot).type === 'bet') lagBets++
      if (new HeuristicOpponent(TIGHT_PASSIVE, seed).decide(spot).type === 'bet') passiveBets++
    }
    expect(lagBets).toBeGreaterThan(passiveBets)
    // The passive bot at least sometimes checks a strong hand (it is not always betting).
    expect(passiveBets).toBeLessThan(40)
  })

  it('checks behind when no bet is legal even if it wanted to be aggressive', () => {
    const bot = new HeuristicOpponent(LOOSE_AGGRESSIVE, 0)
    const s = strong()
    const action = bot.decide(
      ctx({
        holeCards: s.holeCards,
        board: s.board,
        pot: 100,
        toCall: 0,
        legal: { check: true }, // bet not offered
      }),
    )
    expect(action.type).toBe('check')
  })

  it('respects the bet-equity floor: weak air in a checked pot tends to check', () => {
    // 7-2 on an ace-king-queen board (no equity) — below BET_EQUITY_FLOOR, so even the LAG
    // checks rather than bets every time the coin fires.
    let bets = 0
    for (let seed = 0; seed < 40; seed++) {
      const spot = ctx({
        holeCards: hole('7h2d'),
        board: parseCards('Ac Ks Qd'),
        pot: 100,
        toCall: 0,
        legal: { check: true, bet: { min: 2, max: 1000 } },
      })
      if (new HeuristicOpponent(LOOSE_AGGRESSIVE, seed).decide(spot).type === 'bet') bets++
    }
    // The floor keeps it from betting air; with ~0 equity it should bet rarely or never.
    expect(bets).toBe(0)
    expect(BET_EQUITY_FLOOR).toBeGreaterThan(0)
  })

  it('clamps the bet size to the legal min/max', () => {
    // betSizing 1 (pot) × pot 100 = 100, but max is 20 → must clamp down to 20.
    const bot = new HeuristicOpponent(
      { ...LOOSE_AGGRESSIVE, aggression: { betFrequency: 1, betSizing: 1 } },
      0,
    )
    const s = strong()
    const action = bot.decide(
      ctx({
        holeCards: s.holeCards,
        board: s.board,
        pot: 100,
        toCall: 0,
        legal: { check: true, bet: { min: 2, max: 20 } },
      }),
    )
    expect(action.type).toBe('bet')
    if (action.type === 'bet') expect(action.amount).toBe(20)
  })
})

describe('HeuristicOpponent — personalities visibly diverge', () => {
  // A marginal spot facing a bet: a middling hand getting decent but not great pot odds.
  function marginalSpot(): DecisionContext {
    return ctx({
      // Top pair (T9 on a 9-high board): ~0.42 equity vs an ultra-tight read, ~0.70 vs a
      // loose one. Facing 50 into 100 the pot-odds bar is ~0.33 — so the nit (which also
      // reads itself against a tighter villain) folds this while the LAG continues.
      holeCards: hole('Th9h'),
      board: parseCards('9s 4c 2d'),
      pot: 100,
      toCall: 50,
      legal: { fold: true, call: { amount: 50 } },
    })
  }

  it('tight-passive folds marginal spots more than loose-aggressive continues them', () => {
    let tpFolds = 0
    let lagFolds = 0
    for (let seed = 0; seed < 30; seed++) {
      if (new HeuristicOpponent(TIGHT_PASSIVE, seed).decide(marginalSpot()).type === 'fold') {
        tpFolds++
      }
      if (new HeuristicOpponent(LOOSE_AGGRESSIVE, seed).decide(marginalSpot()).type === 'fold') {
        lagFolds++
      }
    }
    // The nit folds the marginal spot strictly more often than the LAG.
    expect(tpFolds).toBeGreaterThan(lagFolds)
  })

  it('loose-aggressive raises/bets across spots far more than tight-passive', () => {
    function aggressionCount(p: Personality): number {
      let agg = 0
      for (let seed = 0; seed < 30; seed++) {
        // Facing-a-bet continue spot where a raise is legal.
        const facing = ctx({
          holeCards: hole('AhAd'),
          board: parseCards('Ac 7s 2d'),
          pot: 100,
          toCall: 10,
          legal: { fold: true, call: { amount: 10 }, raise: { min: 20, max: 1000 } },
        })
        const a = new HeuristicOpponent(p, seed).decide(facing)
        if (a.type === 'raise' || a.type === 'bet') agg++
      }
      return agg
    }
    expect(aggressionCount(LOOSE_AGGRESSIVE)).toBeGreaterThan(aggressionCount(TIGHT_PASSIVE))
  })

  it('falls back to a call when it wants to raise but raise is illegal (capped/not reopened)', () => {
    const bot = new HeuristicOpponent(
      { ...LOOSE_AGGRESSIVE, aggression: { betFrequency: 1, betSizing: 1 } },
      0,
    )
    const action = bot.decide(
      ctx({
        holeCards: hole('AhAd'),
        board: parseCards('Ac 7s 2d'),
        pot: 100,
        toCall: 10,
        legal: { fold: true, call: { amount: 10 } }, // no raise offered
      }),
    )
    expect(action.type).toBe('call')
  })
})

describe('HeuristicOpponent — determinism', () => {
  it('same (personality, seed, context) → same action', () => {
    const spot = (): DecisionContext =>
      ctx({
        holeCards: hole('Th9h'),
        board: parseCards('Ac 7s 2d'),
        pot: 100,
        toCall: 30,
        legal: { fold: true, call: { amount: 30 }, raise: { min: 60, max: 1000 } },
      })
    const a = new HeuristicOpponent(TIGHT_AGGRESSIVE, 99).decide(spot())
    const b = new HeuristicOpponent(TIGHT_AGGRESSIVE, 99).decide(spot())
    expect(a).toEqual(b)
  })

  it('a single bot is deterministic across repeated decisions on a fresh seed', () => {
    const make = (): { bot: HeuristicOpponent; spot: () => DecisionContext } => ({
      bot: new HeuristicOpponent(LOOSE_AGGRESSIVE, 5),
      spot: () =>
        ctx({
          holeCards: hole('AhAd'),
          board: parseCards('Ac 7s 2d'),
          pot: 100,
          toCall: 0,
          legal: { check: true, bet: { min: 2, max: 1000 } },
        }),
    })
    const one = make()
    const two = make()
    const seqA: Action[] = [one.bot.decide(one.spot()), one.bot.decide(one.spot())]
    const seqB: Action[] = [two.bot.decide(two.spot()), two.bot.decide(two.spot())]
    expect(seqA).toEqual(seqB)
  })
})

describe('HeuristicOpponent — robustness: full hands run to completion legally', () => {
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

  function config(o: Partial<HandConfig> & Pick<HandConfig, 'stacks' | 'deck'>): HandConfig {
    return { buttonIndex: 0, smallBlind: 1, bigBlind: 2, ...o }
  }

  function headsUp(): HandState {
    const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
    return createHand(config({ stacks: [100, 100], deck }))
  }

  it('HeuristicOpponent vs HeuristicOpponent completes across many seeds', async () => {
    for (let seed = 0; seed < 60; seed++) {
      const final = await playBotHand(headsUp(), {
        0: new HeuristicOpponent(LOOSE_AGGRESSIVE, seed),
        1: new HeuristicOpponent(TIGHT_PASSIVE, seed + 1000),
      })
      expect(final.street).toBe('complete')
    }
  }, 30000)

  it('HeuristicOpponent vs a reference bot completes across many seeds', async () => {
    const refs: Opponent[] = [callingStation, rock]
    for (let seed = 0; seed < 60; seed++) {
      const ref = refs[seed % refs.length]!
      const final = await playBotHand(headsUp(), {
        0: new HeuristicOpponent(TIGHT_AGGRESSIVE, seed),
        1: ref,
      })
      expect(final.street).toBe('complete')
    }
  }, 30000)

  it('all four personalities complete a self-play hand across seeds', async () => {
    const personalities = [TIGHT_AGGRESSIVE, LOOSE_AGGRESSIVE, TIGHT_PASSIVE, LOOSE_PASSIVE]
    for (const p of personalities) {
      for (let seed = 0; seed < 15; seed++) {
        const final = await playBotHand(headsUp(), {
          0: new HeuristicOpponent(p, seed),
          1: new HeuristicOpponent(p, seed + 7),
        })
        expect(final.street).toBe('complete')
      }
    }
  }, 30000)
})
