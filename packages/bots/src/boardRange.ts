/**
 * Board-aware, *polarised* villain ranges — the texture-conditioned hand-reading layer
 * (ticket 0057).
 *
 * The named {@link RangeWidth} buckets in {@link handReading} ([[0018-bot-hand-reading]]) are
 * *preflop opening ranges with no board awareness*: even the tightest, `ultraTight` (AA-JJ / AK),
 * is just "the top few percent of starting hands". That is the right model for *how a villain
 * entered the pot*, but it is the wrong model for *what a villain who has barrelled multiple
 * streets actually holds*. A player firing big bet after big bet is **polarised**: they hold the
 * strong, board-connected made hands the texture supports (sets, two pair, the straights/flushes
 * this board allows, strong overpairs) **plus** a fraction of busted bluffs — and they have, by and
 * large, *checked* the medium "showdown-value" hands (a lone middling pair) rather than barrelled
 * them. A fixed preflop bucket cannot express any of that: it contains AK-high (which a beaten
 * bottom pair *beats*) on a low coordinated board, so reading a bluff-catcher against it over-rates
 * the bluff-catcher exactly on the line where it is most beaten — the residual leak
 * [[0052-coach-narrow-range-on-action]] documented and this module closes.
 *
 * So this builds, *from the board itself*, the concrete two-card combos a barrelling villain
 * plausibly holds: it walks every possible villain holding, asks the engine evaluator
 * ({@link evaluate7}) what that holding *makes on this exact board*, and sorts each into one of three
 * buckets:
 *
 * - **Value** — a strong, board-connected made hand: two pair or better (sets, straights, flushes,
 *   full houses, quads — anything the texture allows), **or** a *top pair / overpair* (a pair at or
 *   above the highest board card, made with a hole card). These are the hands a villain barrels for
 *   value across three streets.
 * - **Air** — no pair of villain's own (a high-card hand, or a hand merely playing the board's pair):
 *   a busted draw or pure air. These are the hands a villain barrels as a *bluff*.
 * - **Medium** — a single pair *below* top pair (second/middle/bottom pair, an underpair): a
 *   *showdown-value* hand a polarised barreller tends to check rather than fire three streets.
 *   **Excluded** from the barrelling range entirely — that exclusion is what makes the range polarised
 *   and what lets the hero's own pair rank decide the read.
 *
 * The returned {@link Range} is *all* of the value combos plus a deterministic slice of the air combos
 * sized to hit a target **bluff fraction** (the share of the range that is bluffs). A bluff-catcher
 * read against this range therefore earns roughly *the bluff fraction* in equity — it beats the air
 * and loses to the value — which is the honest read a fixed preflop bucket cannot produce.
 *
 * **Where it lives, and what it does *not* change.** This is shared hand-reading machinery, so it
 * sits in `@holdem/bots` beside {@link handReading} — a reusable, tested asset that *could* later
 * sharpen the bots themselves (the project's known-weak shared-range pillar). But it changes **no**
 * bot behaviour today: nothing in the heuristic policy calls it. The *decision* to read a barrelled
 * line against a polarised range is the coach's alone (its {@link coachDecision} barreled branch),
 * exactly as [[0052-coach-narrow-range-on-action]]'s width-narrowing stayed coach-only — the bots
 * keep their personality-tuned, deliberately-fun {@link RangeWidth} reads untouched.
 *
 * Purity: zero I/O, no Node/DOM/network, no randomness of its own — a pure function of
 * `(board, bluffFraction)`. The combo enumeration and the evaluator are both deterministic, so the
 * same board always yields the same range, which is what keeps the coach's equity read replayable.
 */

import { evaluate7, rankIndex, HandCategory, NUM_CARDS, type Card } from '@holdem/engine'
import type { Combo, Range } from '@holdem/odds'

/** Board sizes this layer reads against: flop, turn, river. Preflop (0) has no texture to read. */
const POSTFLOP_BOARD_SIZES = new Set([3, 4, 5])

/**
 * The breakdown of a polarised barrelling range: the concrete combos to read against, plus the
 * value/bluff composition that produced them (for the coach's decision trace, so a ruling can show
 * *how* polarised the assumed range was without re-deriving it).
 */
export interface PolarizedBarrelRange {
  /** The concrete two-card combos: every value combo plus the sampled bluff (air) combos. */
  readonly range: Range
  /** How many of {@link range}'s combos are value (two pair+/overpair) hands. */
  readonly valueCombos: number
  /** How many of {@link range}'s combos are bluff (air) hands. */
  readonly bluffCombos: number
  /**
   * The **realised** bluff fraction — `bluffCombos / (valueCombos + bluffCombos)`. Usually equal to
   * the requested target, but it can come in lower when the board does not offer enough air combos to
   * fill the quota (rare) — so the trace reports the fraction actually used, not the one asked for.
   */
  readonly bluffFraction: number
}

