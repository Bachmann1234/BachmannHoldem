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
 *    than a bot: it reasons against a plausible range — the {@link COACH_ASSUMED_RANGE}
 *    baseline on an unbet pot, narrowed tighter on the betting line by
 *    {@link assumedRangeForLine} (ticket 0052) — per villain, so the equity here is an
 *    **estimate against an assumed range, not an omniscient truth**. It does, however, read
 *    against the right *number* of villains —
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
 * left to a later ticket / the optional LLM narration ([[0011-llm-coaching]]). We *do* carry
 * one deterministic aggression signal alongside the verdict — {@link DecisionVerdict.missedValueBet},
 * a heuristic "you checked an unbet pot while comfortably ahead — bet for value" flag (ticket
 * 0055) — but that flags *whether* value is being left on the table, never *how much* to bet.
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
  polarizedBarrelRange,
  type DecisionContext,
  type RangeWidth,
} from '@holdem/bots'
import { evOfCall, potOdds, type Range } from '@holdem/odds'

/**
 * The villain range the coach assumes when reading the hero's equity *with no betting-line
 * read*: the "I have no specific read" prior — a typical opening range, neither nit nor
 * maniac. Aliased to the bots' {@link DEFAULT_RANGE_WIDTH} (currently `'medium'`) rather
 * than re-declaring the literal, so on an unbet pot the coach grades the hero against the
 * *same* plausible villain every bot assumes by default; retuning that prior moves both in
 * lock-step instead of letting them silently diverge.
 *
 * This is the **baseline** width: {@link assumedRangeForLine} starts here on a free
 * decision (`toCall === 0`) and only narrows *tighter* as the villain commits chips to the
 * line — it never re-widens, so the alias's "no read" meaning is preserved exactly where it
 * applies (the unbet pot). The verdict's equity is therefore *an estimate of how the hero
 * fares against a plausible villain on the line villain actually took*, not against
 * villain's actual (hidden) cards.
 *
 * **Coach-only narrowing (a deliberate decision — ticket 0052).** The line-aware narrowing
 * below lives in the **coach alone**; it does **not** tighten the bots, even though both
 * share this alias. The reason is a standing project value (LEARNING-APPROACH.md / ROADMAP):
 * the bots pick their width by *personality* and are deliberately tuned for *believable,
 * fun* play — a loose-aggressive bot reading itself against a wide range is the point, not a
 * leak. The coach, by contrast, exists to grade the hero *honestly*; a static read lets it
 * reward calling stations (a +EV-looking call down vs a barreling villain whose range is in
 * truth far stronger than `'medium'`). So we narrow the **grading read** without touching
 * **bot behaviour**. The baseline-unbet width stays aliased to the bots' default so the "no
 * read" prior remains shared and single-sourced. A future ticket may layer a per-villain
 * read (personality / observed tendencies) on top of this line-only narrowing.
 */
export const COACH_ASSUMED_RANGE: RangeWidth = DEFAULT_RANGE_WIDTH

/**
 * The bet-size threshold, as a fraction of the pot the villain bet *into*, above which a
 * villain's bet counts as *large* and narrows the assumed range one bucket tighter than a
 * small bet on the same street.
 *
 * **Which pot?** We measure the villain's bet against the pot it was made into — the pot
 * **before** the hero's pending call — i.e. `ctx.toCall / (ctx.pot - ctx.toCall)`. `ctx.pot`
 * is the lifetime pot *including* the villain's current bet but **not** the hero's call (see
 * the pot-accounting note on {@link coachDecision}), so subtracting `ctx.toCall` recovers the
 * dead money the bet was sized against — exactly the denominator {@link potOdds} reasons from.
 * On this denominator the ratio is the bet *as a fraction of the pot it faced*: a *pot-sized*
 * bet = `1.0`, a *3/4-pot* bet = `0.75`, a *2/3-pot* bet ≈ `0.667`, a *half-pot* bet = `0.5`.
 *
 * The `0.6` knob therefore fires at roughly a **two-thirds-pot bet or larger** — the sizing
 * that signals a polarised, value-heavy (i.e. tighter than `'medium'`) range, and the band
 * where a barreling villain's true holdings most outrun a static read — while a small
 * continuation-bet (half-pot or less) stays one bucket wider. (The prior `0.4` was correct
 * only against the old post-bet-pot denominator; re-tuned to `0.6` here so the same
 * two-thirds-pot intent holds under the corrected bet-into-pot ratio — picked empirically by
 * the ground-truth sweep.) A named, tunable knob, like {@link EPSILON} / {@link COACH_SEED}.
 */
