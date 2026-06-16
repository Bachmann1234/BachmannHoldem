/**
 * The seeded **drill-spot generator** — the spine of M5 ([[0009-drills-and-quizzes]], ticket 0065).
 *
 * Given a seed (and, for 0066, a {@link DrillConfig}), {@link generateSpot} deals one legal, coherent
 * poker situation and returns a curriculum {@link Spot} — a postflop {@link CoachSpot} or a preflop
 * {@link PreflopSpot} — that the *existing* `gradeSpot` rules on with **no new grade path and no new
 * engine code**. The generator's whole job is to *manufacture inputs* the curriculum already knows how
 * to grade; it adds zero grading logic of its own.
 *
 * **The two cardinal rules this module is built around.**
 *
 * 1. **No answer keys, end to end.** A generated spot stores *no* "correct" flag. Its choices are
 *    {@link ActionChoice}s (a label + an {@link Action}); which one is right is *whatever* the coach
 *    rules through `gradeSpot` — `coachDecision` postflop, `gradePreflop` preflop. The generator never
 *    computes correctness, so a drill can never disagree with the live coach. The package test proves
 *    this by grading *every* choice of a generated spot and asserting exactly the coach-blessed one(s)
 *    come back `correct: true`.
 * 2. **Pot accounting.** A {@link CoachSpot}'s `context.pot` is the pot the hero would *win* — the
 *    lifetime pot **including the villain's current bet** but **not** the hero's pending call — and
 *    `context.toCall` is the chips the hero must *add* to call. This is exactly the convention the live
 *    engine builds (`ctx.pot = sum of every player's committed chips`, [[bots/context]]) and the coach
 *    reads: `potOdds(toCall, pot)` divides by `pot + toCall`, and the line read recovers the dead money
 *    the bet was sized against as `pot - toCall` ([[coach/verdict]] `assumedLineRead`). The generator
 *    draws the dead money *before* the villain's bet and the bet itself, then forwards `pot = dead +
 *    bet` (the win-pot) so a generated spot grades **identically** to a live one — a half-pot bet is
 *    25% pot odds and reads as a half-pot bet, never a pot-sized barrel.
 *
 * **Determinism is the testability contract.** Every random choice — the deal, the pot/price buckets,
 * the seat geometry — is drawn from a single seeded {@link Dealer} ({@link makeDealer}), so the same
 * seed *always* yields the same spot (deep-equal). That reproducibility is what lets 0066's sessions
 * and their tests replay exactly.
 *
 * **Parameterised, not themed.** The generator reads a minimal {@link DrillConfig} (which spot kind,
 * and the price character of a postflop spot) so 0066 can request "preflop only" / "postflop with a
 * real price" without a rewrite here. It does **not** build the theme catalogue or the interleaved
 * session composer — that is 0066. The seam is the config; the catalogue is next.
 *
 * Purity: zero UI/DOM/Node/network, no `Math.random()` — all randomness is the seeded dealer. Imports
 * only `@holdem/*` and relative `.js`.
 */

import {
  evaluate7,
  formatCard,
  HAND_CATEGORY_NAMES,
  type Card,
  type HandCategory,
} from '@holdem/engine'
import { potOdds } from '@holdem/odds'
import { coachDecision, describeHandClass, handClassLabel } from '@holdem/coach'
import {
  synthesizeContext,
  type ActionChoice,
  type CalculationSpot,
  type CoachSpot,
  type HandReadingChoice,
  type HandReadingSpot,
  type NumericChoice,
  type PreflopSpot,
  type Spot,
  type SpotContext,
} from '@holdem/curriculum'
import { makeDealer, type Dealer } from './deal.js'
import {
  resolveConfig,
  type ActionSet,
  type CalculationQuantity,
  type DrillConfig,
  type PostflopStreet,
} from './config.js'

/**
 * Generate one drill {@link Spot} from a `seed` and an optional {@link DrillConfig}.
 *
 * The seed seeds a {@link Dealer} that every random choice is threaded through, so the call is pure:
 * `generateSpot(7)` always returns the same spot. The config (defaulted via {@link resolveConfig})
 * selects the branch — a postflop {@link CoachSpot} (the default), a preflop {@link PreflopSpot}, or a
 * numeric-retrieval {@link CalculationSpot} (ticket 0077) — and shapes a coach spot's price / a
 * calculation spot's asked quantity. The returned spot flows straight into curriculum's `gradeSpot`;
 * its correct answer (which action, or — for a calculation spot — which number bucket) is whatever the
 * math rules at grade time, never stored here.
 *
 * Throws {@link RangeError} on a non-integer `seed` (via {@link makeDealer}) — a malformed seed must
 * fail loudly rather than silently producing a different deal.
 *
 * @param seed The integer seed threaded through every random choice.
 * @param config Optional theme config ([[0066-drills-themed-sets]]); omitted ⇒ an unconstrained
 *   postflop coach spot.
 */
export function generateSpot(seed: number, config?: DrillConfig): Spot {
  const resolved = resolveConfig(config)
  const dealer = makeDealer(seed)
  if (resolved.kind === 'preflop') return generatePreflopSpot(dealer)
  if (resolved.kind === 'calculation') return generateCalculationSpot(dealer, resolved.quantity)
  if (resolved.kind === 'hand-reading') return generateHandReadingSpot(dealer, resolved.street)
  return generateCoachSpot(
    dealer,
    resolved.priceMode === 'priced',
    resolved.street,
    resolved.actions,
  )
}

/**
 * The smallest number of seats that can be live in a generated postflop pot — the hero plus one
 * villain (heads-up). `synthesizeContext` requires `numActive >= 2`, and a drill is always the hero
 * facing at least one opponent, so 2 is the floor.
 */
const MIN_ACTIVE = 2

/**
 * The largest number of seats a generated postflop pot deals into — a full 6-max-ish table. Bounded so
 * the multiway equity read ({@link coachDecision} reads against `numActive - 1` villains) stays in the
 * believable range a recreational table sits in, and so the deal never asks for more cards than a deck
 * holds. A {@link Dealer}'s `nextInt` picks `numActive` uniformly in `[MIN_ACTIVE, MAX_ACTIVE]`.
 */
