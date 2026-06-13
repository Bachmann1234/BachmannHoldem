/**
 * The bot-vs-engine driver (ticket 0017).
 *
 * The glue that composes the three pieces — the imperfect-information view
 * ({@link decisionContext}), the {@link Opponent} interface, and the engine's
 * {@link applyAction} — into a single step: figure out who is on turn, build that seat's
 * redacted view, ask the seat's bot to decide, and apply the result, returning the next
 * {@link HandState}.
 *
 * It is deliberately tiny and pure: no I/O, no scheduling, no error recovery beyond
 * delegating to the engine's legality checks. A caller loops {@link applyOpponentAction}
 * until {@link isComplete} to play a whole hand (see {@link playBotHand}).
 */

import { applyAction, isComplete, type HandState } from '@holdem/engine'

import { decisionContext } from './context.js'
import type { Opponent } from './opponent.js'

/**
 * How the driver finds the bot for the seat on turn: either a `Record` keyed by seat
 * index or a function from seat to {@link Opponent}. Both forms are accepted so callers
 * can pass a plain literal (`{ 0: rock, 1: callingStation }`) or compute the bot lazily.
 */
export type OpponentLookup = Readonly<Record<number, Opponent>> | ((seat: number) => Opponent)

function resolve(lookup: OpponentLookup, seat: number): Opponent {
  const bot = typeof lookup === 'function' ? lookup(seat) : lookup[seat]
  if (!bot) throw new Error(`no opponent registered for seat ${seat}`)
  return bot
}

/**
 * Advance the hand by one bot action: build the {@link DecisionContext} for the seat the
 * engine expects (`state.toAct`), ask that seat's {@link Opponent} to decide, and apply
 * the chosen {@link Action}, returning the next {@link HandState}.
 *
 * `await`s `Promise.resolve(decide(...))` so it transparently supports both synchronous
 * bots and the async seam (a `Promise<Action>` from a future worker-backed bot) — hence
 * the function is itself `async`. Throws if the hand awaits no action (it is complete or
 * otherwise has no seat on turn) or if no bot is registered for the seat on turn; an
 * illegal action surfaces as the engine's own throw from {@link applyAction}.
 */
export async function applyOpponentAction(
  state: HandState,
  lookup: OpponentLookup,
): Promise<HandState> {
  if (state.toAct === null) throw new Error('hand is not awaiting an action')
  const seat = state.toAct
  const bot = resolve(lookup, seat)
  const ctx = decisionContext(state, seat)
  const action = await Promise.resolve(bot.decide(ctx))
  return applyAction(state, action)
}

/**
 * Play a hand to completion, letting the registered {@link Opponent}s act for every seat,
 * and return the final {@link HandState} (with `street === 'complete'` and `payouts`
 * filled in).
 *
 * Steps with {@link applyOpponentAction} until {@link isComplete}. A `maxActions` guard
 * (default a generous `1000`) trips a throw rather than spinning forever should a buggy
 * bot/engine fail to terminate — in normal play a heads-up hand resolves in a handful of
 * actions. Pure and deterministic given deterministic bots and the state's fixed deck.
 */
export async function playBotHand(
  initial: HandState,
  lookup: OpponentLookup,
  maxActions = 1000,
): Promise<HandState> {
  let state = initial
  let actions = 0
  while (!isComplete(state)) {
    if (actions++ >= maxActions) {
      throw new Error(`hand did not complete within ${maxActions} actions`)
    }
    state = await applyOpponentAction(state, lookup)
  }
  return state
}
