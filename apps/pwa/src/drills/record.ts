/**
 * The serialisable per-concept drill-progress record (ticket 0080) — the durable entry the PWA writes
 * once per finished drill session, aggregated by the {@link Concept} a spot exercised, and the contract
 * the spaced-repetition re-queue (this ticket) and per-concept **mastery** ([[0081]]) read back.
 *
 * **Why aggregate-by-concept, not one record per spot.** The ticket is explicit that re-queue resurfaces
 * the missed *concept TYPE* (a freshly generated spot of that concept), never the byte-identical deal —
 * so the durable signal we need is per-concept, not per-spot. Two consumers read this store and BOTH
 * want per-concept aggregates, not a spot log:
 *
 * - **Re-queue (this ticket).** "Which concepts has the learner recently been getting wrong?" is a
 *   per-concept question — answered by {@link DrillProgressRecord.missStreak} / {@link lastMissedAt} /
 *   the `total` vs `correct` gap, with no need to replay individual deals.
 * - **Mastery % ([[0081]]).** Per-concept `correct / total` *is* mastery; adaptive difficulty weights
 *   selection toward low-mastery concepts off the same aggregate. Again per-concept, never per-spot.
 *
 * Aggregating also makes the store **trivially bounded** — the {@link Concept} union is a small fixed
 * set (≈6 values), so there is exactly one record per concept the learner has ever drilled. No retention
 * cap / pruning is needed (unlike the unbounded hand-history log): the keyspace cannot grow without
 * bound, so the store stays a handful of tiny records forever. The cost is that we do not keep a
 * spot-by-spot history — which neither consumer needs, and which storing would only invite a retention
 * problem the aggregate avoids.
 *
 * **Serialisation.** Plain, structured-clone-safe data only — no class instances, no functions, no
 * `Date` objects (the shell passes `lastDrilledAt`/`lastMissedAt` as epoch ms, exactly like the
 * hand-history record's `playedAt`). The shape is stable and explicit because [[0081]] reads it back;
 * do not repurpose fields — add new optional ones instead, and bump {@link DRILL_PROGRESS_SCHEMA_VERSION}
 * on any incompatible change so a future reader can migrate (the store ignores records whose version it
 * does not understand, exactly like the history/progress stores tolerate older blobs).
 */

import type { Concept } from '@holdem/coach'

/** Schema version for the stored record. Bump on an incompatible shape change so [[0081]]/M6 can migrate. */
export const DRILL_PROGRESS_SCHEMA_VERSION = 1

/**
 * One concept's durable, **aggregated** drill progress — every drilled spot of this concept folded into
 * running tallies. Keyed by {@link concept} (the IndexedDB store uses it as the in-line key path), so an
 * {@link append} of a new session's outcomes *merges* into the existing record rather than appending a
 * new row: there is exactly one record per concept.
 */
export interface DrillProgressRecord {
  /** Schema version — see {@link DRILL_PROGRESS_SCHEMA_VERSION}. */
  readonly schemaVersion: number
  /**
   * The {@link Concept} this record aggregates — the in-line key (one record per concept). Drawn from
   * the drilled {@link DrillTheme.concept}, the shared coach/primer vocabulary, so [[0081]]'s mastery
   * reads in the same terms the summary and Foundations speak.
   */
  readonly concept: Concept
  /** How many spots of this concept the learner has answered, ever (the mastery denominator). */
  readonly total: number
  /** How many of those they got coach-correct (the mastery numerator). */
  readonly correct: number
  /**
   * The current run of **consecutive** missed spots of this concept, across sessions — reset to `0` by a
   * correct answer, incremented by a miss. This is the primary "is this concept weak *right now*" signal
   * the re-queue weights on: a concept the learner just nailed should not be force-resurfaced merely
   * because they missed it long ago. (Mastery % uses `correct/total`; this is the *recency* signal.)
   */
  readonly missStreak: number
  /** When a spot of this concept was last drilled (epoch ms, shell-supplied). For recency ordering. */
  readonly lastDrilledAt: number
  /**
   * When a spot of this concept was last **missed** (epoch ms, shell-supplied), or `0` if never missed.
   * Lets the re-queue prefer the most-recently-failed concepts when several are weak.
   */
  readonly lastMissedAt: number
}

/**
 * One spot's outcome as the recording seam hands it to the store — the minimal, plain-data slice of a
 * {@link DrillOutcome} the store needs to fold into the aggregate ({@link DrillProgressRecord}). Kept
 * separate from the stored record so the caller never has to know the running-tally math (the store owns
 * the merge), and so the seam passes structured-clone-safe data, not UI types.
 */
export interface DrillSpotOutcome {
  /** The concept the answered spot exercised (the drilled {@link DrillTheme.concept}). */
  readonly concept: Concept
  /** Whether the learner answered it coach-correct. */
  readonly correct: boolean
}
