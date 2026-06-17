/**
 * Preflop starting-hand chart — the deterministic, chart-based half of the coach
 * (ticket 0022).
 *
 * Postflop the coach reads equity against an assumed range and grades the *decision* with
 * pot-odds math ([[0021-coach-decision-verdict]]). Preflop, equity-vs-a-range is a fuzzy
 * guide and a beginner cannot run a Monte-Carlo sim in their head — so this module gives the
 * crisp, memorable thing a starting-hand chart gives: take the two hole cards, drop the
 * holding into a **strength tier**, and hand back plain open/fold guidance. Per
 * [LEARNING-APPROACH.md] the chart is a *teaching artifact* — "teach the principle, not a
 * solver output" — so the {@link PreflopTier} ladder and the rationale strings carry as much
 * of the lesson as the classification itself.
 *
 * **This is a chart lookup, not an equity sim.** We deliberately run *no* Monte-Carlo here:
 * the whole point is a deterministic, explainable table a learner can internalise. The chart
 * is declared as a handful of {@link parseRange} token strings (the same `"AA" / "AKs" /
 * "AKo"` syntax the bots' range tables use, [[0018-bot-hand-reading]]), and classification is
 * a pure *membership test* — does the canonical combo of the hole cards appear in a tier's
 * parsed range? — so we reuse the odds/bots combo machinery instead of hand-rolling a
 * parallel rank-comparison engine. (A future ticket may cross-check a tier's boundary against
 * an equity read, but the classification never needs one.)
 *
 * Purity: zero I/O, no Node/DOM/network, no randomness. Imports only `@holdem/*`. Feeds the
 * coach CLI wiring ([[0023-coach-cli-wiring]]).
 */

