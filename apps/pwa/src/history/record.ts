/**
 * The serialisable hand-history record (ticket 0037) — the durable log entry the PWA writes once per
 * completed hand and the contract M6 (stats & leak detection, [[0010]]) will query.
 *
 * **Why this shape.** M6 must compute the hero's VPIP / PFR / aggression-factor and gate any "leak"
 * claim behind a minimum sample size (see {@link file://../../../../docs/LEARNING-APPROACH.md}). Those
 * stats are all derivable from **the hero's per-street decisions plus the hand outcome**, which is
 * exactly what this record stores:
 *
 * - **VPIP** (voluntarily put money in pot): did the hero `call`/`bet`/`raise` preflop (a blind post
 *   is involuntary and is *not* an action — the engine posts blinds, the hero never "acts" them, so
 *   they never appear in {@link decisions}). Derive per hand from `decisions` filtered to `preflop`.
 * - **PFR** (preflop raise): did the hero `bet`/`raise` preflop. Same source.
 * - **Aggression factor** ((bets + raises) / calls across all streets): count action `type`s in
 *   {@link decisions}.
 *
 * Each of those is a per-hand boolean/count; the *sample size* M6 gates on is simply the number of
 * records. The {@link outcome} (net chips, final stacks, board, payouts, endReason) supports the
 * results view and win-rate context without being needed for the decision-quality stats.
 *
 * **Serialisation.** This is plain, structured-clone-safe data only — no class instances, no
 * functions, no `Date` objects (the shell passes `playedAt` as epoch ms). Engine `Card`s are branded
 * numbers and clone fine. The shape is intentionally stable and explicit because M6 reads it back; do
 * not repurpose fields — add new optional ones instead, and bump the schema version.
 *
 * **Schema v2 (ticket 0086)** adds the two facts M6 needs that VPIP/PFR/aggression-factor did not:
 * the dealer {@link HandHistoryRecord.buttonIndex} (so the hero's *position* — and the canonical
 * "you over-fold the big blind" leak — is derivable from `heroSeat` + `seatCount`), and a per-decision
 * {@link HeroDecision.facing} betting context (so *fold-to-3bet* is derivable from what the hero faced
 * each time they acted). Both are **optional**: the history store does NOT version-filter reads, so v1
 * records (which lack both) are still returned by `list()` and must stay valid — a v1 record simply
 * has no position / facing data, and the M6 aggregation treats that as "not countable for the
 * position / 3bet breakdown". The capture lives in the recording seam (`App.tsx`), not the engine.
 */

import type { Action, Card, EndReason, Street } from '@holdem/engine'

/**
 * Schema version for the stored record. Bump when the shape changes so M6 can migrate / gate.
 * v1 → v2 (ticket 0086): added optional {@link HandHistoryRecord.buttonIndex} and
 * {@link HeroDecision.facing}; both additive + optional, so existing v1 records remain valid.
 */
export const HAND_HISTORY_SCHEMA_VERSION = 2

/**
 * One opponent at the table this hand, captured by stable label + preset so M6/replay can name seats
 * without re-deriving them. Plain data mirroring the session's {@link SessionPlayer}.
 */
export interface HistoryPlayer {
  /** Stable session player id (`0` is always the hero). */
  readonly id: number
  /** Display label (e.g. `You`, `Seat 1 (TAG)`). */
  readonly label: string
  /** Bot preset key for an opponent; `undefined` for the hero. */
  readonly botKind?: string
}

/**
 * The betting context the hero faced at the moment of one decision (schema v2, ticket 0086) — the raw
 * numbers from the live pre-action `hand`, captured in the recording seam. This is the signal
 * *fold-to-3bet* is derived from downstream ([[0087]]): nothing is classified here (don't try to flag
 * "3bet" in the stored record), only the faithful faced numbers are stored so a reader can compare the
 * faced bet level to the hero's own earlier raise-to amounts.
 *
 * Both are plain numbers (structured-clone-safe). The field is optional on {@link HeroDecision}
 * because v1 records pre-date it; a missing `facing` simply means "no facing context for this
 * decision" and the aggregation skips it for the fold-to-3bet breakdown.
 */
