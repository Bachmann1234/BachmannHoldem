/**
 * Per-decision verdict — the deterministic spine of the coaching engine (ticket 0021).
 *
 * Given the imperfect-information view of a spot a player faced (the same
 * {@link DecisionContext} a bot decides from, [[0017-opponent-seam]] / reused from
 * [[0006-heuristic-opponents]]) and the {@link Action} the player actually took, this
 * module answers the only question the whole app exists to answer: *was that a good
 * decision, or a leak?* — and it answers it from the math we already own, not from a
 * model, a hunch, or the result of the hand. We **coach the decision, not the result**
 * (see [LEARNING-APPROACH.md]): a +EV call that lost is still a good call.
 *
 * Everything here composes two layers we have already built and validated, rather than
 * re-deriving any of it:
 *
 * 1. **The read** — how good is the hand right now? Answered by {@link estimateEquity}
 *    from `@holdem/bots` ([[0018-bot-hand-reading]]), entirely through `@holdem/odds`,
 *    against the opponents *actually live in the pot*. The coach has no more X-ray vision
 *    than a bot: it reasons against a plausible range ({@link COACH_ASSUMED_RANGE}) per
 *    villain, so the equity here is an **estimate against an assumed range, not an
 *    omniscient truth**. It does, however, read against the right *number* of villains —
 *    `ctx.numActive - 1` of them ([[0031-coach-multiway-equity]]) — so equity at a full
 *    table is not overstated by a heads-up read.
 * 2. **The math** — given that equity and the money on the table, is putting chips in
 *    profitable, and what is it worth? Answered by {@link potOdds} and {@link evOfCall}
 *    from `@holdem/odds` ([[0005-odds-equity-engine]], ticket 0015) — the EV-correct
 *    continue decision falls straight out of `evOfCall`'s sign. We re-derive **none** of
 *    this.
 *
 * **Scope — the hard verdict is the continue decision only.** The deterministic call we
 * own exactly is *fold vs. continue* (call/check) measured against pot odds, plus a
 * coarse value-vs-pot-control read on an unbet pot. We deliberately do **not** grade an
 * exact bet/raise *size*: correct sizing needs fold-equity assumptions
 * ({@link evOfBet}'s `villainCallProbability`) we do not own deterministically. Sizing is
 * left to a later ticket / the optional LLM narration ([[0011-llm-coaching]]).
 *
 * **Determinism.** {@link estimateEquity} is Monte-Carlo sampled against a range, so we
 * pin a fixed {@link COACH_SEED}: the same `(ctx, action)` always yields the same verdict,
 * which is what makes the verdict a stable, testable, replayable asset.
 *
 * Purity: zero I/O, no Node/DOM/network, all randomness seeded. Imports only `@holdem/*`.
 */

import type { Action } from '@holdem/engine'
import {
  DEFAULT_RANGE_WIDTH,
  estimateEquity,
  type DecisionContext,
  type RangeWidth,
} from '@holdem/bots'
import { evOfCall, potOdds } from '@holdem/odds'

/**
 * The villain range the coach assumes when reading the hero's equity: the "I have no
 * specific read" prior — a typical opening range, neither nit nor maniac. Aliased to the
 * bots' {@link DEFAULT_RANGE_WIDTH} (currently `'medium'`) rather than re-declaring the
 * literal, so the coach grades the hero against the *same* plausible villain every bot
 * assumes by default; retuning that prior moves both in lock-step instead of letting them
 * silently diverge. The verdict's equity is therefore *an estimate of how the hero fares
 * against a plausible villain*, not against villain's actual (hidden) cards. A future
 * ticket may let the caller narrow this with a read.
 */
export const COACH_ASSUMED_RANGE: RangeWidth = DEFAULT_RANGE_WIDTH

/**
 * The fixed seed threaded into the Monte-Carlo equity read so the verdict is deterministic.
 * {@link estimateEquity} samples against a range; pinning the seed makes a given
 * `(ctx, action)` always produce the same equity — and therefore the same verdict — so the
 * coaching output is stable across runs, tests, and replays.
 */
export const COACH_SEED = 0