import { formatCard, parseCards, rankOf, suitOf, type Action, type Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import { parseRange, type Combo, type Range } from '@holdem/odds'
import type { ActionVerdict, Concept } from './verdict.js'
import {
  classifyPosition,
  EARLY_SEATS,
  isInPosition,
  WIDENING_POSITIONS,
  type Position,
} from './position.js'
import { formatRaiseSize, openFoldRationale, TIER_RATIONALE } from './rationale.js'

// Re-export the position model's public surface (ticket 0058 split it into `position.ts`) so the
// `@holdem/coach` API — what `src/index.ts` re-exports — is byte-for-byte unchanged by the move.
// `WIDENING_POSITIONS` / `isInPosition` were never public, so they stay internal (imported, not
// re-exported). The rationale builders (`rationale.ts`) were always internal too.
export { classifyPosition, EARLY_SEATS }
export type { Position }

/**
 * The strength ladder a starting hand classifies into, strongest first.
 *
 * Five coarse buckets — deliberately few, so a learner maps a hand onto one with a single
 * named choice the way the bots' {@link RangeWidth} buckets work:
 *
 * - `premium` — the top of the deck: hands you always want chips in with (big pairs, AK).
 * - `strong` — clear value opens (good pairs, the suited broadways, strong aces).
 * - `playable` — speculative but profitable in position (small pairs, suited connectors,
 *   weaker suited aces/broadways) — play them, but with a plan.
 * - `marginal` — the thin edge of the chart: offsuit broadways and gappers you open only
 *   in late position / when folded to, and muck under pressure.
 * - `trash` — everything else: the long tail of unconnected, unsuited junk. Fold.
 */
export type PreflopTier = 'premium' | 'strong' | 'playable' | 'marginal' | 'trash'

/**
 * The chart, the teaching artifact at the heart of this module: each tier (bar the `trash`
 * catch-all) backed by a {@link parseRange} token string in the bots' range syntax — pairs
 * (`"77"`), suited (`"AKs"`), offsuit (`"AKo"`).
 *
 * **The ranges are cumulative / nested, widest-tier-last, exactly like the bots'
 * `RANGE_TEXT`.** A stronger tier's hands are *not* repeated in a weaker tier here; instead
 * {@link CHART_ORDER} walks the tiers strongest-first and returns the *first* range a hand
 * falls in, so each holding lands in its single strongest bucket (AA is `premium`, never
 * `strong`). Listing each hand in exactly one tier keeps the chart readable as a literal
 * starting-hand chart, and the strongest-first scan makes the tiers mutually exclusive in
 * effect. See {@link classifyStartingHand}.
 *
 * These boundaries are a *believable, teachable* opening chart, not a solver's output — tune
 * them freely as the lesson demands; the classifier logic does not depend on the specific
 * hands, only on the tier ordering.
 */
export const PREFLOP_CHART: Readonly<Record<Exclude<PreflopTier, 'trash'>, string>> = {
  // The top of the deck — always raise.
  premium: 'AA, KK, QQ, JJ, AKs, AKo',
  // Clear value opens: the rest of the big pairs, suited broadways, strong aces.
  strong: 'TT, 99, AQs, AQo, AJs, ATs, KQs',
  // Speculative-but-profitable: small/medium pairs, suited connectors, weaker suited
  // aces & broadways — hands that flop well and play nicely in position.
  playable:
    '88, 77, 66, 55, 44, 33, 22, ' +
    'AJo, ATo, A9s, A8s, A7s, A6s, A5s, A4s, A3s, A2s, ' +
    'KJs, KTs, QJs, QTs, JTs, KQo, ' +
    'T9s, 98s, 87s, 76s, 65s, 54s',
  // The thin edge: offsuit broadways and a couple of suited gappers you open only in late
  // position and fold to pressure.
  marginal: 'KJo, KTo, QJo, QTo, JTo, J9s, T8s, 97s, 86s, 75s, 64s, 53s, 43s',
} as const

/**
 * The tiers in strongest→weakest scan order. {@link classifyStartingHand} walks this and
 * returns the first tier whose range contains the hand, so a holding always classifies to
 * its single strongest matching tier (the {@link PREFLOP_CHART} nesting decision). `trash`
 * is the terminal fall-through and is intentionally absent — a hand reaches it only by
 * matching none of the declared tiers.
 */
const CHART_ORDER: readonly Exclude<PreflopTier, 'trash'>[] = [
  'premium',
  'strong',
  'playable',
  'marginal',
]

/**
 * The pre-parsed chart ranges, keyed by tier, built once at module load. Parsing the tokens
 * eagerly turns each tier into a concrete {@link Range} (the flat list of two-card combos)
 * so {@link classifyStartingHand} is a cheap membership test with no per-call parsing — and
 * it surfaces a malformed chart token immediately at import rather than on first use.
 */
const PARSED_CHART: Readonly<Record<Exclude<PreflopTier, 'trash'>, Range>> = {
  premium: parseRange(PREFLOP_CHART.premium),
  strong: parseRange(PREFLOP_CHART.strong),
  playable: parseRange(PREFLOP_CHART.playable),
  marginal: parseRange(PREFLOP_CHART.marginal),
}

/**
 * The result of a preflop classification: the {@link PreflopTier} the holding lands in plus
 * the plain-language {@link rationale} for it. A flat, serialisable value (no engine state,
 * no randomness) — the hand-off shape the coach CLI ([[0023-coach-cli-wiring]]) renders.
 */
export interface StartingHandVerdict {
  /** The strength tier the holding classifies into (its single strongest match). */
  readonly tier: PreflopTier
  /** A short, human-readable line of open/fold guidance — the teaching takeaway. */
  readonly rationale: string
}

/**
 * Whether two combos are the *same physical holding* — the same two `Card` values, compared
 * order-insensitively. Cards are branded ints, so a combo is identified by its unordered
 * pair of values, exactly how the odds/bots code treats a combo (e.g. `parseRange`'s own
 * dedup key). We sort the two cards rather than test both orderings so the comparison reads
 * as "same set of cards".
 */
function sameCombo(a: Combo, b: Combo): boolean {
  const [aLo, aHi] = a[0] < a[1] ? a : [a[1], a[0]]
  const [bLo, bHi] = b[0] < b[1] ? b : [b[1], b[0]]
  return aLo === bLo && aHi === bHi
}

/**
 * Is `hand` (a concrete two-card combo) a member of `range`? A membership test by physical
 * holding — does the unordered card pair appear in the range's combo list. This is the
 * single reused primitive the classifier rests on; it does *no* rank reasoning of its own,
 * deferring entirely to the combos {@link parseRange} produced for each tier.
 */
function rangeContains(range: Range, hand: Combo): boolean {
  return range.some((combo) => sameCombo(combo, hand))
}

/**
 * Validate the hole cards in the odds/bots `RangeError` idiom: exactly two, and two
 * *distinct* cards (a player cannot hold the same physical card twice). Returns the pair as
 * a {@link Combo} on success. Mirrors `blockedByHero`'s checks in `@holdem/bots`.
 */
function validateHole(holeCards: readonly [Card, Card]): Combo {
  if (holeCards.length !== 2) {
    throw new RangeError(`holeCards must have exactly 2 cards, got ${holeCards.length}`)
  }
  const [a, b] = holeCards
  if (a === b) {
    throw new RangeError(`holeCards must be two distinct cards, got ${formatCard(a)} twice`)
  }
  return [a, b]
}

/**
 * Classify a two-card starting hand into its strength tier with plain open/fold guidance —
 * a pure chart lookup, no equity sim.
 *
 * **How it classifies.** The two hole cards *are* a concrete combo (`AKs` of a given two
 * suits is just two specific cards), and every chart tier is a parsed {@link Range} of such
 * combos — so we never need to canonicalise the hand into a `"AKs"`-style token ourselves:
 * `parseRange("AKs")` already expanded every suited AK into its four physical combos, and
 * `parseRange("AKo")` every offsuit one. Classification is therefore a direct membership
 * test of the hero's physical holding against each tier's combo set. Pair/suited/offsuit and
 * rank-ordering all fall out of that — `AsKs` matches a combo inside the `AKs` expansion,
 * `AsKh` one inside `AKo`, with no parallel rank logic here.
 *
 * **Strongest-first / mutual exclusivity.** We scan {@link CHART_ORDER} (premium → strong →
 * playable → marginal) and return the **first** tier that contains the hand, so a holding
 * always lands in its single strongest bucket — AA is `premium`, not also `strong`. A hand
 * matching no tier falls through to `trash`. This is what makes the tiers mutually exclusive
 * in effect even though the chart lists each hand once.
 *
 * Throws {@link RangeError} on malformed input (not exactly two cards, or two copies of the
 * same card), matching the odds/bots validation style.
 *
 * @example
 *   classifyStartingHand(parseCards('As Ah') as [Card, Card]).tier // 'premium'
 *   classifyStartingHand(parseCards('7h 6h') as [Card, Card]).tier // 'playable' (76s)
 *   classifyStartingHand(parseCards('7h 2c') as [Card, Card]).tier // 'trash'
 */
export function classifyStartingHand(holeCards: readonly [Card, Card]): StartingHandVerdict {
  const hand = validateHole(holeCards)

  for (const tier of CHART_ORDER) {
    if (rangeContains(PARSED_CHART[tier], hand)) {
      return { tier, rationale: TIER_RATIONALE[tier] }
    }
  }
  return { tier: 'trash', rationale: TIER_RATIONALE.trash }
}

/**
 * What the starting-hand chart recommends doing with the holding in this spot:
 *
 * - `'open'` — the chart says to put chips in (enter the pot / continue).
 * - `'fold'` — the chart says to give the hand up.
 *
 * This is the chart's *prescription* (position-aware across the whole opening range — 0054); the hero
 * is then graded on whether their action agreed with it — see {@link gradePreflop}.
 */
export type PreflopAdvice = 'open' | 'fold'

/**
 * A graded preflop decision — the chart-based analogue of the postflop {@link DecisionVerdict}
 * (ticket [[BUG-0001]]).
 *
 * Preflop, pot-odds-vs-equity is the *wrong* lens: it ignores position, fold equity, and implied
 * odds, so it folds textbook opens like AJs on the button. So we grade preflop off the
 * starting-hand chart instead — `classifyStartingHand` gives the tier, the chart's open/fold
 * guidance (position-aware across the whole opening range) gives the {@link advice}, and the hero is `good`
 * when their action matched that guidance and a `leak` when it did not. A flat, serialisable value
 * with no equity/EV fields — there is deliberately no pot-odds math here to contradict the chart.
 */
/**
 * The deterministic *decision trace* of a preflop verdict — *why* {@link gradePreflop} graded the
 * way it did (the audit trail this part of the project adds). A **derived, deterministic
 * by-product**: every field is read off the branch the grade already took ({@link classifyPosition},
 * the raise-size gates, the facing-raise vs. open vs. free-check path), never a new decision. Its
 * purpose is self-contained explainability — a human, or an AI a human pastes the ruling to, can see
 * which rule/band/mode fired and the inputs that selected it without re-deriving the chart logic.
 *
 * Every field is a plain, serialisable value, so the trace round-trips through the CLI sim's NDJSON
 * and any copy-to-clipboard blob exactly like the rest of the {@link PreflopVerdict}.
 */
export interface PreflopTrace {
  /** The {@link Position} bucket {@link classifyPosition} placed the hero in — the seat the rule keyed off. */
  readonly position: Position
  /** Whether the hero faced a raise — `ctx.currentBet > ctx.bigBlind` (an unraised pot is `false`). */
  readonly facingRaise: boolean
  /**
   * The raise size in big blinds — `Math.round(ctx.currentBet / ctx.bigBlind)`, the single rounded
   * integer that drives both the price-gate bands and the rationale label. `1` on an unraised pot
   * (the BB is the standing bet), so the recorded size always matches the band the hand was graded in.
   */
  readonly raiseBb: number
  /**
   * Which raise-size band selected the standard applied: `'unraised'` (an open / the BB option),
   * `'small-raise'` (a raise below {@link LARGE_RAISE_MIN_BB}), `'large-raise'` (≥
   * {@link LARGE_RAISE_MIN_BB} but below {@link THREE_BET_MIN_BB}), or `'3bet'` (≥
   * {@link THREE_BET_MIN_BB}). Derived from {@link raiseBb}.
   */
  readonly band: 'unraised' | 'small-raise' | 'large-raise' | '3bet'
  /**
   * Which grading mode the path took: `'open'` (the unraised opening chart), `'bb-defend'` (a big
   * blind defending a raise — the wide-defend rule, BUG-0007), `'cold-call'` (any other seat
   * continuing voluntarily vs a raise), or `'bb-option'` (the free-check short-circuit, where the BB
   * checks its option on an unraised pot).
   */
  readonly mode: 'open' | 'bb-defend' | 'cold-call' | 'bb-option'
  /**
   * On an *unraised* pot, whether the trash steal-promotion was available — a genuine steal spot
   * (the pot folded to the hero) in a widening seat, i.e. {@link isStealSpot}. `false` whenever the
   * hero is facing a raise or it is not a steal spot — it records whether the {@link STEAL_OPEN_RANGE}
   * promotion branch was even reachable for this open.
   */
  readonly stealSpot: boolean
}

export interface PreflopVerdict {
  /** The strength tier the holding classifies into (its single strongest match). */
  readonly tier: PreflopTier
  /** A short, human-readable line of open/fold guidance — the teaching takeaway. */
  readonly rationale: string
  /** What the chart recommends in this spot (position-aware across the whole opening range). */
  readonly advice: PreflopAdvice
  /** Whether the hero put chips in (any non-fold) or folded. */
  readonly heroContinued: boolean
  /**
   * The grade: `'good'` when the hero's action matched the chart {@link advice}, `'leak'` when it
   * did not — with one `'breakEven'` case. The chart gives a crisp open/fold call, so there is no
   * pot-odds coin-flip band preflop; the single `'breakEven'` preflop is the **optional steal**: the
   * bottom of a steal range ({@link STEAL_OPEN_RANGE}) is a hand you *may* open from a late/blind
   * steal seat but are never obliged to, so *folding* one is fine, not a leak (ticket 0060). Opening
   * it is still `'good'`. Every other open/fold is `'good'`/`'leak'`.
   */
  readonly verdict: ActionVerdict
  /**
   * The mental model this decision turns on — always `'ranges'` preflop. The starting-hand chart
   * *is* the ranges/strength-tier idea: it grades by sorting the holding into a {@link PreflopTier}
   * and consulting the range that tier represents, never by weighing equity against a price (the
   * postflop `'equity-vs-price'` lens, which preflop deliberately rejects). This is the cross-link to
   * the Foundations primer's ranges lesson ([[0042-foundations-primer]]); see {@link Concept}.
   */
  readonly concept: Concept
  /**
   * The deterministic {@link PreflopTrace} — *which* rule/band/mode fired and the inputs that
   * selected it. A derived, deterministic by-product of the branch this grade already took (it
   * records the rule applied, adding no decision logic), present on **every** verdict so a ruling is
   * self-explaining: a human or an AI reviewing it can see why the hand was graded as it was without
   * re-deriving the chart's position/raise-size logic.
   */
  readonly trace: PreflopTrace
}

/**
 * Price gate: the raise size — in big blinds — at or above which the pot is *expensive* enough that
 * the flatting range collapses to a value range. Below this is the small/standard-raise regime that
 * keeps a reasonable flatting range; at or above it the implied-odds math on speculative/marginal
 * junk stops working for a beginner, so we keep only the strong+ tiers and fold the rest. A *tunable
 * knob*: the single boundary between "small raise, flat reasonably" and "large raise, value only".
 * Expressed in big blinds because the BB is the unit the price scales against (`currentBet /
 * bigBlind`). See {@link facingRaiseAdvice} for the two regimes this and {@link THREE_BET_MIN_BB}
 * carve out.
 */
export const LARGE_RAISE_MIN_BB = 5

/**
 * Price gate: the raise size — in big blinds — at or above which we treat the action as a *3-bet*
 * (a re-raise, or an open so large it plays like one). Here the hand is taught as a 3-bet spot:
 * "3-bet or call". The *continue* range is the same value-only (strong+) cut as the large-raise
 * regime — a 3-bet does not tighten the range further; it only changes the teaching rationale. A
 * *tunable knob* modelling the 3-bet boundary coarsely with the existing tiers rather than a solver.
 * Sits above {@link LARGE_RAISE_MIN_BB} so a plain large open and an actual 3-bet can grade with
 * different rationale wording.
 */
export const THREE_BET_MIN_BB = 9

/**
 * The tiers in strongest→weakest order — a numeric strength index used by the facing-raise gates to
 * ask "is this holding at least as strong as tier X?". *Derived* from {@link CHART_ORDER} with
 * `trash` appended as the weakest rung, so every tier has a rank and the one hand-maintained
 * strongest-first ordering ({@link CHART_ORDER}) drives both the classifier scan and these gates —
 * a single edit to the tier order can't leave the two out of sync. Lower index = stronger.
 */
const TIER_STRENGTH: readonly PreflopTier[] = [...CHART_ORDER, 'trash']

/**
 * Is `tier` at least as strong as `floor`? A `<=` on {@link TIER_STRENGTH} indices (stronger tiers
 * sort first), the single comparison the price gates rest on — "keep the value tiers, fold the rest"
 * becomes `tierAtLeast(tier, 'strong')`.
 */
function tierAtLeast(tier: PreflopTier, floor: PreflopTier): boolean {
  return TIER_STRENGTH.indexOf(tier) <= TIER_STRENGTH.indexOf(floor)
}

/**
 * Is this a genuine *steal* spot — an unraised pot **folded to the hero**, nobody having voluntarily
 * entered? The binary gate the {@link STEAL_OPEN_RANGE} trash-promotion rests on (the correctness
 * fix): blasting junk like K7o *over limpers* is not a steal, it is a leak, so the steal promotion
 * must only fire when the hero can still take the pot uncontested.
 *
 * **Detecting a voluntary entrant.** A "steal" needs everyone before the hero to have folded. We scan
 * {@link DecisionContext.opponents} for any seat that has *chosen* to put chips in: it is still
 * `'active'`, has `committed >= ctx.bigBlind` this street, **and** is not the big-blind seat (the BB's
 * posted big blind is involuntary, not a limp/call). Any such opponent — a limper or a completed
 * small blind — means the pot is no longer folded to the hero, so this is not a steal spot.
 *
 * Note this is a deliberately coarse *binary* (folded-to-hero or not): it does **not** count limpers
 * or weigh pot odds — that is out of scope. It gates **only** the trash steal-promotion; the
 * tier-gated `playable`/`marginal` opens (iso-raising over a limper is a defensible standard open)
 * are unaffected. Pure: reads only redacted opponent views, no I/O.
 *
 * The big-blind seat is computed with the same HU-aware geometry the engine posts blinds with
 * (heads-up the **button is the small blind** and the other seat the big blind, so the BB is
 * `button+1`, not `button+2`) — otherwise the BB's involuntary post would be misread as a limp.
 */
function isStealSpot(ctx: DecisionContext): boolean {
  const bbSeat =
    ctx.numPlayers === 2
      ? (ctx.buttonIndex + 1) % ctx.numPlayers
      : (ctx.buttonIndex + 2) % ctx.numPlayers
  const someoneEntered = ctx.opponents.some(
    (o) => o.status === 'active' && o.committed >= ctx.bigBlind && o.seat !== bbSeat,
  )
  return !someoneEntered
}

/**
 * The supplementary **steal / heads-up opening range** layered on top of the tier rule (0054). The
 * single 6-max strength chart applied everywhere is the root of the heads-up/blind false negatives:
 * hands like K7o, A9o, T9o are `trash` on the chart yet are trivially profitable button & blind
 * steals (heads-up the button opens ~80%+ of hands). Rather than re-tier those hands — which would
 * corrupt the position-independent strength map the viewable chart ([[0050-starting-hand-chart-view]])
 * renders — we keep a separate, wider opening range that only the late/steal/heads-up path consults
 * to *promote* an otherwise-`trash` hand to `open`.
 *
 * A {@link parseRange} token string in the same syntax as the bots' `RANGE_TEXT`
 * ([[0018-bot-hand-reading]]). A *tunable knob*: a believable button/blind steal range (offsuit
 * broadways and aces, suited-king/queen junk, offsuit connectors) — not a solver's output. Widen or
 * tighten freely.
 *
 * **Invariant — only hands NOT already openable by tier.** Every hand here must be `trash` on
 * {@link PREFLOP_CHART}: {@link adviceFor} consults this range *only* in the `trash` branch (the
 * `premium`/`strong`/`playable`/`marginal` branches return first), so a hand that is also in a named
 * tier would be dead weight here and contradicts this set's purpose (promoting otherwise-foldable
 * junk). T8s/97s/86s/75s were removed because they live in {@link PREFLOP_CHART}.marginal — and the
 * suited/offsuit split keeps the rest distinct from the tiered hands (e.g. T9o/98o/87o here vs. the
 * suited T9s/98s/87s in `playable`). Deterministic and pure (a membership test, no Monte-Carlo).
 */
export const STEAL_OPEN_RANGE =
  'A9o, A8o, A7o, A6o, A5o, A4o, A3o, A2o, ' +
  'K9o, K8o, K7o, K6o, K5o, K9s, K8s, K7s, K6s, K5s, K4s, K3s, K2s, ' +
  'Q9o, Q8o, Q9s, Q8s, Q7s, Q6s, ' +
  'J9o, J8s, J7s, T9o, T8o, 98o, 87o, 76o, 65o, 54o'

/** The pre-parsed {@link STEAL_OPEN_RANGE}, built once at module load (parse eagerly, fail fast). */
const PARSED_STEAL_RANGE: Range = parseRange(STEAL_OPEN_RANGE)

/**
 * The chart's open/fold prescription for a tier in this spot — now position-aware across the **whole**
 * opening range, not just the `marginal` tier (ticket 0054). The hero's {@link Position} gates which
 * tiers open:
 *
 * - `premium` / `strong` — open from **every** position.
 * - `playable` — open from {@link Position.middle} / {@link Position.late} / the small/big blind, but **fold
 *   from early** at a full table: a winning 6-max reg does not open 87s/65s/76s/A2s/44 UTG.
 * - `marginal` — opens only in late position / steal seats (the pre-0054 behaviour, preserved):
 *   QJo/KTo/JTo fold UTG, open CO/BTN.
 * - `trash` — folds by default, but in a {@link WIDENING_POSITIONS} seat (late / small blind /
 *   heads-up button) a hand in the supplementary {@link STEAL_OPEN_RANGE} is promoted to `open`
 *   **only when the pot is folded to the hero** (`stealSpot`) — a genuine steal. Over a limper it is
 *   not a steal (raising junk over limpers is a leak), so the promotion does not fire (K7o/A9o/T9o on
 *   the button steal when folded to, but fold behind a limper).
 *
 * Heads-up gets the wide treatment for free: the heads-up button classifies {@link Position.late}, a
 * {@link WIDENING_POSITIONS} seat, so the steal range applies — a wider opening range than the 6-max
 * chart, as required. The heads-up **big blind** classifies `big-blind` (not widening) and never
 * reaches this function as an opener anyway (see {@link gradePreflop}'s invariant).
 *
 * **BB-open is unreachable.** An *unraised* big blind reaches {@link gradePreflop} only via the
 * `check` short-circuit (its free option), so the BB-open path through here is unreachable in normal
 * flow — but the correctness no longer rests silently on that: `big-blind` is excluded from
 * {@link WIDENING_POSITIONS}, so even if a BB combo did reach here it folds trash rather than stealing.
 */
function adviceFor(
  tier: PreflopTier,
  position: Position,
  hand: Combo,
  stealSpot: boolean,
): PreflopAdvice {
  const widening = WIDENING_POSITIONS.has(position)

  // Premium / strong open everywhere.
  if (tier === 'premium' || tier === 'strong') return 'open'

  // Playable speculative hands fold from early at a full table; open from middle/late/blinds. (An
  // iso-raise over a limper is a defensible standard open, so this is NOT gated on the steal spot.)
  if (tier === 'playable') return position === 'early' ? 'fold' : 'open'

  // Marginal opens only in late/steal seats (preserved pre-0054 behaviour; not steal-gated either).
  if (tier === 'marginal') return widening ? 'open' : 'fold'

  // Trash: fold by default, but a steal-range hand opens from a widening seat ONLY in a genuine steal
  // spot (the pot folded to the hero). Over a limper this is a leak, not a steal — no promotion.
  if (widening && stealSpot && rangeContains(PARSED_STEAL_RANGE, hand)) return 'open'
  return 'fold'
}

/**
 * The chart's *defend* prescription when the hero faces a raise — the advice plus a rationale that
 * describes the defend decision actually made, so the verdict line never contradicts itself (the
 * "fold to pressure" above a `Good` call-of-pressure bug this ticket fixes). A flat value computed
 * by {@link facingRaiseAdvice}; the rationale here *replaces* the static opening-tier label on the
 * facing-raise path.
 */
interface FacingRaiseAdvice {
  /** Continue (call/3-bet) or fold against the raise faced. */
  readonly advice: PreflopAdvice
  /** A self-consistent line describing the defend decision — never the open-chart label. */
  readonly rationale: string
  /**
   * The raise-size band this advice was graded under, for the {@link PreflopTrace} — `'3bet'` (≥
   * {@link THREE_BET_MIN_BB}), `'large-raise'` (≥ {@link LARGE_RAISE_MIN_BB}), or `'small-raise'`.
   * Returned here so the band and the advice come from the *same* place and can never disagree.
   */
  readonly band: 'small-raise' | 'large-raise' | '3bet'
  /**
   * The grading mode this advice took, for the {@link PreflopTrace}: `'bb-defend'` when the hero is
   * the big blind defending the raise, `'cold-call'` for any other seat continuing vs the raise.
   * Sourced here alongside the advice so the trace's mode can't drift from the rule applied.
   */
  readonly mode: 'bb-defend' | 'cold-call'
}

/**
 * The chart's open/fold-vs-a-*raise* prescription — the defend standard this ticket adds (0053),
 * widened for the big blind by BUG-0007. Unlike {@link adviceFor} (an *opening* chart), this grades
 * a hand the hero is *continuing with against a raise*, and tightens with the price faced. It also
 * distinguishes a **cold-call** (chips in voluntarily, no money already committed) from a **big-blind
 * defend** (already posted the blind, getting a discounted price, *closing* the action) — the BB
 * defends far wider, which is why grading it like an out-of-position cold-call over-folded the single
 * most common preflop spot (BUG-0007).
 *
 * - **Below {@link LARGE_RAISE_MIN_BB}** — a small / standard raise:
 *   - **Big blind:** a *defend*, not a cold-call. Continue everything down to `marginal` (the price
 *     discount + closing the action justify it), regardless of position; fold only the unconnected
 *     `trash` tail.
 *   - **Cold-call (any other seat):** keep a tighter flatting range — `strong`+ always; the
 *     speculative `playable` tier flats only *in position* (OOP it is a cold-call leak);
 *     `marginal`/`trash` fold.
 * - **At/above {@link LARGE_RAISE_MIN_BB}** — a large raise: the price has collapsed the range to
 *   value only. `strong`+ continue; everything else (speculative/marginal/trash) folds, in or out of
 *   position. The big blind gets no special widening here — vs a large raise even the discounted
 *   price is too poor, so it folds with everyone else; this preserves the 0053 behaviour that a BB
 *   call of a 6× raise with a speculative hand is a leak. (In-position set-mining of small pairs vs
 *   a large raise is a known conservative simplification — the coarse `playable` tier can't isolate
 *   pairs from suited junk — left for a later refinement.)
 *
 * The **3-bet** cut ({@link THREE_BET_MIN_BB}) sits *inside* the large-raise regime: it applies the
 * **same** value-only continue rule — it does **not** tighten further — and differs only in the
 * teaching rationale ("3-bet or call").
 *
 * The rationale string is built from the *decision made*, so it always agrees with the verdict (the
 * acceptance criterion). Deterministic and pure — a price × position × seat rule, not a solver.
 */
function facingRaiseAdvice(
  tier: PreflopTier,
  raiseBb: number,
  position: Position,
): FacingRaiseAdvice {
  // The hero is in position only on the button/cutoff (heads-up: only the button — see
  // classifyPosition); the big blind defends from a posted blind, so it gets the wide defend below.
  const inPosition = isInPosition(position)
  const isBigBlind = position === 'big-blind'
  const sizeLabel = `${formatRaiseSize(raiseBb)}${raiseBb >= THREE_BET_MIN_BB ? ' (a 3-bet)' : ''}`

  // The raise-size band and the grading mode, derived once from the SAME rounded `raiseBb` the gates
  // compare and the SAME seat the rule keys off — recorded on the {@link PreflopTrace} so the trace
  // and the advice come from one place. A big blind defends (BUG-0007); any other seat cold-calls.
  const band: FacingRaiseAdvice['band'] =
    raiseBb >= THREE_BET_MIN_BB
      ? '3bet'
      : raiseBb >= LARGE_RAISE_MIN_BB
        ? 'large-raise'
        : 'small-raise'
  const mode: FacingRaiseAdvice['mode'] = isBigBlind ? 'bb-defend' : 'cold-call'

  // A 3-bet (or 3-bet-sized open): only the genuine value tiers continue — 3-bet or fold. The price
  // is steep enough that even the big blind's discount does not widen it; position does not move it.
  if (raiseBb >= THREE_BET_MIN_BB) {
    if (tierAtLeast(tier, 'strong')) {
      return {
        advice: 'open',
        rationale: `Facing ${sizeLabel}, a strong hand: 3-bet or call.`,
        band,
        mode,
      }
    }
    return {
      advice: 'fold',
      rationale: `Facing ${sizeLabel}: too steep a price for this hand; fold.`,
      band,
      mode,
    }
  }

  // A large raise (but not a 3-bet): the price collapses the range to value only. `strong`+ continue;
  // everything else (speculative/marginal/trash) folds, in or out of position. The big blind gets no
  // special widening here either — vs a large raise even its discounted price is too poor — so it
  // folds speculative hands with everyone else (preserving the 0053 6× behaviour).
  if (raiseBb >= LARGE_RAISE_MIN_BB) {
    if (tierAtLeast(tier, 'strong')) {
      return {
        advice: 'open',
        rationale: `Facing ${sizeLabel}: a strong hand worth continuing for value.`,
        band,
        mode,
      }
    }
    return {
      advice: 'fold',
      rationale: `Facing ${sizeLabel}: fold this speculative hand to the raise.`,
      band,
      mode,
    }
  }

  // A small / standard raise (below LARGE_RAISE_MIN_BB).
  //
  // BIG BLIND (BUG-0007): this is a *defend*, not a cold-call — the hero already posted the blind,
  // is getting a discounted price, and closes the action. Continue everything down to `marginal`
  // (offsuit broadways, suited gappers) regardless of position; fold only the unconnected `trash`
  // tail. Treating this like an out-of-position cold-call over-folded the most common preflop spot.
  if (isBigBlind) {
    if (tierAtLeast(tier, 'marginal')) {
      return {
        advice: 'open',
        rationale: `Defending the big blind vs ${sizeLabel}: a fine price to continue.`,
        band,
        mode,
      }
    }
    return {
      advice: 'fold',
      rationale: `Even from the big blind, this hand is too weak to defend ${sizeLabel}; fold.`,
      band,
      mode,
    }
  }

  // COLD-CALL (any other seat): value tiers always flat; the speculative `playable` tier flats only
  // in position (a thin flat needs position — out of position it is a cold-call leak). This is the
  // one cold-call branch where position changes the verdict. Marginal/trash fold.
  if (tierAtLeast(tier, 'strong')) {
    return {
      advice: 'open',
      rationale: `Facing ${sizeLabel}: a strong hand worth calling the raise.`,
      band,
      mode,
    }
  }
  if (tier === 'playable') {
    return inPosition
      ? {
          advice: 'open',
          rationale: `Facing ${sizeLabel} in position: a fine price for a thin flat.`,
          band,
          mode,
        }
      : {
          advice: 'fold',
          rationale: `Facing ${sizeLabel} out of position: fold this speculative cold-call.`,
          band,
          mode,
        }
  }
  return {
    advice: 'fold',
    rationale: `Facing ${sizeLabel}: fold this marginal hand to the raise.`,
    band,
    mode,
  }
}

/**
 * Grade one *preflop* decision off the starting-hand chart — the preflop counterpart to
 * {@link coachDecision} (which stays the postflop lens). Classify the hole cards into a
 * {@link PreflopTier}, take the chart's position-aware open/fold {@link PreflopAdvice} for the spot,
 * and score the hero `'good'` when their action agreed with it, `'leak'` when it did not.
 *
 * Deliberately ignores pot odds and equity: preflop those under-rate position, fold equity, and
 * implied odds and would fold clear opens (the bug this fixes). Postflop continues to use
 * {@link coachDecision}; the reducer routes preflop here and everything else there.
 *
 * **Raise-aware (0053).** The decision is graded against the right *standard* for the spot:
 *
 * - **Unraised pot** (`currentBet <= bigBlind` — limp / the BB's option): the chart is an *opening*
 *   chart, so a charted hand opens / continues per {@link adviceFor} — now position-aware across the
 *   **whole** range (ticket 0054): `playable` speculative hands fold from early position, the
 *   `marginal` tier opens only in late/steal seats (preserved), and a {@link STEAL_OPEN_RANGE} hand
 *   is promoted to `open` from the late/small-blind/heads-up steal seats **when the pot is folded to
 *   the hero** (a genuine steal — see {@link isStealSpot}) so standard button & blind steals
 *   (K7o/A9o/T9o) are no longer `Trash`/`Leak`; behind a limper that promotion does not fire. The
 *   bottom of a steal range is *optional*, so **folding** a steal-promotion open is graded
 *   `'breakEven'` (fine either way), not a `'leak'` — opening it stays `'good'` (ticket 0060).
 * - **Facing a raise** (`currentBet > bigBlind`): the open chart would bless loose cold-calls a
 *   winning player snap-folds, so we switch to a *defend* standard — {@link facingRaiseAdvice}
 *   tightens the continue range by the price faced and by position, and returns a rationale
 *   describing the *defend* decision (never the static opening-tier label, never "fold to pressure"
 *   above a `Good` call of pressure).
 *
 * The raise size is rounded to the nearest whole multiple of the big blind *once* here
 * (`Math.round(currentBet / bigBlind)`) and that single integer drives both the price-gate
 * comparisons and the rationale's `"5x raise"` label — so the size the learner reads always matches
 * the regime the hand was graded in. Rounding to the nearest whole multiple is fine for a teaching
 * chart (the gates are coarse bands, not exact accounting).
 *
 * Throws {@link RangeError} (via {@link classifyStartingHand}) on malformed hole cards.
 */
export function gradePreflop(ctx: DecisionContext, action: Action): PreflopVerdict {
  const { tier } = classifyStartingHand(ctx.holeCards)

  // The hero's seat geometry and the raise read drive the facing-raise defend standard (BUG-0007),
  // the unraised opening rule, AND the deterministic PreflopTrace — so compute them once up front,
  // before the free-check short-circuit, so the check path can record its position too. These are
  // the exact values the grade below keys off; the trace records them, it does not re-derive a thing.
  const position = classifyPosition(ctx)
  const facingRaise = ctx.currentBet > ctx.bigBlind
  // Round the raise size to the nearest whole BB multiple once, and use that single integer for BOTH
  // the price-gate bands and the rationale label — so the size the learner reads ("a 5x raise")
  // always matches the regime the hand was graded in. Coarse rounding is fine for a teaching chart.
  // An unraised pot keeps `currentBet === bigBlind`, so this is `1`.
  const raiseBb = Math.round(ctx.currentBet / ctx.bigBlind)

  // A free check is never a leak. Checking is only legal when there is nothing to call — the big
  // blind's option after the pot is limped/folded around — and a free flop strictly dominates
  // folding regardless of how weak the hand is. The open/fold chart is about *entering the pot for
  // chips*; it simply does not apply when continuing costs nothing. (Raising the limpers is graded
  // through the chart path below; only the bare check short-circuits here.)
  //
  // INVARIANT: this is the ONLY path an *unraised* big blind takes — the BB has nothing to call, so
  // its action is a check that lands here. The BB therefore never reaches the opening rule below as an
  // opener, which is why the BB-open path through adviceFor is unreachable in normal flow. (And as a
  // belt-and-braces, `big-blind` is excluded from WIDENING_POSITIONS, so a BB combo would fold trash
  // even if it did reach adviceFor — the correctness no longer rests silently on this short-circuit.)
  if (action.type === 'check') {
    return {
      tier,
      rationale: 'Big-blind option: no raise to call, so check and take the free flop.',
      advice: 'open',
      heroContinued: true,
      verdict: 'good',
      // Preflop grading is always the ranges/strength-tier idea (see PreflopVerdict.concept).
      concept: 'ranges',
      // The free-check short-circuit: an unraised pot, the BB taking its option. No steal-promotion
      // branch is reached on a check, so stealSpot is false.
      trace: {
        position,
        facingRaise: false,
        raiseBb: 1,
        band: 'unraised',
        mode: 'bb-option',
        stealSpot: false,
      },
    }
  }

  const heroContinued = action.type !== 'fold'

  // Are we facing a raise, or is this an unraised pot? Preflop the BB posts `bigBlind`, so
  // `currentBet` starts at `bigBlind`; a limp leaves it there and a raise pushes it above. An
  // unraised pot (limp / BB option) keeps the opening-chart standard; a raise switches to the
  // price-gated *defend* standard so the open chart no longer blesses loose cold-calls (0053).
  // `facingRaise` / `raiseBb` are computed once above (the check path needed `position` too).

  let advice: PreflopAdvice
  let spotRationale: string
  // The trace's band/mode/stealSpot, set on whichever path the grade takes (facing-raise vs open).
  let band: PreflopTrace['band']
  let mode: PreflopTrace['mode']
  let stealSpot = false
  if (facingRaise) {
    // The facing-raise advice ALSO returns its band/mode, so the trace and the advice come from one
    // place and can't disagree (a small/large/3bet band, bb-defend vs cold-call mode).
    const fr = facingRaiseAdvice(tier, raiseBb, position)
    advice = fr.advice
    spotRationale = fr.rationale
    band = fr.band
    mode = fr.mode
  } else {
    // Unraised path: the opening rule is now position-aware across every tier (0054). The advice may
    // fold a tier whose static chart rationale describes an open (e.g. a `playable` hand from early
    // position), so the *open* path keeps the tier's teaching label while the *fold* path gets a
    // position-named line that follows the advice — never the open-chart label above a fold. (The
    // full rationale-follows-advice pass is [[0056-coach-rationale-not-absolute]].)
    // The trash steal-promotion fires only in a genuine steal (the pot folded to the hero); over a
    // limper, raising junk is a leak, not a steal — so gate the promotion on isStealSpot. Recorded on
    // the trace (whether the steal branch was reachable for this open).
    stealSpot = isStealSpot(ctx)
    const hand = validateHole(ctx.holeCards)
    advice = adviceFor(tier, position, hand, stealSpot)
    // A trash hand in the steal range opens when it is folded to the hero in a late/blind seat; this
    // lets the fold-path rationale say so honestly instead of claiming the whole tail "opens later".
    const canStealLater = rangeContains(PARSED_STEAL_RANGE, hand)
    spotRationale = openFoldRationale(tier, position, advice, canStealLater)
    // The unraised opening path: band is always 'unraised', mode 'open'.
    band = 'unraised'
    mode = 'open'
  }

  // Good when the hero's continue/fold matched the chart's open/fold call; a leak otherwise — with
  // ONE exception: the bottom of a steal range is *optional*. A `trash` hand only ever reaches
  // `advice: 'open'` via the {@link STEAL_OPEN_RANGE} promotion (a genuine steal — folded to the hero
  // in a late/blind seat; the facing-raise path never opens trash), and the bottom of a steal range
  // is a hand you *may* open but are never obliged to: opening it is good, and *folding* it is fine,
  // not a leak. So a fold of a steal-promotion open grades `'breakEven'` (the shared coin-flip state),
  // not `'leak'` — otherwise the coach punishes a perfectly standard fold and the explainer narrates a
  // false mistake (ticket 0060). Opening it is still `'good'`; every non-steal open/fold is unchanged.
  const stealPromotionOpen = advice === 'open' && tier === 'trash'
  let verdict: ActionVerdict
  if (heroContinued === (advice === 'open')) {
    verdict = 'good'
  } else if (stealPromotionOpen) {
    // The hero folded the bottom of a steal range — optional, never a leak.
    verdict = 'breakEven'
  } else {
    verdict = 'leak'
  }
  // Preflop grading is always the ranges/strength-tier idea (see PreflopVerdict.concept). The trace
  // records the band/mode/stealSpot the branch above actually took — a pure by-product, no new logic.
  return {
    tier,
    rationale: spotRationale,
    advice,
    heroContinued,
    verdict,
    concept: 'ranges',
    trace: { position, facingRaise, raiseBb, band, mode, stealSpot },
  }
}

/**
 * The thirteen ranks, strongest first — the row/column order of the canonical starting-hand grid.
 * Used by {@link startingHandChart} to lay out the 13×13 matrix and by a UI to label its axes.
 */
export const CHART_RANKS = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
] as const

