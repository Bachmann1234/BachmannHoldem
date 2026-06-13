/**
 * Texas Hold'em game state machine — the rules referee (ticket 0003).
 *
 * This module has *zero* strategy. It drives one hand from posted blinds through
 * showdown, enforcing legal play and accounting for the pot (including side pots).
 * Everything downstream (bots, coach, UI) trusts it, so it is built to be ruthlessly
 * testable: every transition produces a brand-new {@link HandState} snapshot and the
 * input state is never mutated.
 *
 *   createHand(config)        -> initial HandState (blinds posted, first actor set)
 *   legalActions(state)       -> what the player to act may legally do, with min/max
 *   applyAction(state, action)-> the next HandState
 *
 * A hand ends either by everyone-but-one folding (`endReason: 'fold'`) or by a
 * showdown (`endReason: 'showdown'`); in both cases `street` becomes `'complete'`,
 * `toAct` becomes `null`, and `payouts` records the chips returned to each seat.
 *
 * All amounts are integer chip counts.
 */

import { evaluate7, compareHands, type HandValue } from './evaluator.js'
import type { Card } from './card.js'

export type PlayerStatus =
  /** In the hand with chips behind — can still act. */
  | 'active'
  /** Out of the hand. */
  | 'folded'
  /** In the hand but out of chips — cannot act; contests the pots they paid into. */
  | 'allin'

/** The streets of a hand; `'complete'` is the terminal phase. */
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete'

/** How a completed hand ended. */
export type EndReason = 'fold' | 'showdown'

/**
 * One player's state within a hand. Treat as immutable — see {@link HandState}.
 */
export interface PlayerState {
  seat: number
  /** Chips behind (not yet wagered). */
  stack: number
  /** Chips wagered on the *current* street. */
  committed: number
  /** Chips wagered across the *whole* hand — the basis for side-pot accounting. */
  totalCommitted: number
  holeCards: readonly [Card, Card]
  status: PlayerStatus
  /**
   * The value of `currentBet` at the moment this player last acted on the current
   * street, or `-1` if they have not acted yet this street. Drives both round-closing
   * (have they responded to the latest bet?) and the raise-reopen rule.
   */
  lastActionBet: number
}

/** A (side) pot: an amount and the seats eligible to win it. */
export interface Pot {
  amount: number
  eligibleSeats: number[]
}

/**
 * An immutable snapshot of a hand in progress (or complete).
 *
 * Never mutate a `HandState` you are handed — {@link applyAction} deep-clones and
 * returns a fresh snapshot, which keeps states cheap to compare, replay, and render.
 */
export interface HandState {
  players: PlayerState[]
  buttonIndex: number
  smallBlind: number
  bigBlind: number
  street: Street
  /** The community cards revealed so far (0, 3, 4, or 5). */
  board: Card[]
  /** Undealt cards remaining in the deck, in order. */
  deck: Card[]
  /** Index into `players` of the player to act, or `null` when no action is pending. */
  toAct: number | null
  /** The highest `committed` on the current street — the amount to match. */
  currentBet: number
  /** The minimum legal raise *increment* over `currentBet`. */
  minRaise: number
  /**
   * The `currentBet` level set by the last *full* bet or raise. A player whose
   * `lastActionBet` is already at or above this level may only call a subsequent
   * short all-in, not re-raise it (the "incomplete raise does not reopen" rule).
   */
  lastRaiseLevel: number
  /** Contested pots, populated when the hand completes. */
  pots: Pot[]
  /** Seat -> chips returned at the end (winnings + any uncalled bet). */
  payouts: Record<number, number>
  /** Seat -> evaluated hand, populated for non-folded players at a showdown. */
  showdownHands: Record<number, HandValue>
  endReason: EndReason | null
}

/**
 * A player action. For `bet` and `raise`, `amount` is the *total* a player commits on
 * the current street (i.e. "bet/raise **to** this amount"), matching the min/max that
 * {@link legalActions} reports.
 */
export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }

/** What the player to act may legally do right now. */
export interface LegalActions {
  fold: boolean
  check: boolean
  /** `amount` is the additional chips required to call (capped at stack = all-in). */
  call: { amount: number } | null
  /** `min`/`max` are "bet to" totals for the current street. */
  bet: { min: number; max: number } | null
  /** `min`/`max` are "raise to" totals for the current street. */
  raise: { min: number; max: number } | null
}

export interface HandConfig {
  /** Starting stack per seat; length is the number of players (>= 2). */
  stacks: number[]
  /** Seat index of the dealer button. */
  buttonIndex: number
  smallBlind: number
  bigBlind: number
  /** A pre-shuffled deck to deal from (the engine is deterministic — it never shuffles). */
  deck: readonly Card[]
}

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'] as const

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/**
 * Deal a new hand: seat players, post blinds, deal hole cards, and hand the action
 * to the first player to act. Returns the initial immutable {@link HandState}.
 */