export const LARGE_BET_POT_FRACTION = 0.6

/**
 * The fixed seed threaded into the Monte-Carlo equity read so the verdict is deterministic.
 * {@link estimateEquity} samples against a range; pinning the seed makes a given
 * `(ctx, action)` always produce the same equity — and therefore the same verdict — so the
 * coaching output is stable across runs, tests, and replays.
 */
export const COACH_SEED = 0

/**
 * The assumed-range width the coach reads against on a free decision — no chips owed, so
 * the villain has revealed nothing about the strength of their line. Stays at the
 * {@link COACH_ASSUMED_RANGE} baseline (the bots' default "no read" prior). Named so the
 * line-narrowing starting point is one obvious knob.
 *
 * Tunable knob — one of {@link assumedRangeForLine}'s three line-strength settings (alongside
 * {@link FACING_BET_RANGE_WIDTH} and {@link BARRELED_RANGE_WIDTH}).
 */
export const UNBET_RANGE_WIDTH: RangeWidth = COACH_ASSUMED_RANGE

/**
 * The assumed-range width the coach reads against when the villain has bet/raised on an
 * *early* street (preflop/flop) with a *small* size — the villain is committing chips to
 * the line, so the range is narrower than the no-read baseline, but a single small bet is
 * the weakest of the three "villain is betting" signals, so we narrow only one bucket to
 * `'tight'`.
 *
 * Tunable knob — one of {@link assumedRangeForLine}'s three line-strength settings (alongside
 * {@link UNBET_RANGE_WIDTH} and {@link BARRELED_RANGE_WIDTH}).
 */
export const FACING_BET_RANGE_WIDTH: RangeWidth = 'tight'

/**
 * The assumed-range width the coach reads against when the villain's line is *strong*: a
 * large bet (≥ {@link LARGE_BET_POT_FRACTION} of the pot) **and/or** continued aggression
 * on a *later* street (turn/river — the villain has, in a typical hand, already fired an
 * earlier street to get here, so a turn/river bet proxies a multi-barrel line we cannot
 * count directly). Either signal alone narrows the read to `'ultraTight'` — the tightest
 * value-heavy range — because that is exactly the spot where the static `'medium'` read
 * over-rated the hero and manufactured calling stations (the seed-28 leak, ticket 0052).
 *
 * Tunable knob — one of {@link assumedRangeForLine}'s three line-strength settings (alongside
 * {@link UNBET_RANGE_WIDTH} and {@link FACING_BET_RANGE_WIDTH}).
 */
export const BARRELED_RANGE_WIDTH: RangeWidth = 'ultraTight'

/**
 * The share of a **barreled, board-aware** villain range that is bluffs (busted draws / air), with
 * the rest being the texture-supported value hands — the polarisation knob ticket 0057 adds on top
 * of [[0052-coach-narrow-range-on-action]]'s width narrowing.
 *
 * On a barreled *postflop* line the coach no longer reads against the fixed {@link BARRELED_RANGE_WIDTH}
 * preflop bucket; it reads against the concrete {@link polarizedBarrelRange} built from the board —
 * the value combos the texture allows plus this fraction of air. A bluff-catcher read against that
 * range earns roughly *this fraction* in equity (it beats the air, loses to the value), so this knob
 * is exactly the "how often is villain bluffing when they barrel" dial.
 *
 * `0.25` models a **value-heavy** barreller — the recreational/bot pool this trainer grades against
 * fires three streets far more for value than as a bluff. It sits below the pot-odds price of a
 * typical (half- to two-thirds-pot) barrel, so a clearly-beaten single pair correctly grades a
 * −EV continue rather than the `Good` the preflop bucket manufactured (the seed-28 leak). Picked
 * empirically against the `pnpm sim` ground-truth sweep — low enough to fold beaten bluff-catchers,
 * high enough not to over-fold hands that genuinely beat a chunk of the barreling range. A named,
 * tunable knob, like {@link EPSILON} / {@link LARGE_BET_POT_FRACTION} / {@link VALUE_BET_THRESHOLD}.
 */
export const BLUFF_FRACTION = 0.25

