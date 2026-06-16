/**
 * Why a starting hand earns its grade — the plain-English, hand-level explanation behind a chart
 * cell (ticket 0064). The chart ([[0050-starting-hand-chart-view]]) shows _which_ strength tier a
 * hand lands in; {@link TIER_RATIONALE} explains the _tier_. Neither tells a beginner why two hands
 * of the same shape grade apart — the motivating confusion: `A9s` is Playable but `K9s` is Trash.
 *
 * {@link explainGrade} closes that gap. It derives the structural features of the two cards (pair,
 * suited, gap/connectedness, both-broadway, **contains-ace / nut-flush potential**, kicker strength)
 * and renders a short, **layman-first** explanation of the hand's poker properties — the same kind of
 * deterministic, teachable artifact the chart itself is ("teach the principle, not a solver output",
 * [LEARNING-APPROACH.md]). No equity sim, no I/O, no randomness — a pure function of the label.
 *
 * **Property-focused, never prescriptive.** The copy describes what the *hand* is (its flushes, its
 * kicker, its straights), never what to *do* with it — the tier badge above it in the UI carries the
 * verdict. Keeping advice out is what lets this never contradict the position-aware grader and assert
 * no false universal (the [[0056-coach-rationale-not-absolute]] discipline): "K9s tends to lose chips"
 * is a property, "always fold K9s" would be a falsehood (it steals fine on the button).
 *
 * Output is a list of {@link ExplanationSegment}s rather than a flat string so a UI can render the
 * real poker terms it leans on (nuts, kicker, dominated, …) as tappable links into the glossary,
 * while the logic here stays pure and unit-testable. The term ids are the shared vocabulary keys
 * ({@link GradeTermId}); the on-screen definitions live with the glossary that renders them.
 */

import { CHART_RANKS, RANK_WORD, pluralRank } from './preflop.js'

/**
 * The hand-strength terms an explanation can reference — stable ids, not display copy. The glossary
 * owns each term's on-screen definition (keyed by these ids), so the vocabulary is declared here once
 * and the wording lives in exactly one place downstream.
 */
export type GradeTermId = 'nuts' | 'kicker' | 'dominated' | 'set' | 'suited-connector'

/**
 * One piece of an explanation: either a plain run of text, or a run that names a {@link GradeTermId}
 * so a renderer can make it a tappable link to the glossary. Plain strings carry the connective
 * prose; the tagged objects carry the term to define.
 */
export type ExplanationSegment = string | { readonly text: string; readonly term: GradeTermId }

/** Build a glossary-linked segment — `term('the nuts', 'nuts')` renders "the nuts" as a link. */
function term(text: string, id: GradeTermId): ExplanationSegment {
  return { text, term: id }
}

/**
 * Pip value of a rank char — Ace high (14) down to Two (2) — derived from {@link CHART_RANKS} (A→2)
 * so it can never disagree with the chart's own rank order. Returns 0 for an unknown char.
 */
function pip(rank: string): number {
  const i = CHART_RANKS.indexOf(rank as (typeof CHART_RANKS)[number])
  return i < 0 ? 0 : CHART_RANKS.length + 1 - i
}

/** The structural shape of a hand-class label, the feature set the copy branches on. */
interface Shape {
  readonly kind: 'pair' | 'suited' | 'offsuit'
  readonly hi: string
  readonly lo: string
  readonly hiPip: number
  readonly loPip: number
  /** Cards strictly between the two ranks: 0 = connected (98), 1 = one-gapper (97). */
  readonly gap: number
}

/** Parse a hand-class label (`"AA"` / `"AKs"` / `"AKo"`) into its {@link Shape}, or null if malformed. */
function parseLabel(label: string): Shape | null {
  if (label.length === 2 && label[0] === label[1]) {
    const r = label[0] as string
    const p = pip(r)
    return p ? { kind: 'pair', hi: r, lo: r, hiPip: p, loPip: p, gap: 0 } : null
  }
  if (label.length === 3 && (label[2] === 's' || label[2] === 'o')) {
    const hi = label[0] as string
    const lo = label[1] as string
    const hp = pip(hi)
    const lp = pip(lo)
    if (!hp || !lp) return null
    return {
      kind: label[2] === 's' ? 'suited' : 'offsuit',
      hi,
      lo,
      hiPip: hp,
      loPip: lp,
      gap: hp - lp - 1,
    }
  }
  return null
}

/** A card counts as a "broadway" (a big card) at Ten or above. */
const BROADWAY = 10

/**
 * Explain, in plain English, why a starting hand has the strength it does — the reasoning behind its
 * chart grade, as a list of {@link ExplanationSegment}s (plain text + glossary-linked terms).
 *
 * Pure: a deterministic function of the `label` alone (`"AA"`, `"AKs"`, `"K9s"`, …). The copy is
 * property-focused — it describes the hand's flushes, kicker and straights, not what to do with it —
 * so it never contradicts the tier verdict shown beside it and asserts no false universal. Returns
 * `[]` for a label it cannot parse, so a caller can render "nothing extra" without guarding.
 */