export function createHand(config: HandConfig): HandState {
  const { stacks, buttonIndex, smallBlind, bigBlind } = config
  const n = stacks.length
  assert(n >= 2, `need at least 2 players, got ${n}`)
  assert(buttonIndex >= 0 && buttonIndex < n, `button index ${buttonIndex} out of range`)
  assert(smallBlind > 0 && bigBlind > 0, 'blinds must be positive')
  assert(bigBlind >= smallBlind, 'big blind must be >= small blind')
  assert(
    stacks.every((s) => s > 0),
    'all starting stacks must be positive',
  )
  const needed = 2 * n + 5
  assert(config.deck.length >= needed, `deck needs >= ${needed} cards, got ${config.deck.length}`)

  // Heads-up: the button is the small blind. Otherwise SB/BB sit to the button's left.
  const sbIndex = n === 2 ? buttonIndex : (buttonIndex + 1) % n
  const bbIndex = n === 2 ? (buttonIndex + 1) % n : (buttonIndex + 2) % n

  const deck = [...config.deck]
  // Deal hole cards one at a time, two rounds, starting at the small blind.
  const holes: Card[][] = stacks.map(() => [])
  let d = 0
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) {
      holes[(sbIndex + k) % n]!.push(deck[d++]!)
    }
  }

  const players: PlayerState[] = stacks.map((stack, seat) => ({
    seat,
    stack,
    committed: 0,
    totalCommitted: 0,
    holeCards: [holes[seat]![0]!, holes[seat]![1]!],
    status: 'active',
    lastActionBet: -1,
  }))

  const state: HandState = {
    players,
    buttonIndex,
    smallBlind,
    bigBlind,
    street: 'preflop',
    board: [],
    deck: deck.slice(d),
    toAct: bbIndex, // anchor; settle() computes the real first actor
    currentBet: bigBlind,
    minRaise: bigBlind,
    lastRaiseLevel: bigBlind,
    pots: [],
    payouts: {},
    showdownHands: {},
    endReason: null,
  }

  // Post blinds (an undersized stack posts what it has and is all-in for less).
  postBlind(players[sbIndex]!, smallBlind)
  postBlind(players[bbIndex]!, bigBlind)

  settle(state)
  return state
}

function postBlind(p: PlayerState, blind: number): void {
  const amount = Math.min(blind, p.stack)
  p.stack -= amount
  p.committed += amount
  p.totalCommitted += amount
  if (p.stack === 0) p.status = 'allin'
}

/** What the player to act may legally do, with valid min/max amounts. */
export function legalActions(state: HandState): LegalActions {
  const none: LegalActions = { fold: false, check: false, call: null, bet: null, raise: null }
  if (state.toAct === null) return none
  const p = state.players[state.toAct]!
  if (p.status !== 'active') return none

  const toCall = state.currentBet - p.committed
  const result: LegalActions = { fold: true, check: false, call: null, bet: null, raise: null }

  if (toCall <= 0) {
    result.check = true
  } else {
    result.call = { amount: Math.min(toCall, p.stack) }
  }

  if (state.currentBet === 0) {
    // Opening the betting (no outstanding bet — only happens postflop, committed === 0).
    result.bet = { min: Math.min(state.bigBlind, p.stack), max: p.stack }
  } else if (p.stack > toCall) {
    // There is a bet to raise, and the player has chips beyond a call. A player who
    // has already acted at or above the last *full* raise level cannot re-raise a
    // subsequent short all-in — the action is not reopened for them.
    const reopened = p.lastActionBet < state.lastRaiseLevel
    if (reopened) {
      const maxTo = p.committed + p.stack // all-in
      const fullMin = state.currentBet + state.minRaise
      // If they cannot afford a full min-raise, going all-in for less is still legal.
      result.raise = { min: Math.min(fullMin, maxTo), max: maxTo }
    }
  }

  return result
}

/**
 * Apply an action by the player to act, returning the next state. The input state is
 * not mutated. Throws if the action is illegal or no action is pending.
 */
