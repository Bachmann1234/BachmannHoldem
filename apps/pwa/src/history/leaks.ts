/**
 * Play-side **leak detection** — the pedagogy heart of M6 ([[0088-leak-detection]], the second and third
 * acceptance criteria of [[0010-stats-and-leak-detection]]). The aggregation (`stats.ts`, ticket 0087)
 * turns the durable hand log into {@link AggregatedHeroStats}; this turns those stats into **named,
 * actionable leaks** ("you over-fold the big blind") — and, the load-bearing guard, **never calls a leak
 * on too thin a sample**.
 *
 * This is the play-side analog of `drills/mastery.ts`, and it borrows its discipline wholesale:
 *
 * - **Pure function of the stats, never a re-read of the records.** We reason ONLY over
 *   {@link AggregatedHeroStats}; we never touch the hand log. No second aggregation, no I/O, no `Date`,
 *   no randomness — exactly like `mastery.ts` reads only the {@link DrillProgressRecord}s.
 * - **The sample-size gate is mandatory and explicit.** Each leak keys off ONE stat, and that stat has
 *   its OWN named sample threshold (the analog of `MASTERY_REPS_THRESHOLD`), documented as the tunable
 *   knob it is. A leak is NEVER returned `confirmed` below its sample — that is the whole point of the
 *   milestone: per `docs/LEARNING-APPROACH.md`, flagging a leak on too few hands is *worse* than silence.
 * - **Data, not strings.** Each {@link DetectedLeak} carries a stable `key`, a minimal honest `description`
 *   (plain prose, but it is DATA the UI renders — no markup), the offending stat's value, the sample size
 *   it was judged on, and (for the pending state) the shortfall. The Stats UI ([[0089-stats-screen]])
 *   owns all presentation — the same seam split as `masteryByConcept` (data) vs `formatMastery` (strings).
 *
 * **The tri-state — the requirement, not collapsible.** Every candidate leak resolves to ONE of three
 * {@link LeakStatus} states, and the middle one must be first-class:
 *
 * - `'confirmed'` — the stat meets its minimum sample AND crosses the leak threshold → an actionable leak.
 * - `'pending'` — the stat is trending leak-ward (a non-null, threshold-crossing value) but its sample is
 *   below the minimum → reported WITH `handsNeeded` (the "keep playing, I need N more hands before I can
 *   call this" cue). This is distinct from both "confirmed" and "clear"; do not fold it into either.
 *   `pending` is reserved for a genuinely trending-but-thin stat — never a no-data or measured-and-fine one.
 * - `'clear'` — not trending: EITHER no data at all (null fraction/ratio, or an absent slice) OR enough
 *   sample and not crossing the threshold → no leak, and no directional cue. **We OMIT `clear` candidates
 *   from the returned list** (a clear stat is not a leak to surface); only `confirmed` and `pending` are
 *   returned. A no-data stat is silent, not a contradictory "need N more" nag — silence beats a bad signal.
 *
 * **Each stat has its OWN sample denominator — the classic cry-wolf trap.** VPIP/PFR/AF are judged over
 * `hands` (hands played). Fold-to-3bet is judged over its NARROWER `foldToThreeBet.denominator` ("opened
 * then faced a 3bet"), which is far smaller — so the BB-over-fold leak gates on THAT, not total hands.
 * Gating fold-to-3bet on hands-played would let a 60% fold over 3 qualifying spots ride on a 200-hand
 * sample. We gate every leak on the denominator of the exact stat it reads.
 *
 * **Null fractions/ratios are "no data", never zero.** `RateStat.fraction` is `null` when
 * `denominator === 0`; `AggressionStat.ratio` is `null` when `calls === 0`. Treating null as 0 would read
 * a stat with no sample as "folds 0%" / "perfectly passive" and fire a false leak. Null → no data → we
 * make NO directional claim → the candidate is `clear` (omitted, silent), never `pending` and never
 * `confirmed`. A maximally aggressive player (`calls === 0`, null AF) is silent, not nagged "low aggression".
 *
 * **Absent position slices are "unseen".** A {@link Position} with no countable hands is ABSENT from
 * `byPosition` (not a zeroed entry). The BB leak reads the `big-blind` slice; when it is absent it is a
 * no-data stat — `value: null` → `clear` (silent), never pending and never a confirmed leak.
 */