export function explainGrade(label: string): readonly ExplanationSegment[] {
  const s = parseLabel(label)
  if (!s) return []
  const { kind, hi, hiPip, loPip, gap } = s
  const hiWord = RANK_WORD[hi] as string

  // --- Pocket pairs: a made hand now; the upside is a set. -------------------------------------
  if (kind === 'pair') {
    if (hiPip >= 12) {
      // QQ, KK, AA
      return [
        `Pocket ${pluralRank(hiWord)}, one of the very best hands you can be dealt. You are usually ahead before any cards come, and you can improve to a near-unbeatable `,
        term('set', 'set'),
        `.`,
      ]
    }
    if (hiPip >= 9) {
      // 99, TT, JJ
      return [
        `Pocket ${pluralRank(hiWord)}, a strong made pair. The catch is overcards: one bigger card on the board can put a better pair within reach. Its top end is flopping a `,
        term('set', 'set'),
        `.`,
      ]
    }
    // 22–88
    return [
      `Pocket ${pluralRank(hiWord)}, a small pair. On its own it is easily overtaken by bigger pairs, so its real value is flopping a `,
      term('set', 'set'),
      `: a big hand when it lands, easy to let go when it doesn't.`,
    ]
  }

  const ace = hiPip === 14
  const suited = kind === 'suited'

  // --- Aces: the high card plus, when suited, the nut flush. -----------------------------------
  if (ace) {
    if (suited) {
      if (loPip >= BROADWAY) {
        // AKs, AQs, AJs, ATs
        return [
          `About as good as a non-pair gets. The ace makes any flush you hit `,
          term('the nuts', 'nuts'),
          `. The big second card also means you flop strong top pairs and straights.`,
        ]
      }
      // A9s–A2s — the motivating "why is this playable" case.
      return [
        `The ace pulls its weight two ways: any flush you make is `,
        term('the nuts', 'nuts'),
        `. The ace is also a strong card by itself. That nut-flush upside is exactly why the weak second card is forgiven and the hand is worth playing.`,
      ]
    }
    if (loPip >= BROADWAY) {
      // AKo, AQo, AJo, ATo
      return [
        `Two big cards. Pair either one and you have top pair with a strong `,
        term('kicker', 'kicker'),
        `. Different suits mean no flush to fall back on, but the raw high-card strength carries it.`,
      ]
    }
    // A9o–A2o
    return [
      `A strong ace, but different suits mean no flush behind it, so you are mostly hoping to pair the ace, and a weak `,
      term('kicker', 'kicker'),
      ` means a bigger ace has you `,
      term('out-kicked', 'dominated'),
      `. Much thinner than the suited version.`,
    ]
  }

  // --- Suited, no ace. ------------------------------------------------------------------------
  if (suited) {
    if (loPip >= BROADWAY) {
      // KQs, KJs, KTs, QJs, QTs, JTs
      return [
        `Two big cards of the same suit: they make strong top pairs, the high straights, and a flush. One of the best holdings that isn't a pair or an ace.`,
      ]
    }
    if (gap <= 1) {
      // T9s, 98s … and the one-gappers J9s, T8s, 97s, …
      return [
        gap === 1 ? `A one-gapper ` : `A `,
        term('suited connector', 'suited-connector'),
        `. It rarely makes a big pair, but it makes straights and flushes: disguised hands that can win a large pot from a strong position.`,
      ]
    }
    if (hiPip >= 11) {
      // K9s, Q9s, J7s, K2s … big card + weak, gappy kicker — the "looks like a suited ace" trap.
      return [
        `Same shape as a suited ace, but a clear step down. Your best flush is only ${hiWord}-high, so it loses to an ace-high one, leaving you `,
        term('dominated', 'dominated'),
        ` right when you think you're ahead. Pairing the ${hiWord} leaves a weak `,
        term('kicker', 'kicker'),
        ` that better hands out-kick. It looks playable but tends to lose chips, not make them.`,
      ]
    }
    // Small, gappy suited junk (T7s, 96s, …).
    return [
      `Sharing a suit gives a slim flush chance, but the cards are small and gappy, with little straight potential, and any flush you do make is easily beaten, or `,
      term('dominated', 'dominated'),
      `. The bottom of the deck.`,
    ]
  }

  // --- Offsuit, no ace. -----------------------------------------------------------------------
  if (loPip >= BROADWAY) {
    // KQo, KJo, KTo, QJo, QTo, JTo
    return [
      `Two big cards, but different suits: they still make strong top pairs, yet with no flush to fall back on they are a notch thinner than the suited version.`,
    ]
  }
  if (gap <= 1) {
    // Offsuit connectors / one-gappers.
    return [
      `Connected but offsuit: there is some straight potential, but no flush, and the board misses you often. Thin.`,
    ]
  }
  // Offsuit, gapped, unremarkable high card — the junk tail.
  return [
    `Different suits, a gap between the cards, and nothing especially high: the unconnected, no-flush bottom of the deck.`,
  ]
}