/**
 * The break-even tolerance band, in equity-fraction units.
 *
 * A spot where the hero's equity sits *exactly* on the pot-odds threshold is a true
 * coin-flip: continuing and folding are equal in EV, so neither is a mistake. Real equity
 * reads are Monte-Carlo estimates with sampling noise, and floating-point arithmetic adds
 * its own dust, so an equity that is "really" break-even can land a hair above or below the
 * threshold. Without a tolerance, that dust would flip a coin-flip spot between "good" and
 * "leak" at random — coaching noise, not signal.
 *
 * So we treat any spot whose equity is within `EPSILON` of the pot-odds threshold as
 * **break-even**: not a leak no matter which side of the line the play fell on. `0.02`
 * (two equity points) comfortably covers the sampling error of the equity read — the coach
 * uses {@link estimateEquity}'s default {@link DEFAULT_ITERATIONS} (4000) read, ≈±0.8% on a
 * coin-flip spot — with margin to spare, while still flagging genuinely −EV continues and
 * genuinely +EV folds. Kept as a named exported constant so the band is one obvious,
 * tunable knob.
 */
export const EPSILON = 0.02

/**
 * The mental model a graded spot exercises — the name of the *idea* a verdict turns on.
 *
 * The coach narrates raw numbers (`equity`, `potOddsThreshold`, `callEv`, `verdict`) against a
 * framework it assumes the player already holds; M4.5's Foundations primer
 * ([[0042-foundations-primer]]) teaches that framework, and tagging every verdict with the idea it
 * exercises is what lets the primer, the play coach, and the future M5 drills cross-link a live spot
 * to its lesson ("this is the pot-odds idea from Foundations"). The values are exactly the models
 * the coach uses and the primer teaches:
 *
 * - `'equity'` — your share of the pot if the hand went to showdown right now: how good the hand is,
 *   independent of any price. The lens for a free decision, where there is nothing to weigh it
 *   against.
 * - `'pot-odds'` — the break-even price: what fraction of the pot a call costs, i.e. the minimum
 *   equity a call needs to be worthwhile. The idea in isolation, before it is weighed against equity.
 * - `'equity-vs-price'` — the continue decision proper: weighing your {@link DecisionVerdict.equity}
 *   against the {@link DecisionVerdict.potOddsThreshold pot-odds price} to decide whether putting
 *   chips in is profitable. The primary idea a *priced* continue verdict turns on.
 * - `'ev'` — expected value: the chip-denominated worth of a decision over the long run, the number
 *   that says not just *whether* a play is right but *how much* it is worth.
 * - `'position'` — acting later than your opponents is an edge: more information and more control over
 *   the pot, which widens the hands you can profitably play.
 * - `'ranges'` — thinking in the *set* of hands rather than one holding: the strength tiers a
 *   starting-hand chart sorts hands into, and the assumed range you read equity against. The lens the
 *   preflop chart grades through.
 */
export type Concept = 'equity' | 'pot-odds' | 'equity-vs-price' | 'ev' | 'position' | 'ranges'

/**
 * The EV-correct continue decision the math points to, independent of what the hero did.
 *
 * - `'continue'` — the hero's equity meets or beats the pot-odds threshold (the call/check
 *   is at least break-even); putting chips in is correct.
 * - `'fold'` — the hero's equity is below the threshold by more than {@link EPSILON}; the
 *   continue is clearly −EV and folding is correct.
 *
 * A free check (`toCall === 0`) is always `'continue'` — there is no price to pay.
 */
export type CorrectDecision = 'continue' | 'fold'

/**
 * How the action the hero actually took stacks up against the EV-correct decision.
 *
 * - `'good'` — the hero's action agreed with the math (continued a +EV spot, or folded a
 *   clearly −EV one).
 * - `'leak'` — the hero's action *disagreed* with the math beyond the tolerance band: a
 *   clearly −EV continue (called/raised below the pot-odds threshold by more than
 *   {@link EPSILON}), or a fold of a clearly +EV spot.
 * - `'breakEven'` — the spot is within {@link EPSILON} of the pot-odds threshold, so the
 *   decision is a coin-flip and is **never** scored as a leak regardless of what the hero
 *   chose.
 */
export type ActionVerdict = 'good' | 'leak' | 'breakEven'

/** Whether an {@link Action} keeps the hero in the hand (puts/leaves chips in) or surrenders it. */
function isContinue(action: Action): boolean {
  // Folding is the only action that surrenders the hand; check/call/bet/raise all continue
  // (bet/raise are "continue and then some" — still strictly a non-fold for the verdict).
  return action.type !== 'fold'
}