import type { Position } from '@holdem/coach'
import type { AggregatedHeroStats, AggressionStat, HeroStats, RateStat } from './stats.js'

/**
 * The stable identity of a detectable leak — one per rule below. A string-union key (not a free-form
 * string) so the UI can switch on it for richer copy/links and tests can assert exact identities. New
 * rules extend this union; the set is deliberately small (a couple of well-gated, true leaks beat a wall
 * of speculative ones — the ticket's honest-framing note).
 */
export type LeakKey = 'over-fold-big-blind' | 'too-passive' | 'too-loose-vpip' | 'too-tight-vpip'

/**
 * The tri-state of a candidate leak — the milestone's core structure. `'clear'` exists in the model (so
 * the state is *nameable*) but `clear` candidates are omitted from {@link detectLeaks}' result; only
 * `'confirmed'` and `'pending'` are returned. Never collapse `'pending'` into either neighbour — telling
 * the learner "keep playing, I need N more hands" is the entire pedagogy guard.
 */
export type LeakStatus = 'confirmed' | 'pending' | 'clear'

/**
 * One detected leak — plain structured DATA for the UI to render (no formatting strings beyond the
 * minimal honest `description`). Carries everything the UI needs to phrase the cue: the stable `key`, the
 * tri-state `status`, the measured `value`, the `sample` it was judged on, and — for `pending` — the
 * `handsNeeded` shortfall. A returned leak always carries a non-null, leak-ward `value`: a no-data stat
 * (null `fraction`/`ratio`, or an absent slice) is `clear` (silent) and never appears in the output.
 */
export interface DetectedLeak {
  /** Stable identity of the rule that produced this (switchable union, not free-form). */
  readonly key: LeakKey
  /** Tri-state — `'confirmed'` (actionable) or `'pending'` (below sample). `'clear'` is never returned. */
  readonly status: LeakStatus
  /**
   * A minimal, honest, plain-prose description of the tendency — DATA the UI renders, not markup. A leak
   * is a coachable signal, not a scolding (the learning doc): it names the stat the learner can see. The
   * copy reflects the status (a `pending` description is hedged: "may be …, keep playing").
   */
  readonly description: string
  /**
   * The offending stat's measured value: a `0..1` fraction for rate leaks (VPIP, fold-to-3bet), the AF
   * `ratio` for the aggression leak. `null` when the stat had NO sample (null `fraction`/`ratio`) — never
   * coerced to 0 (which would read as a false extreme).
   */
  readonly value: number | null
  /** The sample size this candidate was judged on — the denominator of the EXACT stat it keys off. */
  readonly sample: number
  /**
   * For `'pending'`: how many more qualifying hands are needed to reach the stat's sample threshold
   * (`threshold - sample`, always `>= 1`). `0` for `'confirmed'` (the gate is already met). This is the
   * "need N more hands" cue.
   */
  readonly handsNeeded: number
}

// ---------------------------------------------------------------------------------------------------
// Sample-size thresholds — the tunable knobs (mirroring `MASTERY_REPS_THRESHOLD`). One per gated stat,
// because each stat's denominator is a different thing and gets thin at a different rate. These are the
// most important numbers in the milestone: set them too low and we cry wolf, too high and we never speak.
// ---------------------------------------------------------------------------------------------------

/**
 * Minimum **hands played** before VPIP/PFR-based leaks (too-loose / too-tight) are trusted to fire. VPIP
 * is a preflop-frequency stat measured over every hand, so it stabilises relatively quickly — but a
 * dozen hands can still swing it 20 points on variance alone. 30 is the conventional floor below which a
 * preflop-frequency read is treated as noise (well short of the hundreds a full HUD wants, but enough to
 * stop the worst small-sample swings). Tunable: raise for a stricter "don't speak yet", lower to surface
 * leaks sooner at the cost of more false positives.
 */
