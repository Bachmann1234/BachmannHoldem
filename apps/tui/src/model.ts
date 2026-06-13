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

/** The hero's seat index. The human always sits at seat 0; all other seats are opponents. */
export const HERO_SEAT = 0

/** Default table size for the milestone — 6-max (hero plus five opponents). */
export const DEFAULT_SEATS = 6

/** Blinds and stacks for the scaffold's single demo hand. Real session config lands later. */
export const SMALL_BLIND = 1
export const BIG_BLIND = 2
export const STARTING_STACK = 200

/**
 * The application model: the live hand plus any UI-only state.
 *
 * For this read-only scaffold the only UI-only field is {@link Model.heroSeat}; later
 * tickets (action input, coach panel, multi-hand session) extend this shape — the reducer
 * is the single place that does so, keeping the components dumb.
 */
export interface Model {
  /** The engine's immutable snapshot of the hand in progress. */
  readonly hand: HandState
  /** Which seat the human occupies (UI-only — the engine is seat-agnostic). */
  readonly heroSeat: number
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
  return { hand, heroSeat: HERO_SEAT }
}
