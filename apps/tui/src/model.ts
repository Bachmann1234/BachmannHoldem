/**
 * The MVU `Model` — the single source of truth the Ink view renders (ticket 0025).
 *
 * Following the Bubble Tea mental model the rest of this milestone is built on: there is
 * exactly one immutable model, a pure `reducer` advances it (see {@link file://./reducer.ts}),
 * and the React/Ink components only *read* it. The model is the engine's {@link HandState}
 * plus whatever UI-only state the terminal client needs (none of which is poker logic — all
 * rules stay in `@holdem/engine`).
 *
 * The table is modelled generically for **N seats**: every seat-aware derivation reads
 * `hand.players.length`, never a hardcoded heads-up `2`. The milestone seats up to 6-max,
 * and the engine already supports N seats, so the model carries no two-player assumption.
 * The hero always sits in seat 0.
 */

import { createHand, makeDeck, type Card, type HandState } from '@holdem/engine'
import type { DecisionVerdict, StartingHandVerdict } from '@holdem/coach'

/** The hero's seat index. The human always sits at seat 0; all other seats are opponents. */
export const HERO_SEAT = 0

/** Default table size for the milestone — 6-max (hero plus five opponents). */
export const DEFAULT_SEATS = 6

/** Blinds and stacks for the scaffold's single demo hand. Real session config lands later. */
export const SMALL_BLIND = 1
export const BIG_BLIND = 2
export const STARTING_STACK = 200

/**
 * The coach's view of the hero's *most recent* decision — the advisory state the
 * {@link CoachPanel} renders (ticket 0028). It is a small, serialisable union with three
 * states, computed by the pure reducer from the spot captured *before* the action was applied:
 *
 * - `'none'` — no hero decision has been graded yet (the opening frames of a hand, before the
 *   hero first acts). The panel renders a dim placeholder.
 * - `'verdict'` — a graded decision: the `@holdem/coach` {@link DecisionVerdict} the panel
 *   lays out (equity / pot odds / EV / good-leak), plus the preflop {@link StartingHandVerdict}
 *   when the decision was preflop. The panel does *no* verdict math of its own.
 * - `'error'` — coaching is strictly advisory, so any throw from the coach (a malformed spot
 *   the verdict math rejects) degrades to this one-line notice rather than crashing the hand.
 */
export type CoachResult =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'verdict'
      readonly verdict: DecisionVerdict
      /** The starting-hand chart classification — present only for a preflop decision. */
      readonly preflop?: StartingHandVerdict
    }
  | { readonly kind: 'error'; readonly message: string }

/**
 * The application model: the live hand plus any UI-only state.
 *
 * UI-only fields carry no poker logic (all rules stay in `@holdem/engine` / `@holdem/coach`):
 * {@link Model.heroSeat} (which seat is the human) and {@link Model.coach} (the coach's grade
 * of the hero's last decision, advanced by the reducer's `apply-action` case). Later tickets
 * (multi-hand session) extend this shape — the reducer is the single place that does so,
 * keeping the components dumb.
 */
export interface Model {
  /** The engine's immutable snapshot of the hand in progress. */
  readonly hand: HandState
  /** Which seat the human occupies (UI-only — the engine is seat-agnostic). */
  readonly heroSeat: number
  /**
   * The coach's grade of the hero's most recent decision (ticket 0028). Starts at `'none'`
   * and is replaced each time the *hero* acts; bot actions leave it in place so the panel
   * keeps showing the hero's last decision as the hand progresses around the table.
   */
  readonly coach: CoachResult
}

/** Options for {@link createInitialModel}; all default to the scaffold's demo settings. */
export interface InitialModelOptions {
  /** Number of seats at the table (>= 2). Defaults to {@link DEFAULT_SEATS}. */
  seats?: number
  /** Seat index of the dealer button. Defaults to the hero's seat. */
  buttonIndex?: number
  /** A pre-shuffled deck. Defaults to a freshly shuffled one (see {@link shuffledDeck}). */
  deck?: readonly Card[]
}

/**
 * Fisher–Yates shuffle of a fresh deck. The engine is deterministic and never shuffles, so —
 * exactly as `apps/cli/src/play.ts` does — the shuffle lives in the app. `Math.random` is
 * fine for a play client; determinism that matters lives in the package tests, and a test can
 * pass its own `deck` through {@link InitialModelOptions}.
 */
export function shuffledDeck(): Card[] {
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/**
 * Build the initial model: one hand dealt by the real {@link createHand} engine, with every
 * seat starting on {@link STARTING_STACK}. The table is sized generically from `seats` — the
 * engine seats N players, posts blinds, and sets the first actor — so nothing here assumes
 * heads-up.
 */
export function createInitialModel(options: InitialModelOptions = {}): Model {
  const seats = options.seats ?? DEFAULT_SEATS
  const buttonIndex = options.buttonIndex ?? HERO_SEAT
  const hand = createHand({
    stacks: Array.from({ length: seats }, () => STARTING_STACK),
    buttonIndex,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck: options.deck ?? shuffledDeck(),
  })
  // No hero decision has been graded yet — the coach panel starts on its placeholder state.
  return { hand, heroSeat: HERO_SEAT, coach: { kind: 'none' } }
}
