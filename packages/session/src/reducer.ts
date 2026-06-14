/**
 * The MVU `reducer` — the pure update function at the heart of the Bubble Tea loop (tickets
 * 0025 / 0029): `model + dispatch(msg) -> model`. It is the *only* place the {@link Model} changes,
 * which keeps the Ink components purely presentational and lets the whole update logic — now the
 * full session + setup state machine — be unit-tested without rendering anything (`reducer.test.ts`).
 *
 * **Purity.** The reducer holds no `Math.random`, no I/O, no bot calls, no PRNG. The two non-pure
 * concerns of a session live in the shell (Root), the way a terminal play loop keeps them out of
 * the pure core:
 * the per-hand **deck shuffle** and the **bots' decisions**. The shell shuffles a fresh deck and
 * dispatches it in via `start-hand`; the reducer builds the compacted stacks + button and calls the
 * deterministic `createHand` (see {@link dealHand}). The coach grading (`coachDecision` /
 * `classifyStartingHand`) is pure, seeded, and deterministic, so it may — and does — stay here.
 *
 * **The session state machine.** The reducer owns every phase transition (`setup` → `playing` →
 * `hand-over` → `playing` … → `game-over`), the setup selection edits, the per-hand seat
 * compaction + button rotation + bust removal, and writing post-hand stacks back to stable players.
 * The shell only supplies decks and bot actions and renders the phase.
 */

import { applyAction, isComplete, type Action, type Card } from '@holdem/engine'
import { decisionContext } from '@holdem/bots'
import { coachDecision, classifyStartingHand } from '@holdem/coach'
import {
  applyHandResult,
  buildSessionPlayers,
  clampSeats,
  dealHand,
  defaultOpponents,
  rotateButton,
  sessionOver,
  BOT_KINDS,
  type BotKind,
  type CoachResult,
  type Model,
} from './model.js'

/**
 * The messages the reducer understands. A discriminated union on `type`, dispatched by the view;
 * the reducer pattern-matches and returns the next model.
 *
 * Setup-screen edits (active only in `phase === 'setup'`):
 * - `'set-seats'` — choose the table size; clamped and the opponent presets re-fitted.
 * - `'cycle-opponent'` — cycle one opponent seat through the four presets.
 *
 * Session messages:
 * - `'start-hand'` — the shell hands in a freshly shuffled `deck`; the reducer deals the next hand
 *   (the first hand from setup, or a play-again hand with the button rotated and busted players
 *   dropped) and enters `'playing'`. The RNG that produced `deck` stays in the shell.
 * - `'apply-action'` — apply an already-validated engine {@link Action} (the hero's keystroke or a
 *   bot's `decide` result) to the live hand, grading the hero's decision, and — if the hand
 *   completes — settling stacks and moving to `'hand-over'` or `'game-over'`.
 * - `'quit'` — the hero quits; jump straight to `'game-over'` with whatever stacks stand.
 * - `'noop'` — identity (proves the loop).
 */
export type Msg =
  | { readonly type: 'noop' }
  | { readonly type: 'set-seats'; readonly seats: number }
  | { readonly type: 'cycle-opponent'; readonly opponentIndex: number; readonly direction?: 1 | -1 }
  | { readonly type: 'start-hand'; readonly deck: readonly Card[] }
  | { readonly type: 'apply-action'; readonly action: Action }
  | { readonly type: 'quit' }

/**
 * Advance the model in response to a message. Pure and synchronous: it never mutates its inputs
 * (`applyAction` and the seating helpers return fresh values), holds no PRNG or I/O, and returns the
 * next model. The `switch` is exhaustive so adding a `Msg` variant without handling it is a compile
 * error.
 */
export function reducer(model: Model, msg: Msg): Model {
  switch (msg.type) {
    case 'noop':
      return model

    case 'set-seats':
      return setSeats(model, msg.seats)

    case 'cycle-opponent':
      return cycleOpponent(model, msg.opponentIndex, msg.direction ?? 1)

    case 'start-hand':
      return startHand(model, msg.deck)

    case 'apply-action':
      return applyHeroOrBotAction(model, msg.action)

    case 'quit':
      return { ...model, phase: 'game-over' }
  }
}

/**
 * Setup edit: choose the table size. The seat count is clamped to the legal range and the opponent
 * preset list is re-fitted to `seats - 1` — preserving the presets already chosen and topping up
 * (or trimming) with sensible {@link defaultOpponents} as the size grows or shrinks. No-op outside
 * `'setup'`.
 */