export interface DecisionFacing {
  /**
   * Chips the hero had to call when they acted (`currentBet` − the hero's `committed`, clamped at 0).
   * `0` means the action was unraised to the hero (they could check / open). The same quantity
   * `legalActions` / `decisionContext` compute for the hero's seat.
   */
  readonly toCall: number
  /**
   * The street's faced bet level when the hero acted (the engine's `currentBet`) — the highest
   * `committed` on that street. Stored alongside `toCall` (not just derived from it) because
   * fold-to-3bet needs to compare the *absolute* faced level to the hero's own earlier raise-to
   * amount, which `toCall` alone (a delta off the hero's own committed) cannot express unambiguously.
   */
  readonly currentBet: number
}

/**
 * One decision the hero voluntarily made during the hand, on a given street. Blind posts are NOT
 * decisions and never appear here — this is the M6-critical signal for VPIP/PFR/aggression.
 */
export interface HeroDecision {
  /** The street the decision was made on (`'complete'` never appears — the hand is over). */
  readonly street: Street
  /** The action the hero took. `bet`/`raise` carry an `amount`; the rest are bare. */
  readonly action: Action
  /**
   * What the hero faced when they made this decision (schema v2, ticket 0086) — `toCall` + the faced
   * `currentBet`, read from the live hand BEFORE the action applied. Optional: v1 records lack it, so
   * never assume it is present; M6's fold-to-3bet breakdown only counts decisions that carry it.
   */
  readonly facing?: DecisionFacing
}

/** One player's final state at the end of the hand, keyed by stable id for write-back/replay. */
export interface PlayerOutcome {
  /** Stable session player id. */
  readonly id: number
  /** Display label, duplicated here so the outcome reads standalone. */
  readonly label: string
  /** This hand's engine seat index (for replay / debugging). */
  readonly seat: number
  /** Chips behind at the end of the hand. */
  readonly finalStack: number
  /** Chips this player committed across the whole hand (the basis for net result). */
  readonly totalCommitted: number
}

/** The settled result of the hand — outcome context for the results view (not needed for the stats). */
export interface HandOutcome {
  /** The full community board dealt (0–5 cards; branded-number `Card`s clone fine). */
  readonly board: readonly Card[]
  /** How the hand ended. `null` would be an unfinished hand — never recorded. */
  readonly endReason: EndReason | null
  /** Engine seat → chips returned (winnings + uncalled bets), straight from the completed hand. */
  readonly payouts: Readonly<Record<number, number>>
  /** Per-player final state, keyed by stable id. */
  readonly players: readonly PlayerOutcome[]
  /** The hero's net chip result this hand (`payouts[heroSeat] - hero.totalCommitted`). */
  readonly heroNet: number
}

/**
 * A complete, durable record of one finished hand. Newest-first ordering is by {@link playedAt}; the
 * store assigns the persisted key.
 */
export interface HandHistoryRecord {
  /** Schema version — see {@link HAND_HISTORY_SCHEMA_VERSION}. */
  readonly schemaVersion: number
  /**
   * Stable unique id for the record (a UUID assigned at assembly). Distinct from the IndexedDB
   * autoincrement key so a record can be referenced/deduped independently of the store.
   */
  readonly id: string
  /** When the hand finished, epoch ms. The SHELL supplies this (`Date.now()`); never set in pure code. */
  readonly playedAt: number
  /** This session's hand number (1-based) when the hand completed. */
  readonly handNumber: number
  /** Table config: total seats dealt this hand. */
  readonly seatCount: number
  /** The players at the table this hand (hero + opponents), in stable order. */
  readonly players: readonly HistoryPlayer[]
  /** The engine seat the hero occupied this hand. */
  readonly heroSeat: number
  /**
   * The dealer button's engine seat this hand (schema v2, ticket 0086). With {@link heroSeat} +
   * {@link seatCount} this is enough to derive the hero's *position* (button / blinds / etc.) for M6's
   * by-position stats and the "you over-fold the big blind" leak. Optional: v1 records pre-date it, so
   * the aggregation treats a missing `buttonIndex` as "position unknown / not countable".
   */
  readonly buttonIndex?: number
  /** The hero's voluntary decisions, in order — the M6-critical signal. */
  readonly decisions: readonly HeroDecision[]
  /** The settled outcome of the hand. */
  readonly outcome: HandOutcome
}