/**
 * Choose the assumed villain range the coach reads the hero's equity against, *as a pure,
 * deterministic function of the betting line* in the {@link DecisionContext} — the heart of
 * ticket 0052. Today's coach read against a single static {@link COACH_ASSUMED_RANGE} no
 * matter how the villain bet, which over-rated the hero exactly when a villain kept firing
 * (the hero's hand "improves" against a fixed wide range as the board runs out) and so
 * rewarded calling down clearly-beaten hands. This narrows the read instead.
 *
 * There is **no barrel counter** on a `DecisionContext`, so we proxy "how committed is the
 * villain to this line" from the two fields that *are* available — the bet size relative to
 * the pot and the street:
 *
 * - **Unbet pot / free check** (`ctx.toCall === 0`): the villain has owed the hero nothing
 *   and revealed nothing, so we keep the {@link UNBET_RANGE_WIDTH} baseline (= the bots'
 *   default). This is the only branch that leaves the read at the no-read prior, which is why
 *   {@link coachDecision}'s free-check behaviour is byte-identical to before.
 * - **A strong line** — a *large* bet
 *   (`ctx.toCall / (ctx.pot - ctx.toCall) ≥` {@link LARGE_BET_POT_FRACTION}, the villain's bet
 *   as a fraction of the pot it was made *into*; see that constant for the exact ratio)
 *   **or** any bet on a *later* street (turn/river, where reaching the spot at all implies
 *   the villain already bet an earlier street — a proxy for a multi-barrel line): narrow to
 *   {@link BARRELED_RANGE_WIDTH} (`'ultraTight'`). Either signal alone is enough.
 * - **Otherwise a bet/raise** (a small bet on preflop/flop): narrow one bucket to
 *   {@link FACING_BET_RANGE_WIDTH} (`'tight'`).
 *
 * The function reads only `ctx.toCall`, `ctx.pot`, and `ctx.street`, returns a
 * {@link RangeWidth}, and touches no randomness — so it is a pure mapping that keeps the
 * verdict deterministic ({@link coachDecision} still pins {@link COACH_SEED}; this only
 * chooses *which width* to seed the read against). Exported standalone so the mapping is
 * unit-testable in isolation.
 *
 * Guards `ctx.pot`/`ctx.toCall` negativity is left to {@link coachDecision} (which validates
 * before calling this). The bet-into-pot denominator `ctx.pot - ctx.toCall` is the dead money
 * *before* the bet, which is `0` only when the villain bet into a pot with no prior money
 * (pathological postflop, but possible) and negative only in impossible inputs; either way the
 * `denom > 0` guard falls back to `Infinity`, classifying a no-dead-money bet as the strong
 * (barreled) read — the conservative (tighter) side, never a crash or a re-widening.
 */
export function assumedRangeForLine(ctx: DecisionContext): RangeWidth {
  // Delegate to the richer {@link assumedLineRead}, which yields the width AND the reason/betFraction
  // the {@link PostflopTrace} records, then keep only the width. This function's signature and
  // behaviour are byte-identical to before — it remains the standalone, unit-testable line→width
  // mapping {@link coachDecision} (and the existing tests) call — so the trace adds *no* new decision
  // logic; it only surfaces the branch this read already takes.
  return assumedLineRead(ctx).width
}

/**
 * The full line read the coach's equity uses: the {@link assumedRangeForLine} *width* the read is
 * seeded against, **plus** the deterministic by-products the {@link PostflopTrace} records — *why*
 * that width fired ({@link PostflopTrace.lineReason}) and the villain's bet as a fraction of the pot
 * it faced ({@link PostflopTrace.betFraction}). One function so the width and its explanation can
 * never disagree: {@link assumedRangeForLine} returns `assumedLineRead(ctx).width`, and
 * {@link coachDecision} reads both the width and the trace fields from a single call here.
 *
 * **No new decision logic — it records the branch already taken.** The width mapping is exactly the
 * one {@link assumedRangeForLine} always used (the {@link UNBET_RANGE_WIDTH} baseline on a free
 * decision, {@link BARRELED_RANGE_WIDTH} on a large bet or a later-street barrel, else
 * {@link FACING_BET_RANGE_WIDTH}); this helper merely also names which of those three branches it
 * took and carries out the same bet-into-pot ratio the {@link LARGE_BET_POT_FRACTION} comparison
 * already computed. The `reason`/`betFraction` are therefore a pure, deterministic projection of the
 * line, not a second read.
 *
 * The `reason` maps one-to-one onto the width: a free decision (`toCall === 0`) is `'unbet'` (width
 * baseline, `betFraction` `null` — no bet was made); a large bet (`betFraction >=`
 * {@link LARGE_BET_POT_FRACTION}) **or** any later-street (turn/river) bet is `'barreled'` (width
 * `ultraTight`); any other bet/raise is `'facing-bet'` (width `tight`). `betFraction` is the same
 * `toCall / (pot - toCall)` ratio {@link assumedRangeForLine} divides — `null` only on the free
 * check, where there is no bet to size — and `Infinity` on the divide-by-zero guard (a bet into no
 * dead money), which classifies as the strong `'barreled'` read just as the width does.
 *
 * Pure and deterministic, reading only `ctx.toCall`, `ctx.pot`, and `ctx.street` — exported so the
 * trace projection is unit-testable in isolation alongside {@link assumedRangeForLine}.
 */
