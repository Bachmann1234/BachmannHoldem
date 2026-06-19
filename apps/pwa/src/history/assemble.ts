/**
 * Assemble a {@link HandHistoryRecord} from a completed hand + the hero's accumulated decisions
 * (ticket 0037). Pure: the two non-deterministic bits — the record `id` and `playedAt` — are passed
 * in by the shell (`crypto.randomUUID()` and `Date.now()`), never called here, so this is fully
 * unit-testable with a real completed hand built via `createHand`/`applyAction`.
 *
 * The caller is the recording seam, which guarantees `hand` is complete and `decisions` are the
 * hero's *voluntary* actions in order (blind posts are not decisions and are never in the buffer).
 */

import { isComplete, type HandState } from '@holdem/engine'
import type { Model } from '@holdem/session'
import {
  HAND_HISTORY_SCHEMA_VERSION,
  type HandHistoryRecord,
  type HeroDecision,
  type HistoryPlayer,
  type PlayerOutcome,
} from './record.js'

/** The shell-supplied, non-pure inputs to {@link assembleRecord}. */
export interface AssembleContext {
  /** Stable unique record id (the shell passes `crypto.randomUUID()`). */
  readonly id: string
  /** When the hand finished, epoch ms (the shell passes `Date.now()`). */
  readonly playedAt: number
  /**
   * The id of the current session (schema v3) — the shell's per-session UUID, stable across the
   * sitting. Non-pure like {@link id}, so it is injected here rather than derived. Optional so callers
   * mid-migration (and tests that don't exercise sessions) can omit it; when omitted the record simply
   * carries no `sessionId`.
   */
  readonly sessionId?: string
}

/**
 * Build the durable record for a finished hand. Reads the completed engine {@link HandState} for the
 * outcome and the model for stable player identity (`seatToId` → `players`). Throws if `hand` is not
 * complete — the seam only calls this on completion, so a throw signals a seam bug.
 */
export function assembleRecord(
  model: Model,
  hand: HandState,
  decisions: readonly HeroDecision[],
  ctx: AssembleContext,
): HandHistoryRecord {
  if (!isComplete(hand)) {
    throw new Error('assembleRecord: hand is not complete')
  }

  const { players, seatToId, heroSeat, handNumber } = model

  // Stable label/preset by id, for naming seats in the record without re-deriving them later.
  const labelById = new Map(players.map((p) => [p.id, p]))

  const historyPlayers: HistoryPlayer[] = hand.players.map((p): HistoryPlayer => {
    const id = seatToId[p.seat]
    const sp = id === undefined ? undefined : labelById.get(id)
    return {
      id: id ?? -1,
      label: sp?.label ?? `Seat ${p.seat}`,
      ...(sp?.botKind !== undefined ? { botKind: sp.botKind } : {}),
    }
  })

  const playerOutcomes: PlayerOutcome[] = hand.players.map((p): PlayerOutcome => {
    const id = seatToId[p.seat]
    const sp = id === undefined ? undefined : labelById.get(id)
    return {
      id: id ?? -1,
      label: sp?.label ?? `Seat ${p.seat}`,
      seat: p.seat,
      finalStack: p.stack,
      totalCommitted: p.totalCommitted,
    }
  })

  const heroPlayer = hand.players.find((p) => p.seat === heroSeat)
  const heroPayout = hand.payouts[heroSeat] ?? 0
  const heroNet = heroPayout - (heroPlayer?.totalCommitted ?? 0)

  return {
    schemaVersion: HAND_HISTORY_SCHEMA_VERSION,
    id: ctx.id,
    playedAt: ctx.playedAt,
    handNumber,
    seatCount: hand.players.length,
    players: historyPlayers,
    heroSeat,
    // The dealer button is constant for the hand, so capture it once here from the completed hand
    // (schema v2, ticket 0086) — with heroSeat + seatCount it makes the hero's position derivable.
    buttonIndex: hand.buttonIndex,
    // The big blind is constant for the hand (schema v2, ticket 0087) — captured so fold-to-3bet can
    // tell a genuine open (raise into an unraised pot, currentBet === bigBlind) from a cold 3bet.
    bigBlind: hand.bigBlind,
    // Schema v3: the hero's hole cards (for hand-by-hand review) and the session id (so an export can
    // be grouped per sitting). Both optional — spread in only when present so a record that genuinely
    // lacks them stays absent-keyed (not `holeCards: undefined`), matching the pre-v3 shape readers see.
    ...(heroPlayer !== undefined
      ? { holeCards: [heroPlayer.holeCards[0], heroPlayer.holeCards[1]] as const }
      : {}),
    ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
    decisions: [...decisions],
    outcome: {
      board: [...hand.board],
      endReason: hand.endReason,
      payouts: { ...hand.payouts },
      players: playerOutcomes,
      heroNet,
    },
  }
}