/** Parameters for {@link polarizedBarrelRange}. */
export interface PolarizedBarrelParams {
  /** The community cards (3, 4, or 5 — flop/turn/river). Preflop has no texture and is rejected. */
  readonly board: readonly Card[]
  /**
   * The target share of the range that should be bluffs (air), `0..1` exclusive of `1`. A
   * value-heavy barreller sits well below `0.5`; `0` produces a pure value range (no bluffs).
   */
  readonly bluffFraction: number
  /**
   * Cards that cannot be in villain's hand — the hero's hole cards (and, redundantly, the board).
   * Combos colliding with any blocked card are dropped, exactly as the equity sampler would prune
   * them, so the realised composition is honest. Optional; the board is always treated as blocked.
   */
  readonly blocked?: ReadonlySet<Card>
}

/**
 * Every legal two-card combo (all 1,326), generated in deck order from the engine card primitives.
 * Built once and frozen because it never changes; the per-board builder filters this down rather than
 * re-enumerating each call.
 */
const ALL_COMBOS: readonly Combo[] = (() => {
  const combos: Combo[] = []
  for (let c0 = 0; c0 < NUM_CARDS; c0++) {
    for (let c1 = c0 + 1; c1 < NUM_CARDS; c1++) {
      combos.push([c0 as Card, c1 as Card])
    }
  }
  return combos
})()

/** The category at/above which a made hand is unambiguous, board-connected *value*: two pair+. */
const VALUE_CATEGORY_FLOOR: HandCategory = HandCategory.TwoPair

/**
 * Classify one villain combo on a board into the polarised buckets: `'value'`, `'air'`, or
 * `'medium'`. The combo's hand is evaluated against the *known* board only (no future cards) — the
 * coach's equity read then runs the board out — so this asks "what does villain have *right now*",
 * which is what determines whether they are barrelling for value, as a bluff, or holding a
 * showdown-value hand they would more often check.
 *
 * The single-pair case is **board-relative**, which is the heart of the polarisation: a barreller
 * firing three streets keeps their *top* one-pair hands (an overpair or top pair) but tends to
 * *check* the weaker ones (second pair and below, an underpair) as showdown-value rather than barrel
 * them. So a single pair villain made *with a hole card* is `'value'` only when the paired rank is at
 * least the board's **highest** rank (`valuePairRank` — top pair clears it, an overpair exceeds it),
 * and `'medium'` (excluded) below that. This is exactly what lets the hero's *own* pair rank decide
 * the read: the hero's top pair beats villain's kept worse top-pair kickers and the bluffs (a call),
 * while the hero's middle/bottom pair beats only the bluffs (a fold), without either being hard-coded.
 *
 * The pair must be villain's **own** — a hole card has to hold the paired rank. A hand merely *playing
 * the board's own pair* (two unconnected cards on a paired board, e.g. KQ on a TT4 board) has no pair
 * of its own and is treated as bluff-eligible air, not a made pair; otherwise a paired board would
 * classify every holding as "made" and the range would collapse to every combo.
 *
 * A **pocket pair** is judged the same board-relative way regardless of the board pairing: it is value
 * only if it makes a *set* (matches a board card → trips or better) or is an *overpair* (rank above the
 * top board card). This is split out because a small pocket pair on a *paired* board makes "two pair"
 * by riding the board's own pair (e.g. 77 on a KK5 board → KK+77) and would otherwise be masked as
 * value by the two-pair-or-better check — when it is really the same weak showdown hand that a 77 on an
 * unpaired board is. Routing pocket pairs through the overpair rule keeps that judgement consistent
 * across paired and unpaired boards (and still promotes the set 55-on-KK5 case, a full house, to value).
 *
 * Returns the bucket plus the combo's evaluator `score`, so the caller can sort bluff (air) combos by
 * strength without re-evaluating the hand — the evaluation is done exactly once per combo.
 */
function classifyCombo(
  combo: Combo,
  board: readonly Card[],
  valuePairRank: number,
): { kind: 'value' | 'air' | 'medium'; score: number } {
  const value = evaluate7([combo[0], combo[1], ...board])
  const score = value.score
  const r0 = rankIndex(combo[0])
  const r1 = rankIndex(combo[1])

  // A pocket pair: value only as a set (trips+) or an overpair (rank above the top board card). Judged
  // by the overpair rule even when it makes "two pair" off a paired board, so a small pocket pair is
  // not masked as value (see the doc above). A set 55-on-KK5 makes a full house, which clears this.
  if (r0 === r1) {
    if (value.category >= HandCategory.ThreeOfAKind) return { kind: 'value', score }
    return { kind: r0 >= valuePairRank ? 'value' : 'medium', score }
  }

  // Two pair or better (with distinct hole cards) is unambiguous, board-connected value.
  if (value.category >= VALUE_CATEGORY_FLOOR) return { kind: 'value', score }
  // A lone high-card hand (no pair) is air — a busted draw or pure bluff.
  if (value.category === HandCategory.HighCard) return { kind: 'air', score }
  // A single pair. For a Pair, ranks[0] is the paired rank (the engine encodes the pair rank first).
  const pairedRank = value.ranks[0]!
  // Villain merely playing the board's pair (no hole card holds the paired rank) is air, not a pair.
  if (r0 !== pairedRank && r1 !== pairedRank) return { kind: 'air', score }
  // Their own pair: top pair / overpair is value; anything weaker is a checked showdown-value hand.
  return { kind: pairedRank >= valuePairRank ? 'value' : 'medium', score }
}

