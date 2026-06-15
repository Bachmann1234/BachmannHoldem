/**
 * The MVU core's unit tests (tickets 0025 / 0029): the reducer is a pure function over the model,
 * so these run with no JSX transform and no terminal. They cover the whole **session state machine**
 * the reducer owns — setup edits, dealing a hand from an injected deck, apply-action, and the
 * session-orchestration logic the ticket requires proven directly: **button rotation among live
 * seats**, **bust removal / compaction**, the seat→playerId map, and the phase transitions. The RNG
 * (deck shuffle) and bot decisions stay in the shell; here we inject decks and drive actions.
 */

import { describe, it, expect } from 'vitest'
import {
  isComplete,
  legalActions,
  makeDeck,
  parseCards,
  potTotal,
  type Card,
  type HandState,
} from '@holdem/engine'
import {
  buildSessionPlayers,
  compactSeating,
  createInitialModel,
  defaultOpponents,
  removeBusted,
  rotateButton,
  sessionOver,
  type SessionPlayer,
} from './model.js'
import { reducer } from './reducer.js'

/** A fixed, unshuffled full deck — legal to deal; order is irrelevant to the session logic. */
const FIXED_DECK: readonly Card[] = makeDeck()

/** Build a deck dealing exactly the given hole cards + board (mirrors the engine test helper). */
function buildDeck(n: number, button: number, holesBySeat: string[], board: string): Card[] {
  const sbIndex = n === 2 ? button : (button + 1) % n
  const holes = holesBySeat.map((s) => parseCards(s))
  const order: Card[] = []
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) order.push(holes[(sbIndex + k) % n]![round]!)
  }
  return [...order, ...parseCards(board)]
}

/** A stable players list with the given stacks (hero id 0 first, then bots) for direct helper tests. */
function playersWithStacks(stacks: number[]): SessionPlayer[] {
  return stacks.map((stack, id) => ({
    id,
    isHero: id === 0,
    label: id === 0 ? 'You' : `Seat ${id}`,
    botKind: id === 0 ? undefined : 'tag',
    stack,
  }))
}

describe('reducer — setup phase', () => {
  it('starts in setup with a 6-max default selection and no hand', () => {
    const model = createInitialModel()
    expect(model.phase).toBe('setup')
    expect(model.setup.seats).toBe(6)
    expect(model.setup.opponents).toHaveLength(5)
    expect(model.hand).toBeNull()
  })

  it('heads-up defaults to a single TAG opponent', () => {
    const model = createInitialModel({ seats: 2 })
    expect(model.setup.opponents).toEqual(['tag'])
  })

  it('set-seats clamps to heads-up..6-max and re-fits the opponent list', () => {
    let model = createInitialModel({ seats: 6 })
    model = reducer(model, { type: 'set-seats', seats: 99 })
    expect(model.setup.seats).toBe(6)
    expect(model.setup.opponents).toHaveLength(5)
    model = reducer(model, { type: 'set-seats', seats: 1 })
    expect(model.setup.seats).toBe(2)
    expect(model.setup.opponents).toHaveLength(1)
  })

  it('set-seats preserves already-chosen presets when growing the table', () => {
    let model = createInitialModel({ seats: 2 })
    model = reducer(model, { type: 'cycle-opponent', opponentIndex: 0 }) // tag -> lag
    expect(model.setup.opponents[0]).toBe('lag')
    model = reducer(model, { type: 'set-seats', seats: 3 })
    expect(model.setup.opponents[0]).toBe('lag') // preserved
    expect(model.setup.opponents).toHaveLength(2)
  })

  it('cycle-opponent walks the four presets (wrapping) and ignores out-of-range', () => {
    let model = createInitialModel({ seats: 2 })
    const seq = ['lag', 'rock', 'station', 'tag']
    for (const expected of seq) {
      model = reducer(model, { type: 'cycle-opponent', opponentIndex: 0 })
      expect(model.setup.opponents[0]).toBe(expected)
    }
    // Backwards wraps the other way; an out-of-range index is a no-op.
    model = reducer(model, { type: 'cycle-opponent', opponentIndex: 0, direction: -1 })
    expect(model.setup.opponents[0]).toBe('station')
    const before = model
    expect(reducer(model, { type: 'cycle-opponent', opponentIndex: 9 })).toBe(before)
  })

  it('ignores session messages while in setup, except start-hand', () => {
    const model = createInitialModel({ seats: 2 })
    expect(reducer(model, { type: 'apply-action', action: { type: 'call' } })).toBe(model)
  })
})

