/**
 * Play-side **hero stats** — the pure read-side projection of the durable hand-history log (ticket
 * 0087, the first M6 acceptance criterion of [[0010-stats-and-leak-detection]]). The history store
 * ({@link HandHistoryStore}, ticket 0037) owns the *recording* (one {@link HandHistoryRecord} per
 * finished hand); this owns the *reading*: turning those same records into the core HUD stats —
 * **VPIP**, **PFR**, **aggression factor**, and **fold-to-3bet** — both **overall** and **broken down
 * by {@link Position}**.
 *
 * This is the play-side analog of `drills/mastery.ts`. Everything here is a **pure function of the
 * records `HandHistoryStore.list()` returns** — no second store, no second aggregation pass, no I/O,
 * no `Date`, no randomness. The store is the single source of truth; these stats are just a view over
 * `decisions` + `buttonIndex` + per-decision `facing`. Kept out of the React component (a plain module
 * with jsdom-free tests) so the *definitions* — what counts as VPIP, how the calls===0 case is
 * represented, what the fold-to-3bet denominator is — are unit-testable in isolation and the Stats UI
 * ([[0089-stats-screen]]) and leak detector ([[0088-leak-detection]]) stay thin consumers.
 *
 * **Sample size travels with every number** (mirroring `ConceptMastery.reps`). Each stat carries the
 * `n`/denominator it was computed over, so a thin sample reads as thin: the UI can show "over N hands"
 * and the leak detector can gate any actionable claim. We deliberately do **not** gate here — that is
 * 0088/0089's job; this module just carries the counts.
 *
 * **The stat definitions (be exact — see the record doc on `HeroDecision`/`DecisionFacing`).**
 *
 * - **VPIP** (voluntarily put money in pot): share of hands with a voluntary preflop `call`/`bet`/
 *   `raise`. Blind posts are involuntary and the engine never records them as {@link HeroDecision}s, so
 *   they correctly don't count. Source: `decisions` filtered to `preflop`.
 * - **PFR** (preflop raise): share of hands with a preflop `bet`/`raise`. Same source.
 * - **Aggression factor**: `(bets + raises) / calls` counted across **all** streets. The classic
 *   "how often do I take the lead vs. tag along" read. The `calls === 0` case is handled explicitly
 *   (see {@link AggressionStat}): we carry the raw counts and a *guarded* ratio that is `null` when
 *   undefined, so `Infinity`/`NaN` never reaches a consumer.
 * - **Fold-to-3bet**: of the hands where the hero **open-raised preflop AND then faced a re-raise**,
 *   the share where the hero **folded**. The denominator is "faced a 3bet after opening", not all
 *   hands. A re-raise is detected purely from the captured {@link DecisionFacing}: a *later* preflop
 *   decision whose faced `currentBet` exceeds the hero's own earlier preflop raise-to `amount` (both
 *   are "raise to" totals on the same street, so directly comparable). Nothing is classified at record
 *   time — only the faithful faced numbers are stored — so the derivation lives here.
 *
 * **v1-record tolerance (the no-version-filter contract).** `HandHistoryStore.list()` returns *all*
 * records, including old schema-v1 ones that lack `buttonIndex` and per-decision `facing`. VPIP/PFR/AF
 * need only `decisions`, so v1 records still count for those. But a record with no `buttonIndex` cannot
 * be placed in a position bucket (excluded from the by-position split, still counted overall), and a
 * decision with no `facing` cannot be compared for a re-raise (the hand is excluded from the
 * fold-to-3bet denominator). Missing data is "not countable here", never a crash.
 */

import type { DecisionContext } from '@holdem/bots'
import { classifyPosition, type Position } from '@holdem/coach'
import type { HandHistoryRecord, HeroDecision } from './record.js'

/**
 * The five {@link Position} buckets, in the canonical "how a learner is taught position" order
 * (earliest to latest, then the blinds). The by-position result is keyed by these so a consumer can
 * iterate them in a stable, teachable order without re-deriving the vocabulary.
 */
export const POSITION_ORDER: readonly Position[] = [
  'early',
  'middle',
  'late',
  'small-blind',
  'big-blind',
]

/**
 * A simple "share of hands" stat — a count over a denominator, plus the fraction. Used for VPIP, PFR,
 * and fold-to-3bet, each of which is "of N qualifying hands, M did the thing". The `fraction` is
 * `count / denominator`, or `null` when `denominator === 0` (no hands to measure — never `NaN`). The
 * `denominator` is the sample size that travels with the number (mirrors `ConceptMastery.reps`): for
 * VPIP/PFR it is hands played; for fold-to-3bet it is the narrower "faced a 3bet after opening" count.
 */