/**
 * Build the **polarised, board-aware** range a barrelling villain plausibly holds on this board: all
 * the value combos the texture supports plus a deterministic slice of air combos sized to the target
 * {@link PolarizedBarrelParams.bluffFraction}. See the module doc for the value/air/medium model.
 *
 * **Which air becomes the bluffs.** When the bluff quota is smaller than the available air (the usual
 * case), we keep the *strongest* air — the hands highest by evaluator score (ace-high, busted
 * broadway/flush draws) rather than the literal worst holdings. That is both realistic (a villain
 * semi-bluffs their best air, not 7-2) and *conservative* for the read: the bluffs are the air that
 * is hardest for the hero's bluff-catcher to beat, so we never over-rate a bluff-catcher by stuffing
 * the bluff slot with hands it dominates. Ties are broken by deck order so the selection is fully
 * deterministic.
 *
 * The quota is `bluffCombos = round( f/(1-f) · valueCombos )`, the count that makes
 * `bluffCombos / (valueCombos + bluffCombos)` equal the target `f`, capped at the air available.
 *
 * Throws {@link RangeError} on a non-postflop board (preflop has no texture), a `bluffFraction`
 * outside `[0, 1)`, or a board on which *no* value combo exists (degenerate — the caller should fall
 * back to a width-based read). The hero blocks (and the board) are pruned before classification, so
 * the composition reflects only holdings villain could actually have.
 */
export function polarizedBarrelRange(params: PolarizedBarrelParams): PolarizedBarrelRange {
  const { board, bluffFraction } = params
  if (!POSTFLOP_BOARD_SIZES.has(board.length)) {
    throw new RangeError(`polarizedBarrelRange needs a 3/4/5-card board, got ${board.length}`)
  }
  if (!(bluffFraction >= 0 && bluffFraction < 1)) {
    throw new RangeError(`bluffFraction must be in [0, 1), got ${bluffFraction}`)
  }

  // Everything villain cannot hold: the board itself, plus any caller-supplied hero blockers.
  const blocked = new Set<Card>(params.blocked)
  for (const card of board) blocked.add(card)

  // The board's highest rank — the cut for a "value" single pair (see classifyCombo): a pair at this
  // rank is top pair, above it (a pocket pair) is an overpair, below it is checked showdown-value.
  let valuePairRank = -1
  for (const card of board) valuePairRank = Math.max(valuePairRank, rankIndex(card))

  const valueCombos: Combo[] = []
  // Air carried with its evaluator score so we can keep the strongest (see the doc above). The score
  // comes straight from classifyCombo's single evaluation — no second evaluate7 on the air combos.
  const airCombos: { readonly combo: Combo; readonly score: number }[] = []
  for (const combo of ALL_COMBOS) {
    if (blocked.has(combo[0]) || blocked.has(combo[1])) continue
    const { kind, score } = classifyCombo(combo, board, valuePairRank)
    if (kind === 'value') valueCombos.push(combo)
    else if (kind === 'air') airCombos.push({ combo, score })
    // 'medium' is deliberately dropped — the polarisation.
  }

  if (valueCombos.length === 0) {
    throw new RangeError('no value combos on this board: cannot build a polarised range')
  }

  // Strongest air first; deck order (combo[0], then combo[1]) breaks score ties deterministically.
  airCombos.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.combo[0] !== b.combo[0]) return a.combo[0] - b.combo[0]
    return a.combo[1] - b.combo[1]
  })

  // The bluff count that realises the target fraction: f = B/(V+B) ⇒ B = f/(1-f)·V. Capped at the
  // air actually available (a board can be too dry to offer the full quota).
  const target =
    bluffFraction === 0 ? 0 : (bluffFraction / (1 - bluffFraction)) * valueCombos.length
  const bluffCount = Math.min(airCombos.length, Math.round(target))
  const bluffs = airCombos.slice(0, bluffCount).map((a) => a.combo)

  const range: Range = [...valueCombos, ...bluffs]
  const total = valueCombos.length + bluffs.length
  return {
    range,
    valueCombos: valueCombos.length,
    bluffCombos: bluffs.length,
    bluffFraction: total === 0 ? 0 : bluffs.length / total,
  }
}