export function assumedLineRead(ctx: DecisionContext): {
  width: RangeWidth
  reason: PostflopTrace['lineReason']
  betFraction: number | null
} {
  // No chips owed: the villain has revealed nothing — keep the no-read baseline width. There is no
  // bet to size against, so the betFraction is null (not 0 — 0 would read as a check-sized "bet").
  if (ctx.toCall === 0) return { width: UNBET_RANGE_WIDTH, reason: 'unbet', betFraction: null }

  // A later street (turn/river) means the villain, to be betting here, has in a typical hand
  // already fired an earlier street: a stand-in for the multi-barrel line we cannot count.
  const laterStreet = ctx.street === 'turn' || ctx.street === 'river'

  // The villain's bet as a fraction of the pot it was made INTO — the dead money BEFORE the
  // hero's call (`ctx.pot - ctx.toCall`), the same quantity potOdds reasons from (a pot-sized
  // bet = 1.0). See LARGE_BET_POT_FRACTION. The denominator is 0 only with no dead money
  // before the bet and negative only on impossible inputs; the guard treats either as the
  // strong (barreled) read rather than dividing by zero or under-narrowing.
  const denom = ctx.pot - ctx.toCall
  const betFraction = denom > 0 ? ctx.toCall / denom : Infinity
  const largeBet = betFraction >= LARGE_BET_POT_FRACTION

  // Either a large bet or a later-street bet signals a strong, value-heavy line.
  if (largeBet || laterStreet) {
    return { width: BARRELED_RANGE_WIDTH, reason: 'barreled', betFraction }
  }

  // A small bet/raise on an early street: a real commitment, but the weakest of the signals.
  return { width: FACING_BET_RANGE_WIDTH, reason: 'facing-bet', betFraction }
}

/**
 * Build the board-aware polarised range for a barreled spot, returning `null` instead of throwing on a
 * degenerate board (no value combos, or a non-3/4/5 board size) so {@link coachAssumedRead} can honour
 * {@link polarizedBarrelRange}'s documented "fall back to a width read" contract. The throw is
 * unreachable for a legal hold'em board — value combos always survive pruning only the two hero cards —
 * so this never swallows a real error in practice; it is a guard against a malformed/hand-edited spot
 * crashing the grade. The narrow `catch` only converts a degenerate-range throw into the width fallback.
 */
function tryPolarizedBarrelRange(
  ctx: DecisionContext,
): ReturnType<typeof polarizedBarrelRange> | null {
  try {
    return polarizedBarrelRange({
      board: ctx.board,
      bluffFraction: BLUFF_FRACTION,
      blocked: new Set(ctx.holeCards),
    })
  } catch {
    return null
  }
}