export interface RateStat {
  /** Numerator: hands matching the stat's condition (voluntary preflop action, a fold to a 3bet, …). */
  readonly count: number
  /** Denominator: the sample size this rate was computed over — hands played, or hands that qualified. */
  readonly denominator: number
  /** `count / denominator` as a fraction `0..1`, or `null` when `denominator === 0` (no sample). */
  readonly fraction: number | null
}

/**
 * The **aggression factor** stat — `(bets + raises) / calls` across all streets. AF is the one core
 * stat with no natural "share of hands" denominator, and division by `calls === 0` is a real case (a
 * hand history of pure bets/raises with zero calls). We therefore carry the **raw counts** and a
 * **guarded ratio**:
 *
 * - `ratio` is `(bets + raises) / calls` when `calls > 0`, else `null` — never `Infinity`/`NaN`. A
 *   consumer that wants a single number uses `ratio` and renders `null` as "—" (or "infinitely
 *   aggressive" copy); the leak detector reasons over the counts directly (e.g. "lots of aggression,
 *   zero calls" is a passive-vs-maniac signal it can phrase from `aggressive`/`calls`).
 * - `aggressive` (`bets + raises`) and `calls` are exposed so the calls===0 case is *representable*
 *   rather than collapsed to a sentinel — the UI/leak layer decides what to say about it.
 * - `hands` is the sample size (hands these counts were tallied over), so AF off three hands reads as
 *   the thin sample it is, same as every other stat carrying its `n`.
 */
export interface AggressionStat {
  /** Aggressive actions across all streets: `bets + raises`. */
  readonly aggressive: number
  /** `call` actions across all streets — the AF denominator. */
  readonly calls: number
  /** `aggressive / calls` when `calls > 0`, else `null` (no division by zero — never `Infinity`/`NaN`). */
  readonly ratio: number | null
  /** Sample size: hands these counts were tallied over (mirrors `ConceptMastery.reps`). */
  readonly hands: number
}

/**
 * The four core stats for one slice of the history (the whole log, or one {@link Position} bucket).
 * Each carries its own sample size so a consumer can gate per-stat: VPIP/PFR are over `hands`,
 * fold-to-3bet over its narrower qualifying denominator, AF over the hands it tallied. Plain
 * structured data — no formatting strings (formatting is the UI's job, like `formatMastery` sits
 * beside `masteryByConcept`).
 */
export interface HeroStats {
  /** How many hands this slice was computed over — the overall sample size for VPIP/PFR/AF. */
  readonly hands: number
  /** Voluntarily-put-money-in-pot rate (preflop call/bet/raise share), over `hands`. */
  readonly vpip: RateStat
  /** Preflop-raise rate (preflop bet/raise share), over `hands`. */
  readonly pfr: RateStat
  /** Aggression factor across all streets, with the calls===0 case made explicit. */
  readonly aggressionFactor: AggressionStat
  /** Fold-to-3bet rate, over the "open-raised then faced a re-raise" denominator (NOT all hands). */
  readonly foldToThreeBet: RateStat
}

/**
 * The full aggregated result: the **overall** stats plus the **by-position** breakdown. The
 * `byPosition` map is keyed by {@link Position}; a position the hero has no countable hands in is
 * **absent** (not a zeroed entry) — "unseen" rather than "0%", exactly as an undrilled concept has no
 * mastery entry. Records lacking `buttonIndex` contribute to `overall` but to no position bucket.
 * Shaped for both consumers: the leak detector reasons over `overall` + `byPosition` (each with
 * samples), and the Stats UI renders both directly.
 */
export interface AggregatedHeroStats {
  /** Stats over every record (including v1 records that lack `buttonIndex` / `facing`). */
  readonly overall: HeroStats
  /** Stats per {@link Position}, only over records whose `buttonIndex` places them in a bucket. */
  readonly byPosition: ReadonlyMap<Position, HeroStats>
}

/** Is this decision a voluntary preflop money-in action (`call`/`bet`/`raise`)? — the VPIP condition. */
function isVpipAction(d: HeroDecision): boolean {
  if (d.street !== 'preflop') return false
  const t = d.action.type
  return t === 'call' || t === 'bet' || t === 'raise'
}

