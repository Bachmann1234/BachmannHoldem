/**
 * The MVU `reducer` — the pure update function at the heart of the Bubble Tea loop (ticket
 * 0025): `model + dispatch(msg) -> model`. It is the *only* place the {@link Model} changes,
 * which keeps the Ink components purely presentational and lets the whole update logic be
 * unit-tested without rendering anything (see `reducer.test.ts`).
 *
 * The action-input ticket (0027) adds the first real message: `'apply-action'`. Its case is a
 * thin, pure wrapper over the engine's `applyAction` — the only mutation of the hand — so all the
 * non-pure concerns (parsing keystrokes, the bot's PRNG) stay in the app shell and never leak into
 * the reducer.
 *
 * The coach-panel ticket (0028) extends that same case to *also* grade the hero's decision. This
 * belongs in the reducer because `coachDecision` / `classifyStartingHand` are **pure, seeded,
 * deterministic** functions (no I/O, no `Math.random`) — so grading here keeps the coach panel a
 * pure render of stored model state, unit-testable without Ink. The ordering is load-bearing: the
 * coach's `DecisionContext` must be captured from the **pre-`applyAction`** hand, while it is still
 * the hero's turn (`decisionContext` throws once the turn has moved on), so we capture *then* apply.
 * Coaching is strictly advisory — every coach call is wrapped so a throw degrades to a stored notice
 * rather than crashing the hand. The reducer wraps engine/coach calls only; it owns no poker rules.
 */

import { applyAction, type Action } from '@holdem/engine'
import { decisionContext } from '@holdem/bots'
import { coachDecision, classifyStartingHand } from '@holdem/coach'
import type { CoachResult, Model } from './model.js'

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
    case 'apply-action': {
      // Grade the hero's decision BEFORE mutating the hand. If it was the hero's turn on the
      // pre-apply hand, this is a hero decision: capture the coach's view of the spot now (while
      // `decisionContext` still accepts it — it throws once the turn moves on), then apply. A bot
      // action leaves the existing grade untouched, so the panel keeps showing the hero's last
      // decision as play proceeds around the table.
      const coach = model.hand.toAct === model.heroSeat ? coachHero(model, msg.action) : model.coach
      return { ...model, hand: applyAction(model.hand, msg.action), coach }
    }
  }
}

/**
 * Grade the hero's decision via `@holdem/coach`, returning the {@link CoachResult} to store —
 * mirrors `apps/cli/src/play.ts`'s `coachHero` (capture-before-apply ordering + advisory
 * try/catch). The caller has guaranteed it is the hero's turn on `model.hand`, so the context
 * captures cleanly; the verdict math lives entirely in the coach (we do none here). Preflop we
 * also hand back the starting-hand chart classification. Any throw (a malformed spot the verdict
 * math rejects) degrades to an `'error'` notice — coaching never crashes the hand.
 */
function coachHero(model: Model, action: Action): CoachResult {
  try {
    const ctx = decisionContext(model.hand, model.heroSeat)
    const verdict = coachDecision(ctx, action)
    const preflop = ctx.street === 'preflop' ? classifyStartingHand(ctx.holeCards) : undefined
    return { kind: 'verdict', verdict, preflop }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { kind: 'error', message: `Coaching unavailable for this spot — ${reason}` }
  }
}

/** The `dispatch` callback the view calls to send a {@link Msg} into the loop. */
export type Dispatch = (msg: Msg) => void
