import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from './card.js'
import {
  applyAction,
  createHand,
  currentActor,
  handWinners,
  handWinnings,
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

  it('reports handWinnings() per seat from contested pots (excludes returns)', () => {
    // The same 3-way all-in as above: seat0 royal wins the 60 main, seat1 straight wins
    // the 60 side, seat2 wins nothing. No uncalled bet here, so every chip is contested.
    // This pins handWinnings(), used by the TUI/CLI result screens but otherwise unasserted.
    const deck = buildDeck(3, 0, ['Th 3d', 'Tc 9c', '2d 2s'], 'Ah Kh Qh Jh 2c')
    let s = createHand(config({ stacks: [20, 50, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 20 }) // seat0 shoves 20
    s = applyAction(s, { type: 'raise', amount: 50 }) // seat1 shoves 50
    s = applyAction(s, { type: 'call' }) // seat2 calls 50
    expect(isComplete(s)).toBe(true)

    expect(handWinnings(s)).toEqual({ 0: 60, 1: 60 })
    // With no uncalled bet, handWinnings matches payouts exactly.
    expect(s.payouts).toEqual({ 0: 60, 1: 60 })
  })

  it('excludes a returned uncalled bet from handWinnings() (BUG-0002)', () => {
    // Hero (seat0) overbets all-in; the short stack (seat1) calls for less and wins at
    // showdown. The 70-chip overbet is returned to hero, so hero's *payout* is positive
    // even though hero won no pot — handWinnings must report 0 for hero, distinct from
    // payouts which counts the return.
    const deck = buildDeck(2, 0, ['2c 7d', 'As Ad'], 'Ah Kd Qc Js 9h')
    let s = createHand(config({ stacks: [100, 30], deck }))
    s = applyAction(s, { type: 'raise', amount: 100 }) // hero shoves 100
    s = applyAction(s, { type: 'call' }) // short stack calls all-in for 30
    expect(isComplete(s)).toBe(true)

    // Only seat1 won a (contested) pot; the returned overbet is NOT a winning.
    expect(handWinnings(s)).toEqual({ 1: 60 })
    expect(handWinnings(s)[0]).toBeUndefined()
    // payouts, by contrast, counts the 70 returned to hero on top of seat1's 60.
    expect(s.payouts).toEqual({ 0: 70, 1: 60 })
  })

  it('layers a deep multi-way all-in into a main pot plus several side pots', () => {
    // Six DISTINCT stacks all in. The largest stack (seat5, 320) has no caller for its
    // top layer, so its 160-chip excess is RETURNED as an uncalled bet rather than forming
    // a sixth pot: six distinct stacks therefore yield a main + 4 side pots (5 contested
    // pots), not six. (A genuine six-pot ladder needs a contested top layer — see the
    // seven-way test below.) This is the upper-bound felt-rendering case for ticket 0094.
    const holes = ['As Ah', 'Ks Kh', 'Qs Qh', 'Js Jh', 'Ts Th', '9s 9h']
    const deck = buildDeck(6, 0, holes, '2c 3d 4h 5c 7d')
    const stacks = [10, 20, 40, 80, 160, 320]
    let s = createHand(config({ stacks, deck }))
    let guard = 0
    while (s.toAct !== null && guard++ < 40) {
      const la = legalActions(s)
      if (la.raise) s = applyAction(s, { type: 'raise', amount: la.raise.max })
      else if (la.call) s = applyAction(s, { type: 'call' })
      else if (la.check) s = applyAction(s, { type: 'check' })
      else break
    }
    expect(isComplete(s)).toBe(true)

    expect(s.pots.length).toBe(5)
    // Pots are ordered main-first (widest eligibility shrinking as stacks tap out).
    expect(s.pots.map((p) => p.eligibleSeats)).toEqual([
      [0, 1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
      [2, 3, 4, 5],
      [3, 4, 5],
      [4, 5],
    ])
    expect(s.pots.map((p) => p.amount)).toEqual([60, 50, 80, 120, 160])

    const contested = s.pots.reduce((sum, p) => sum + p.amount, 0)
    expect(contested).toBe(470)
    // potTotal counts every chip wagered; the 160 uncalled overbet is returned, not pooled.
    expect(potTotal(s)).toBe(630)
    expect(contested).toBe(potTotal(s) - 160)
  })

  it('builds a true six-pot ladder when the top layer is contested (seven-way)', () => {
    // Seven distinct stacks: the top two contributing seats (seat5=320, seat6=640) make
    // the 320-level layer contested, so this layers a main pot + 5 side pots = 6 pots.
    // seat6's 320 excess above seat5 is the only uncalled bet, returned.
    const holes = ['As Ah', 'Ks Kh', 'Qs Qh', 'Js Jh', 'Ts Th', '9s 9h', '8s 8h']
    const deck = buildDeck(7, 0, holes, '2c 3d 4h 5c 7d')
    const stacks = [10, 20, 40, 80, 160, 320, 640]
    let s = createHand(config({ stacks, deck }))
    let guard = 0
    while (s.toAct !== null && guard++ < 50) {
      const la = legalActions(s)
      if (la.raise) s = applyAction(s, { type: 'raise', amount: la.raise.max })
      else if (la.call) s = applyAction(s, { type: 'call' })
      else if (la.check) s = applyAction(s, { type: 'check' })
      else break
    }
    expect(isComplete(s)).toBe(true)

    expect(s.pots.length).toBe(6)
    expect(s.pots[0]!.eligibleSeats).toEqual([0, 1, 2, 3, 4, 5, 6]) // main, all eligible
    expect(s.pots[5]!.eligibleSeats).toEqual([5, 6]) // last side, only the deepest two
    expect(s.pots.map((p) => p.amount)).toEqual([70, 60, 100, 160, 240, 320])

    const contested = s.pots.reduce((sum, p) => sum + p.amount, 0)
    expect(contested).toBe(950)
    expect(potTotal(s)).toBe(1270)
    expect(contested).toBe(potTotal(s) - 320) // seat6's uncalled 320 returned
  })

  it('resolves the wheel as the lowest straight across a multi-pot showdown', () => {
    // seat0 (short, 20) makes a 6-high straight (2-3-4-5-6) and wins the main pot.
    // seat1 (mid, 50) makes the WHEEL (A-2-3-4-5), the lowest straight: it loses the main
    // pot to seat0's higher straight but wins the side pot against seat2's pair of kings.
    // Board 3c 4d 5h 9s Tc: seat0 holds 2h 6s, seat1 holds As 2d, seat2 holds Kh Kd.
    const deck = buildDeck(3, 0, ['2h 6s', 'As 2d', 'Kh Kd'], '3c 4d 5h 9s Tc')
    let s = createHand(config({ stacks: [20, 50, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 20 }) // seat0 shoves 20
    s = applyAction(s, { type: 'raise', amount: 50 }) // seat1 shoves 50
    s = applyAction(s, { type: 'call' }) // seat2 calls 50
    expect(isComplete(s)).toBe(true)

    expect(s.pots).toEqual([
      // Main pot: 6-high straight (seat0) beats the wheel (seat1) beats the pair (seat2).
      { amount: 60, eligibleSeats: [0, 1, 2], winningSeats: [0] },
      // Side pot: the wheel still beats the pair, so seat1 wins it.
      { amount: 60, eligibleSeats: [1, 2], winningSeats: [1] },
    ])
    expect(handWinners(s)).toEqual([0, 1])
    expect(handWinnings(s)).toEqual({ 0: 60, 1: 60 })
  })

  it('splits a three-way tie with odd chips going left of the button', () => {
    // Four-handed. seats 0, 1, 3 are all-in for 10 and tie by playing the board (a royal
    // straight A-K-Q-J-T on the board); seat2 folds its 2-chip big blind as dead money, so
    // the single pot is 32 — not divisible by three. The two odd chips go to the seats
    // nearest left of the button (button = seat0): seat1 (SB) first, then seat3 (UTG).
    const deck = buildDeck(4, 0, ['2c 2d', '3c 3d', '4c 4d', '5c 5d'], 'As Ks Qs Js Ts')
    let s = createHand(config({ stacks: [10, 10, 10, 10], deck }))
    s = applyAction(s, { type: 'raise', amount: 10 }) // seat3 (UTG) shoves 10
    s = applyAction(s, { type: 'call' }) // seat0 (button) calls 10
    s = applyAction(s, { type: 'call' }) // seat1 (SB) calls 10
    s = applyAction(s, { type: 'fold' }) // seat2 (BB) folds its 2 chips as dead money
    expect(isComplete(s)).toBe(true)

    expect(s.pots).toEqual([{ amount: 32, eligibleSeats: [0, 1, 3], winningSeats: [0, 1, 3] }])
    // 32 / 3 = 10 each, remainder 2 -> +1 to seat1, +1 to seat3, seat0 gets the bare share.
    expect(s.payouts).toEqual({ 0: 10, 1: 11, 3: 11 })
    expect(handWinnings(s)).toEqual({ 0: 10, 1: 11, 3: 11 })
    // Chips are conserved across the whole table.
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(40)
  })

  it('merges a folded contributor’s dead money into the live pot', () => {
    // seat0 (short, 20) is all-in and wins. seat1 (50) raises over the top; seat2 folds its
    // 2-chip big blind. seat2’s dead 2 chips do not form their own pot — they are absorbed
    // into the live main pot (the bottom 0–2 layer merges with the 2–20 layer since both
    // are contested by the same eligible seats [0, 1]). seat1’s 30-chip excess over the
    // all-in is uncalled and returned. No chips are lost.
    const deck = buildDeck(3, 0, ['Th 3d', 'Tc 9c', '2d 2s'], 'Ah Kh Qh Jh 2c')
    let s = createHand(config({ stacks: [20, 50, 100], deck }))
    s = applyAction(s, { type: 'raise', amount: 20 }) // seat0 all-in for 20
    s = applyAction(s, { type: 'raise', amount: 50 }) // seat1 raises to 50
    s = applyAction(s, { type: 'fold' }) // seat2 folds its 2-chip BB as dead money
    expect(isComplete(s)).toBe(true)

    // One pot of 42 = 20 (seat0) + 20 (seat1's matched portion) + 2 (seat2's dead BB).
    expect(s.pots).toEqual([{ amount: 42, eligibleSeats: [0, 1], winningSeats: [0] }])
    // seat0 wins the 42 pot; seat1's uncalled 30 is returned (payout without a win).
    expect(s.payouts).toEqual({ 0: 42, 1: 30 })
    expect(handWinnings(s)).toEqual({ 0: 42 })
    // Every chip is accounted for: nothing created or destroyed by the dead-money merge.
    expect(s.players.reduce((sum, p) => sum + p.stack, 0)).toBe(170)
    expect(s.pots[0]!.amount + 30).toBe(potTotal(s)) // pot + returned = all wagered
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