/**
 * The hand-class label for two hole cards, in the same standard notation {@link startingHandChart}
 * uses for its cells — `"QQ"` (pair), `"AKs"` (suited), `"AKo"` (offsuit), higher rank first. So a
 * hand's label is exactly the label of its grid cell: a chart view can highlight "your hand" by
 * matching this against {@link ChartCell.label}. Pure (rank/suit reads only).
 */
export function handClassLabel(holeCards: readonly [Card, Card]): string {
  const [a, b] = holeCards
  const ra = rankOf(a)
  const rb = rankOf(b)
  if (ra === rb) return `${ra}${rb}` // pocket pair
  // Higher rank leads the label — a lower index in CHART_RANKS (A→2) is the stronger rank.
  const aStronger = CHART_RANKS.indexOf(ra) < CHART_RANKS.indexOf(rb)
  const hi = aStronger ? ra : rb
  const lo = aStronger ? rb : ra
  return `${hi}${lo}${suitOf(a) === suitOf(b) ? 's' : 'o'}`
}

/**
 * Plain-English rank words keyed by the single-character notation the chart and {@link handClassLabel}
 * use (`A`…`2`, `T` = Ten). The spoken form of a rank, for decoding shorthand into human copy.
 */
export const RANK_WORD: Readonly<Record<string, string>> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
  '9': 'Nine',
  '8': 'Eight',
  '7': 'Seven',
  '6': 'Six',
  '5': 'Five',
  '4': 'Four',
  '3': 'Three',
  '2': 'Two',
}