const MAX_ACTIVE = 6

/**
 * The candidate **dead-money** pots a postflop spot is dealt with — the chips already in the pot
 * *before* the villain's bet, in the chip unit the coach reasons in. The villain's bet is sized as a
 * fraction of *this* dead money, and `context.pot` is then `dead + bet` (the win-pot the coach reads).
 * A small menu of round numbers rather than a continuous draw: the exact pot is immaterial to the
 * lesson (only the *ratio* of the bet to the dead money it faced drives the pot-odds math), so a
 * handful of clean values keeps generated prompts readable while still varying the spot. Picked by the
 * seeded dealer.
 */
const POT_BUCKETS: readonly number[] = [40, 60, 100, 150, 200]

/**
 * The candidate prices the villain bets, as a *fraction of the dead money* it bet into (the
 * {@link POT_BUCKETS} dead pot, *before* the bet). Quoting the price as a fraction of the pot-it-faced
 * — not an absolute — is what keeps the pot-odds character of the spot meaningful regardless of which
 * {@link POT_BUCKETS} dead pot was dealt, and it is exactly the bet-into-pot ratio the coach's line
 * read divides (`toCall / (pot - toCall)`): a `0.5` bet is always a half-pot bet, which is **25% pot
 * odds** (`toCall / (pot + toCall)` with `pot = dead + toCall` ⇒ `0.5·dead / 1.5·dead`), a `1.0` bet a
 * pot-sized bet (**33% pot odds**: `dead / 2·dead`). The `0` fraction is a *free* spot (a check),
 * included so an unconstrained coach spot can be a free decision; the `'priced'` price mode filters it
 * out (see {@link generateCoachSpot}).
 */
const PRICE_FRACTIONS: readonly number[] = [0, 0.25, 0.5, 0.75, 1]

/**
 * The price fractions a `'priced'` coach spot draws from — {@link PRICE_FRACTIONS} minus the free `0`
 * — so a pot-odds drill ([[0066-drills-themed-sets]]) always gets a real continue decision against a
 * price, never a free check. Derived from the same source list so the two can't drift apart.
 */
const PRICED_FRACTIONS: readonly number[] = PRICE_FRACTIONS.filter((f) => f > 0)

/**
 * Pick a uniformly-random element of a non-empty list using the dealer's seeded `nextInt` — the one
 * helper every bucket draw (pot, price, seat) goes through, so all of them stay on the single
 * reproducible stream. Throws {@link RangeError} on an empty list (a programming error — the bucket
 * lists are all non-empty constants).
 */
function pick<T>(dealer: Dealer, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('cannot pick from an empty list')
  return items[dealer.nextInt(items.length)]!
}

/**
 * Choose the **start index of a seeded `count`-wide window** over a contiguous integer grid `0..maxIndex`
 * that is guaranteed to *contain* `target`, with the window position varied by the seed. The single
 * source of truth for the window-placement algorithm both {@link buildBuckets} (number buckets) and
 * {@link buildCategoryChoices} (hand-category buttons) lean on — extracted so the subtle boundary clamp
 * lives, and is fixed, in exactly one place.
 *
 * **The invariant it guarantees.** The returned `start` satisfies
 * `0 <= start <= maxIndex - count + 1` **and** `start <= target <= start + count - 1` — i.e. the window
 * `[start, start + count - 1]` is wholly inside `[0, maxIndex]` *and* covers `target`. Callers can then
 * read off `count` consecutive elements from `start` knowing the correct one (at `target`) is always on
 * offer and every offered index is legal. (Assumes `0 <= target <= maxIndex` and
 * `count <= maxIndex + 1`, which both callers satisfy by construction.)
 *
 * **The 4 steps (and the boundary bug they encode).**
 * 1. **Offset draw** — the seeded dealer picks how many slots *before* `target` the window starts
 *    (`offset` in `0..count-1`), so the correct element is not always in the same button position.
 * 2. **Clamp into `[0, maxStart]`** — keep the whole window inside `[0, maxIndex]`, where
 *    `maxStart = max(0, maxIndex - count + 1)` is the latest a `count`-wide window can start.
 * 3. **Re-nudge to keep `target` in-window** — if clamping pushed the window past `target` (because
 *    `target` sits near `0` or near `maxIndex`), slide it back to cover `target` — but **never past
 *    `maxStart`**. That cap is the load-bearing fix: an earlier copy re-nudged *without* it and so could
 *    re-introduce an out-of-range index (the calc grid's "96–104%" ceiling-spill bug). Capping the
 *    upper re-nudge at `maxStart` is exactly what kept the ceiling clamp from being overridden.
 * 4. **Final `max(0, …)`** — clamp the floor so a degenerate `target === 0` window can never start
 *    negative.
 *
 * Pure: the only randomness is the seeded `dealer`'s `offset` draw.
 *
 * @param dealer The seeded dealer the window `offset` is drawn from.
 * @param target The index that MUST end up inside the returned window (the containing bucket / true category).
 * @param count How many consecutive indices the window spans (`CALC_CHOICES` / `HAND_READING_CHOICES`).
 * @param maxIndex The largest legal index on the grid (`CEILING_BUCKET` / `n - 1`).
 */
export function pickWindowStart(
  dealer: Dealer,
  target: number,
  count: number,
  maxIndex: number,
): number {
  // The latest a count-wide window can start and still fit within [0, maxIndex].
  const maxStart = Math.max(0, maxIndex - (count - 1))

  // 1. Seeded variety: how many slots BEFORE the target the window starts (0 ⇒ target is the lowest
  //    offered, count-1 ⇒ the highest). Drawn off the same reproducible stream as every other choice.
  const offset = dealer.nextInt(count)
  let start = target - offset
  // 2. Clamp the window into [0, maxStart] so every offered index is legal (≤ maxIndex)…
  start = Math.max(0, Math.min(maxStart, start))
  // 3. …then re-nudge so the target is still inside the (possibly clamped) window — but NEVER past
  //    `maxStart` (which would re-introduce an out-of-range index — the ceiling-spill bug). After this,
  //    `start <= target <= start + count - 1` holds AND `start <= maxStart`.
  if (target < start) start = target
  if (target > start + count - 1) start = Math.min(maxStart, target - (count - 1))
  // 4. Floor clamp so a target === 0 window can never start negative.
  return Math.max(0, start)
}

