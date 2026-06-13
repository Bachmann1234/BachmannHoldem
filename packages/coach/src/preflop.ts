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

import { formatCard, type Card } from '@holdem/engine'
import { parseRange, type Combo, type Range } from '@holdem/odds'

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