/**
 * A complete per-decision verdict: the numbers the coach narrates plus the classification.
 *
 * Every field is a plain value (no engine state, no randomness) so the verdict serialises,
 * logs, and renders trivially — it is the hand-off shape the CLI ([[0023-coach-cli-wiring]])
 * and the optional LLM layer ([[0011-llm-coaching]]) consume.
 */
export interface DecisionVerdict {
  /**
   * The hero's estimated equity (expected pot share) as a fraction `0..1`, read against the
   * `ctx.numActive - 1` opponents live in the pot, each on {@link COACH_ASSUMED_RANGE}. An
   * *estimate against an assumed range per villain*, not omniscient; lower at a fuller table.
   */
  readonly equity: number
  /**
   * The break-even equity the call needs: `potOdds(toCall, pot)`. `0` on a free check
   * (`toCall === 0`). The threshold the {@link equity} is judged against.
   */
  readonly potOddsThreshold: number
  /**
   * The chip EV of *calling* relative to folding, in the context's chip unit:
   * `evOfCall({ equity, pot, callAmount: toCall })`. Positive ⇒ continuing gains chips,
   * negative ⇒ it loses them, `0` ⇒ break-even.
   */
  readonly callEv: number
  /** The EV-correct continue decision the math points to (fold vs continue). */
  readonly correctDecision: CorrectDecision
  /** Whether the hero actually continued (non-fold) or folded. */
  readonly heroContinued: boolean
  /** Whether the hero's action was a `'good'` play, a `'leak'`, or a `'breakEven'` coin-flip. */
  readonly verdict: ActionVerdict
  /**
   * The primary mental model this decision turns on — the cross-link to the Foundations primer
   * ([[0042-foundations-primer]]). A single verdict touches equity, pot odds, and EV all at once, so
   * this names the *one* idea the decision hinges on rather than every number it reports:
   *
   * - A **free check** (`toCall === 0`) → `'equity'`. There is no price to weigh, so the decision is
   *   purely reading your share of the pot.
   * - **Facing a price** (`toCall > 0`, both the break-even and the clear-decision branches) →
   *   `'equity-vs-price'`. The continue decision turns on weighing equity against the pot-odds price.
   *
   * `'pot-odds'`, `'ev'`, and `'position'` exist in the {@link Concept} union for the primer
   * ([[0045-foundations-primer-content]]) and M5 drills to tag spots that *isolate* those ideas, even
   * though the live continue-verdict here rolls them into `'equity-vs-price'`. The tag is derived from
   * the spot, never hand-fed.
   */
  readonly concept: Concept
}

/**
 * Coach one decision: read the hero's equity, run the pot-odds / EV math, and classify the
 * {@link Action} the hero took as good, a leak, or a break-even coin-flip.
 *
 * **Pot accounting (read carefully — the easiest bug here, the same one the bots hit).**
 * The odds helpers define `pot` as the dead money *before* the hero's call and `callAmount`
 * as the chips the hero must *add* to call. The {@link DecisionContext} hands us exactly
 * those as `ctx.pot` (the lifetime pot total, already including villain's current bet and
 * the hero's own committed chips, but **not** the `toCall` the hero has yet to add) and
 * `ctx.toCall` (the additional chips to call). So we map **directly**:
 * `potOdds(ctx.toCall, ctx.pot)` and `evOfCall({ equity, pot: ctx.pot, callAmount: ctx.toCall })`.
 * We do **not** add `toCall` into `pot` (the helper does that internally) nor subtract the
 * hero's committed chips. This mirrors `heuristic.ts`'s `wantsToContinue` exactly.
 *
 * **The decision rule.**
 *
 * - A **free check** (`ctx.toCall === 0`) is always at least break-even: the threshold is
 *   `0` and any equity clears it, so the EV-correct decision is `'continue'`. Checking it
 *   is `'good'`; folding a free check would be a (pathological) leak. There is no price, so
 *   the verdict never lands in the tolerance band here.
 * - **Facing a price** (`ctx.toCall > 0`): compare equity to the pot-odds threshold. If
 *   equity is within {@link EPSILON} of the threshold the spot is `'breakEven'` — a
 *   coin-flip, never a leak. Otherwise the EV-correct decision is `'continue'` when
 *   `equity > threshold` and `'fold'` when below; the hero's action is `'good'` if it
 *   matches and a `'leak'` if it does not.
 *
 * Note we grade only *whether* to put chips in, not *how much*: a `bet`/`raise` is scored
 * exactly like a `call`/`check` (a continue). Grading sizing needs fold-equity assumptions
 * we do not own deterministically and is out of scope (see the module doc).
 *
 * Each verdict is tagged with the {@link Concept} it exercises, derived from the spot: a free check
 * is the `'equity'` idea (no price to weigh), and any priced continue — break-even or clear — is the
 * `'equity-vs-price'` idea (the decision turns on weighing equity against the price). See the
 * {@link DecisionVerdict.concept} doc for the full mapping rationale.
 *
 * The equity is a seeded ({@link COACH_SEED}) Monte-Carlo estimate against
 * {@link COACH_ASSUMED_RANGE}, read against the `ctx.numActive - 1` opponents actually live
 * in the pot ([[0031-coach-multiway-equity]]) — deterministic, but an estimate against an
 * *assumed* range per villain, not their actual cards. A heads-up pot reads against one
 * villain (the original behaviour); a fuller table reads against more, so the equity is not
 * overstated.
 *
 * Throws {@link RangeError} (via {@link estimateEquity} / the odds helpers) on malformed
 * inputs: a context with the wrong hole-card count, an illegal board size, a negative pot,
 * or a negative `toCall`.
 */