/**
 * The two answer choices a postflop continue decision offers: **Call** then **Fold**, in that fixed
 * order. The hero either continues for the price or gives the hand up — the exact binary the coach's
 * fold-vs-continue verdict rules on. Order is fixed (Call first) so `gradeSpot`'s `correctIndex` scan
 * and the UI's button order are stable across seeds; *which* of the two is correct is left entirely to
 * the coach. A free spot (`toCall === 0`) still offers Call/Fold — a "call" of `0` is a check, which
 * the coach grades as the (always-correct) free continue.
 */
const COACH_CHOICES: readonly ActionChoice[] = [
  { label: 'Call', action: { type: 'call' } },
  { label: 'Fold', action: { type: 'fold' } },
]

/**
 * A nominal raise size, in chips, for the **Raise** choice's {@link Action} on a `'call-raise-fold'`
 * coach spot (ticket 0078). Like the preflop open size, the exact amount is *grading-inert*: the coach
 * grades only *whether* the hero puts chips in (a raise is a continue, scored exactly like a call), never
 * *how much* — so any positive amount serves and a clean small raise reads sensibly if ever surfaced.
 * Named so the "size doesn't matter to the grade" intent is one obvious constant. (Bet *sizing* drills —
 * picking the specific amount — are deferred precisely because that part *isn't* coach-gradable; see
 * {@link ActionSet}.)
 */
const COACH_RAISE_AMOUNT = 1_000

/**
 * The three answer choices a `'call-raise-fold'` postflop continue decision offers: **Call**, **Raise**,
 * then **Fold** (ticket 0078) — the binary broken open with a third *continue* button. `raise` and
 * `call` are graded *identically* by `coachDecision` (both non-fold continues: both `'good'` when
 * continuing is EV-correct, both `'leak'` when folding is) — so this is still a pure continue-or-fold
 * drill the coach rules entirely, never an authored "raise is correct" key. When continuing is right BOTH
 * Call and Raise come back correct (exactly as the coach would at the table); when folding is right both
 * are leaks. Fixed order (continues first) for the same stable-`correctIndex` reason as
 * {@link COACH_CHOICES}. The raise `amount` is the grading-inert {@link COACH_RAISE_AMOUNT}.
 */
const COACH_RAISE_CHOICES: readonly ActionChoice[] = [
  COACH_CHOICES[0]!, // Call — single-sourced from the binary so the two sets can't drift on it
  { label: 'Raise', action: { type: 'raise', amount: COACH_RAISE_AMOUNT } },
  COACH_CHOICES[1]!, // Fold — single-sourced from the binary
]

/**
 * Pick the {@link ActionChoice}s a coach spot offers for the requested {@link ActionSet} — the classic
 * Call/Fold binary, or the Call/Raise/Fold triple (ticket 0078). One table so the "which buttons" choice
 * lives in one place and `'call-fold'` returns the *exact* pre-0078 array (byte-identical existing spots).
 */
function coachChoicesFor(actions: ActionSet): readonly ActionChoice[] {
  return actions === 'call-raise-fold' ? COACH_RAISE_CHOICES : COACH_CHOICES
}

/**
 * Generate a postflop {@link CoachSpot}: deal the hero a holding and a board, pick a coherent
 * pot/price, and offer the continue/fold choices the coach grades.
 *
 * **The deal.** Hole cards and a `street`-sized board come off one seeded, shuffled deck
 * ({@link Dealer}), so they are duplicate-free by construction and the board is a legal size for its
 * street. `street` defaults to `'flop'` (3 cards — the pre-0078 behaviour, byte-identical), and ticket
 * 0078's turn/river themes pass `'turn'`/`'river'` so continue decisions appear on every street; the
 * coach grades a turn/river continue and the multiway equity read identically (it reads `evaluate7` over
 * 2 hole + 3..5 board cards either way).
 *
 * **The money (the pot-accounting rule).** We draw `deadPot` (the dead money *before* the villain's
 * bet) and a price *fraction*, derive the villain's bet `toCall = round(deadPot * fraction)`, and then
 * forward `pot = deadPot + toCall` (the win-pot the hero would collect, **including** the villain's
 * bet) and `toCall` (the chips the hero must add) into the {@link SpotContext}. This is the exact
 * convention the live engine builds and the coach reads (`potOdds` divides by `pot + toCall`; the line
 * read recovers the dead money as `pot - toCall`), so a generated half-pot bet grades as 25% pot odds
 * and reads as a half-pot bet — never the pot-sized barrel the old "pot = dead money" convention
 * manufactured. A `priced` request draws the fraction from {@link PRICED_FRACTIONS} (no free check, so
 * `toCall > 0`); an unconstrained request may draw the `0` free fraction. The money model is identical
 * on every street — a turn/river spot is priced exactly as a flop spot is.
 *
 * **The choices (ticket 0078's richer actions).** `actions` selects the answer buttons: the default
 * `'call-fold'` binary (byte-identical existing spots) or the `'call-raise-fold'` triple. **Either way
 * the spot carries no correct flag** — `gradeSpot` runs `coachDecision` over *each* choice's action to
 * rule which are right, and Raise grades exactly like Call (both continues). So the richer set never
 * authors an answer; it only offers a second coach-graded continue button.
 *
 * @param dealer The seeded dealer every choice is drawn from.
 * @param priced Whether a non-trivial price is required (the `'priced'` price mode).
 * @param street The board street to deal — `'flop'` (default), `'turn'`, or `'river'`.
 * @param actions Which answer buttons to offer — `'call-fold'` (default) or `'call-raise-fold'`.
 */
