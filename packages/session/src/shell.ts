/**
 * Shared, pure shell glue both play clients (the Ink TUI and the React PWA) sit on top of.
 *
 * These helpers used to be copy-pasted byte-for-byte into each shell, where they could silently
 * diverge (ticket 0039). They live here — pure, no UI/DOM/Node — so the two shells share one
 * definition. The only thing the shells keep local is the impure RNG seed they feed {@link makeBot}
 * (the per-hand deck shuffle and the bots' decisions still run in the shell, by design).
 */

import {
  heuristicOpponent,
  LOOSE_AGGRESSIVE,
  LOOSE_PASSIVE,
  TIGHT_AGGRESSIVE,
  TIGHT_PASSIVE,
  type Opponent,
  type Personality,
} from '@holdem/bots'
import type { Action, LegalActions } from '@holdem/engine'
import type { BotKind, SessionPlayer } from './model.js'

/** The `@holdem/bots` personality each setup preset maps to. */
export const PERSONALITY_BY_KIND: Readonly<Record<BotKind, Personality>> = {
  tag: TIGHT_AGGRESSIVE,
  lag: LOOSE_AGGRESSIVE,
  rock: TIGHT_PASSIVE,
  station: LOOSE_PASSIVE,
}

/**
 * Build the per-player bot instance for an opponent from its preset, seeded with `seed`. Pure: the
 * shell owns the (impure) seed source, so a session stays reproducible when a fixed seed is passed.
 */
export function makeBot(player: SessionPlayer, seed: number): Opponent {
  return heuristicOpponent(PERSONALITY_BY_KIND[player.botKind ?? 'tag'], seed)
}

/**
 * Is `action` one of the moves `legal` permits right now? A last-ditch guard so a shell never
 * dispatches an action the engine would throw on (the hero's path validates its own input; this
 * covers the defensive bot path). Mirrors the engine's {@link LegalActions} shape.
 */
export function actionIsLegal(action: Action, legal: LegalActions): boolean {
  switch (action.type) {
    case 'fold':
      return legal.fold
    case 'check':
      return legal.check
    case 'call':
      return legal.call !== null
    case 'bet':
      return legal.bet !== null && action.amount >= legal.bet.min && action.amount <= legal.bet.max
    case 'raise':
      return (
        legal.raise !== null && action.amount >= legal.raise.min && action.amount <= legal.raise.max
      )
  }
}
