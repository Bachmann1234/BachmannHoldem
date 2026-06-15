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
 * One short, human-readable line of guidance per tier — the *why*, not just the *what*, so
 * the verdict teaches a principle a learner can carry to the next hand (per
 * [LEARNING-APPROACH.md]). Returned verbatim as the {@link StartingHandVerdict.rationale}.
 */
const TIER_RATIONALE: Readonly<Record<PreflopTier, string>> = {
  premium: 'Premium holding — always raise; you want chips in.',
  strong: 'Strong value hand — open and bet for value.',
  playable: 'Playable speculative hand — open in position and play it with a plan.',
  marginal: 'Marginal hand — open only in late position; fold to pressure.',
  trash: 'Trash — fold; it makes no money over time.',
}

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
 * This is the chart's *prescription* (position-aware for {@link PreflopTier.marginal}); the hero is
 * then graded on whether their action agreed with it — see {@link gradePreflop}.
 */
export type PreflopAdvice = 'open' | 'fold'

/**
 * A graded preflop decision — the chart-based analogue of the postflop {@link DecisionVerdict}
 * (ticket [[BUG-0001]]).
 *
 * Preflop, pot-odds-vs-equity is the *wrong* lens: it ignores position, fold equity, and implied
 * odds, so it folds textbook opens like AJs on the button. So we grade preflop off the
 * starting-hand chart instead — `classifyStartingHand` gives the tier, the chart's open/fold
 * guidance (position-aware for the marginal tier) gives the {@link advice}, and the hero is `good`
 * when their action matched that guidance and a `leak` when it did not. A flat, serialisable value
 * with no equity/EV fields — there is deliberately no pot-odds math here to contradict the chart.
 */