function generateCoachSpot(
  dealer: Dealer,
  priced: boolean,
  street: PostflopStreet,
  actions: ActionSet,
): CoachSpot {
  const holeCards = dealer.dealHole()
  const board = dealer.dealBoard(street)
  const numActive = MIN_ACTIVE + dealer.nextInt(MAX_ACTIVE - MIN_ACTIVE + 1)

  const deadPot = pick(dealer, POT_BUCKETS)
  const fraction = pick(dealer, priced ? PRICED_FRACTIONS : PRICE_FRACTIONS)
  // `toCall` is the chips the hero must ADD to call — the villain's bet, a fraction of the dead money
  // it bet INTO (`deadPot`, before the bet). Rounded to a whole chip.
  const toCall = Math.round(deadPot * fraction)
  // `context.pot` is the pot the hero would WIN — the dead money PLUS the villain's bet — exactly as
  // the live engine builds it (`ctx.pot = sum of all committed chips`) and the coach reads it
  // (`potOdds(toCall, pot)` divides by `pot + toCall`; the line read recovers `deadPot = pot - toCall`).
  // So `pot - toCall === deadPot` and a half-pot bet grades as 25% pot odds / reads as a half-pot bet,
  // never the pot-sized barrel the old `pot = deadPot` convention manufactured.
  const pot = deadPot + toCall

  const context: SpotContext = { holeCards, board, pot, toCall, numActive }

  return {
    kind: 'coach',
    prompt: buildCoachPrompt(holeCards, board, pot, toCall, numActive, actions),
    choices: coachChoicesFor(actions),
    context,
  }
}

/**
 * The width, in equity-fraction units, of one number bucket on a generated {@link CalculationSpot} — the
 * span of `[lo, hi)` each {@link NumericChoice} covers, and therefore the *tolerance* of the answer (a
 * pick is correct when the computed value lands in the same bucket). `0.08` (eight percentage points)
 * is tight enough that the bucket is a real retrieval check — the player must land in roughly the right
 * decile, not merely "low / medium / high" — while being wide enough to swallow the equity read's
 * Monte-Carlo sampling dust (≈±0.8%, well inside the band) so the `'equity'` quantity never flips
 * buckets between runs. It doubles as the rule-of-2-and-4 "close enough" tolerance the ticket asks for:
 * an outs estimate a bucket-width off the exact equity still grades correct. A named, tunable knob.
 */
const BUCKET_WIDTH = 0.08

/**
 * How many number buckets a generated calculation spot offers — a 3-choice retrieval check (the
 * containing bucket plus two plausible distractors). At least two is the curriculum contract; three is
 * the sweet spot the owner picked: enough that a lucky guess is a 1-in-3, few enough to stay tappable
 * on a phone, mirroring the binary Call/Fold of the other kinds without ballooning into a numeric pad.
 */
const CALC_CHOICES = 3

/**
 * The exclusive upper bound of the **ceiling bucket** — the top-most bucket the grid can offer, the one
 * that touches the 100% ceiling. A hair *above* `1.0` (not exactly `1.0`) on purpose: {@link gradeSpot}'s
 * containment rule is half-open `lo <= value < hi`, so a `hi` of exactly `1.0` would NOT contain a
 * perfectly legal locked-up `value === 1.0` (a flopped nuts vs the assumed range) — `findContainingBucket`
 * would return `-1` and `gradeSpot` would throw on a legal spot. Nudging the bound a hair past 1 makes the
 * ceiling bucket *inclusive of 1.0 for containment* (`1.0 < 1.0001`), while {@link bucketLabel} still
 * renders it "…–100%" (`Math.round(1.0001 * 100) === 100`) — so containment and the displayed label are
 * decoupled and never disagree at the 1.0 edge, and no label ever shows above 100%. Kept ≤ `1.0001` so the
 * package test's `expect(c.hi).toBeLessThanOrEqual(1.0001)` partition invariant still holds.
 */
const CEILING_HI = 1.0001

/**
 * Format a `[lo, hi)` equity-fraction bucket as the human button label — a percent *range*, e.g.
 * `[0.2, 0.28) → "20–28%"`. Rounds each bound to a whole percent (the buckets are whole-percent-aligned
 * by construction — see {@link buildBuckets}) so the label reads clean, and matches how the rest of the
 * app renders percentages (`@holdem/format`'s `pct` is one-decimal; a *range* label reads better whole,
 * and the underlying grade uses the exact `lo`/`hi`, not the label). The ceiling bucket's `hi` of
 * {@link CEILING_HI} rounds to a clean `100`, so a top-of-range bucket reads "…–100%", never "…–104%".
 */