export function applyAction(state: HandState, action: Action): HandState {
  assert(state.toAct !== null, 'hand is not awaiting an action')
  const legal = legalActions(state)
  const next = clone(state)
  const p = next.players[next.toAct!]!

  switch (action.type) {
    case 'fold':
      assert(legal.fold, 'fold is not legal here')
      p.status = 'folded'
      p.lastActionBet = next.currentBet
      break

    case 'check':
      assert(legal.check, 'check is not legal here')
      p.lastActionBet = next.currentBet
      break

    case 'call': {
      assert(legal.call, 'call is not legal here')
      commit(p, legal.call.amount)
      p.lastActionBet = next.currentBet
      if (p.stack === 0) p.status = 'allin'
      break
    }

    case 'bet': {
      assert(legal.bet, 'bet is not legal here')
      assertAmount(action.amount, legal.bet, 'bet')
      commit(p, action.amount - p.committed)
      next.currentBet = action.amount
      next.minRaise = action.amount // a fresh bet sets the min raise to its own size
      next.lastRaiseLevel = action.amount
      p.lastActionBet = action.amount
      if (p.stack === 0) p.status = 'allin'
      break
    }

    case 'raise': {
      assert(legal.raise, 'raise is not legal here')
      assertAmount(action.amount, legal.raise, 'raise')
      const increment = action.amount - next.currentBet
      commit(p, action.amount - p.committed)
      // Only a *full* raise resets the min-raise size and reopens the action.
      if (increment >= next.minRaise) {
        next.minRaise = increment
        next.lastRaiseLevel = action.amount
      }
      next.currentBet = action.amount
      p.lastActionBet = action.amount
      if (p.stack === 0) p.status = 'allin'
      break
    }
  }

  settle(next)
  return next
}

function assertAmount(amount: number, range: { min: number; max: number }, label: string): void {
  assert(Number.isInteger(amount), `${label} amount must be an integer, got ${amount}`)
  assert(
    amount >= range.min && amount <= range.max,
    `${label} amount ${amount} outside legal range [${range.min}, ${range.max}]`,
  )
}

/** Move `amount` chips from a player's stack into the pot (this street and the hand). */
function commit(p: PlayerState, amount: number): void {
  p.stack -= amount
  p.committed += amount
  p.totalCommitted += amount
}

/** True if `player` still owes an action on the current street. */
function needsToAct(state: HandState, player: PlayerState): boolean {
  if (player.status !== 'active') return false
  if (player.committed < state.currentBet) return true // must call, raise, or fold
  // Already matched. Still owes an action only if they haven't acted yet this street
  // *and* there is another active player to bet against.
  const activeCount = state.players.filter((p) => p.status === 'active').length
  return player.lastActionBet === -1 && activeCount >= 2
}

/** True if the current betting round is complete. */
function bettingClosed(state: HandState): boolean {
  const active = state.players.filter((p) => p.status === 'active')
  if (active.length === 0) return true // everyone left is all-in
  return active.every((p) => !needsToAct(state, p))
}

/** First seat at/after `start` (clockwise) that still owes an action, or `null`. */
function findActor(state: HandState, start: number): number | null {
  const n = state.players.length
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    if (needsToAct(state, state.players[i]!)) return i
  }
  return null
}

/**
 * Advance the hand after blinds or an action: pass the turn, move to the next street,
 * run the board out when no further betting is possible, or settle the showdown.
 */
function settle(state: HandState): void {
  const n = state.players.length
  for (;;) {
    const live = state.players.filter((p) => p.status !== 'folded')
    if (live.length <= 1) {
      finalize(state, 'fold')
      return
    }
    if (bettingClosed(state)) {
      if (state.street === 'river') {
        finalize(state, 'showdown')
        return
      }
      advanceStreet(state)
      // Re-anchor so the next iteration looks for the first actor left of the button.
      state.toAct = state.buttonIndex
      continue
    }
    // Betting is still open: hand the turn to the next player who owes an action.
    state.toAct = findActor(state, (state.toAct! + 1) % n)
    return
  }
}

/** Move to the next street: reset the betting, then deal the board cards. */
function advanceStreet(state: HandState): void {
  for (const p of state.players) {
    p.committed = 0
    p.lastActionBet = -1
  }
  state.currentBet = 0
  state.minRaise = state.bigBlind
  state.lastRaiseLevel = 0
  const next = STREET_ORDER[STREET_ORDER.indexOf(state.street as never) + 1]!
  const count = next === 'flop' ? 3 : 1
  for (let i = 0; i < count; i++) state.board.push(state.deck.shift()!)
  state.street = next
}

/** Resolve the hand: build pots, return uncalled bets, award winners. */
function finalize(state: HandState, reason: EndReason): void {
  state.endReason = reason
  state.street = 'complete'
  state.toAct = null

  // Evaluate every contender's hand once, up front (board is complete at a showdown).
  if (reason === 'showdown') {
    for (const p of state.players) {
      if (p.status !== 'folded') {
        state.showdownHands[p.seat] = evaluate7([...p.holeCards, ...state.board])
      }
    }
  }

  const { pots, returns } = collectPots(state.players)

  // Return uncalled bets (a slice of the pot only one player ever contributed to).
  for (const [seat, amount] of Object.entries(returns)) {
    const s = Number(seat)
    state.players[s]!.stack += amount
    state.payouts[s] = (state.payouts[s] ?? 0) + amount
  }

  for (const pot of pots) {
    const winners = decideWinners(state, pot.eligibleSeats)
    distribute(state, pot.amount, winners)
  }

  state.pots = pots
}