/** Is this decision a preflop raise (`bet`/`raise`)? — the PFR condition (a subset of VPIP). */
function isPfrAction(d: HeroDecision): boolean {
  if (d.street !== 'preflop') return false
  const t = d.action.type
  return t === 'bet' || t === 'raise'
}

/**
 * The mutable per-slice tallies we fold each record into, before deriving the immutable
 * {@link HeroStats}. One of these accumulates "overall", and one per {@link Position} bucket. Kept as a
 * single fold (one pass over the records) so there is no second aggregation — the same discipline
 * `mastery.ts` keeps over the drill records.
 */
interface Tally {
  /** Hands counted in this slice (the VPIP/PFR/AF denominator). */
  hands: number
  /** Hands with a voluntary preflop action (VPIP numerator). */
  vpipHands: number
  /** Hands with a preflop raise (PFR numerator). */
  pfrHands: number
  /** `bets + raises` across all streets (AF numerator). */
  aggressive: number
  /** `call`s across all streets (AF denominator). */
  calls: number
  /** Hands where the hero open-raised preflop and then faced a re-raise (fold-to-3bet denominator). */
  facedThreeBet: number
  /** Of {@link facedThreeBet}, those where the hero folded to it (fold-to-3bet numerator). */
  foldedToThreeBet: number
}

/** A fresh, zeroed {@link Tally}. */
function emptyTally(): Tally {
  return {
    hands: 0,
    vpipHands: 0,
    pfrHands: 0,
    aggressive: 0,
    calls: 0,
    facedThreeBet: 0,
    foldedToThreeBet: 0,
  }
}

/**
 * Fold one record's hero {@link HeroDecision}s into a {@link Tally}. Walks `decisions` once (they are
 * in order) and updates every counter the record's data supports:
 *
 * - VPIP/PFR/AF need only `decisions`, so they always update (v1 and v2 alike).
 * - Fold-to-3bet needs the per-decision `facing` AND the record's `bigBlind` (v2 only). We find the
 *   hero's **open**: their FIRST preflop raise made into an *unraised* pot — a genuine RFI, detected
 *   by that raise's own faced `currentBet === record.bigBlind` (limps keep `currentBet` at the BB, so
 *   raising over limpers still qualifies; a first raise facing a higher `currentBet` is a cold 3bet,
 *   NOT an open). Once the open is found, the hero's **next** preflop decision facing
 *   `currentBet > open` IS their immediate response to the 3bet: `fold` → numerator (and denominator);
 *   anything else (call / 4bet / …) → denominator only. We then STOP — a later fold to a 4bet/5bet is
 *   not a fold-to-3bet. A hand that never opened into an unraised pot, that opened but was never
 *   3bet, or whose `bigBlind` / relevant `facing` is missing, contributes to neither (excluded from
 *   the denominator) — the subtle part the ticket calls out.
 */
function tallyRecord(tally: Tally, record: HandHistoryRecord): void {
  tally.hands += 1

  let vpip = false
  let pfr = false
  // The hero's own open raise-to amount (a "raise to" total) — the level a 3bet must exceed. null
  // until the hero opens into an unraised pot; only then can the hand qualify for fold-to-3bet.
  let heroOpenRaiseTo: number | null = null
  let facedReRaise = false
  let foldedToReRaise = false
  // Once the response to the 3bet is evaluated, stop touching fold-to-3bet for this hand (a later
  // fold to a 4bet/5bet must NOT count as a fold to the 3bet).
  let threeBetResolved = false

  for (const d of record.decisions) {
    if (isVpipAction(d)) vpip = true
    if (isPfrAction(d)) pfr = true

    const t = d.action.type
    if (t === 'bet' || t === 'raise') tally.aggressive += 1
    else if (t === 'call') tally.calls += 1

    if (d.street !== 'preflop') continue

    // Fold-to-3bet derivation, walking preflop decisions in order. Once the hero has opened, their
    // next preflop decision facing a higher currentBet is the 3bet of that open — evaluate exactly
    // that one decision, then stop.
    if (
      !threeBetResolved &&
      heroOpenRaiseTo !== null &&
      d.facing !== undefined &&
      d.facing.currentBet > heroOpenRaiseTo
    ) {
      facedReRaise = true
      if (t === 'fold') foldedToReRaise = true
      threeBetResolved = true
    }
    // Record the hero's open-raise-to AFTER the 3bet check above, so the open itself (whose own
    // `facing.currentBet` is the pre-open level) is never mistaken for facing its own raise. The open
    // is the FIRST preflop raise into an UNRAISED pot — detected by `facing.currentBet === bigBlind`
    // (a genuine RFI; raising over limpers still qualifies). A first raise facing a higher level is a
    // cold 3bet, not an open. Missing `bigBlind` or `facing` → cannot classify → not an open.
    if (
      heroOpenRaiseTo === null &&
      (t === 'bet' || t === 'raise') &&
      'amount' in d.action &&
      record.bigBlind !== undefined &&
      d.facing !== undefined &&
      d.facing.currentBet === record.bigBlind
    ) {
      heroOpenRaiseTo = d.action.amount
    }
  }

  if (vpip) tally.vpipHands += 1
  if (pfr) tally.pfrHands += 1
  if (facedReRaise) {
    tally.facedThreeBet += 1
    if (foldedToReRaise) tally.foldedToThreeBet += 1
  }
}