describe('reducer — dealing a hand (start-hand injects the shell deck)', () => {
  it('deals the first hand from setup, entering playing with the hero on the button', () => {
    let model = createInitialModel({ seats: 2 })
    model = reducer(model, { type: 'start-hand', deck: FIXED_DECK })
    expect(model.phase).toBe('playing')
    expect(model.players).toHaveLength(2)
    expect(model.hand).not.toBeNull()
    expect(model.handNumber).toBe(1)
    expect(model.buttonId).toBe(0) // hero takes the first button
    expect(model.hand!.toAct).not.toBeNull()
    expect(model.coach).toEqual({ kind: 'none' })
  })

  it('seats a 6-max table from the selection with the hero at seat 0', () => {
    let model = createInitialModel({ seats: 6 })
    model = reducer(model, { type: 'start-hand', deck: FIXED_DECK })
    expect(model.hand!.players).toHaveLength(6)
    expect(model.heroSeat).toBe(0)
    expect(model.seatToId).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('resets the coach grade on each new hand (no stale verdict)', () => {
    const deck1 = buildDeck(2, 0, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck: deck1 })
    // Grade the hero, then check the hand down to a showdown → hand-over with a stored verdict.
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    expect(model.coach.kind).toBe('preflop') // the first hero decision is graded off the chart
    model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    for (let i = 0; i < 6 && model.phase === 'playing'; i++) {
      model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    }
    expect(model.phase).toBe('hand-over')
    expect(model.coach.kind).toBe('verdict') // the verdict persists through hand-over for the panel
    // Dealing the next hand clears it — a fresh hand must not show the prior verdict.
    const deck2 = buildDeck(2, 1, ['As Ad', 'Kd Qc'], '2c 7d 9h Th 5s')
    model = reducer(model, { type: 'start-hand', deck: deck2 })
    expect(model.coach).toEqual({ kind: 'none' })
  })
})

describe('reducer — apply-action advances the hand and settles the session', () => {
  it('applies a legal action through the engine into a fresh model', () => {
    const model = reducer(createInitialModel({ seats: 2 }), {
      type: 'start-hand',
      deck: FIXED_DECK,
    })
    const next = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    expect(next).not.toBe(model)
    expect(next.hand).not.toBe(model.hand)
    expect(potTotal(next.hand!)).toBeGreaterThan(potTotal(model.hand!))
  })

  it('throws (does not swallow) when handed an illegal action — the shell must pre-validate', () => {
    const model = reducer(createInitialModel({ seats: 2 }), {
      type: 'start-hand',
      deck: FIXED_DECK,
    })
    // Preflop facing the big blind, the SB cannot check — the engine throws, by design.
    expect(() => reducer(model, { type: 'apply-action', action: { type: 'check' } })).toThrow()
  })

  it('on hand completion writes stacks back, drops a busted player, and offers hand-over', () => {
    // Heads-up but with the loser left with chips: hero wins a small pot at showdown, both survive.
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck })
    // Check the hand down to a showdown (heads-up: SB calls, BB checks, then 6 checks).
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    for (let i = 0; i < 6 && model.phase === 'playing'; i++) {
      model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    }
    expect(isComplete(model.hand!)).toBe(true)
    // Both still have chips (small blinds-only pot), so the session continues into hand-over.
    expect(model.phase).toBe('hand-over')
    const total = model.players.reduce((sum, p) => sum + p.stack, 0)
    expect(total).toBe(400) // chips conserved across the two 200-stacks
  })

  it('pauses on session-over (showing the final hand) once only one player has chips', () => {
    // Hero shoves, bot calls all-in and loses the whole stack → one survivor → session over.
    const deck = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck })
    // Hero (SB/button) raises all-in; bot calls all-in; runout; hero wins everything.
    const allIn = legalAllIn(model.hand!)
    model = reducer(model, { type: 'apply-action', action: allIn })
    // Bot must call the shove; drive it via the engine's legal call.
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    // Any remaining streets auto-run when both are all-in; the hand completes.
    expect(isComplete(model.hand!)).toBe(true)
    // The session has ended, but we pause at 'session-over' (NOT 'game-over') so the completed hand
    // — the showdown that decided it — stays on screen for review; the hand is still present.
    expect(model.phase).toBe('session-over')
    expect(model.hand).not.toBeNull()
    const live = model.players.filter((p) => p.stack > 0)
    expect(live).toHaveLength(1)
    expect(live[0]!.isHero).toBe(true)

    // Dismissing the review (a 'quit') advances to the summary.
    expect(reducer(model, { type: 'quit' }).phase).toBe('game-over')
  })

  it('pauses on session-over (not straight to game-over) when the hero busts out', () => {
    // Hero (SB/button) shoves and loses to the bot → hero busts → session over, but the final hand
    // must stay visible so the hero sees the showdown that knocked them out (the reported bug).
    const deck = buildDeck(2, 0, ['7h 2c', 'As Ad'], 'Ah Kd 9s 4c 3d')
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck })
    const allIn = legalAllIn(model.hand!)
    model = reducer(model, { type: 'apply-action', action: allIn })
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    expect(isComplete(model.hand!)).toBe(true)
    expect(model.phase).toBe('session-over')
    expect(model.hand).not.toBeNull()
    const hero = model.players.find((p) => p.isHero)!
    expect(hero.stack).toBe(0)
    expect(reducer(model, { type: 'quit' }).phase).toBe('game-over')
  })

  it('quit jumps straight to game-over', () => {
    const model = reducer(createInitialModel({ seats: 2 }), {
      type: 'start-hand',
      deck: FIXED_DECK,
    })
    expect(reducer(model, { type: 'quit' }).phase).toBe('game-over')
  })
})