/**
 * Split each player's lifetime contribution into layered pots. A layer contributed to
 * by only one player is an *uncalled bet* and is returned to them; otherwise it forms
 * a pot contested by the non-folded contributors. Dead money (a layer where every
 * contributor folded) is folded into the lowest live pot.
 */
function collectPots(players: PlayerState[]): {
  pots: Pot[]
  returns: Record<number, number>
} {
  const returns: Record<number, number> = {}
  const levels = [...new Set(players.map((p) => p.totalCommitted))]
    .filter((a) => a > 0)
    .sort((a, b) => a - b)

  const raw: Pot[] = []
  let prev = 0
  for (const level of levels) {
    const slice = level - prev
    const contributors = players.filter((p) => p.totalCommitted >= level)
    if (slice > 0) {
      if (contributors.length === 1) {
        const seat = contributors[0]!.seat
        returns[seat] = (returns[seat] ?? 0) + slice
      } else {
        const eligible = contributors.filter((p) => p.status !== 'folded').map((p) => p.seat)
        raw.push({ amount: slice * contributors.length, eligibleSeats: eligible })
      }
    }
    prev = level
  }

  // Pull out dead pots (no eligible winner) and merge them into the first live pot.
  let dead = 0
  const live: Pot[] = []
  for (const pot of raw) {
    if (pot.eligibleSeats.length === 0) dead += pot.amount
    else live.push(pot)
  }
  if (live.length > 0) live[0]!.amount += dead

  // Merge adjacent pots with identical eligibility into a single pot.
  const merged: Pot[] = []
  for (const pot of live) {
    const last = merged[merged.length - 1]
    if (last && sameSeats(last.eligibleSeats, pot.eligibleSeats)) last.amount += pot.amount
    else merged.push({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] })
  }
  return { pots: merged, returns }
}

function sameSeats(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((s) => set.has(s))
}

/** The eligible seat(s) that win a pot: by best hand, or directly if uncontested. */
function decideWinners(state: HandState, eligibleSeats: number[]): number[] {
  if (eligibleSeats.length === 1) return eligibleSeats
  let best: HandValue | null = null
  let winners: number[] = []
  for (const seat of eligibleSeats) {
    const hv = state.showdownHands[seat]!
    if (best === null || compareHands(hv, best) > 0) {
      best = hv
      winners = [seat]
    } else if (compareHands(hv, best) === 0) {
      winners.push(seat)
    }
  }
  return winners
}

/** Pay a pot to its winner(s); odd chips go to seats nearest left of the button. */
function distribute(state: HandState, amount: number, winners: number[]): void {
  const n = state.players.length
  const ordered = [...winners].sort(
    (a, b) => ((a - state.buttonIndex - 1 + n) % n) - ((b - state.buttonIndex - 1 + n) % n),
  )
  const share = Math.floor(amount / winners.length)
  let remainder = amount - share * winners.length
  for (const seat of ordered) {
    let won = share
    if (remainder > 0) {
      won++
      remainder--
    }
    state.players[seat]!.stack += won
    state.payouts[seat] = (state.payouts[seat] ?? 0) + won
  }
}

/**
 * Deep copy a state so transitions never mutate their input. Hand-rolled (rather than
 * `structuredClone`) to stay dependency-free and to copy only what we own — cards are
 * plain numbers and `HandValue`s are immutable, so they can be shared by reference.
 */
function clone(state: HandState): HandState {
  return {
    players: state.players.map((p) => ({ ...p, holeCards: [p.holeCards[0], p.holeCards[1]] })),
    buttonIndex: state.buttonIndex,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    street: state.street,
    board: [...state.board],
    deck: [...state.deck],
    toAct: state.toAct,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    lastRaiseLevel: state.lastRaiseLevel,
    pots: state.pots.map((pot) => ({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] })),
    payouts: { ...state.payouts },
    showdownHands: { ...state.showdownHands },
    endReason: state.endReason,
  }
}

/** Total chips currently in the pot (across all streets). */
export function potTotal(state: HandState): number {
  return state.players.reduce((sum, p) => sum + p.totalCommitted, 0)
}

/** The player to act, or `null` if the hand is complete / awaiting nothing. */
export function currentActor(state: HandState): PlayerState | null {
  return state.toAct === null ? null : state.players[state.toAct]!
}

/** Whether the hand has finished. */
export function isComplete(state: HandState): boolean {
  return state.street === 'complete'
}
