/**
 * The imperfect-information view a bot decides from (ticket 0017).
 *
 * Poker is a game of incomplete information: a player reasons from *what they can see* —
 * their own two cards, the board, the betting, the stacks — and **never** from the
 * opponent's hole cards. The engine's {@link HandState} is the referee's omniscient
 * truth (it holds every seat's cards and the undealt deck); handing that straight to a
 * bot would let a bot peek. {@link DecisionContext} is the deliberately narrowed lens we
 * pass instead: it derives everything a bot is *allowed* to know from a `HandState` plus
 * the seat that is about to act, and it structurally cannot expose another seat's cards.
 *
 * This is the stable seam the whole heuristic-opponents epic ([[0006-heuristic-opponents]])
 * builds on. The perception layer ([[0018-bot-hand-reading]]), the personality matrix
 * ([[0019-bot-personality]]), and the real heuristic policy ([[0020-heuristic-opponent]])
 * all consume a `DecisionContext` and nothing wider, so the bot internals behind the
 * {@link Opponent} interface can evolve freely without the caller (CLI now, PWA table
 * later) changing.
 *
 * Everything here is pure: no I/O, no randomness, no mutation of the input state.
 */

import {
  legalActions,
  type Card,
  type HandState,
  type LegalActions,
  type PlayerStatus,
  type Street,
} from '@holdem/engine'

/**
 * A redacted view of one opponent seat — everything visible across the table, but
 * **not** their hole cards. This is the public, peek-proof shape a bot may reason about
 * other players from (stack sizes, who has folded, who is all-in, what they have wagered).
 */
export interface OpponentView {
  readonly seat: number
  /** Chips behind (not yet wagered). */
  readonly stack: number
  /** Chips this seat has wagered on the *current* street. */
  readonly committed: number
  /** Chips this seat has wagered across the *whole* hand. */
  readonly totalCommitted: number
  readonly status: PlayerStatus
  /** Whether this seat is the dealer button. */
  readonly isButton: boolean
}

/**
 * Everything the acting bot is allowed to see when it decides, and nothing more.
 *
 * Built by {@link decisionContext} from `(HandState, seat)`. The acting seat's own
 * `holeCards` are present; the `opponents` array carries only redacted {@link OpponentView}s
 * (no `holeCards` field exists on it to leak), so a bot literally cannot read another
 * player's cards through this type.
 *
 * All chip amounts are integer counts in the engine's unit.
 */
export interface DecisionContext {
  /** The seat this context is built for — the bot about to act. */
  readonly seat: number
  /** The acting bot's own two hole cards (the one hand it is entitled to see). */
  readonly holeCards: readonly [Card, Card]
  /** The community cards revealed so far (0, 3, 4, or 5), in board order. */
  readonly board: readonly Card[]
  /** The current street; never `'complete'` here, since a complete hand awaits no action. */
  readonly street: Street
  /** What the acting bot may legally do right now, with valid amounts (see {@link legalActions}). */
  readonly legalActions: LegalActions
  /**
   * The total chips in the pot across all streets (every seat's lifetime contribution).
   * This is the pot *including* chips already committed this street by all players.
   */
  readonly pot: number
  /** The highest `committed` on the current street — the amount to match. */
  readonly currentBet: number
  /**
   * The additional chips the acting bot must put in to call, capped at its stack (so a
   * short stack's `toCall` is its all-in amount). `0` when checking is free. This is the
   * same figure as `legalActions.call?.amount`, surfaced as a plain number for convenience.
   */
  readonly toCall: number
  /** The acting bot's chips behind (not yet wagered). */
  readonly stack: number
  /** Chips the acting bot has already wagered on the current street. */
  readonly committed: number
  readonly smallBlind: number
  readonly bigBlind: number
  /** Seat index of the dealer button. */
  readonly buttonIndex: number
  /** Whether the acting bot is on the button. */
  readonly isButton: boolean
  /** Total seats dealt into the hand. */
  readonly numPlayers: number
  /** How many seats are still `'active'` (in the hand with chips, able to act). */
  readonly numActive: number
  /** The other seats, redacted — visible info only, never their hole cards. */
  readonly opponents: readonly OpponentView[]
}

/**
 * Build the {@link DecisionContext} for `seat` from an engine {@link HandState}.
 *
 * Reads only fields the seat is entitled to: it copies the acting seat's own hole cards
 * but maps every other seat to a redacted {@link OpponentView} that omits cards entirely.
 * `legalActions` is computed from the state as-is, so it reflects exactly what this seat
 * may do this turn.
 *
 * Throws if `seat` is out of range or is not the seat the engine currently expects to act
 * (`state.toAct`) — a bot is only ever asked to decide for the seat on turn, and building
 * a context for an off-turn seat would yield meaningless `legalActions`.
 */
export function decisionContext(state: HandState, seat: number): DecisionContext {
  if (seat < 0 || seat >= state.players.length) {
    throw new RangeError(`seat ${seat} out of range (0..${state.players.length - 1})`)
  }
  if (state.toAct !== seat) {
    throw new Error(`seat ${seat} is not to act (engine expects seat ${state.toAct})`)
  }

  const me = state.players[seat]!
  const legal = legalActions(state)
  const pot = state.players.reduce((sum, p) => sum + p.totalCommitted, 0)
  const numActive = state.players.filter((p) => p.status === 'active').length

  const opponents: OpponentView[] = state.players
    .filter((p) => p.seat !== seat)
    .map((p) => ({
      seat: p.seat,
      stack: p.stack,
      committed: p.committed,
      totalCommitted: p.totalCommitted,
      status: p.status,
      isButton: p.seat === state.buttonIndex,
    }))

  return {
    seat,
    holeCards: [me.holeCards[0], me.holeCards[1]],
    board: [...state.board],
    street: state.street,
    legalActions: legal,
    pot,
    currentBet: state.currentBet,
    toCall: legal.call?.amount ?? 0,
    stack: me.stack,
    committed: me.committed,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    buttonIndex: state.buttonIndex,
    isButton: seat === state.buttonIndex,
    numPlayers: state.players.length,
    numActive,
    opponents,
  }
}