describe('reducer — play-again deals the next hand with the button rotated', () => {
  it('rotates the button and carries stacks into the next hand', () => {
    const deck1 = buildDeck(2, 0, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    let model = reducer(createInitialModel({ seats: 2 }), { type: 'start-hand', deck: deck1 })
    model = reducer(model, { type: 'apply-action', action: { type: 'call' } })
    model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    for (let i = 0; i < 6 && model.phase === 'playing'; i++) {
      model = reducer(model, { type: 'apply-action', action: { type: 'check' } })
    }
    expect(model.phase).toBe('hand-over')
    const buttonBefore = model.buttonId
    const stacksBefore = model.players.map((p) => p.stack)

    const deck2 = buildDeck(2, 1, ['As Ad', '7h 2c'], 'Ah Kd 9s 4c 3d')
    model = reducer(model, { type: 'start-hand', deck: deck2 })
    expect(model.phase).toBe('playing')
    expect(model.handNumber).toBe(2)
    expect(model.buttonId).not.toBe(buttonBefore) // heads-up: button alternates
    // The new hand was seated with the carried stacks (minus this hand's blinds).
    const seatedTotal = model.hand!.players.reduce((s, p) => s + p.stack + p.committed, 0)
    expect(seatedTotal).toBe(stacksBefore.reduce((a, b) => a + b, 0))
  })
})

// --- Direct unit tests of the session-orchestration helpers (the ticket requires these) --------

describe('rotateButton — advances among LIVE players only', () => {
  it('moves to the next live player in stable order, wrapping', () => {
    const players = playersWithStacks([200, 200, 200]) // ids 0,1,2 all live
    expect(rotateButton(players, 0)).toBe(1)
    expect(rotateButton(players, 1)).toBe(2)
    expect(rotateButton(players, 2)).toBe(0) // wraps
  })

  it('skips a busted player', () => {
    const players = playersWithStacks([200, 0, 200]) // id 1 busted
    expect(rotateButton(players, 0)).toBe(2) // 1 is skipped
    expect(rotateButton(players, 2)).toBe(0)
  })

  it('rotates correctly even when the current button holder has just busted', () => {
    const players = playersWithStacks([200, 0, 200]) // id 1 (last button) busted
    expect(rotateButton(players, 1)).toBe(2) // next live after stable position 1
  })
})

describe('compactSeating — seats only live players and maps seats back to ids', () => {
  it('compacts survivors into seats 0..k-1 in stable order with a seat→id map', () => {
    const players = playersWithStacks([150, 0, 80, 200]) // id 1 busted out
    const { stacks, seatToId, heroSeat, buttonIndex } = compactSeating(players, 3)
    expect(stacks).toEqual([150, 80, 200]) // the three live stacks, busted id 1 dropped
    expect(seatToId).toEqual([0, 2, 3]) // seat 0→id0, seat1→id2, seat2→id3
    expect(heroSeat).toBe(0) // hero (id 0) is the first live player
    expect(buttonIndex).toBe(2) // buttonId 3 sits in seat 2
  })

  it('keeps the hero seat correct after players ahead of them bust', () => {
    // Hero is id 0 here, so it stays seat 0; but verify a non-zero hero too via a custom list.
    const players: SessionPlayer[] = [
      { id: 0, isHero: false, label: 'Seat 0', botKind: 'tag', stack: 0 },
      { id: 1, isHero: true, label: 'You', stack: 100 },
      { id: 2, isHero: false, label: 'Seat 2', botKind: 'tag', stack: 100 },
    ]
    const { heroSeat, seatToId } = compactSeating(players, 1)
    expect(seatToId).toEqual([1, 2]) // id 0 busted out, so the hero is now seat 0
    expect(heroSeat).toBe(0)
  })
})

describe('removeBusted / sessionOver — bust removal and end detection', () => {
  it('partitions players into alive (chips) and busted (0 chips)', () => {
    const players = playersWithStacks([200, 0, 80, 0])
    const { alive, busted } = removeBusted(players)
    expect(alive.map((p) => p.id)).toEqual([0, 2])
    expect(busted.map((p) => p.id)).toEqual([1, 3])
  })

  it('sessionOver is true when one player remains', () => {
    expect(sessionOver(playersWithStacks([200, 0, 0]))).toBe(true)
    expect(sessionOver(playersWithStacks([200, 100, 0]))).toBe(false)
  })

  it('sessionOver is true when the hero busts even if multiple bots survive', () => {
    expect(sessionOver(playersWithStacks([0, 100, 100]))).toBe(true)
  })
})

describe('buildSessionPlayers / defaultOpponents', () => {
  it('builds the hero (id 0) plus one bot per opponent on the starting stack', () => {
    const players = buildSessionPlayers({ seats: 3, opponents: ['lag', 'rock'] })
    expect(players.map((p) => p.id)).toEqual([0, 1, 2])
    expect(players[0]!.isHero).toBe(true)
    expect(players[1]!.botKind).toBe('lag')
    expect(players[2]!.botKind).toBe('rock')
    expect(players.every((p) => p.stack === 200)).toBe(true)
  })

  it('defaults heads-up to TAG and larger tables to a varied spread', () => {
    expect(defaultOpponents(2)).toEqual(['tag'])
    expect(defaultOpponents(6)).toEqual(['tag', 'lag', 'rock', 'station', 'tag'])
  })
})

/** A legal all-in raise for the seat to act — the maximum the engine permits (hero faces the BB). */
function legalAllIn(hand: HandState): { type: 'raise'; amount: number } {
  return { type: 'raise', amount: legalActions(hand).raise!.max }
}
