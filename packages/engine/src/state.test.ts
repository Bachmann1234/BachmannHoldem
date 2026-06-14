import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from './card.js'
import {
  applyAction,
  createHand,
  currentActor,
  handWinners,
  isComplete,
  legalActions,
  potTotal,
  type HandConfig,
} from './state.js'

/**
 * Build a deck that deals exactly the given hole cards and board. Hole cards are dealt
 * one at a time, two rounds, starting at the small blind — so we lay the deck out in
 * that same consumption order. `holesBySeat[seat]` is a two-card string like "As Ks".
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

describe('hand setup', () => {
  it('posts blinds and seats the first actor (3-handed)', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100, 100], deck }))

    expect(s.players[1]!.committed).toBe(1) // small blind
    expect(s.players[2]!.committed).toBe(2) // big blind
    expect(s.players[0]!.committed).toBe(0)
    expect(s.players[1]!.stack).toBe(99)
    expect(s.players[2]!.stack).toBe(98)
    expect(s.currentBet).toBe(2)
    expect(s.street).toBe('preflop')
    // 3-handed: UTG is the button and acts first preflop.
    expect(s.toAct).toBe(0)
    expect(potTotal(s)).toBe(3)
  })

  it('deals each player their hole cards', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100], deck }))
    expect(parseCards('As Ad')).toEqual([s.players[0]!.holeCards[0], s.players[0]!.holeCards[1]])
    expect(parseCards('Ks Kd')).toEqual([s.players[1]!.holeCards[0], s.players[1]!.holeCards[1]])
  })

  it('treats the button as the small blind heads-up, acting first preflop', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100], deck }))
    expect(s.players[0]!.committed).toBe(1) // button = SB
    expect(s.players[1]!.committed).toBe(2) // BB
    expect(s.toAct).toBe(0)
  })
})

describe('legal actions', () => {
  it('offers fold/call/raise to the opener facing the big blind', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100, 100], deck }))
    const la = legalActions(s)
    expect(la.fold).toBe(true)
    expect(la.check).toBe(false)
    expect(la.call).toEqual({ amount: 2 })
    expect(la.bet).toBeNull()
    expect(la.raise).toEqual({ min: 4, max: 100 }) // min open-raise is to 2 big blinds
  })

  it('gives the big blind its option to check or raise', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    let s = createHand(config({ stacks: [100, 100, 100], deck }))
    s = applyAction(s, { type: 'call' }) // UTG calls
    s = applyAction(s, { type: 'call' }) // SB completes
    expect(s.toAct).toBe(2) // big blind
    const la = legalActions(s)
    expect(la.check).toBe(true)
    expect(la.call).toBeNull()
    expect(la.raise).toEqual({ min: 4, max: 100 })
  })

  it('rejects a check when facing a bet', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100, 100], deck }))
    expect(() => applyAction(s, { type: 'check' })).toThrow(/check is not legal/)
  })

  it('enforces the minimum raise size', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    const s = createHand(config({ stacks: [100, 100, 100], deck }))
    expect(() => applyAction(s, { type: 'raise', amount: 3 })).toThrow(/outside legal range/)
    expect(() => applyAction(s, { type: 'raise', amount: 4 })).not.toThrow()
  })
})

describe('hand progression', () => {
  it('runs heads-up to showdown and awards the better hand', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 7d 9h Th Jc')
    let s = createHand(config({ stacks: [100, 100], deck }))
    s = applyAction(s, { type: 'call' }) // button/SB completes
    s = applyAction(s, { type: 'check' }) // BB checks
    expect(s.street).toBe('flop')
    // Check the hand down across flop, turn, river.
    for (let i = 0; i < 6; i++) s = applyAction(s, { type: 'check' })
    expect(isComplete(s)).toBe(true)
    expect(s.endReason).toBe('showdown')
    expect(s.board.length).toBe(5)
    expect(s.payouts).toEqual({ 0: 4 })
    expect(s.players[0]!.stack).toBe(102) // pair of aces wins the 4-chip pot
    expect(s.players[1]!.stack).toBe(98)
  })

  it('awards the blinds on a walk (everyone folds to the big blind)', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    let s = createHand(config({ stacks: [100, 100, 100], deck }))
    s = applyAction(s, { type: 'fold' }) // UTG folds
    s = applyAction(s, { type: 'fold' }) // SB folds
    expect(isComplete(s)).toBe(true)
    expect(s.endReason).toBe('fold')
    expect(s.showdownHands).toEqual({}) // no showdown on a fold
    expect(s.players[2]!.stack).toBe(101) // BB recovers its 2 and wins SB's 1
    expect(s.players[1]!.stack).toBe(99)
    expect(s.players[0]!.stack).toBe(100)
  })
})

describe('side pots', () => {
  it('splits a three-way all-in of differing sizes into main and side pots', () => {
    // seat0 royal flush, seat1 broadway straight, seat2 trip deuces.
    const deck = buildDeck(3, 0, ['Th 3d', 'Tc 9c', '2d 2s'], 'Ah Kh Qh Jh 2c')
    let s = createHand(config({ stacks: [20, 50, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 20 }) // UTG (seat0) shoves 20
    s = applyAction(s, { type: 'raise', amount: 50 }) // SB (seat1) shoves 50
    s = applyAction(s, { type: 'call' }) // BB (seat2) calls 50, leaving 50 behind
    expect(isComplete(s)).toBe(true)

    // Main pot: 20 x 3 = 60, contested by all three -> seat0's royal wins.
    // Side pot: 30 x 2 = 60, contested by seat1 & seat2 -> seat1's straight wins.
    expect(s.pots).toEqual([
      { amount: 60, eligibleSeats: [0, 1, 2], winningSeats: [0] },
      { amount: 60, eligibleSeats: [1, 2], winningSeats: [1] },
    ])
    expect(handWinners(s)).toEqual([0, 1])
    expect(s.players[0]!.stack).toBe(60)
    expect(s.players[1]!.stack).toBe(60)
    expect(s.players[2]!.stack).toBe(50)
    // Chips are conserved.
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(170)
  })

  it('chops an odd pot with dead money, giving the odd chip left of the button', () => {
    // seat0 and seat2 tie; seat1 folds its posted small blind into the pot as dead money.
    const deck = buildDeck(3, 0, ['As Ks', '3c 3d', 'Ad Kd'], '2c 7d 9h Th Jc')
    let s = createHand(config({ stacks: [100, 100, 100], deck }))
    s = applyAction(s, { type: 'call' }) // UTG (seat0) calls
    s = applyAction(s, { type: 'fold' }) // SB (seat1) folds its 1 chip
    s = applyAction(s, { type: 'check' }) // BB (seat2) checks its option
    for (let i = 0; i < 6; i++) s = applyAction(s, { type: 'check' }) // check it down

    expect(s.pots).toEqual([{ amount: 5, eligibleSeats: [0, 2], winningSeats: [0, 2] }])
    // 5 chips split two ways -> 2 each plus a 1-chip remainder to the first eligible
    // seat clockwise from the button (seat2 here).
    expect(s.payouts).toEqual({ 0: 2, 2: 3 })
    expect(s.players[0]!.stack).toBe(100)
    expect(s.players[2]!.stack).toBe(101)
    expect(s.players[1]!.stack).toBe(99)
  })
})

describe('all-in reopen rule', () => {
  it('does not let a short all-in reopen the betting to a player who already acted', () => {
    // seat1 has only 8 chips; after a full raise to 6 it can only shove to 8 (a 2-chip
    // raise, less than the 4-chip minimum), which must not reopen the raise to seat0.
    const deck = buildDeck(3, 0, ['As Ks', 'Qh Qd', '7c 2d'], '2c 3d 4h 5s 7h')
    let s = createHand(config({ stacks: [100, 8, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 6 }) // UTG (seat0) raises to 6
    s = applyAction(s, { type: 'raise', amount: 8 }) // SB (seat1) all-in for less than a full raise

    // BB has not acted since the last full raise, so it may still re-raise.
    expect(s.toAct).toBe(2)
    expect(legalActions(s).raise).not.toBeNull()

    s = applyAction(s, { type: 'call' }) // BB just calls the 8
    // Action returns to seat0, who already raised: it may call the extra 2 but NOT re-raise.
    expect(s.toAct).toBe(0)
    const la = legalActions(s)
    expect(la.call).toEqual({ amount: 2 })
    expect(la.raise).toBeNull()
    expect(() => applyAction(s, { type: 'raise', amount: 12 })).toThrow(/raise is not legal/)
  })
})

describe('uncalled bets', () => {
  it('returns the uncalled portion of a bet when everyone folds', () => {
    const deck = buildDeck(2, 0, ['As Ad', 'Ks Kd'], '2c 3d 4h 5s 7c')
    let s = createHand(config({ stacks: [100, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 50 }) // button/SB raises to 50
    s = applyAction(s, { type: 'fold' }) // BB folds

    // Only the called portion (matching the BB's 2) forms a pot; the other 48 is returned.
    expect(s.pots).toEqual([{ amount: 4, eligibleSeats: [0], winningSeats: [0] }])
    expect(s.players[0]!.stack).toBe(102) // net +2 (won the big blind), not +50
    expect(s.players[1]!.stack).toBe(98)
  })

  it('does not count a returned uncalled overbet as a win (BUG-0002)', () => {
    // Hero (seat0) shoves more than the short stack can call; the short stack calls
    // all-in for less and wins at showdown. The uncalled excess is returned to the
    // hero, so hero's payout is > 0 even though hero lost the pot.
    const deck = buildDeck(2, 0, ['2c 7d', 'As Ad'], 'Ah Kd Qc Js 9h')
    let s = createHand(config({ stacks: [100, 30], deck }))
    s = applyAction(s, { type: 'raise', amount: 100 }) // hero (button/SB) shoves 100
    s = applyAction(s, { type: 'call' }) // short stack calls all-in for 30
    expect(isComplete(s)).toBe(true)

    // One contested pot of 60, won by the short stack (seat1) with aces.
    expect(s.pots).toEqual([{ amount: 60, eligibleSeats: [0, 1], winningSeats: [1] }])
    // Hero still has a positive payout — the 70 returned overbet — but is NOT a winner.
    expect(s.payouts[0]).toBeGreaterThan(0)
    expect(handWinners(s)).toEqual([1])
  })
})

describe('immutability', () => {
  it('never mutates the input state', () => {
    const deck = buildDeck(3, 0, ['As Ks', 'Qs Js', 'Ts 9s'], '2c 3d 4h 5s 7c')
    const s0 = createHand(config({ stacks: [100, 100, 100], deck }))
    const before = JSON.stringify(s0)
    const s1 = applyAction(s0, { type: 'fold' })
    expect(JSON.stringify(s0)).toBe(before) // s0 untouched
    expect(s1).not.toBe(s0)
    expect(s1.players[0]!.status).toBe('folded')
    expect(s0.players[0]!.status).toBe('active')
    expect(currentActor(s0)!.seat).toBe(0)
  })
})
