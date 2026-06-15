/**
 * Pure analysis helpers for the headless harness's *testing* features (the Tier-1..3 enhancements):
 * hero position naming, a **ground-truth** equity read (the coach grades the hero against an assumed
 * range; this reads the hero's equity against villains' *actual* cards, so a sweep can flag every
 * spot where the coach's advice diverges from the truth), and the serialisable record shapes the
 * `--json` mode emits.
 *
 * Kept free of I/O and of `process`/argv so it unit-tests directly — `sim.ts` is the thin harness
 * that wires these to stdout. All the poker math is reused from `@holdem/odds` (no re-derivation):
 * {@link exactEquity} enumerates the remaining board exactly, and postflop that is cheap (≤2 cards to
 * come), so the ground-truth read adds no Monte-Carlo noise of its own.
 */

import { exactEquity, evOfCall } from '@holdem/odds'
import type { Card, HandState } from '@holdem/engine'
import type { PostflopTrace, PreflopTrace } from '@holdem/coach'

/** EV-correct continue decision, mirroring the coach's {@link CorrectDecision}. */
export type Correct = 'continue' | 'fold'

/**
 * Standard position labels in seat order *starting from the button*, per table size. Index `i` is
 * the seat `i` steps clockwise from the button: 0 = BTN, then SB, BB, and the early/middle seats up
 * to CO. Heads-up the button is the small blind, so the two labels are just BTN and BB.
 */
export const POSITION_LABELS: Readonly<Record<number, readonly string[]>> = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'],
}

/**
 * The poker position name for `seat` given the button seat and table size — `BTN`, `SB`, `BB`, `UTG`,
 * `MP`, `CO`. Falls back to `seat N` for an unsupported table size. This is what lets a sweep see the
 * hero playing every position (the harness moves the button; the hero stays seat 0).
 */
export function positionName(seat: number, button: number, numSeats: number): string {
  const labels = POSITION_LABELS[numSeats]
  if (!labels) return `seat ${seat}`
  return labels[(seat - button + numSeats) % numSeats] ?? `seat ${seat}`
}

/** A ground-truth read of a spot: the hero's *actual* equity and the EV-correct call it implies. */
export interface GroundTruth {
  /** Hero's exact equity vs the live villains' actual hole cards on the current board (`0..1`). */
  readonly equity: number
  /** Chip EV of calling at the true equity: `evOfCall({ equity, pot, callAmount: toCall })`. */
  readonly callEv: number
  /** The EV-correct decision at the true equity (a free check is always `'continue'`). */
  readonly correct: Correct
}

/**
 * The hero's **exact** equity right now against the villains *actually live in the pot*, using their
 * real (hidden-to-the-coach) hole cards — the omniscient read the coach deliberately does not have.
 * Enumerates every completion of the current board, so it is only meaningful (and cheap) postflop;
 * callers must not invoke it preflop (the coach grades preflop by chart, not equity, anyway).
 */
export function groundTruthEquity(state: HandState, heroSeat: number): number {
  const hero = state.players[heroSeat]!
  const villains = state.players.filter((p) => p.status !== 'folded' && p.seat !== heroSeat)
  const hands: (readonly [Card, Card])[] = [
    [hero.holeCards[0]!, hero.holeCards[1]!],
    ...villains.map((p) => [p.holeCards[0]!, p.holeCards[1]!] as const),
  ]
  // Hero is hand 0, so result[0] is the hero's equity share.
  return exactEquity({ hands, board: state.board })[0]!.equity
}

/**
 * Turn a ground-truth equity into the EV-correct call, given the same pot accounting the coach uses
 * (`pot` is the dead money before the call, `toCall` the chips to add). A free check (`toCall === 0`)
 * is always a continue.
 */
export function assessTruth(equity: number, pot: number, toCall: number): GroundTruth {
  const callEv = evOfCall({ equity, pot, callAmount: toCall })
  const correct: Correct = toCall === 0 ? 'continue' : callEv >= 0 ? 'continue' : 'fold'
  return { equity, callEv, correct }
}

/**
 * Whether the coach's recommended decision would be a *mistake* against the ground truth — the
 * headline signal a sweep is looking for. Only a priced spot (`toCall > 0`) can mislead: on a free
 * check both the coach and the truth always say continue. A `true` here means following the coach
 * costs the hero chips relative to the EV-correct play against villains' real cards.
 */
export function coachMisleads(coachCorrect: Correct, truth: GroundTruth, toCall: number): boolean {
  return toCall > 0 && coachCorrect !== truth.correct
}

/** One hero decision in a {@link HandRecord}: the spot, the coach's read, and the ground truth. */
export interface DecisionRecord {
  readonly street: string
  readonly board: string
  /** The hero's action, e.g. `call`, `bet 50`, `fold`. */
  readonly action: string
  /** Chips to call (omitted preflop, where the chart drives the verdict). */
  readonly toCall?: number
  /** Dead money before the call (omitted preflop). */
  readonly pot?: number
  /** The postflop pot-odds verdict, or `null` preflop. */
  readonly coach: CoachRecord | null
  /** The preflop chart verdict, or `null` postflop. */
  readonly preflop: PreflopRecord | null
  /** The omniscient read vs villains' actual cards, or `null` preflop. */
  readonly truth: GroundTruth | null
  /** `true` if the coach's advice diverges from the truth (a costly miss); `null` preflop. */
  readonly misleads: boolean | null
}

/** The postflop pot-odds view the coach narrates, flattened for JSON. */
export interface CoachRecord {
  readonly equity: number
  readonly potOdds: number
  readonly callEv: number
  readonly correct: Correct
  readonly verdict: 'good' | 'leak' | 'breakEven'
  /** The deterministic decision trace — *why* the read fired (the coach's {@link PostflopTrace}). */
  readonly trace: PostflopTrace
}

/** The preflop chart view the coach narrates, flattened for JSON. */
export interface PreflopRecord {
  readonly tier: string
  readonly advice: string
  readonly verdict: 'good' | 'leak' | 'breakEven'
  /** The deterministic decision trace — *which* rule fired (the coach's {@link PreflopTrace}). */
  readonly trace: PreflopTrace
}

/** One showdown holding in a completed hand. */
export interface ShowdownRecord {
  readonly seat: number
  readonly cards: string
  readonly hand: string
}

/** A whole hand, the unit of the `--json` NDJSON stream — one object per line. */
export interface HandRecord {
  readonly seed: number
  readonly seats: number
  readonly button: number
  readonly heroSeat: number
  readonly heroCards: string
  readonly heroPosition: string
  readonly decisions: readonly DecisionRecord[]
  readonly result: {
    readonly endReason: string | null
    /** Hero's net chip change for the hand (winnings minus everything committed). */
    readonly heroNet: number
    readonly showdown: readonly ShowdownRecord[]
    readonly winners: Readonly<Record<number, number>>
  }
}

/** Running tallies for a batch sweep, emitted as the final summary record. */
export interface SweepSummary {
  readonly type: 'summary'
  readonly hands: number
  readonly heroDecisions: number
  /** Verdict counts across all graded hero decisions (preflop + postflop). */
  readonly verdicts: Record<'good' | 'leak' | 'breakEven', number>
  /** How many postflop priced decisions the coach got *wrong* vs the ground truth. */
  readonly misleads: number
  /** How many postflop priced decisions were checked against the ground truth. */
  readonly pricedPostflop: number
}