/**
 * The concrete opponent holdings the coach reads the hero's equity against, plus the matching
 * {@link PostflopTrace} — the **board-aware** layer ticket 0057 adds on top of
 * {@link assumedLineRead}'s line→width mapping. One function so the range actually read and the trace
 * recorded can never disagree (the trace is, again, a pure projection of the branch taken, not a
 * second decision).
 *
 * It starts from {@link assumedLineRead} (the unbet / facing-bet / barreled classification) and then,
 * on a **barreled line with a postflop board**, swaps the fixed {@link BARRELED_RANGE_WIDTH} preflop
 * bucket for the texture-conditioned {@link polarizedBarrelRange}: the value combos the board supports
 * plus a {@link BLUFF_FRACTION} slice of air. That is the whole point of the ticket — a barreller's
 * range is polarised to board-connected made hands + bluffs, not a preflop opening range, so reading a
 * bluff-catcher against the polarised range stops over-rating it (the residual seed-28 leak). Every
 * other line is unchanged: it reads against the {@link RangeWidth} bucket as before.
 *
 * - **Barreled + board (flop/turn/river)** → `opponentRange` is the polarised {@link Range};
 *   `trace.assumedRange` is `'board-aware'` and `trace.polarized` carries the value/bluff composition.
 *   The hero's own cards are passed as blockers so the realised composition excludes holdings villain
 *   cannot have.
 * - **Barreled but preflop** (a large preflop bet/3-bet, `board.length === 0`) → there is no texture
 *   to read, so it falls back to the {@link BARRELED_RANGE_WIDTH} width exactly as before.
 * - **Unbet / facing-bet** → the {@link UNBET_RANGE_WIDTH} / {@link FACING_BET_RANGE_WIDTH} width, with
 *   `trace.polarized` `null` (no board-aware read).
 *
 * Pure and deterministic: {@link polarizedBarrelRange} is itself a pure function of the board, and the
 * width path is unchanged. Reads only the betting line + board + hero cards from `ctx`.
 */
export function coachAssumedRead(ctx: DecisionContext): {
  opponentRange: RangeWidth | Range
  trace: PostflopTrace
} {
  const lineRead = assumedLineRead(ctx)

  // The only line that gets the board-aware treatment: a barreled bet with real texture to read.
  // A barreled *preflop* bet (3-bet) has no board, so it keeps the width fallback.
  const hasBoard = ctx.board.length >= 3
  if (lineRead.reason === 'barreled' && hasBoard) {
    // polarizedBarrelRange is a pure function of the board and documents that the caller should fall
    // back to a width read on a degenerate board (one with no value combos, or — defensively — a
    // non-3/4/5 board). That degenerate case is unreachable for a legal hold'em board (top-pair /
    // overpair combos always survive pruning only the two hero cards), but we honour the contract so a
    // malformed or hand-edited spot degrades to the width bucket instead of throwing out of
    // coachDecision into a client without an error boundary.
    const polarized = tryPolarizedBarrelRange(ctx)
    if (polarized) {
      return {
        opponentRange: polarized.range,
        trace: {
          assumedRange: 'board-aware',
          lineReason: lineRead.reason,
          betFraction: lineRead.betFraction,
          polarized: {
            valueCombos: polarized.valueCombos,
            bluffCombos: polarized.bluffCombos,
            bluffFraction: polarized.bluffFraction,
          },
        },
      }
    }
    // else: degenerate board — fall through to the width fallback below (BARRELED_RANGE_WIDTH).
  }

  // Every other line (unbet, facing-bet, a barreled preflop bet, or the degenerate-board fallback):
  // the width bucket, no board-aware read.
  return {
    opponentRange: lineRead.width,
    trace: {
      assumedRange: lineRead.width,
      lineReason: lineRead.reason,
      betFraction: lineRead.betFraction,
      polarized: null,
    },
  }
}

/**
 * The equity, as a fraction `0..1`, at or above which a *checked, unbet pot* is a **missed
 * value bet** — the over-passivity knob (ticket 0055).
 *
 * The deterministic coach grades only *fold vs. continue*, so checking a strong hand into an
 * unbet pot scores `'good'` (a free check is never a −EV mistake) and the fact that the hero
 * is **leaving value on the table** by not betting goes unflagged — a beginner drilled on that
 * line learns to play passively. This threshold is the additional signal: when the hero checks
 * an unbet pot with equity at/above it, the hero is comfortably ahead of a typical range and
 * should be *betting for value*, so {@link coachDecision} raises {@link DecisionVerdict.missedValueBet}.
 *
 * `0.6` (60% equity) is "comfortably ahead of a typical {@link COACH_ASSUMED_RANGE} range" —
 * an overpair / top-pair-good-kicker class read — the band where betting for value clearly
 * beats checking, without firing on marginal hands that genuinely prefer pot control. It is a
 * *heuristic* over-passivity flag, deliberately **not** a bet-*sizing* recommendation: correct
 * sizing needs the fold-equity assumption ({@link evOfBet}'s `villainCallProbability`) the
 * deterministic engine does not own, so sizing stays out of scope (see the module doc / ticket
 * 0055). A named, tunable knob, like {@link EPSILON} / {@link COACH_SEED} / {@link LARGE_BET_POT_FRACTION}.
 *
 * The equity this gates is already table-size aware — {@link coachDecision} reads it against the
 * `ctx.numActive - 1` opponents actually live in the pot ([[0031-coach-multiway-equity]]) — so 60%
 * means 60% against the whole live field, not just one villain. What it does *not* model is the
 * pot-control nuance that a thin value bet multiway can prefer a check; that is a sizing concern,
 * out of scope here (the flag only ever *adds* a "consider betting" nudge, never flips the verdict).
 */