export interface PreflopVerdict {
  /** The strength tier the holding classifies into (its single strongest match). */
  readonly tier: PreflopTier
  /** A short, human-readable line of open/fold guidance — the teaching takeaway. */
  readonly rationale: string
  /** What the chart recommends in this spot (position-aware for the `marginal` tier). */
  readonly advice: PreflopAdvice
  /** Whether the hero put chips in (any non-fold) or folded. */
  readonly heroContinued: boolean
  /**
   * The grade: `'good'` when the hero's action matched the chart {@link advice}, `'leak'` when it
   * did not. (`'breakEven'` is part of the shared {@link ActionVerdict} union but unused preflop —
   * the chart gives a crisp open/fold call, not a coin-flip band.)
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
 * Whether the hero is in *late position* — on the button or the cutoff (the seat immediately before
 * the button). This is a seat-geometry property: the cutoff is `buttonIndex - 1` (mod
 * {@link DecisionContext.numPlayers}), so it falls straight out of the button index without any
 * range or fold reasoning. Heads-up (two seats) both seats count as late — the standard read that
 * the marginal tier is playable heads-up.
 *
 * Late position is the one piece of context the chart needs to grade the `marginal` tier, whose
 * guidance is "open only in late position; fold to pressure".
 */
function isLatePosition(ctx: DecisionContext): boolean {
  const cutoff = (ctx.buttonIndex - 1 + ctx.numPlayers) % ctx.numPlayers
  return ctx.seat === ctx.buttonIndex || ctx.seat === cutoff
}

/**
 * The chart's open/fold prescription for a tier in this spot. Tiers the chart always plays
 * (`premium` / `strong` / `playable`) say `'open'`; the `marginal` tier opens only in late
 * position and otherwise folds; `trash` always folds.
 */
function adviceFor(tier: PreflopTier, latePosition: boolean): PreflopAdvice {
  if (tier === 'trash') return 'fold'
  if (tier === 'marginal') return latePosition ? 'open' : 'fold'
  return 'open'
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
}

/**
 * The chart's open/fold-vs-a-*raise* prescription — the defend standard this ticket adds (0053).
 * Unlike {@link adviceFor} (an *opening* chart), this grades a hand the hero is *calling a raise*
 * with, and tightens with the price faced. There are **two** behavioral regimes (continue ranges),
 * split at a single cut — {@link LARGE_RAISE_MIN_BB}:
 *
 * - **Below {@link LARGE_RAISE_MIN_BB}** — a small / standard raise: keep a reasonable flatting
 *   range. Value tiers (`strong`+) always continue; the speculative `playable` tier flats too, but
 *   only *in position* (a thin flat needs position; OOP it is a cold-call leak); `marginal`/`trash`
 *   fold. This is the one regime where position changes the verdict.
 * - **At/above {@link LARGE_RAISE_MIN_BB}** — a large raise: the price has collapsed the range to
 *   value only. `strong`+ continue; everything else (speculative/marginal/trash) folds, in or out
 *   of position.
 *
 * The **3-bet** cut ({@link THREE_BET_MIN_BB}) sits *inside* the large-raise regime: it applies the
 * **same** continue rule (`strong`+ continue, rest fold) — it does **not** tighten the range
 * further. It differs only in the teaching rationale: at/above {@link THREE_BET_MIN_BB} the spot is
 * labelled and taught as a 3-bet ("3-bet or call") rather than a plain value call. So there are two
 * distinct continue-ranges (small vs large), not three; the 3-bet is the large regime with a 3-bet
 * teaching frame.
 *
 * The rationale string is built from the *decision made*, so it always agrees with the verdict (the
 * acceptance criterion). Deterministic and pure — a price×position rule, not a solver.
 */
function facingRaiseAdvice(
  tier: PreflopTier,
  raiseBb: number,
  latePosition: boolean,
): FacingRaiseAdvice {
  const sizeLabel = `${formatRaiseSize(raiseBb)}${raiseBb >= THREE_BET_MIN_BB ? ' (a 3-bet)' : ''}`

  // A 3-bet (or 3-bet-sized open): only the genuine value tiers continue — 3-bet or fold. Position
  // does not move this call, so the rationale omits a position label.
  if (raiseBb >= THREE_BET_MIN_BB) {
    if (tierAtLeast(tier, 'strong')) {
      return { advice: 'open', rationale: `Facing ${sizeLabel} — a strong hand: 3-bet or call.` }
    }
    return {
      advice: 'fold',
      rationale: `Facing ${sizeLabel} — too steep a price for this hand; fold.`,
    }
  }

  // A large raise (but not a 3-bet): the price collapses the range to value only. Position does not
  // move this call either — speculative junk folds whether in or out of position.
  if (raiseBb >= LARGE_RAISE_MIN_BB) {
    if (tierAtLeast(tier, 'strong')) {
      return {
        advice: 'open',
        rationale: `Facing ${sizeLabel} — a strong hand worth continuing for value.`,
      }
    }
    return {
      advice: 'fold',
      rationale: `Facing ${sizeLabel} — fold this speculative hand to the raise.`,
    }
  }

  // A small / standard raise (below LARGE_RAISE_MIN_BB): value tiers always flat; the speculative
  // `playable` tier flats only in position (a thin flat needs position — out of position it is a
  // cold-call leak). This is the one branch where position changes the verdict, so the rationale
  // names it. Marginal/trash fold.
  if (tierAtLeast(tier, 'strong')) {
    return {
      advice: 'open',
      rationale: `Facing ${sizeLabel} — a strong hand worth calling the raise.`,
    }
  }
  if (tier === 'playable') {
    return latePosition
      ? {
          advice: 'open',
          rationale: `Facing ${sizeLabel} in position — a fine price for a thin flat.`,
        }
      : {
          advice: 'fold',
          rationale: `Facing ${sizeLabel} out of position — fold this speculative cold-call.`,
        }
  }
  return {
    advice: 'fold',
    rationale: `Facing ${sizeLabel} — fold this marginal hand to the raise.`,
  }
}

/**
 * Format a raise size in big blinds as a short `"6x"` label for the rationale strings. Takes the
 * already-rounded whole-multiple `raiseBb` {@link gradePreflop} computes — the price gates and this
 * label share that single rounded integer, so the size a learner reads can never contradict the
 * regime the hand was graded in (e.g. a 4.6x raise reads "5x" *and* is graded in the large band, not
 * the small one). Pure string formatting.
 */
function formatRaiseSize(raiseBb: number): string {
  return `a ${raiseBb}x raise`
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
 *   chart, so a charted hand opens / continues per {@link adviceFor}. (Position-awareness beyond the
 *   `marginal` tier and HU widening are ticket 0054; this path keeps today's opening behaviour.)
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
  const { tier, rationale } = classifyStartingHand(ctx.holeCards)

  // A free check is never a leak. Checking is only legal when there is nothing to call — the big
  // blind's option after the pot is limped/folded around — and a free flop strictly dominates
  // folding regardless of how weak the hand is. The open/fold chart is about *entering the pot for
  // chips*; it simply does not apply when continuing costs nothing. (Raising the limpers is graded
  // through the chart path below; only the bare check short-circuits here.)
  if (action.type === 'check') {
    return {
      tier,
      rationale: 'Big-blind option — no raise to call, so check and take the free flop.',
      advice: 'open',
      heroContinued: true,
      verdict: 'good',
      // Preflop grading is always the ranges/strength-tier idea (see PreflopVerdict.concept).
      concept: 'ranges',
    }
  }

  const latePosition = isLatePosition(ctx)
  const heroContinued = action.type !== 'fold'

  // Are we facing a raise, or is this an unraised pot? Preflop the BB posts `bigBlind`, so
  // `currentBet` starts at `bigBlind`; a limp leaves it there and a raise pushes it above. An
  // unraised pot (limp / BB option) keeps the opening-chart standard; a raise switches to the
  // price-gated *defend* standard so the open chart no longer blesses loose cold-calls (0053).
  const facingRaise = ctx.currentBet > ctx.bigBlind
  // Round the raise size to the nearest whole BB multiple once, and use that single integer for BOTH
  // the price-gate bands and the rationale label — so the size the learner reads ("a 5x raise")
  // always matches the regime the hand was graded in. Coarse rounding is fine for a teaching chart.
  const raiseBb = Math.round(ctx.currentBet / ctx.bigBlind)
  const { advice, rationale: spotRationale } = facingRaise
    ? facingRaiseAdvice(tier, raiseBb, latePosition)
    : { advice: adviceFor(tier, latePosition), rationale }

  // Good when the hero's continue/fold matched the chart's open/fold call; a leak otherwise.
  const verdict: ActionVerdict = heroContinued === (advice === 'open') ? 'good' : 'leak'
  // Preflop grading is always the ranges/strength-tier idea (see PreflopVerdict.concept).
  return { tier, rationale: spotRationale, advice, heroContinued, verdict, concept: 'ranges' }
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