export const VPIP_SAMPLE_THRESHOLD = 30

/**
 * Minimum **hands played** before the aggression-factor leak (too-passive) is trusted. AF is tallied over
 * *actions across all streets*, but it is still keyed off `hands`; like VPIP it needs a real run of hands
 * before "this player only ever calls" is a tendency rather than a cold deck. Set equal to
 * {@link VPIP_SAMPLE_THRESHOLD} (30) — both are "hands played" frequency reads of comparable noisiness.
 */
export const AGGRESSION_SAMPLE_THRESHOLD = 30

/**
 * Minimum **fold-to-3bet opportunities** (the NARROW "opened then faced a 3bet" denominator, NOT hands
 * played) before the over-fold-the-big-blind leak is trusted. This denominator is *much* smaller than
 * hands played — a player can play 200 hands and face only a handful of 3bets after opening from the BB —
 * so the threshold is correspondingly smaller (15). This is the gate that most directly prevents the
 * canonical "cry wolf on 3 hands" failure: we gate on the stat's OWN qualifying count, never on total
 * hands. Tunable, but keep it gating the narrow denominator.
 */
export const FOLD_TO_THREE_BET_SAMPLE_THRESHOLD = 15

// ---------------------------------------------------------------------------------------------------
// Leak thresholds — the value a stat must cross to be a leak (given enough sample). Also tunable knobs.
// Documented inline at each rule so the choice (and its direction) is auditable.
// ---------------------------------------------------------------------------------------------------

/**
 * Fold-to-3bet rate in the big blind at or above which the hero is "over-folding the BB" — the canonical
 * leak. Folding too often to a 3bet after defending the blind is exploitable (opponents can 3bet light to
 * steal). 0.70 is intentionally generous: some folding is correct, and we only flag a tendency that is
 * clearly past honest defence, not a marginally-tight-but-fine player. Tunable downward to be stricter.
 */
export const OVER_FOLD_BIG_BLIND_THRESHOLD = 0.7

/**
 * Aggression factor at or below which the hero is "too passive" — calling far more than betting/raising.
 * AF around 1 (bets+raises ≈ calls) is the rough boundary between a passive and an active style; below ~1
 * the player is leading with the worse line (calling) too often. 1.0 is the documented call-it-passive
 * line. Tunable upward for a stricter aggression standard.
 */
export const TOO_PASSIVE_AF_THRESHOLD = 1.0

/**
 * VPIP at or above which the hero plays "too loose" — voluntarily entering too many pots. Healthy 6-max
 * VPIP sits roughly in the low-to-mid 20s%; persistent play above the low-40s% means defending far too
 * wide a range. 0.40 is the documented "clearly too loose" line (above sound aggressive ranges, not
 * merely on the aggressive side of fine). Tunable.
 */
export const TOO_LOOSE_VPIP_THRESHOLD = 0.4

/**
 * VPIP at or below which the hero plays "too tight" — folding too many playable hands preflop, leaving
 * value on the table and becoming readable. Sub-15% VPIP in a 6-max game is the conventional "nit" line.
 * 0.15 is the documented "clearly too tight" floor. Tunable upward to nudge passive-tight players sooner.
 */
export const TOO_TIGHT_VPIP_THRESHOLD = 0.15