export const VALUE_BET_THRESHOLD = 0.6

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
 * The deterministic *decision trace* of a postflop verdict — *why* {@link coachDecision} read the
 * hero against the range it did (the audit trail this part of the project adds). It is a **derived,
 * deterministic by-product** of the same {@link assumedLineRead} the equity read already runs: it
 * records the branch that read took, never any new decision. Its purpose is self-contained
 * explainability — a human (or an AI a human pastes the ruling to) can see at a glance which line
 * read fired and the inputs that selected it, without re-deriving the mapping.
 *
 * Every field is a plain, serialisable value, so the trace round-trips through the NDJSON the CLI
 * sim emits and any copy-to-clipboard blob exactly like the rest of the {@link DecisionVerdict}.
 */
export interface PostflopTrace {
  /**
   * The assumed range the equity read was seeded against. Either a {@link RangeWidth} bucket name
   * (the {@link COACH_ASSUMED_RANGE} baseline on an unbet pot, tighter the harder the villain
   * barreled — the width {@link assumedRangeForLine} picks), **or** the literal `'board-aware'` when
   * the read used the {@link polarizedBarrelRange} concrete range instead of a width: that happens on
   * a barreled *postflop* line (ticket 0057), where a fixed preflop bucket over-rates a bluff-catcher
   * and the texture-conditioned polarised range ({@link PostflopTrace.polarized}) replaces it.
   */
  readonly assumedRange: RangeWidth | 'board-aware'
  /**
   * *Why* that range: which of {@link assumedLineRead}'s three line-strength branches fired.
   * `'unbet'` is the free decision (`toCall === 0`, baseline width); `'barreled'` is a large bet
   * (≥ {@link LARGE_BET_POT_FRACTION}) and/or a turn/river bet (the strong, value-heavy read);
   * `'facing-bet'` is any other bet/raise (one bucket tighter than baseline).
   */
  readonly lineReason: 'unbet' | 'facing-bet' | 'barreled'
  /**
   * The villain's bet as a fraction of the pot it was made into — `toCall / (pot - toCall)`, the
   * same ratio the {@link LARGE_BET_POT_FRACTION} comparison divides (a pot-sized bet = `1.0`).
   * `null` on a free check (`toCall === 0`), where there is no bet to size; `Infinity` on the
   * divide-by-zero guard (a bet into no dead money), which reads as the strong `'barreled'` line.
   */
  readonly betFraction: number | null
  /**
   * The composition of the **board-aware polarised range**, present (non-`null`) *only* when
   * {@link assumedRange} is `'board-aware'` — i.e. on a barreled postflop line where the read used
   * {@link polarizedBarrelRange} instead of a width bucket. Records how many value vs bluff combos the
   * texture produced and the realised bluff fraction, so a ruling can show *how polarised* the assumed
   * villain was without re-deriving it. `null` on every width-based read (unbet, facing-bet, and the
   * barreled-but-preflop fallback, which has no board to read).
   */
  readonly polarized: {
    /** Texture-supported value combos (two pair+/overpairs) in the assumed range. */
    readonly valueCombos: number
    /** Bluff (air) combos in the assumed range — the sampled busted-draw/air fraction. */
    readonly bluffCombos: number
    /** Realised bluff share — `bluffCombos / (valueCombos + bluffCombos)` (see {@link BLUFF_FRACTION}). */
    readonly bluffFraction: number
  } | null
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
   * `ctx.numActive - 1` opponents live in the pot, each on the {@link assumedRangeForLine}
   * width for the betting line (the {@link COACH_ASSUMED_RANGE} baseline on an unbet pot,
   * tighter the harder the villain has barreled). An *estimate against an assumed range per
   * villain*, not omniscient; lower at a fuller table and against a stronger line.
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
   * Over-passivity signal (ticket 0055): the hero **checked an unbet pot** while holding equity
   * at/above {@link VALUE_BET_THRESHOLD} — comfortably ahead of a typical range — so the check,
   * though not a −EV mistake, **leaves value on the table**: the hero should be *betting for value*.
   *
   * This is an **additional** signal layered on top of {@link verdict}, **not** a flip to a leak.
   * The check of a free card is still graded `'good'` (taking a free card is never −EV); this flag
   * is the coach's "the check is fine, but you're leaving value — bet" nudge, surfaced once for all
   * clients through {@link explainDecision}. It fires *only* on the unbet-pot check
   * (`toCall === 0 && action.type === 'check' && equity >= VALUE_BET_THRESHOLD`) and is `false` in
   * every priced (`toCall > 0`) branch. Deliberately scoped: it does **not** flag a flat-call that
   * could raise (murkier) and does **not** grade bet *sizing* (needs fold-equity assumptions the
   * deterministic engine does not own — out of scope per ticket 0055).
   */
  readonly missedValueBet: boolean
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
  /**
   * The deterministic {@link PostflopTrace} — *which* line read fired and the inputs that selected it.
   * A derived, deterministic by-product of the {@link assumedLineRead} the equity read already runs
   * (it records the branch taken, adding no decision logic), present on **every** verdict so a ruling
   * is self-explaining: a human or an AI reviewing it can see why the hero was graded against the
   * range it was, without re-deriving the line→width mapping.
   */
  readonly trace: PostflopTrace
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
 * The equity is a seeded ({@link COACH_SEED}) Monte-Carlo estimate against the width
 * {@link assumedRangeForLine} picks from the betting line (the {@link COACH_ASSUMED_RANGE}
 * baseline on an unbet pot, narrowing tighter the more the villain has barreled — ticket
 * 0052), read against the `ctx.numActive - 1` opponents actually live in the pot
 * ([[0031-coach-multiway-equity]]) — deterministic, but an estimate against an *assumed*
 * range per villain, not their actual cards. A heads-up pot reads against one villain; a
 * fuller table reads against more, so the equity is not overstated.
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