function bucketLabel(lo: number, hi: number): string {
  return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`
}

/**
 * The grid-bucket index of the **ceiling bucket** — the top-most bucket the grid offers, the one that
 * touches the 100% ceiling. With `W = 0.08` that is index `12`: `floor(1 / 0.08) === 12`. Every grid
 * bucket `k < CEILING_BUCKET` is the ordinary half-open `[k·W, (k+1)·W)`; the ceiling bucket `k ===
 * CEILING_BUCKET` is `[CEILING_BUCKET·W, CEILING_HI)` — i.e. `[0.96, 1.0001)` — whose top is clamped to
 * {@link CEILING_HI} so it both *contains* a value of exactly `1.0` (a flopped lock) and *labels* as
 * "…–100%", never the impossible "96–104%" the unclamped `[0.96, 1.04)` would have rendered.
 *
 * Why this is the largest offered index: a fraction-quantity value lives in `[0, 1]` (pot-odds in
 * ~`0.167–0.333`, equity across the closed `[0, 1]`), so `floor(value / W)` is at most
 * `floor(1.0 / 0.08) === 12 === CEILING_BUCKET`; clamping the containing index there guarantees no
 * offered bucket ever exceeds the ceiling. (For `value === 1.0`, `floor(1.0 / 0.08)` is already exactly
 * 12, so the clamp is a no-op there; it guards only against float dust nudging the index to 13.)
 */
const CEILING_BUCKET = Math.floor(1 / BUCKET_WIDTH)

/**
 * The `[lo, hi)` bounds of grid bucket `k`, whole-percent-aligned. The ordinary bucket is
 * `[k·W, (k+1)·W)`; the {@link CEILING_BUCKET} is special-cased to `[k·W, CEILING_HI)` so its top is the
 * 1.0-inclusive, 100%-labelled ceiling (see {@link CEILING_HI}) rather than a `> 100%` spill. Bounds are
 * rounded to whole-percent fractions so float dust (`0.08·3 = 0.24000000000000002`) never leaks into a
 * `lo`/`hi` and a boundary value sits cleanly on the grid the grade compares to.
 */
function gridBucketBounds(k: number): { lo: number; hi: number } {
  const lo = Math.round(k * BUCKET_WIDTH * 100) / 100
  const hi = k >= CEILING_BUCKET ? CEILING_HI : Math.round((k + 1) * BUCKET_WIDTH * 100) / 100
  return { lo, hi }
}

/**
 * Build the offered number buckets for a calculation spot: a contiguous run of {@link CALC_CHOICES}
 * half-open `[lo, hi)` buckets of {@link BUCKET_WIDTH} each, tiling the percentage line so that **exactly
 * one** of them contains `value` and the rest are *adjacent* (hence plausible) distractors.
 *
 * **The tiling (why exactly one bucket ever contains the value).** Buckets are anchored to a fixed grid
 * of multiples of {@link BUCKET_WIDTH} — bucket `k` is `[k·W, (k+1)·W)`, except the top-most
 * {@link CEILING_BUCKET} which is `[k·W, CEILING_HI)` (≈`[0.96, 1.0001)`). `value` lands in grid bucket
 * `floor(value / W)`, **clamped to `CEILING_BUCKET`** so a value of exactly `1.0` (a flopped lock vs the
 * assumed range) lands in the ceiling bucket — which *contains* `1.0` under {@link gradeSpot}'s half-open
 * `lo <= v < hi` rule because its `hi` is a hair above 1 ({@link CEILING_HI}). Because the buckets are
 * half-open at the top and tile the grid with no gaps or overlaps, `value` is in that one grid bucket and
 * no other (a boundary value `k·W` belongs to the *upper* bucket). We then offer a window of
 * `CALC_CHOICES` consecutive grid buckets that *includes* the containing one, so the correct bucket is
 * always on offer and the distractors are the neighbouring deciles — a genuine "is it ~25% or ~33%?"
 * retrieval, never an absurd "5% vs 95%".
 *
 * **The window placement (seeded variety, always in range).** Delegated to the shared
 * {@link pickWindowStart}: the dealer picks how far *before* the containing bucket the window starts, then
 * the window is clamped within `[0, CEILING_BUCKET]` (no bucket above the 100% ceiling) and re-nudged to
 * keep the containing bucket inside it — so wherever the value falls (a tiny pot-odds price, a
 * near-coin-flip equity, a flopped 100% lock), the offered buckets are legal percentages whose labels
 * never exceed 100% and the answer is always present. (The boundary clamp — the ceiling-spill fix — lives
 * in `pickWindowStart`, so it can never again drift between this and the category-window caller.)
 *
 * Returns the buckets in ascending order (a stable, readable low→high button column), so `gradeSpot`'s
 * `correctIndex` and the UI's order agree. Pure: all randomness is the seeded `dealer`.
 */
export function buildBuckets(dealer: Dealer, value: number): NumericChoice[] {
  // The grid bucket the value falls in: bucket k spans [k·W, (k+1)·W). floor(value/W) is that index,
  // CLAMPED to CEILING_BUCKET so value === 1.0 (floor(1/0.08) === 12) — and any float-dust overshoot —
  // lands in the 1.0-inclusive ceiling bucket rather than an out-of-range index.
  const containing = Math.min(CEILING_BUCKET, Math.floor(value / BUCKET_WIDTH))
  // Place a CALC_CHOICES-wide window over the grid 0..CEILING_BUCKET that contains the value's bucket —
  // the shared, boundary-correct algorithm (the ceiling-spill fix lives in pickWindowStart, not here).
  const start = pickWindowStart(dealer, containing, CALC_CHOICES, CEILING_BUCKET)

  const buckets: NumericChoice[] = []
  for (let i = 0; i < CALC_CHOICES; i++) {
    const { lo, hi } = gridBucketBounds(start + i)
    buckets.push({ label: bucketLabel(lo, hi), lo, hi })
  }
  return buckets
}

/**
 * Generate a numeric-retrieval {@link CalculationSpot} (ticket 0077): deal a coherent *priced* postflop
 * spot, compute the asked {@link CalculationQuantity} from the math the app already owns, and offer the
 * number buckets {@link buildBuckets} tiles around it. The player taps the bucket the math lands in.
 *
 * **Always priced.** Unlike a coach spot, a calculation spot is *always* dealt a non-zero price (the
 * fraction is drawn from {@link PRICED_FRACTIONS}, never the free `0`): a free spot has pot odds of `0`
 * — a degenerate "what price?" — so every calculation quantity (the price, the equity needed to pay it,
 * the equity read against that price) is only well-posed facing a real bet.
 *
 * **The value is computed, never stored (the no-answer-key invariant).** We compute the value *here*
 * only to *place the buckets around it* — the same math {@link gradeSpot} re-runs at grade time to
 * decide the correct bucket. The spot carries the buckets and the `quantity`, never which bucket is
 * right; `gradeSpot` derives that. We deliberately use the **same** computations `gradeSpot` does
 * (`potOdds(toCall, pot)` for the price quantities; the coach's *own seeded* `.equity` for the equity
 * quantity, via the curriculum's `synthesizeContext` so the read is byte-identical to the live coach's),
 * so the bucket we tile *around* is exactly the bucket the grade will rule correct.
 *
 * **Pot accounting.** Identical to {@link generateCoachSpot}: `toCall = round(deadPot · fraction)` and
 * `pot = deadPot + toCall` (the win-pot), so `potOdds(toCall, pot)` equals the coach's
 * `potOddsThreshold` for the same deal — a calculation spot's pot-odds answer never disagrees with what
 * a coach spot on the same deal would price.
 *
 * @param dealer The seeded dealer every choice is drawn from.
 * @param quantity Which number to ask for (the pot-odds price, the required equity, or an equity estimate).
 */
function generateCalculationSpot(dealer: Dealer, quantity: CalculationQuantity): CalculationSpot {
  const holeCards = dealer.dealHole()
  const board = dealer.dealBoard('flop')
  const numActive = MIN_ACTIVE + dealer.nextInt(MAX_ACTIVE - MIN_ACTIVE + 1)

  const deadPot = pick(dealer, POT_BUCKETS)
  // A calculation spot is ALWAYS priced — a free spot has degenerate pot odds (0), so the price
  // quantities (and the equity-vs-price framing) are only well-posed against a real bet.
  const fraction = pick(dealer, PRICED_FRACTIONS)
  const toCall = Math.round(deadPot * fraction)
  // Same win-pot convention as generateCoachSpot, so the pot-odds answer matches the coach's threshold.
  const pot = deadPot + toCall

  const context: SpotContext = { holeCards, board, pot, toCall, numActive }

  // Compute the value with the SAME math gradeSpot will re-run — only to PLACE the buckets around it; the
  // spot stores no correct flag (gradeSpot derives the bucket). For 'equity' we read the coach's own
  // seeded equity through the curriculum's synthesizeContext, so it is byte-identical to the live read.
  const value =
    quantity === 'equity'
      ? coachDecision(synthesizeContext(context), { type: 'call' }).equity
      : potOdds(toCall, pot)

  const choices = buildBuckets(dealer, value)

  const concept: CalculationSpot['concept'] = quantity === 'equity' ? 'equity' : 'pot-odds'

  return {
    kind: 'calculation',
    prompt: buildCalculationPrompt(quantity, holeCards, board, pot, toCall, numActive),
    choices,
    quantity,
    context,
    concept,
  }
}

/**
 * How many category buttons a generated {@link HandReadingSpot} offers — a 3-choice recognition check
 * (the true category plus two plausible distractors), the same tappable-on-a-phone count the calculation
 * kind uses ({@link CALC_CHOICES}). Three is enough that a lucky guess is a 1-in-3, few enough to stay a
 * clean column of buttons. The number of distractors is `HAND_READING_CHOICES - 1`.
 */
const HAND_READING_CHOICES = 3

/**
 * Build the offered category choices for a hand-reading spot: the **true** category (so the answer is
 * always on offer) plus `{@link HAND_READING_CHOICES} - 1` *neighbouring* distractor categories, in
 * ascending rank order (a stable, readable weak→strong button column).
 *
 * **The distractors are neighbours on the rank ladder (plausible, never absurd).** We take a contiguous
 * window of {@link HAND_READING_CHOICES} categories that *includes* the true one, placed by the shared
 * {@link pickWindowStart} — the seeded dealer varies how far *before* the true category the window starts,
 * clamped so the whole window stays within the legal `0..8` category range and the true category is always
 * inside it (the SAME boundary-correct window placement {@link buildBuckets} uses for number buckets). So
 * the distractors are always the
 * categories just weaker/stronger than the real hand — "is this Two Pair or just a Pair? or a Set?" — a
 * genuine recognition check, and the true category's button position varies across seeds rather than
 * always being, say, the lowest.
 *
 * The choices carry **only labels**, never a correct flag — {@link gradeSpot} derives the correct one
 * from `evaluate7` at grade time. Pure: all randomness is the seeded `dealer`.
 *
 * @param dealer The seeded dealer the window offset is drawn from.
 * @param trueCategory The category the hero's cards actually make — always included in the window.
 */
export function buildCategoryChoices(
  dealer: Dealer,
  trueCategory: HandCategory,
): HandReadingChoice[] {
  const n = HAND_CATEGORY_NAMES.length // 9 categories, ranks 0..8
  // Place a HAND_READING_CHOICES-wide window over the rank ladder 0..n-1 that contains the true category
  // — the SAME shared, boundary-correct placement buildBuckets uses for number buckets.
  const start = pickWindowStart(dealer, trueCategory, HAND_READING_CHOICES, n - 1)

  const choices: HandReadingChoice[] = []
  for (let i = 0; i < HAND_READING_CHOICES; i++) {
    // The label is the VERBATIM HAND_CATEGORY_NAMES string gradeSpot matches the true category against —
    // so the offered label and the derived answer are spelled identically and the grade can never miss.
    choices.push({ label: HAND_CATEGORY_NAMES[start + i]! })
  }
  return choices
}

/**
 * Generate a board-reading {@link HandReadingSpot} (ticket 0078): deal the hero a holding and a
 * `street`-sized board, then offer the made-hand category plus plausible neighbours — *"what's the best
 * hand you have here?"*.
 *
 * **The deal.** Hole cards and a flop/turn/river board come off one seeded, shuffled deck
 * ({@link Dealer}), duplicate-free by construction. `street` defaults to `'flop'`; a turn/river theme
 * passes `'turn'`/`'river'` so board reading is drilled on later streets too (the evaluator reads 5..7
 * cards either way). A hand-reading spot is *not* a continue decision — it has no pot, price, or
 * Call/Fold — so unlike a coach spot it draws no money buckets.
 *
 * **The true category is computed only to PLACE the choices around it (the no-answer-key invariant).**
 * We run `evaluate7([...holeCards, ...board])` *here* only to centre the distractor window on the real
 * category — the SAME evaluator {@link gradeSpot} re-runs at grade time to rule the correct choice. The
 * spot stores the category *labels*, never which is right; `gradeSpot` derives that from the evaluator.
 * So the true category is always on offer and the grade can never disagree with the live evaluator.
 *
 * **Concept.** `'ranges'` — see the {@link HandReadingSpot} doc: reading the made hand is the
 * strength-tier recognition the `'ranges'` lens is built on, and no other {@link Concept} fits board
 * reading (the coach has no continue-verdict for "what do you have").
 *
 * @param dealer The seeded dealer every choice is drawn from.
 * @param street The board street to deal — `'flop'` (default), `'turn'`, or `'river'`.
 */
function generateHandReadingSpot(dealer: Dealer, street: PostflopStreet): HandReadingSpot {
  const holeCards = dealer.dealHole()
  const board = dealer.dealBoard(street)

  // Read the made hand off the SAME evaluator gradeSpot re-runs — only to PLACE the distractor window
  // around the true category; the spot stores no correct flag (gradeSpot derives it from evaluate7).
  const trueCategory = evaluate7([...holeCards, ...board]).category
  const choices = buildCategoryChoices(dealer, trueCategory)

  return {
    kind: 'hand-reading',
    prompt: buildHandReadingPrompt(holeCards, board),
    choices,
    holeCards,
    board,
    // Reading the made hand is the strength-tier recognition the 'ranges' lens rests on — the closest fit
    // in the shared Concept vocabulary; the coach has no verdict for board reading. See the spot doc.
    concept: 'ranges',
  }
}

/**
 * Build the question shown on a {@link HandReadingSpot}. A plain, deterministic sentence of the public
 * facts — the holding and the board — then the recognition ask. States the situation only; it never
 * hints at the made hand (the evaluator rules that, and the category buttons are the answer surface).
 * Same seed ⇒ same prompt.
 */
function buildHandReadingPrompt(holeCards: readonly [Card, Card], board: readonly Card[]): string {
  const boardText = board.map(formatCard).join(' ')
  return `You hold ${formatHole(holeCards)} on ${boardText}. What's the best hand you have?`
}