/** Pluralised rank word for a pocket pair, e.g. `"Kings"`, `"Sixes"` (the one irregular plural). */
export function pluralRank(word: string): string {
  return word === 'Six' ? 'Sixes' : `${word}s`
}

/**
 * Decode a hand-class **label** into plain English — the spoken form of the chart's shorthand, so a
 * UI can expand a terse `"JTo"` cell or coach highlight into words a learner can read:
 *
 *   describeHandClass('AA')  // 'pair of Aces'
 *   describeHandClass('AKs') // 'Ace-King suited'
 *   describeHandClass('JTo') // 'Jack-Ten offsuit'
 *
 * The human-facing companion to {@link handClassLabel}: it takes that function's exact output (and any
 * {@link ChartCell.label}) and reads it aloud. Pure. Returns the input unchanged if it isn't a
 * recognisable hand-class label, so callers can pass arbitrary strings without guarding.
 */
export function describeHandClass(label: string): string {
  const hi = RANK_WORD[label[0] ?? '']
  const lo = RANK_WORD[label[1] ?? '']
  if (!hi || !lo) return label
  // Pair: two identical ranks, no suffix ("QQ"). Plural reads as a holding ("pair of Queens").
  if (label.length === 2 && label[0] === label[1]) return `pair of ${pluralRank(hi)}`
  // Suited/offsuit: higher-lower plus an s/o suffix ("AKs" / "JTo").
  if (label.length === 3 && (label[2] === 's' || label[2] === 'o')) {
    return `${hi}-${lo} ${label[2] === 's' ? 'suited' : 'offsuit'}`
  }
  return label
}