  // --- The read: equity against the assumed range, seeded for determinism. ---
  // The range is a deterministic, pure function of the betting line + board: the no-read
  // COACH_ASSUMED_RANGE baseline width on an unbet pot, narrowing tighter the more the villain
  // committed (a small bet → 'tight'); and on a *barreled postflop* line, the texture-conditioned
  // polarizedBarrelRange (board-connected value + a bluff fraction — ticket 0057) instead of the
  // fixed 'ultraTight' preflop bucket, since a barreller's range is polarised, not a preflop opener.
  // This grades the hero against a *plausible villain on the line + board villain actually faced*,
  // not a fixed preflop bucket, and without touching bot behaviour. Read against the number of
  // opponents ACTUALLY live in the pot — `ctx.numActive - 1` villains, each on that range — so the
  // equity reflects the real table size; a heads-up pot (`numActive === 2`) is the single-villain read.
  // One call yields both the range to seed the read AND the trace, so the recorded "why" can never
  // disagree with the range actually used. The trace is a pure by-product — recording this branch,
  // not taking a new one — and is stamped onto every verdict return below.
  const { opponentRange, trace } = coachAssumedRead(ctx)
  const equity = estimateEquity({
    holeCards: ctx.holeCards,
    board: ctx.board,
    opponentRange,
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
    // Over-passivity signal (ticket 0055): a *check* into the unbet pot with equity comfortably
    // ahead of a typical range leaves value on the table — the hero should be betting. An
    // ADDITIONAL nudge, not a flip to a leak (the free check itself is still graded 'good').
    const missedValueBet = action.type === 'check' && equity >= VALUE_BET_THRESHOLD
    return {
      equity,
      potOddsThreshold,
      callEv,
      correctDecision: 'continue',
      heroContinued,
      verdict: heroContinued ? 'good' : 'leak',
      missedValueBet,
      // No price to weigh — the decision is purely reading your share of the pot.
      concept: 'equity',
      trace,
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
      // A priced spot is never a "missed value bet" — that signal is scoped to the unbet check.
      missedValueBet: false,
      // Facing a price: the continue decision turns on weighing equity against that price.
      concept: 'equity-vs-price',
      trace,
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
    // A priced spot is never a "missed value bet" — that signal is scoped to the unbet check.
    missedValueBet: false,
    // Facing a price: the continue decision turns on weighing equity against that price.
    concept: 'equity-vs-price',
    trace,
  }
}