function setSeats(model: Model, seats: number): Model {
  if (model.phase !== 'setup') return model
  const next = clampSeats(seats)
  const want = next - 1
  const fill = defaultOpponents(next)
  const opponents = Array.from({ length: want }, (_, i) => model.setup.opponents[i] ?? fill[i]!)
  return { ...model, setup: { seats: next, opponents } }
}

/**
 * Setup edit: cycle one opponent seat to the next (or previous) preset, wrapping through the four
 * {@link BOT_KINDS}. No-op outside `'setup'` or for an out-of-range index.
 */
function cycleOpponent(model: Model, opponentIndex: number, direction: 1 | -1): Model {
  if (model.phase !== 'setup') return model
  if (opponentIndex < 0 || opponentIndex >= model.setup.opponents.length) return model
  const current = model.setup.opponents[opponentIndex]!
  const at = BOT_KINDS.indexOf(current)
  const nextKind: BotKind = BOT_KINDS[(at + direction + BOT_KINDS.length) % BOT_KINDS.length]!
  const opponents = model.setup.opponents.map((k, i) => (i === opponentIndex ? nextKind : k))
  return { ...model, setup: { ...model.setup, opponents } }
}

/**
 * Deal a hand from a shell-supplied (already-shuffled) `deck` and enter `'playing'`. Two entries:
 *
 * - From `'setup'`: freeze the selection into the stable {@link SessionPlayer} list (hero id 0 plus
 *   one bot per opponent), seat the button on the hero (a deterministic, documented start), and
 *   deal the first hand.
 * - From `'hand-over'` (play-again): rotate the button to the next LIVE player and deal the next
 *   hand over the survivors — busted players are simply never seated again (the compaction skips
 *   any 0-stack player).
 *
 * Either way the coach grade resets to `'none'` (a fresh hand must not show the prior verdict) and
 * `seatToId` / `heroSeat` are rebuilt for this hand's compacted seating. No-op while `'playing'`
 * (a hand is already live) or once `'game-over'`.
 */
function startHand(model: Model, deck: readonly Card[]): Model {
  if (model.phase === 'setup') {
    const players = buildSessionPlayers(model.setup)
    // The hero (id 0) takes the first button — a deterministic, documented start; it rotates from
    // here every subsequent hand.
    const buttonId = 0
    const { hand, seatToId, heroSeat } = dealHand(players, buttonId, deck)
    return {
      ...model,
      phase: 'playing',
      players,
      hand,
      seatToId,
      heroSeat,
      buttonId,
      handNumber: 1,
      coach: { kind: 'none' },
    }
  }

  if (model.phase === 'hand-over') {
    const buttonId = rotateButton(model.players, model.buttonId)
    const { hand, seatToId, heroSeat } = dealHand(model.players, buttonId, deck)
    return {
      ...model,
      phase: 'playing',
      hand,
      seatToId,
      heroSeat,
      buttonId,
      handNumber: model.handNumber + 1,
      coach: { kind: 'none' },
    }
  }

  return model
}

/**
 * Apply a legal action to the live hand. Grades the hero's decision first (capture-before-apply, so
 * `decisionContext` still accepts the spot), then advances the hand. When the hand completes, settle
 * the per-seat stacks back to the stable players and transition: `'game-over'` if the session is
 * over (hero busted, or one survivor), else `'hand-over'` to offer play-again. No-op outside
 * `'playing'` or with no live hand.
 */
function applyHeroOrBotAction(model: Model, action: Action): Model {
  if (model.phase !== 'playing' || model.hand === null) return model

  // Grade the hero's decision BEFORE mutating the hand (a bot action leaves the grade untouched, so
  // the panel keeps showing the hero's last decision as play proceeds around the table).
  const coach = model.hand.toAct === model.heroSeat ? coachHero(model, action) : model.coach
  const hand = applyAction(model.hand, action)

  if (!isComplete(hand)) {
    return { ...model, hand, coach }
  }

  // Hand done: write the survivors' stacks back to the stable players, then decide the next phase.
  const players = applyHandResult(model.players, hand, model.seatToId)
  const phase = sessionOver(players) ? 'game-over' : 'hand-over'
  return { ...model, hand, coach, players, phase }
}

/**
 * Grade the hero's decision via `@holdem/coach`, returning the {@link CoachResult} to store —
 * the capture-before-apply ordering + advisory try/catch a terminal coach loop uses.
 * The caller has guaranteed it is the hero's turn on `model.hand`, so the context captures cleanly;
 * the verdict math lives entirely in the coach. Preflop we also hand back the starting-hand chart
 * classification. Any throw degrades to an `'error'` notice — coaching never crashes the hand.
 */
function coachHero(model: Model, action: Action): CoachResult {
  try {
    const ctx = decisionContext(model.hand!, model.heroSeat)
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