/**
 * The big-blind seat index for a table, in the **same HU-aware geometry** the coach's
 * {@link classifyPosition} uses — so the seat this generator excludes is byte-for-byte the seat the
 * coach would short-circuit to a free check. Heads-up (`numPlayers === 2`) the button is the small
 * blind and the *other* seat the big blind (BB = `button + 1`); three-handed and up the BB sits two
 * seats left of the button (BB = `button + 2`). Kept in lock-step with `classifyPosition` so the
 * exclusion can never drift from the seat the coach actually treats as the BB.
 */
function bigBlindSeat(buttonIndex: number, numPlayers: number): number {
  return numPlayers === 2 ? (buttonIndex + 1) % numPlayers : (buttonIndex + 2) % numPlayers
}

/**
 * Pick the hero's preflop seat uniformly over every seat **except the big blind** — the seat the live
 * coach short-circuits to a free check rather than an open/fold decision (see
 * {@link generatePreflopSpot}). Draws one of the `numPlayers - 1` non-BB seats from the seeded dealer
 * and maps it past the excluded BB index, so the result is always a legal, BB-free seat on the single
 * reproducible stream. (`numPlayers >= 2` always holds, so there is at least one non-BB seat — the
 * button.)
 */
function pickSeatExcludingBigBlind(
  dealer: Dealer,
  buttonIndex: number,
  numPlayers: number,
): number {
  const bb = bigBlindSeat(buttonIndex, numPlayers)
  // Draw over the numPlayers-1 non-BB seats, then skip the BB: any draw at or past the BB index shifts
  // up by one, so every seat except `bb` is reachable with equal probability.
  const draw = dealer.nextInt(numPlayers - 1)
  return draw < bb ? draw : draw + 1
}