export function coachDecision(ctx: DecisionContext, action: Action): DecisionVerdict {
  // Guard the pot-accounting numbers in the odds/bots RangeError idiom before they reach
  // the helpers — a clearer message than the deep call's, and it documents the contract.
  if (ctx.pot < 0) throw new RangeError(`ctx.pot must be ≥ 0, got ${ctx.pot}`)
  if (ctx.toCall < 0) throw new RangeError(`ctx.toCall must be ≥ 0, got ${ctx.toCall}`)

  // --- The read: equity against the assumed range, seeded for determinism. ------------
  // Read against the number of opponents ACTUALLY live in the pot — `ctx.numActive - 1`
  // villains, each on COACH_ASSUMED_RANGE — so the equity reflects the real table size. A
  // heads-up pot (`numActive === 2`) is one villain, i.e. the unchanged single-villain read.
  const equity = estimateEquity({
    holeCards: ctx.holeCards,
    board: ctx.board,
    opponentRange: COACH_ASSUMED_RANGE,
    seed: COACH_SEED,
    opponentCount: ctx.numActive - 1,
  }).equity

  // --- The math: map DIRECTLY (pot is BEFORE the call; toCall is the chips to add). ----
  const potOddsThreshold = potOdds(ctx.toCall, ctx.pot)
  const callEv = evOfCall({ equity, pot: ctx.pot, callAmount: ctx.toCall })

  const heroContinued = isContinue(action)

  // A free check has no price: continuing is always correct, and there is no break-even
  // band to fall into (the threshold is exactly 0).
  if (ctx.toCall === 0) {
    return {
      equity,
      potOddsThreshold,
      callEv,
      correctDecision: 'continue',
      heroContinued,
      verdict: heroContinued ? 'good' : 'leak',
      // No price to weigh — the decision is purely reading your share of the pot.
      concept: 'equity',
    }
  }

  // Facing a price: is the spot a coin-flip within the tolerance band?
  if (Math.abs(equity - potOddsThreshold) <= EPSILON) {
    return {
      equity,
      potOddsThreshold,
      callEv,
      // Within tolerance the call is (near-)break-even, so continuing is not a mistake.
      correctDecision: 'continue',
      heroContinued,
      verdict: 'breakEven',
      // Facing a price: the continue decision turns on weighing equity against that price.
      concept: 'equity-vs-price',
    }
  }

  // Clearly off the threshold: the EV-correct decision is the profitable side, and the
  // hero leaks only by choosing the wrong one. `callEv >= 0` is exactly `callIsProfitable`
  // (the odds package documents the two as equivalent), so we derive the decision from the
  // `callEv` we already computed rather than re-running the math through a second helper —
  // one source of truth, no chance of the stored EV and the verdict disagreeing.
  const correctDecision: CorrectDecision = callEv >= 0 ? 'continue' : 'fold'

  const heroWasCorrect = correctDecision === 'continue' ? heroContinued : !heroContinued

  return {
    equity,
    potOddsThreshold,
    callEv,
    correctDecision,
    heroContinued,
    verdict: heroWasCorrect ? 'good' : 'leak',
    // Facing a price: the continue decision turns on weighing equity against that price.
    concept: 'equity-vs-price',
  }
}