/**
 * Resolve ONE candidate leak from a measured value, the threshold it must cross, the sample it was judged
 * on, and that stat's sample gate — applying the tri-state uniformly so every rule gates the same way.
 *
 * The `crosses` predicate (passed in, since "over X" vs "under X" differs per rule) answers "is this
 * value leak-ward?". A candidate is emitted ONLY when the stat is genuinely **trending leak-ward** — a
 * non-null value that crosses the threshold. Everything else is silent. The status then falls out of the
 * one remaining question — *enough sample?*:
 *
 * - **Not trending** — either **no data** (`value === null`, denominator 0: null fraction/ratio, or an
 *   absent slice) OR **measured and fine** (a value that doesn't cross): `clear`. No data ⇒ no directional
 *   claim ⇒ silence. We never tell the learner "you may be over-X" off a stat we cannot even measure.
 * - **Trending + enough sample**: `confirmed` (the only path to actionable).
 * - **Trending + below sample**: `pending` with `handsNeeded = max(1, threshold - sample)` — the genuinely
 *   useful "keep playing, I need N more of these spots before I can call it" cue.
 *
 * Returns `null` for the `clear` case so {@link detectLeaks} can simply skip it; a non-null return is
 * always a `confirmed` or `pending` {@link DetectedLeak} on a non-null, leak-ward value.
 */
function resolveLeak(args: {
  readonly key: LeakKey
  readonly value: number | null
  readonly sample: number
  readonly sampleThreshold: number
  readonly crosses: (value: number) => boolean
  /** Description for the actionable (`confirmed`) state — the leak named plainly. */
  readonly confirmedDescription: string
  /** Description for the `pending` state — hedged ("may be …, keep playing"). */
  readonly pendingDescription: string
}): DetectedLeak | null {
  const { key, value, sample, sampleThreshold, crosses } = args
  const hasSample = sample >= sampleThreshold
  // value === null means denominator 0 (null fraction/ratio) or an absent slice: no data to judge, so it
  // cannot be leak-ward. With no value we make NO directional claim — the candidate is clear (silent).
  const trending = value !== null && crosses(value)

  // Not trending — either no data at all (value === null) OR measured-and-fine — is the silent case: we
  // never make a directional claim we cannot back with a non-null, leak-ward value. Clear regardless of
  // sample, so a brand-new player and a maximally aggressive player get silence, not a backwards nag.
  if (!trending) return null

  // Trending leak-ward. Enough sample → confirmed (actionable); below sample → pending with the
  // "need N more hands" cue. This is the ONLY path that emits a candidate.
  if (hasSample) {
    return {
      key,
      status: 'confirmed',
      description: args.confirmedDescription,
      value,
      sample,
      handsNeeded: 0,
    }
  }
  return {
    key,
    status: 'pending',
    description: args.pendingDescription,
    value,
    sample,
    handsNeeded: Math.max(1, sampleThreshold - sample), // the "need N more hands" cue, always >= 1.
  }
}

/**
 * The big-blind over-fold rule — keyed off the `big-blind` slice's {@link RateStat} fold-to-3bet, gated on
 * its NARROW `denominator` ("opened then faced a 3bet from the BB"), never on hands played. An ABSENT
 * `big-blind` slice (unseen position) reads as a no-data stat: `value: null` → `clear` (silent), never
 * pending and never confirmed — we make no over-fold claim until we have actually seen the BB defend a 3bet.
 */
function detectOverFoldBigBlind(bb: HeroStats | undefined): DetectedLeak | null {
  const stat: RateStat | undefined = bb?.foldToThreeBet
  return resolveLeak({
    key: 'over-fold-big-blind',
    // null fraction (denominator 0) and an absent slice both collapse to null — "no data", not 0%.
    value: stat?.fraction ?? null,
    sample: stat?.denominator ?? 0,
    sampleThreshold: FOLD_TO_THREE_BET_SAMPLE_THRESHOLD,
    crosses: (v) => v >= OVER_FOLD_BIG_BLIND_THRESHOLD,
    confirmedDescription:
      'You fold to 3-bets in the big blind a lot. Defending too few of your blinds lets opponents 3-bet you light to steal, so look to continue more often.',
    pendingDescription:
      'You may be over-folding the big blind to 3-bets, but I need more of these spots before I can call it. Keep playing.',
  })
}

/**
 * The too-passive rule — keyed off overall aggression factor, gated on hands played. The `calls === 0`
 * case (AF `ratio` is `null`) is handled explicitly: a player with zero calls is the OPPOSITE of passive
 * (all bets/raises), so a null ratio is "not trending passive" and `resolveLeak` leaves it `clear`
 * (silent) — never a backwards "your aggression is looking low" pending. `value: null` → no leak at all.
 */