/**
 * One cell of the {@link startingHandChart} grid: a starting-hand *class* (a `"AA"` / `"AKs"` /
 * `"AKo"` label and which of the three kinds it is) and the {@link PreflopTier} it classifies into.
 * A flat, serialisable value — the hand-off shape a chart view renders.
 */
export interface ChartCell {
  /** The hand-class label in standard notation: `"AA"` (pair), `"AKs"` (suited), `"AKo"` (offsuit). */
  readonly label: string
  /** Which kind of holding the cell is — drives the grid's three regions (diagonal / upper / lower). */
  readonly kind: 'pair' | 'suited' | 'offsuit'
  /** The strength tier the class lands in, from {@link classifyStartingHand}. */
  readonly tier: PreflopTier
}

/**
 * Build the canonical **13×13 starting-hand chart** — the visible form of the same chart the coach
 * grades preflop decisions against ([[0022-coach-preflop-chart]]). Returns a grid of {@link ChartCell}s,
 * `grid[row][col]` indexed by {@link CHART_RANKS} (A→2), in the universal poker layout:
 *
 * - the **diagonal** (`row === col`) is the pocket pairs (`AA`…`22`);
 * - the **upper-right** triangle (`col > row`) is the **suited** hands (`AKs`, `AQs`, …);
 * - the **lower-left** triangle (`col < row`) is the **offsuit** hands (`AKo`, `AQo`, …),
 *
 * with the higher rank always first in the label. Each cell's tier is read straight from
 * {@link classifyStartingHand} on a representative two-card combo of that class, so the chart can
 * **never disagree** with how the live coach grades a hand — they are the same function. Pure and
 * deterministic (no randomness, no I/O): the UI just colours the grid by {@link ChartCell.tier}.
 */
export function startingHandChart(): ChartCell[][] {
  return CHART_RANKS.map((rowRank, row) =>
    CHART_RANKS.map((colRank, col): ChartCell => {
      // Pick a representative physical combo for the class, then let the coach classify it — no
      // parallel tier logic here. Suits are arbitrary: same suit for suited, different for the rest.
      let label: string
      let kind: ChartCell['kind']
      let holeText: string
      if (row === col) {
        kind = 'pair'
        label = `${rowRank}${rowRank}`
        holeText = `${rowRank}h ${rowRank}s`
      } else if (col > row) {
        // Upper-right: the row rank is the higher one (ranks descend A→2), so it leads the label.
        kind = 'suited'
        label = `${rowRank}${colRank}s`
        holeText = `${rowRank}h ${colRank}h`
      } else {
        // Lower-left: the column rank is the higher one, so it leads the label.
        kind = 'offsuit'
        label = `${colRank}${rowRank}o`
        holeText = `${colRank}h ${rowRank}s`
      }
      const [a, b] = parseCards(holeText)
      const { tier } = classifyStartingHand([a!, b!])
      return { label, kind, tier }
    }),
  )
}
