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

import { formatCard, type Card } from '@holdem/engine'
import { describeHandClass, handClassLabel } from '@holdem/coach'
import type { ActionChoice, CoachSpot, PreflopSpot, Spot, SpotContext } from '@holdem/curriculum'
import { makeDealer, type Dealer } from './deal.js'
import { resolveConfig, type DrillConfig } from './config.js'

/**
 * Generate one drill {@link Spot} from a `seed` and an optional {@link DrillConfig}.
 *
 * The seed seeds a {@link Dealer} that every random choice is threaded through, so the call is pure:
 * `generateSpot(7)` always returns the same spot. The config (defaulted via {@link resolveConfig})
 * selects the branch — a postflop {@link CoachSpot} (the default) or a preflop {@link PreflopSpot} —
 * and shapes a coach spot's price. The returned spot flows straight into curriculum's `gradeSpot`; its
 * correct answer is whatever the coach rules, never stored here.
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
  return resolved.kind === 'preflop'
    ? generatePreflopSpot(dealer)
    : generateCoachSpot(dealer, resolved.priceMode === 'priced')
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
 * Generate a postflop {@link CoachSpot}: deal the hero a holding and a flop, pick a coherent
 * pot/price, and offer the Call/Fold binary the coach grades.
 *
 * **The deal.** Hole cards and a three-card flop come off one seeded, shuffled deck
 * ({@link Dealer}), so they are duplicate-free by construction and the board is a legal flop size.
 * (We deal a flop — the simplest legal postflop board — rather than a turn/river; richer board-street
 * variety is a fine future config knob, out of scope for the generation primitive.)
 *
 * **The money (the pot-accounting rule).** We draw `deadPot` (the dead money *before* the villain's
 * bet) and a price *fraction*, derive the villain's bet `toCall = round(deadPot * fraction)`, and then
 * forward `pot = deadPot + toCall` (the win-pot the hero would collect, **including** the villain's
 * bet) and `toCall` (the chips the hero must add) into the {@link SpotContext}. This is the exact
 * convention the live engine builds and the coach reads (`potOdds` divides by `pot + toCall`; the line
 * read recovers the dead money as `pot - toCall`), so a generated half-pot bet grades as 25% pot odds
 * and reads as a half-pot bet — never the pot-sized barrel the old "pot = dead money" convention
 * manufactured. A `priced` request draws the fraction from {@link PRICED_FRACTIONS} (no free check, so
 * `toCall > 0`); an unconstrained request may draw the `0` free fraction.
 *
 * The returned spot carries *no* correct flag: `gradeSpot` runs `coachDecision` over the
 * {@link SpotContext} to rule which of Call/Fold is right.
 *
 * @param dealer The seeded dealer every choice is drawn from.
 * @param priced Whether a non-trivial price is required (the `'priced'` price mode).
 */
function generateCoachSpot(dealer: Dealer, priced: boolean): CoachSpot {
  const holeCards = dealer.dealHole()
  const board = dealer.dealBoard('flop')
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
    prompt: buildCoachPrompt(holeCards, board, pot, toCall, numActive),
    choices: COACH_CHOICES,
    context,
  }
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
): string {
  const boardText = board.map(formatCard).join(' ')
  const villains = numActive - 1
  const opp = villains === 1 ? '1 opponent' : `${villains} opponents`
  const price =
    toCall === 0
      ? `It's checked to you (pot ${pot}, ${opp})`
      : `${opp}, pot ${pot}, ${toCall} to call`
  return `You hold ${formatHole(holeCards)} on ${boardText}. ${price} — call or fold?`
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
  return `You're dealt ${formatHole(holeCards)} (${handClass}) ${where} at a ${numPlayers}-handed table — open or fold?`
}