function detectTooPassive(af: AggressionStat): DetectedLeak | null {
  return resolveLeak({
    key: 'too-passive',
    // ratio is null when calls === 0 — that is a maximally aggressive player, never a passive leak. Pass
    // null so it is never confirmed and never trending; the sample logic then leaves it clear.
    value: af.ratio,
    sample: af.hands,
    sampleThreshold: AGGRESSION_SAMPLE_THRESHOLD,
    crosses: (v) => v <= TOO_PASSIVE_AF_THRESHOLD,
    confirmedDescription:
      'You play passively: you call a lot more than you bet or raise. Taking the lead with your strong hands and good draws wins more than calling along.',
    pendingDescription:
      'Your aggression is looking low, but I need more hands before I can call it a leak. Keep playing.',
  })
}

/** The too-loose VPIP rule — keyed off overall VPIP, gated on hands played. */
function detectTooLooseVpip(vpip: RateStat, hands: number): DetectedLeak | null {
  return resolveLeak({
    key: 'too-loose-vpip',
    value: vpip.fraction, // null when no hands — "no data", not 0%.
    sample: hands,
    sampleThreshold: VPIP_SAMPLE_THRESHOLD,
    crosses: (v) => v >= TOO_LOOSE_VPIP_THRESHOLD,
    confirmedDescription:
      'You enter too many pots before the flop. Playing a tighter range out of position saves you from tough spots with weak holdings.',
    pendingDescription:
      'You may be playing too many hands before the flop, but I need more hands before I can call it. Keep playing.',
  })
}

/** The too-tight VPIP rule — keyed off overall VPIP, gated on hands played. */
function detectTooTightVpip(vpip: RateStat, hands: number): DetectedLeak | null {
  return resolveLeak({
    key: 'too-tight-vpip',
    value: vpip.fraction, // null when no hands — "no data", not 0%.
    sample: hands,
    sampleThreshold: VPIP_SAMPLE_THRESHOLD,
    crosses: (v) => v <= TOO_TIGHT_VPIP_THRESHOLD,
    confirmedDescription:
      'You play very few hands before the flop. A range this tight leaves value on the table and is easy for opponents to read, so open up a little.',
    pendingDescription:
      'You may be playing too few hands before the flop, but I need more hands before I can call it. Keep playing.',
  })
}

/**
 * Detect every leak over the aggregated stats — the public entry point ([[0088]]). Returns ONLY
 * `'confirmed'` and `'pending'` {@link DetectedLeak}s (clear candidates are omitted); the `pending` ones
 * carry the `handsNeeded` "need N more hands" cue. Order is stable (the rule order below) so the UI and
 * tests see a deterministic list. Pure: a stats snapshot in, a leak list out — no I/O, no `Date`, no
 * randomness.
 *
 * Note the per-stat denominators (the cry-wolf guard): VPIP/AF read `overall.hands`; the BB over-fold
 * reads the `big-blind` slice's narrow `foldToThreeBet.denominator`. Too-loose and too-tight VPIP are
 * mutually exclusive by construction (their thresholds don't overlap), so at most one fires.
 *
 * @param stats The aggregated hero stats (from `aggregateHeroStats`). Reasoned over directly — never a
 *   re-read of the hand log.
 */
export function detectLeaks(stats: AggregatedHeroStats): readonly DetectedLeak[] {
  const { overall } = stats
  const candidates: readonly (DetectedLeak | null)[] = [
    detectOverFoldBigBlind(stats.byPosition.get('big-blind')),
    detectTooPassive(overall.aggressionFactor),
    detectTooLooseVpip(overall.vpip, overall.hands),
    detectTooTightVpip(overall.vpip, overall.hands),
  ]
  return candidates.filter((c): c is DetectedLeak => c !== null)
}

/** Re-exported for tests/consumers that switch on the canonical position key. */
export type { Position }