/**
 * A nominal open-raise size, in chips, for the preflop **Open** choice's {@link Action}. The exact
 * size is grading-inert — `gradePreflop` keys off the holding and seat, not how much the hero opens —
 * so any positive amount serves; a clean `3` (a 3×-ish open in big-blind units) reads sensibly if ever
 * surfaced. Named so the "size doesn't matter to the grade" intent is one obvious constant.
 */
const PREFLOP_OPEN_AMOUNT = 3

/**
 * The two answer choices a preflop decision offers: **Open** (raise to enter the pot) then **Fold**.
 * "Open" is modelled as a `raise` because that is what entering an unraised pot *is* — putting chips in
 * — and `gradePreflop` grades any non-fold as a continue against the chart's open/fold prescription, so
 * the raise `amount` is immaterial to the grade (the chart reads the holding + seat, never the size).
 * A nominal `amount` keeps the {@link Action} well-formed. Fixed order (Open first) for the same
 * stable-`correctIndex` reason as {@link COACH_CHOICES}.
 */
const PREFLOP_CHOICES: readonly ActionChoice[] = [
  { label: 'Open', action: { type: 'raise', amount: PREFLOP_OPEN_AMOUNT } },
  { label: 'Fold', action: { type: 'fold' } },
]

/**
 * Generate a preflop {@link PreflopSpot}: deal the hero a holding and a random seat geometry, and offer
 * the Open/Fold binary the starting-hand chart grades.
 *
 * **The deal.** Only the hero's two hole cards are dealt (preflop has no board), off the seeded deck —
 * distinct by construction. **The geometry.** `numPlayers`, the dealer `buttonIndex`, and the hero's
 * `seat` are drawn from the seeded dealer because the chart is *position-aware* (it opens marginal
 * hands only from late seats / steal spots), so a generated preflop spot must vary the seat to exercise
 * that. The button is a free uniform draw; the seat is drawn over every seat **except the big blind**
 * (see below) and may coincide with the button (the hero on the button) — a legal, common spot.
 *
 * **The big blind is excluded (the well-posedness fix).** A generated preflop spot offers an *Open or
 * Fold* binary — a raise-first-in decision. But the live coach's `gradePreflop` short-circuits an
 * *unraised* big blind to a FREE CHECK (`'bb-option'`), never an open/fold: with `synthesizeContext`'s
 * `opponents: []` the pot is folded to the hero (a steal/RFI spot), so a BB-seated hero owes nothing
 * and the coach would let it check for free, never fold a trash hand. Our Open/Fold choices never offer
 * that `check`, so a BB-seat spot would grade the hero as an opener and rule a marginal/trash hand
 * "Fold correct, Open a leak" — diverging from the live coach, breaking the no-answer-key invariant. So
 * we seat the hero only where the open/fold question is actually well-posed (every seat but the BB).
 * The **small blind** is kept: when folded to, the SB is a genuine steal/RFI seat
 * ({@link WIDENING_POSITIONS}), open-or-fold is the real decision, and `gradePreflop` grades it through
 * the opening chart (no free-check short-circuit) — so it grades exactly like the coach.
 *
 * The returned spot carries no correct flag: `gradeSpot` runs `gradePreflop` over the holding + seat to
 * rule whether Open or Fold is right for *this* position.
 *
 * @param dealer The seeded dealer every choice is drawn from.
 */