/** Build a {@link RateStat} from a numerator + denominator, guarding the zero-denominator case. */
function rate(count: number, denominator: number): RateStat {
  return { count, denominator, fraction: denominator === 0 ? null : count / denominator }
}

/** Derive the immutable {@link HeroStats} from an accumulated {@link Tally}. */
function finalize(tally: Tally): HeroStats {
  return {
    hands: tally.hands,
    vpip: rate(tally.vpipHands, tally.hands),
    pfr: rate(tally.pfrHands, tally.hands),
    aggressionFactor: {
      aggressive: tally.aggressive,
      calls: tally.calls,
      // Guarded ratio: null when calls === 0 (don't divide) so Infinity/NaN never reaches a consumer.
      ratio: tally.calls === 0 ? null : tally.aggressive / tally.calls,
      hands: tally.hands,
    },
    foldToThreeBet: rate(tally.foldedToThreeBet, tally.facedThreeBet),
  }
}

/**
 * The hero's {@link Position} for a record, or `undefined` when it cannot be placed in a bucket.
 * REUSES `classifyPosition` from `@holdem/coach` (the 5-bucket model) rather than reinventing seat
 * geometry — we feed it the minimal `{ seat, buttonIndex, numPlayers }` it reads, built straight from
 * the record: `heroSeat → seat`, `buttonIndex → buttonIndex`, `seatCount → numPlayers`.
 *
 * `classifyPosition` is typed to a full {@link DecisionContext}, but it only ever destructures those
 * three fields (it is pure seat arithmetic — see `position.ts`). Rather than fabricate a meaningless
 * full context (hole cards, board, legal actions, …) we don't have at stats time, we build exactly the
 * fields it reads and assert the narrowed shape — duplicating zero geometry, which is the point.
 *
 * Returns `undefined` for a v1 record with no `buttonIndex` (position unknown → excluded from the
 * by-position split, still counted overall).
 */
function positionOf(record: HandHistoryRecord): Position | undefined {
  if (record.buttonIndex === undefined) return undefined
  const ctx: Pick<DecisionContext, 'seat' | 'buttonIndex' | 'numPlayers'> = {
    seat: record.heroSeat,
    buttonIndex: record.buttonIndex,
    numPlayers: record.seatCount,
  }
  return classifyPosition(ctx as DecisionContext)
}

/**
 * Project a hero's hand-history records into {@link AggregatedHeroStats} — the one place these numbers
 * are computed. A single pass folds each record into the "overall" tally and, when its `buttonIndex`
 * places it, into that {@link Position}'s tally; then each tally is finalized. Pure: the store reads
 * the records, this projects them; no re-aggregation, no I/O, no `Date`, no randomness.
 *
 * @param records The hero's hand-history records (what `HandHistoryStore.list()` returns), in any
 *   order — order does not affect the aggregates. May include v1 records lacking `buttonIndex` /
 *   `facing`; those are tolerated (counted where their data supports it, never crashing).
 */
export function aggregateHeroStats(records: readonly HandHistoryRecord[]): AggregatedHeroStats {
  const overall = emptyTally()
  const byPosition = new Map<Position, Tally>()

  for (const record of records) {
    tallyRecord(overall, record)

    const position = positionOf(record)
    if (position === undefined) continue // v1 record (no buttonIndex): overall only, no bucket.
    let bucket = byPosition.get(position)
    if (bucket === undefined) {
      bucket = emptyTally()
      byPosition.set(position, bucket)
    }
    tallyRecord(bucket, record)
  }

  const finalizedByPosition = new Map<Position, HeroStats>()
  for (const [position, tally] of byPosition) {
    finalizedByPosition.set(position, finalize(tally))
  }

  return { overall: finalize(overall), byPosition: finalizedByPosition }
}
