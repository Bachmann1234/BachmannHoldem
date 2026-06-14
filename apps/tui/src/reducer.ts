/**
 * The MVU `reducer` — the pure update function at the heart of the Bubble Tea loop (ticket
 * 0025): `model + dispatch(msg) -> model`. It is the *only* place the {@link Model} changes,
 * which keeps the Ink components purely presentational and lets the whole update logic be
 * unit-tested without rendering anything (see `reducer.test.ts`).
 *
 * The action-input ticket (0027) adds the first real message: `'apply-action'`. Its case is a
 * thin, pure wrapper over the engine's `applyAction` — the only mutation of the hand — so all the
 * non-pure concerns (parsing keystrokes, the bot's PRNG) stay in the app shell and never leak into
 * the reducer. Later tickets (coach panel, multi-hand session) extend the {@link Msg} union and add
 * cases here. The reducer wraps engine calls only; it owns no poker rules of its own.
 */

import { applyAction, type Action } from '@holdem/engine'
import type { Model } from './model.js'

/**
 * The messages the reducer understands. A discriminated union on `type`, dispatched by the
 * view; the reducer pattern-matches and returns the next model.
 *
 * - `'noop'` — identity (proves the loop; a place later tickets grow from).
 * - `'apply-action'` — apply an already-validated engine {@link Action} (the hero's keystroke,
 *   parsed and legality-checked by `src/input.ts`, or a bot's `decide` result) to the hand. The
 *   shell guarantees the action is legal; `applyAction` throws on an illegal move.
 */
export type Msg =
  | { readonly type: 'noop' }
  | { readonly type: 'apply-action'; readonly action: Action }

/**
 * Advance the model in response to a message. Pure and synchronous: it never mutates its inputs
 * (`applyAction` returns a fresh immutable {@link HandState}), holds no PRNG or I/O, and returns the
 * next model. The `switch` is exhaustive so adding a `Msg` variant without handling it is a compile
 * error.
 */
export function reducer(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'noop':
      return model
    case 'apply-action':
      return { ...model, hand: applyAction(model.hand, msg.action) }
  }
}

/** The `dispatch` callback the view calls to send a {@link Msg} into the loop. */
export type Dispatch = (msg: Msg) => void