function generatePreflopSpot(dealer: Dealer): PreflopSpot {
  const holeCards = dealer.dealHole()
  const numPlayers = MIN_ACTIVE + dealer.nextInt(MAX_ACTIVE - MIN_ACTIVE + 1)
  const buttonIndex = dealer.nextInt(numPlayers)
  const seat = pickSeatExcludingBigBlind(dealer, buttonIndex, numPlayers)

  return {
    kind: 'preflop',
    prompt: buildPreflopPrompt(holeCards, seat, buttonIndex, numPlayers),
    choices: PREFLOP_CHOICES,
    holeCards,
    seat,
    buttonIndex,
    numPlayers,
  }
}

/**
 * Render the hero's two hole cards as a compact `"A♠ K♦"`-style string — the human label a prompt
 * leads with. Delegates to the engine's {@link formatCard} so the notation matches the rest of the
 * app; the two cards are space-joined.
 */
function formatHole(holeCards: readonly [Card, Card]): string {
  return `${formatCard(holeCards[0])} ${formatCard(holeCards[1])}`
}

/**
 * Build the question shown on a postflop {@link CoachSpot}. A plain, deterministic sentence of the
 * spot's public facts — the holding, the board, the table size, and the price (or "checked to you" on
 * a free spot) — so the same seed renders the same prompt. It states the situation only; it never
 * hints at the answer (that is the coach's to rule).
 */
function buildCoachPrompt(
  holeCards: readonly [Card, Card],
  board: readonly Card[],
  pot: number,
  toCall: number,
  numActive: number,
  actions: ActionSet,
): string {
  const boardText = board.map(formatCard).join(' ')
  const villains = numActive - 1
  const opp = villains === 1 ? '1 opponent' : `${villains} opponents`
  const price =
    toCall === 0
      ? `It's checked to you (pot ${pot}, ${opp})`
      : `${opp}, pot ${pot}, ${toCall} to call`
  // The closing question names the buttons on offer so it never hints at an answer — "Call or fold?" for
  // the binary, "Call, raise, or fold?" for the richer set (ticket 0078).
  const question = actions === 'call-raise-fold' ? 'Call, raise, or fold?' : 'Call or fold?'
  return `You hold ${formatHole(holeCards)} on ${boardText}. ${price}. ${question}`
}

/**
 * The question stem for each {@link CalculationQuantity} — the *what number* a calculation prompt asks
 * for, appended after the spot's situation. Kept as a small table (not inline branches) so the wording
 * for each quantity lives in one obvious place, and stated as a question the player retrieves a number
 * for — never hinting at the answer (the buckets are the answer surface; the math rules which is right).
 */
const CALC_QUESTION: Readonly<Record<CalculationQuantity, string>> = {
  'pot-odds': 'What pot odds are you getting — what fraction of the final pot does the call cost?',
  'required-equity': 'What equity do you need to call profitably?',
  equity: 'Estimate your equity — your share of the pot if you saw it to showdown.',
}

/**
 * Build the question shown on a {@link CalculationSpot}. A plain, deterministic sentence of the spot's
 * public facts — the holding, the board, the table size, and the price — followed by the
 * {@link CALC_QUESTION} stem for the asked quantity. States the situation only; the number the player
 * must produce is left to the math (and the offered buckets), never spelled out here. Same seed ⇒ same
 * prompt.
 */
function buildCalculationPrompt(
  quantity: CalculationQuantity,
  holeCards: readonly [Card, Card],
  board: readonly Card[],
  pot: number,
  toCall: number,
  numActive: number,
): string {
  const boardText = board.map(formatCard).join(' ')
  const villains = numActive - 1
  const opp = villains === 1 ? '1 opponent' : `${villains} opponents`
  return `You hold ${formatHole(holeCards)} on ${boardText}. ${opp}, pot ${pot}, ${toCall} to call. ${CALC_QUESTION[quantity]}`
}

/**
 * Build the question shown on a preflop {@link PreflopSpot}. States the holding (in plain English via
 * the coach's {@link describeHandClass}/{@link handClassLabel}, so "A♣ J♣" reads as "Ace-Jack suited")
 * and the seat geometry, then asks open-or-fold — again stating the situation only, never the answer.
 */
function buildPreflopPrompt(
  holeCards: readonly [Card, Card],
  seat: number,
  buttonIndex: number,
  numPlayers: number,
): string {
  const handClass = describeHandClass(handClassLabel(holeCards))
  // The seat's distance after the button — 0 is the button itself, 1 the seat just left of it — a
  // position cue a learner can read without knowing the absolute seat index.
  const seatsAfterButton = (seat - buttonIndex + numPlayers) % numPlayers
  const where =
    seatsAfterButton === 0 ? 'on the button' : `${seatsAfterButton} seat(s) after the button`
  return `You're dealt ${formatHole(holeCards)} (${handClass}) ${where} at a ${numPlayers}-handed table. Open or fold?`
}
