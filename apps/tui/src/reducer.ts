/**
 * The MVU `reducer` — the pure update function at the heart of the Bubble Tea loop (ticket
 * 0025): `model + dispatch(msg) -> model`. It is the *only* place the {@link Model} changes,
 * which keeps the Ink components purely presentational and lets the whole update logic be
 * unit-tested without rendering anything (see `reducer.test.ts`).
 *
 * For this read-only scaffold the message set is intentionally minimal — there is no input yet
 * — but the shape is established so later tickets (action input, coach panel, multi-hand
 * session) extend the {@link Msg} union and add cases here rather than leaking logic into
 * components. The reducer wraps engine calls only; it owns no poker rules of its own.
 */

import type { Model } from './model.js'

/**
 * The messages the reducer understands. A discriminated union on `type`, dispatched by the
 * view; the reducer pattern-matches and returns the next model.
 *
 * Today the only message is `'noop'` (identity — proves the loop and gives later tickets a
 * place to grow from). Future tickets add `'hero-action'`, `'advance'`, `'new-hand'`, etc.
 */
export type Msg = { readonly type: 'noop' }

/**
 * Advance the model in response to a message. Pure: it never mutates its inputs and returns the
 * next model (here, unchanged — the scaffold renders one static frame). The `switch` is
 * exhaustive so adding a `Msg` variant without handling it is a compile error.
 */
export function reducer(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'noop':
      return model
  }
}

/** The `dispatch` callback the view calls to send a {@link Msg} into the loop. */
export type Dispatch = (msg: Msg) => void
