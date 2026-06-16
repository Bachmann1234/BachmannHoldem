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
 * deterministic `createHand` (see {@link dealHand}). The coach grading (`gradePreflop` preflop /
 * `coachDecision` postflop) is pure, seeded, and deterministic, so it may — and does — stay here.
 *
 * **The session state machine.** The reducer owns every phase transition (`setup` → `playing` →
 * `hand-over` → `playing` … → `game-over`), the setup selection edits, the per-hand seat
 * compaction + button rotation + bust removal, and writing post-hand stacks back to stable players.
 * The shell only supplies decks and bot actions and renders the phase.
 */

import { applyAction, isComplete, type Action, type Card } from '@holdem/engine'
import { decisionContext } from '@holdem/bots'
import { coachDecision, gradePreflop } from '@holdem/coach'
import {
  applyHandResult,
  buildSessionPlayers,
  clampSeats,
  countsByKind,
  dealHand,
  defaultOpponents,
  rotateButton,
  sessionOver,
  BIG_BLIND,
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
 * - `'set-seats'` — choose the table size; clamped and the opponent mix re-fitted.
 * - `'adjust-mix'` — nudge how many opponents are a given archetype by ±1, rebalancing the others
 *   so the mix still totals `seats − 1` (the felt no longer pins a style to a seat, so setup picks
 *   *counts*, not per-seat presets).
 * - `'set-opponents'` — replace the whole mix at once (the shell's "Randomize" reroll).
 * - `'set-stack'` — choose the starting stack depth (chips); the setup screen offers it as
 *   {@link STACK_DEPTH_PRESETS_BB} presets. Stored on the setup selection, frozen into every
 *   player's stack at deal.
 * - `'cycle-opponent'` — cycle one opponent seat through the four presets (the TUI's per-seat
 *   setup editor still drives the mix this way; the PWA uses count-based `adjust-mix` instead).
 *
 * Session messages:
 * - `'start-hand'` — the shell hands in a freshly shuffled `deck`; the reducer deals the next hand
 *   (the first hand from setup, or a play-again hand with the button rotated and busted players
 *   dropped) and enters `'playing'`. The RNG that produced `deck` stays in the shell.
 * - `'apply-action'` — apply an already-validated engine {@link Action} (the hero's keystroke or a
 *   bot's `decide` result) to the live hand, grading the hero's decision, and — if the hand
 *   completes — settling stacks and moving to `'hand-over'` or `'session-over'`.
 * - `'quit'` — the hero quits, or dismisses the final-hand review; jump to `'game-over'` with
 *   whatever stacks stand.
 * - `'noop'` — identity (proves the loop).
 */
export type Msg =
  | { readonly type: 'noop' }
  | { readonly type: 'set-seats'; readonly seats: number }
  | { readonly type: 'adjust-mix'; readonly kind: BotKind; readonly delta: 1 | -1 }
  | { readonly type: 'set-opponents'; readonly opponents: readonly BotKind[] }
  | { readonly type: 'set-stack'; readonly startingStack: number }
  | { readonly type: 'cycle-opponent'; readonly opponentIndex: number; readonly direction?: 1 | -1 }
  | {
      readonly type: 'start-hand'
      readonly deck: readonly Card[]
      readonly names?: readonly string[]
    }
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

    case 'adjust-mix':
      return adjustMix(model, msg.kind, msg.delta)

    case 'set-opponents':
      return setOpponents(model, msg.opponents)

    case 'set-stack':
      return setStack(model, msg.startingStack)

    case 'cycle-opponent':
      return cycleOpponent(model, msg.opponentIndex, msg.direction ?? 1)

    case 'start-hand':
      return startHand(model, msg.deck, msg.names)

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

/** Rebuild the opponent list from per-archetype counts, grouped in {@link BOT_KINDS} order. */
function opponentsFromCounts(counts: Record<BotKind, number>): BotKind[] {
  return BOT_KINDS.flatMap((k) => Array.from({ length: counts[k] }, () => k))
}

/**
 * Setup edit: cycle one opponent seat to the next (or previous) preset, wrapping through the four
 * {@link BOT_KINDS}. The TUI's per-seat setup editor uses this; the PWA edits counts via
 * {@link adjustMix}. No-op outside `'setup'` or for an out-of-range index.
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
 * Setup edit: change how many opponents are `kind` by `delta` (±1), keeping the mix's total fixed at
 * `seats − 1` by moving the slot to/from another archetype. Adding a `kind` steals from the *most*
 * common other archetype; removing one gives to the *least* common — both nudge toward variety. The
 * felt assigns names to seats randomly per session, so order is irrelevant here; only counts matter.
 * No-op outside `'setup'`, or when the edit is impossible (already 0, or already the whole table).
 */
function adjustMix(model: Model, kind: BotKind, delta: 1 | -1): Model {
  if (model.phase !== 'setup') return model
  const counts = countsByKind(model.setup.opponents)
  const others = BOT_KINDS.filter((k) => k !== kind)
  if (delta === 1) {
    // Take a slot from the most-common other archetype (there must be one: the mix is full).
    const donor = others.reduce((a, b) => (counts[b] > counts[a] ? b : a))
    if (counts[donor] === 0) return model // `kind` already fills the table.
    counts[kind] += 1
    counts[donor] -= 1
  } else {
    if (counts[kind] === 0) return model
    // Give the freed slot to the least-common other archetype.
    const receiver = others.reduce((a, b) => (counts[b] < counts[a] ? b : a))
    counts[kind] -= 1
    counts[receiver] += 1
  }
  return { ...model, setup: { ...model.setup, opponents: opponentsFromCounts(counts) } }
}

/**
 * Setup edit: replace the whole opponent mix (the "Randomize" reroll). Re-fitted to `seats − 1` so a
 * stale or wrong-length list can't desync the table size. No-op outside `'setup'`.
 */
function setOpponents(model: Model, opponents: readonly BotKind[]): Model {
  if (model.phase !== 'setup') return model
  const fill = defaultOpponents(model.setup.seats)
  const fitted = Array.from({ length: model.setup.seats - 1 }, (_, i) => opponents[i] ?? fill[i]!)
  return { ...model, setup: { ...model.setup, opponents: fitted } }
}

/**
 * Setup edit: choose the starting stack depth (chips). Clamped to at least one big blind so a
 * degenerate 0-stack table can never be dealt; the setup screen offers it as the
 * {@link STACK_DEPTH_PRESETS_BB} presets but any positive depth is accepted. No-op outside `'setup'`.
 */
function setStack(model: Model, startingStack: number): Model {
  if (model.phase !== 'setup') return model
  const next = Math.max(BIG_BLIND, Math.round(startingStack))
  return { ...model, setup: { ...model.setup, startingStack: next } }
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
function startHand(model: Model, deck: readonly Card[], names?: readonly string[]): Model {
  if (model.phase === 'setup') {
    const players = buildSessionPlayers(model.setup, names)
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
 * the per-seat stacks back to the stable players and transition: `'session-over'` if the session is
 * over (hero busted, or one survivor) so the showdown stays on screen for review, else `'hand-over'`
 * to offer play-again. No-op outside `'playing'` or with no live hand.
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
  // When the session has ended we stop at `'session-over'` (not straight to `'game-over'`) so the
  // completed hand — including the showdown that busted the hero — stays on screen for review; the
  // hero dismisses it (a `'quit'` message) to reach the summary. A bot busting still goes to
  // `'hand-over'` to offer play-again.
  const players = applyHandResult(model.players, hand, model.seatToId)
  const phase = sessionOver(players) ? 'session-over' : 'hand-over'
  return { ...model, hand, coach, players, phase }
}

/**
 * Grade the hero's decision via `@holdem/coach`, returning the {@link CoachResult} to store —
 * the capture-before-apply ordering + advisory try/catch a terminal coach loop uses.
 * The caller has guaranteed it is the hero's turn on `model.hand`, so the context captures cleanly;
 * the verdict math lives entirely in the coach. **Preflop** is graded off the starting-hand chart
 * (`gradePreflop`), **postflop** off the pot-odds math (`coachDecision`) — the two lenses are
 * distinct because preflop pot-odds-vs-equity folds clear opens (ticket [[BUG-0001]]). Any throw
 * degrades to an `'error'` notice — coaching never crashes the hand.
 */
function coachHero(model: Model, action: Action): CoachResult {
  try {
    const ctx = decisionContext(model.hand!, model.heroSeat)
    // Carry the graded `(ctx, action)` on the result so a client can `serializeSpot` the exact spot
    // (the "Copy ruling" blob); the coach is a pure function of that pair, so the blob re-grades here.
    if (ctx.street === 'preflop') {
      return { kind: 'preflop', verdict: gradePreflop(ctx, action), ctx, action }
    }
    return { kind: 'verdict', verdict: coachDecision(ctx, action), ctx, action }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { kind: 'error', message: `Coaching unavailable for this spot — ${reason}` }
  }
}

/** The `dispatch` callback the view calls to send a {@link Msg} into the loop. */
export type Dispatch = (msg: Msg) => void
