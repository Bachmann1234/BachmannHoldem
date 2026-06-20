/**
 * Bet-**sizing recommendation** — the deterministic core of the coach's betting & sizing guidance
 * ([[0100-coach-betting-sizing-guidance]]), the part the rest of M8 trusts ([[0101-coach-sizing-intent-and-bands]]).
 *
 * The continue-decision coach ({@link coachDecision}) answers *fold vs. call/check* and deliberately
 * declines to grade *bet/raise size*: a truly correct size needs fold-equity assumptions
 * (`evOfBet`'s `villainCallProbability`) the deterministic engine does not own, and the *optimal*
 * size is a solver output we have explicitly deferred (ROADMAP / [LEARNING-APPROACH.md]). This module
 * does **not** reach for that optimum. It answers the honest, deterministic question instead: given
 * the spot the coach already reads, **what is the bet trying to do, and what size band serves that
 * job?** — the teachable heuristics the Foundations bet-sizing lesson ([[0072-lesson-bet-sizing]])
 * already commits to. Beginners rarely lose money sizing 0.62-pot when 0.55 was ideal; they lose it
 * shoving 100bb to win 3, min-betting the nuts, or 3-bet-to-2.1x — **purpose** errors, checkable
 * without a solver.
 *
 * Three pure, deterministic functions, each a pure function of the {@link DecisionContext} (the same
 * imperfect-information view the bots decide from, [[0017-opponent-seam]]):
 *
 * 1. {@link classifySpot} — the betting *situation* (open / 3-bet+ / overcall / c-bet / lead / raise),
 *    from `toCall`, the line, street, and position. (This is also the fix for the coach narrating a
 *    BTN *overcall* of a limped pot as an RFI/steal *open* — exploratory-testing finding 2026-06-19.)
 * 2. {@link classifyIntent} — the bet's *purpose* (value / bluff / protection / steal), reusing the
 *    coach's existing equity read ({@link coachAssumedRead} + {@link estimateEquity} pinned to
 *    {@link COACH_SEED}, exactly as {@link coachDecision} does — never a new equity path) plus the spot.
 * 3. {@link recommendedBand} — a recommended size **band** (`[lo, hi]` in pot fraction, plus the
 *    equivalent "to" chip range for the live pot), keyed to intent × spot, from the lesson's rules of
 *    thumb. **Always a band, never a single number**, and never a solver/GTO claim.
 *
 * **Recommendation only — NOT a grade.** Nothing here looks at the {@link Action} the hero took; this
 * is "what size should the spot *want*, and why", a *pre*-action function (it also feeds the ActionBar
 * anchoring, [[0104-pwa-actionbar-sizing-anchoring]], before the hero acts). Grading the hero's chosen
 * size against the band — the risk/reward guardrail that flips the ATo-shove green check — is
 * [[0102-coach-sizing-verdict-and-explain]], which is also the ticket that adds a `sizing` field to
 * {@link DecisionVerdict}. We add none here.
 *
 * **Determinism.** {@link classifyIntent} reuses the same seeded ({@link COACH_SEED}) Monte-Carlo read
 * {@link coachDecision} pins, so the same `ctx` always yields the same intent and band — the stability
 * the heavier tests in this milestone rest on.
 *
 * Purity: zero I/O, no Node/DOM/network, all randomness seeded. Imports only `@holdem/*` and relative
 * `.js` specifiers.
 */

import { rankIndex, suitIndex } from '@holdem/engine'
import { estimateEquity, type DecisionContext } from '@holdem/bots'
import { onlyBlindsBehind } from './position.js'
import {
  coachAssumedRead,
  COACH_SEED,
  VALUE_BET_THRESHOLD,
  type VillainArchetype,
} from './verdict.js'

/**
 * The **single-sourced peg vocabulary** the bet-sizing lesson ([[0072-lesson-bet-sizing]]) teaches and
 * the coach reasons in — each pot-fraction *peg* mapped to the pot-odds *price* (as a fraction `0..1`)
 * it lays the caller. This is the same family of pegs the pot-odds lesson taught the learner to *read*
 * a bet by; the sizing lesson teaches them *backwards* (the size you bet IS the price you offer), and
 * the coach's bands must speak the **same** vocabulary so a learner never sees one number on the felt
 * and a contradicting one in the lesson.
 *
 * **Why these live here, and only here.** The peg→price numbers used to exist only as prose in three
 * separate sentences of `foundations.ts`, free to drift from any coach output that quoted them. Per the
 * acceptance criterion the values are single-sourced *here* (the coach owns the betting math) and the
 * curriculum *consumes* them — the dependency direction is `curriculum → @holdem/coach` (curriculum
 * already depends on coach), so importing this constant into the lesson is safe; the reverse
 * (coach → curriculum) would close a cycle and is forbidden.
 *
 * **The arithmetic each value encodes** (a bet of fraction `f` of the pot lays the caller
 * `f / (1 + 2f)` — they call `f` into a pot that becomes `1 + 2f`):
 *
 * - `quarter` (¼-pot) → `0.25 / 1.5 ≈ 0.167` → **~17%**.
 * - `third` (⅓-pot)   → `0.333 / 1.667 ≈ 0.20` → **~20%**.
 * - `half` (½-pot)     → `0.5 / 2.0 = 0.25` → **~25%**.
 * - `threeQuarter` (¾-pot) → `0.75 / 2.5 = 0.30` → **~30%**.
 * - `pot` (full-pot)   → `1.0 / 3.0 ≈ 0.333` → **~33%**.
 *
 * The values are the *rounded teaching pegs* (17/20/25/30/33%), not re-derived from the formula at
 * runtime, precisely because they are a memorised vocabulary: the learner internalises "third-pot ≈
 * 20%", and the coach must quote that exact peg, not `0.2003…`. A named, tunable constant in the house
 * style — retune the lesson and the coach in lock-step by editing this one table.
 */
export const SIZE_PEGS = {
  /** A quarter-pot bet — lays the caller ~17%. The small, cheap size (a thin/blocker bet, a cheap probe). */
  quarter: { fraction: 0.25, price: 0.17 },
  /** A third-pot bet — lays the caller ~20%. The small end of a standard value/c-bet range. */
  third: { fraction: 1 / 3, price: 0.2 },
  /** A half-pot bet — lays the caller ~25%. The workhorse value/c-bet size. */
  half: { fraction: 0.5, price: 0.25 },
  /** A three-quarter-pot bet — lays the caller ~30%. The big end of value, and the protection size. */
  threeQuarter: { fraction: 0.75, price: 0.3 },
  /** A full-pot bet — lays the caller ~33%. The biggest standard size (polarised value / max protection). */
  pot: { fraction: 1, price: 0.33 },
} as const

/** The peg names of {@link SIZE_PEGS}, smallest→largest — for callers iterating the vocabulary in order. */
export type SizePeg = keyof typeof SIZE_PEGS

/**
 * The betting **situation** a bet/raise sits in — *what kind of bet this is*, derived deterministically
 * from the line, never from the hero's holding. The classification {@link classifySpot} returns and the
 * axis {@link recommendedBand} keys its bb/pot rules of thumb off.
 *
 * Preflop (`board.length === 0`):
 *
 * - `'open'` — the hero is the **first raise** into the pot: only the blinds (and possibly limpers) are
 *   in, no one has raised yet (`currentBet <= bigBlind`, so the standing bet is just the big blind).
 *   Sized in big blinds (≈2–2.5bb, +~1bb per limper).
 * - `'3bet+'` — a raise is **already in** (`currentBet > bigBlind`): the hero re-raising is a 3-bet (or
 *   4-bet+). Sized as a multiple of the raise (≈3x in position, 4x out).
 * - `'overcall'` — the hero is **flat-calling a limped pot** (`toCall > 0` but the price is only the big
 *   blind — no one has raised). This is the spot the coach used to misread as an RFI/steal *open*; a
 *   limped pot the hero is *calling* into is an overcall, and an overcall is not sized (you match the
 *   bet, you do not pick a number).
 *
 * Postflop (`board.length >= 3`):
 *
 * - `'c-bet'` — the hero is **betting an unbet pot in position / as the preflop aggressor proxy**: a
 *   continuation bet. (See the proxy note on {@link classifySpot} — the context cannot prove who raised
 *   preflop, so we proxy the c-bet vs. lead split by position.)
 * - `'lead'` — the hero is **betting into an unbet pot out of position**: a donk/lead.
 * - `'raise'` — the hero is **raising a bet already in** (`toCall > 0` postflop): a check-raise or
 *   raise. Sized as a multiple of the bet faced.
 */
export type SpotKind = 'open' | '3bet+' | 'overcall' | 'c-bet' | 'lead' | 'raise'

/**
 * The **intent** of a bet/raise — the *job the bet is doing*, the thing the band is sized to serve and
 * the lens the whole sizing lesson turns on. From the coach's existing equity read plus the spot:
 *
 * - `'value'` — the hero is **ahead**: bet so worse hands pay you off. The read is comfortably above a
 *   coin-flip against the assumed range.
 * - `'bluff'` — the hero is **behind**: bet to fold out better hands. The read is well below break-even.
 * - `'protection'` — *thin value / protection*: a **marginal** read on a **vulnerable (draw-heavy)
 *   board**, where a bet both charges the draws and extracts thin value. The board's draw count feeds
 *   this case.
 * - `'steal'` — a **wide late-position preflop open with a weak holding**: the bet's job is fold equity
 *   (take the blinds uncontested), not value. A preflop-only intent.
 */
export type Intent = 'value' | 'bluff' | 'protection' | 'steal'

/**
 * A recommended size **band** for a spot — the output of {@link recommendedBand}. Always a *band*
 * (`[lo, hi]`), never a single "optimal" number, in keeping with the no-solver-authority rule: the
 * coach recommends a *range that serves the job*, and any size inside it is fine.
 *
 * Two coordinate systems, both carried so a caller (the review drawer, the ActionBar slider) can use
 * whichever it renders in:
 *
 * - **Pot fraction** (`lo`/`hi`) — the peg vocabulary, e.g. `[0.5, 0.75]` for a ½–¾-pot value bet. The
 *   stable, pot-relative band. `null` for both when the spot is sized in big blinds rather than pot
 *   fraction (a preflop open/3-bet — see {@link bbLo}/{@link bbHi}).
 * - **"To" chips** (`toLo`/`toHi`) — the same band converted to the live pot/bet: the absolute chip
 *   amounts to bet/raise *to*, so the slider can shade the actual numbers the hero will act on.
 *
 * Preflop opens/3-bets are *natively* sized in big blinds, so they additionally carry {@link bbLo}/
 * {@link bbHi}; the pot-fraction band is `null` there (a 2.5bb open is not naturally a pot fraction).
 */
export interface SizeBand {
  /** The spot this band is for (the {@link classifySpot} result), carried so the band is self-describing. */
  readonly spot: SpotKind
  /** The intent this band serves (the {@link classifyIntent} result), carried for the same reason. */
  readonly intent: Intent
  /** Low end of the band as a fraction of the pot, or `null` when the spot is sized in big blinds. */
  readonly lo: number | null
  /** High end of the band as a fraction of the pot, or `null` when the spot is sized in big blinds. */
  readonly hi: number | null
  /** Low end of the band in big blinds (preflop open/3-bet only), or `null` postflop. */
  readonly bbLo: number | null
  /** High end of the band in big blinds (preflop open/3-bet only), or `null` postflop. */
  readonly bbHi: number | null
  /** The band's low end as an absolute "bet/raise-to" chip amount for the live pot/bet. */
  readonly toLo: number
  /** The band's high end as an absolute "bet/raise-to" chip amount for the live pot/bet. */
  readonly toHi: number
  /**
   * `true` when the spot is genuinely **size-agnostic** — multiple bands are all fine and there is no
   * one band the coach should anchor (e.g. an overcall, where you *match* the bet and pick no size).
   * Honestly flagged rather than faking a single false band: the band fields still carry a sensible
   * widened default for rendering, but a caller should present this as "any reasonable size" / "no size
   * to pick" rather than a prescriptive anchor.
   */
  readonly sizeAgnostic: boolean
}

/**
 * The number of big blinds a single limper adds to the recommended **open** size — the "+~1bb per
 * limper" rule of thumb from the bet-sizing lesson. Each player who limped in front sweetens the pot
 * and warrants a larger raise so the open still charges a real price; a *tunable knob* modelling that
 * coarsely (the lesson's rule, not a solver's output).
 */
export const OPEN_BB_PER_LIMPER = 1

/**
 * The base recommended **open** band in big blinds — `≈2–2.5bb`, the lesson's standard raise-first-in
 * size, before the {@link OPEN_BB_PER_LIMPER} per-limper adjustment. A named, tunable band; the low/high
 * keep the recommendation a *range* (never a single number) exactly as the postflop pot-fraction bands do.
 */
export const OPEN_BB_BAND = { lo: 2, hi: 2.5 } as const

/**
 * The recommended **3-bet** sizing multiples — `≈3x the raise in position, 4x out of position` — the
 * lesson's 3-bet rule of thumb. Out of position you size up because you will be playing the rest of the
 * hand at an information disadvantage and want to deny the caller a cheap, profitable flat. Tunable
 * multiples (of the bet faced), kept as low/high so even the 3-bet recommendation is a small band, not a
 * single number.
 */
export const THREE_BET_MULTIPLE = {
  /** In position: ~3x the raise faced. */
  inPosition: { lo: 3, hi: 3.5 },
  /** Out of position: ~4x the raise faced. */
  outOfPosition: { lo: 4, hi: 4.5 },
} as const

/**
 * The recommended **value** band in pot fraction — `½–¾ pot` ({@link SIZE_PEGS}`.half` to
 * `.threeQuarter`), the lesson's value-bet rule of thumb: big enough that worse hands paying you off is
 * real money, not so big it folds out the very hands you are value-betting. Derived from the pegs so the
 * band and the lesson's price vocabulary can never drift.
 */
export const VALUE_BAND = {
  lo: SIZE_PEGS.half.fraction,
  hi: SIZE_PEGS.threeQuarter.fraction,
} as const

/**
 * The recommended **protection / thin-value** band in pot fraction — `¾ pot up to pot`
 * ({@link SIZE_PEGS}`.threeQuarter` to `.pot`): on a draw-heavy board you bet *bigger* so the draws must
 * pay a steep price to chase (a cheap bet just lets them draw out — the lesson's protection point).
 * Derived from the pegs. The top of the standard sizes, reflecting that protection wants the largest
 * non-overbet size.
 */
export const PROTECTION_BAND = {
  lo: SIZE_PEGS.threeQuarter.fraction,
  hi: SIZE_PEGS.pot.fraction,
} as const

/**
 * The equity, as a fraction `0..1`, **below** which the hero's read is a **bluff** (well behind the
 * assumed range — bet to fold out better hands). Between this and {@link VALUE_BET_THRESHOLD} (the
 * "comfortably ahead" value cut, reused from the verdict module) the read is *marginal*: thin value at
 * best, and on a vulnerable board a protection bet. A named, tunable knob; the lower edge of the
 * marginal band.
 */
export const BLUFF_EQUITY_THRESHOLD = 0.4

/**
 * How many distinct draw "outs categories" a board must show to count as **vulnerable (draw-heavy)** —
 * the threshold that routes a *marginal* read into the {@link Intent} `'protection'` case (charge the
 * draws) rather than a plain thin bet. Counted by {@link boardDrawSignals}: a flush draw present (two+ of
 * a suit) and a straight-draw texture (connected/coordinated ranks) each contribute. At/above this many
 * signals the board is wet enough that a marginal made hand wants to bet big for protection. A *tunable
 * knob*, deliberately coarse (the deterministic context cannot enumerate every combo draw) — it proxies
 * "is this board wet?" from the two cheapest texture reads.
 */
export const VULNERABLE_BOARD_DRAW_SIGNALS = 1

/**
 * Count the coarse **draw signals** on a board — the deterministic "is this board draw-heavy?" proxy the
 * protection case rests on. We do not enumerate villain's combo draws (out of scope, and a width read
 * cannot); we read the two cheapest texture signals straight off the board cards:
 *
 * - **Flush-draw texture** — any suit appears on **two or more** board cards, so a flush draw is live
 *   (and, on the river's fifth card, possibly a made flush the hero must charge).
 * - **Straight-draw texture** — *any* three distinct board ranks are **coordinated**: some triple of
 *   distinct ranks spans ≤4 (open-enders / gutshots plentiful — connected or one-gap boards like 9-8-7,
 *   J-T-8). We slide the coordination window over *every* triple of the sorted distinct ranks, not just
 *   the three lowest, so straight texture among higher cards on a 4-/5-card board is caught (K-Q-J-3-2
 *   is coordinated, not dry). The ace is additionally counted as a **low** card (rank below the deuce)
 *   when present, so the wheel textures A-2-3 / A-2-4 / A-3-4 read as straight-coordinated rather than
 *   having their span inflated by the ace's high rank.
 *
 * Returns the count of signals present (`0`, `1`, or `2`), which {@link classifyIntent} compares against
 * {@link VULNERABLE_BOARD_DRAW_SIGNALS}. Preflop (no board) is `0` — there is no texture, and the
 * protection case is postflop-only. Pure: reads only `ctx.board`, no evaluator, no randomness.
 */
export function boardDrawSignals(ctx: DecisionContext): number {
  const board = ctx.board
  if (board.length < 3) return 0

  // Read rank/suit through the engine's branded-card primitives ({@link rankIndex} / {@link suitIndex})
  // rather than hand-rolling the codec — the encoding is `suit * 13 + rank`, not a bit-pack, so the
  // helpers are the single source of truth for decoding a card.
  const suits = new Map<number, number>()
  const ranks = new Set<number>()
  for (const card of board) {
    const suit = suitIndex(card)
    suits.set(suit, (suits.get(suit) ?? 0) + 1)
    ranks.add(rankIndex(card))
  }

  let signals = 0

  // Flush-draw texture: any suit on two+ board cards means a flush draw is live.
  for (const count of suits.values()) {
    if (count >= 2) {
      signals += 1
      break
    }
  }

  // Straight-draw texture: any three distinct ranks coordinated within a span of 4 or less (e.g. 9-8-7
  // spans 2, J-T-8 spans 3) means open-enders and gutshots are plentiful. We slide a 3-wide window over
  // EVERY consecutive triple of the sorted distinct ranks — not just the three lowest — so high-card
  // coordination on a 4-/5-card board is caught (K-Q-J-3-2 has the K-Q-J triple span 2). Because the
  // ranks are sorted ascending, the tightest-spanning triple for any window is its three consecutive
  // members, so consecutive triples suffice. Three+ distinct ranks are needed; a very paired board
  // (fewer distinct ranks) is not straight-coordinated.
  //
  // Ace-low (the wheel): the ace ranks high (index 12), which would inflate the span of A-2-3, so when an
  // ace is present we also consider it as a low card (one below the deuce, index -1) — A-2-3 then reads as
  // the coordinated triple (-1)-0-1, span 2. We add the low ace as an extra synthetic rank and sort, so a
  // wheel triple is found by the same sliding window.
  const distinct = [...ranks]
  const ACE = 12
  const ACE_LOW = -1
  if (ranks.has(ACE)) distinct.push(ACE_LOW)
  const sortedRanks = distinct.sort((a, b) => a - b)
  for (let i = 0; i + 2 < sortedRanks.length; i++) {
    const span = sortedRanks[i + 2]! - sortedRanks[i]!
    if (span <= 4) {
      signals += 1
      break
    }
  }

  return signals
}

/**
 * Classify the betting **situation** of the spot — `open` / `3bet+` / `overcall` preflop, `c-bet` /
 * `lead` / `raise` postflop — a pure, deterministic function of the line, street, and position. The
 * axis {@link recommendedBand} keys its rules of thumb off, and the fix for the coach narrating a BTN
 * *overcall* of a limped pot as an RFI/steal *open* (exploratory-testing finding 2026-06-19).
 *
 * **Preflop** (`board.length === 0`), split on whether a raise is already in and whether the hero owes
 * chips:
 *
 * - A raise is already in (`currentBet > bigBlind`) → `'3bet+'`. *Whether the hero owes chips or not* —
 *   re-raising a raise is a 3-bet; this is the "current bet is a raise, not just the blind" test the
 *   ticket calls for.
 * - No raise in, the hero owes chips (`toCall > 0`, but only up to the big blind) → `'overcall'`: a
 *   limped pot the hero is **flat-calling** into. This is the corrected case — a call of a limped pot is
 *   an overcall, not an open.
 * - No raise in, the hero owes nothing or is putting in the first raise (`toCall === 0`, or the only
 *   "bet" is the blind) → `'open'`: the hero is the first raise into the pot (raise-first-in / a
 *   completed-blind raise / the BB raising its option).
 *
 * **Postflop** (`board.length >= 3`):
 *
 * - The hero owes chips (`toCall > 0`) → `'raise'`: there is a bet in front, so betting more is a raise.
 * - The hero owes nothing (`toCall === 0`) → a bet into an unbet pot: `'c-bet'` **in position**, `'lead'`
 *   **out of position**.
 *
 * **Proxy (documented in the house style, mirroring {@link assumedLineRead}).** The
 * {@link DecisionContext} carries *no* preflop-aggressor history, so the c-bet/lead split cannot be
 * proven — a true c-bet is "the preflop raiser betting the flop". We **proxy** it by position: betting an
 * unbet pot **in position** (`ctx.isButton`, the seat that most often *was* the preflop aggressor and
 * holds the initiative) is treated as a `'c-bet'`; betting **out of position** is a `'lead'`. This is a
 * deliberately coarse stand-in (a blind that defended and now leads is technically a donk we will call a
 * lead, a flat-caller in position betting when checked to is technically a probe we will call a c-bet),
 * but the *sizing* recommendation is identical for both postflop bet situations anyway (both take the
 * intent-keyed pot-fraction band), so the split is for narration/labelling, not for choosing a different
 * band. Pure: reads only `board`, `street`, `toCall`, `currentBet`, `bigBlind`, `isButton`.
 */
export function classifySpot(ctx: DecisionContext): SpotKind {
  const preflop = ctx.board.length === 0

  if (preflop) {
    // A raise is already in front of the hero (the standing bet exceeds the big blind): re-entering is a
    // 3-bet (or 4-bet+). This holds whether or not the hero already has chips in — the test is purely
    // "is the current bet a raise, or just the blind?" per the ticket.
    if (ctx.currentBet > ctx.bigBlind) return '3bet+'

    // No raise in. If the hero owes chips, the only price is the big blind (an unraised/limped pot), so
    // flat-calling it is an OVERCALL — the corrected case (a call of a limped pot is not an RFI open).
    if (ctx.toCall > 0) return 'overcall'

    // No raise in and nothing owed (or the hero is putting in the first raise): the hero is the first
    // raise into the pot — an OPEN (raise-first-in / completed-blind raise / BB raising its option).
    return 'open'
  }

  // Postflop. A bet is already in front → betting more is a RAISE; nothing in front → a bet into an
  // unbet pot, split c-bet (in position) vs lead (out of position) by the documented position proxy.
  if (ctx.toCall > 0) return 'raise'
  return ctx.isButton ? 'c-bet' : 'lead'
}

/**
 * Read the hero's **equity** for the sizing intent — the *same* seeded ({@link COACH_SEED}) Monte-Carlo
 * read {@link coachDecision} runs, reused verbatim rather than re-derived: {@link coachAssumedRead}
 * picks the line-aware assumed range (the {@link COACH_ASSUMED_RANGE} baseline on an unbet pot, the
 * board-aware polarised range on a barrel, etc.), and {@link estimateEquity} samples the hero against
 * the `ctx.numActive - 1` opponents actually live in the pot. Returns the equity fraction `0..1`.
 *
 * Single point of reuse so the sizing intent reads against the *identical* villain the continue verdict
 * does — no second equity path that could disagree with the felt's equity read. Deterministic for a
 * given `ctx` (and optional archetype). Internal; {@link classifyIntent} is the public surface.
 */
function readEquity(ctx: DecisionContext, villainArchetype?: VillainArchetype): number {
  const { opponentRange } = coachAssumedRead(ctx, villainArchetype)
  return estimateEquity({
    holeCards: ctx.holeCards,
    board: ctx.board,
    opponentRange,
    seed: COACH_SEED,
    opponentCount: ctx.numActive - 1,
  }).equity
}

/**
 * Classify the **intent** of a bet/raise in this spot — `value` / `bluff` / `protection` / `steal` —
 * from the coach's existing equity read plus the {@link classifySpot} situation. The purpose the
 * {@link recommendedBand} sizes for, and the lens the bet-sizing lesson turns on.
 *
 * **It reuses the existing read — it does not re-derive equity.** The equity comes from {@link readEquity}
 * → {@link coachAssumedRead} + {@link estimateEquity} pinned to {@link COACH_SEED}, exactly the read
 * {@link coachDecision} runs, so the same `ctx` always yields the same intent and the felt's equity and
 * the sizing intent can never disagree.
 *
 * **The rules** (in priority order):
 *
 * - **Steal** (preflop only) — a **wide blind-steal open** (`classifySpot === 'open'` from a steal seat:
 *   the button or small blind, heads-up-aware — {@link onlyBlindsBehind}) with a **weak holding** (equity
 *   below {@link VALUE_BET_THRESHOLD} against the assumed range). The bet's job is fold equity, not value.
 *   Checked first because a steal-seat open with a junk hand is a steal even though its raw equity
 *   would otherwise read as a bluff.
 * - **Value** — equity at/above {@link VALUE_BET_THRESHOLD}: comfortably ahead, bet so worse hands pay.
 * - **Protection (thin value)** — a *marginal* read (between {@link BLUFF_EQUITY_THRESHOLD} and
 *   {@link VALUE_BET_THRESHOLD}) on a **vulnerable (draw-heavy) board** ({@link boardDrawSignals} at/
 *   above {@link VULNERABLE_BOARD_DRAW_SIGNALS}): bet big to charge the draws and take thin value. The
 *   board's draw count feeds exactly this case.
 * - **Bluff** — everything else: a below-{@link BLUFF_EQUITY_THRESHOLD} read (behind — bet to fold out
 *   better hands), or a marginal read on a *dry* board (no protection job, so a thin/bluffy bet). A
 *   marginal hand on a dry board has little to protect against and little to value-bet, so the bet is, in
 *   effect, a thin bluff — the closest of the four labels.
 *
 * Pure and deterministic (seeded). The optional `villainArchetype` colours the assumed-range read the
 * same bounded way {@link coachAssumedRead} does; omitted, the read is the line-only grade.
 */
export function classifyIntent(ctx: DecisionContext, villainArchetype?: VillainArchetype): Intent {
  const spot = classifySpot(ctx)
  const equity = readEquity(ctx, villainArchetype)

  // Steal: a wide blind-steal preflop OPEN with a weak holding — the bet's job is fold equity, not
  // value. A junk hand opened from the button or small blind reads as a steal even though its raw equity
  // is bluff-low, so this is checked before the value/bluff equity cut. The steal seat is the canonical
  // `onlyBlindsBehind` predicate (button OR small blind, heads-up-aware) the preflop coach already owns,
  // so the sizing steal label and the preflop chart agree on an SB open. Only a preflop open is a steal.
  if (spot === 'open' && onlyBlindsBehind(ctx) && equity < VALUE_BET_THRESHOLD) {
    return 'steal'
  }

  // Value: comfortably ahead of the assumed range — bet so worse hands pay you off.
  if (equity >= VALUE_BET_THRESHOLD) return 'value'

  // Marginal (between the bluff and value thresholds): on a vulnerable, draw-heavy board this is a
  // protection / thin-value bet (charge the draws); on a dry board there is nothing to protect, so it
  // falls through to the bluff label as a thin bet.
  const marginal = equity >= BLUFF_EQUITY_THRESHOLD
  if (marginal && boardDrawSignals(ctx) >= VULNERABLE_BOARD_DRAW_SIGNALS) {
    return 'protection'
  }

  // Behind (or a marginal hand on a dry board): the bet's job is to fold out better hands — a bluff.
  return 'bluff'
}

/**
 * Recommend a size **band** for the spot — `[lo, hi]` in pot fraction (or big blinds for a preflop open/
 * 3-bet) **plus** the equivalent "bet/raise-to" chip range for the live pot — keyed to intent × spot,
 * from the bet-sizing lesson's rules of thumb ([[0072-lesson-bet-sizing]]). **Always a band, never a
 * single "optimal" number, and never a solver/GTO claim.**
 *
 * A *pre-action* recommendation: it reads only the spot (via {@link classifySpot} / {@link classifyIntent}),
 * never the hero's chosen action. Grading the hero's size against this band is
 * [[0102-coach-sizing-verdict-and-explain]].
 *
 * **The rules of thumb, keyed by spot then intent:**
 *
 * - **Open** (preflop, first raise in) → {@link OPEN_BB_BAND} (≈2–2.5bb) + {@link OPEN_BB_PER_LIMPER} per
 *   limper, sized natively in **big blinds** (the pot-fraction band is `null`). Limpers are the opponents
 *   who *voluntarily* entered (`status === 'active'`, `committed >= bigBlind`, not the big-blind seat —
 *   the same voluntary-entrant test preflop.ts's `isStealSpot` uses), so the posted small and big blinds
 *   are NOT miscounted as limpers and a plain RFI over only-blinds stays at the base 2–2.5bb band.
 * - **3-bet+** (preflop, a raise already in) → {@link THREE_BET_MULTIPLE} of the raise faced — 3x in
 *   position, 4x out — expressed in **big blinds** (the resulting "to" size in bb), pot-fraction `null`.
 * - **Value** (postflop bet/raise) → {@link VALUE_BAND} (½–¾ pot).
 * - **Protection** (postflop, marginal on a wet board) → {@link PROTECTION_BAND} (¾–pot — charge the draws).
 * - **Bluff** (postflop) → **matches the value band on this line** ({@link VALUE_BAND}): a bluff is sized
 *   to look exactly like the value bets it is balanced against (the polarised-barrel reasoning — a bluff
 *   that bets smaller than your value bets is transparent), so the band is the same ½–¾ pot. This is the
 *   reuse of {@link polarizedBarrelRange}'s logic the ticket calls for: value and bluff bets on a line
 *   share a size so the line is unreadable.
 * - **Overcall** (preflop flat-call of a limped pot) → **size-agnostic**: you *match* the bet, you do not
 *   pick a number, so {@link SizeBand.sizeAgnostic} is `true` and the band is a widened placeholder.
 *
 * **The "to" chip conversion.** For a postflop bet into an unbet pot, the "to" amount of a fraction `f`
 * is `round(f · pot)` (you bet `f` of the pot, on top of nothing owed). For a postflop *raise*, the band
 * is still a pot fraction of the pot *after* calling — `round(f · (pot + toCall))` plus the call — a
 * standard "raise to" approximation; we keep it a band so the coarseness is honest. For preflop opens/
 * 3-bets the "to" amount is the bb band times the big blind (open) or the multiple times the raise faced
 * (3-bet). All conversions round to whole chips.
 *
 * **Size-agnostic, honestly.** Where a spot genuinely has no single band to anchor (the overcall), we set
 * {@link SizeBand.sizeAgnostic} rather than invent a false number — the band fields still carry a sensible
 * widened default so a slider has *something* to render, but a caller should present "any reasonable size"
 * / "no size to pick".
 *
 * Pure and deterministic (the intent read is seeded). Throws nothing of its own; a malformed `ctx`
 * surfaces through the reused {@link estimateEquity} read exactly as {@link coachDecision} does.
 */
export function recommendedBand(
  ctx: DecisionContext,
  villainArchetype?: VillainArchetype,
): SizeBand {
  const spot = classifySpot(ctx)
  const intent = classifyIntent(ctx, villainArchetype)

  // --- Preflop: opens and 3-bets are sized in big blinds, not pot fraction. ---
  if (spot === 'open') {
    // +~1bb per limper: count the opponents who *voluntarily* entered the pot this street, the same way
    // preflop.ts's `isStealSpot` detects a voluntary entrant (a limper or a completed small blind):
    // still `'active'`, `committed >= bigBlind` (completed to the big blind), and NOT the big-blind seat
    // (the BB's posted big blind is involuntary). In the `open` branch classifySpot guarantees no raise
    // is in (`currentBet <= bigBlind`), so `committed >= bigBlind` cleanly catches a limper who completed
    // to the BB while excluding the small blind's smaller post and the BB's own involuntary post — fixing
    // the prior `committed > 0` filter that miscounted both posted blinds as limpers (so a plain button
    // RFI over only-blinds recommended 4–4.5bb instead of 2–2.5bb).
    //
    // `bbSeat` is the HU-aware big-blind seat (heads-up the button *is* the small blind, so the BB is
    // `button+1`, not `button+2`) — the same geometry preflop.ts/position.ts compute. It is recomputed
    // locally rather than imported because `position.ts` does not export a big-blind-seat helper and this
    // module is scoped to a single file; the OpponentView carries no big-blind flag, so the seat must be
    // derived from `buttonIndex + numPlayers` here.
    const n = ctx.numPlayers
    const bbSeat = n === 2 ? (ctx.buttonIndex + 1) % n : (ctx.buttonIndex + 2) % n
    const limpers = ctx.opponents.filter(
      (o) => o.status === 'active' && o.committed >= ctx.bigBlind && o.seat !== bbSeat,
    ).length
    const bbLo = OPEN_BB_BAND.lo + limpers * OPEN_BB_PER_LIMPER
    const bbHi = OPEN_BB_BAND.hi + limpers * OPEN_BB_PER_LIMPER
    return {
      spot,
      intent,
      lo: null,
      hi: null,
      bbLo,
      bbHi,
      toLo: Math.round(bbLo * ctx.bigBlind),
      toHi: Math.round(bbHi * ctx.bigBlind),
      sizeAgnostic: false,
    }
  }

  if (spot === '3bet+') {
    // 3x in position, 4x out — of the raise faced (`ctx.toCall` is the chips to match the raise, the
    // raise size proxy). Out of position when not on the button (the coarse IP/OOP read the lesson uses).
    const mult = ctx.isButton ? THREE_BET_MULTIPLE.inPosition : THREE_BET_MULTIPLE.outOfPosition
    // The raise faced as a "to" total: the standing bet (`currentBet`). The 3-bet "to" size is the
    // multiple times that standing raise. Expressed in bb too for the lesson's vocabulary.
    const raiseTo = ctx.currentBet
    const toLo = Math.round(mult.lo * raiseTo)
    const toHi = Math.round(mult.hi * raiseTo)
    return {
      spot,
      intent,
      lo: null,
      hi: null,
      // classifySpot only returns '3bet+' when `currentBet > bigBlind`, which forces `bigBlind > 0`, so
      // the divide is unconditional (no dead zero-guard) — mirroring the `open` branch's bare multiply.
      bbLo: toLo / ctx.bigBlind,
      bbHi: toHi / ctx.bigBlind,
      toLo,
      toHi,
      sizeAgnostic: false,
    }
  }

  // --- Preflop overcall: genuinely size-agnostic — you match the bet, you pick no number. ---
  if (spot === 'overcall') {
    // A widened placeholder band so a renderer has something, but flagged size-agnostic: the honest
    // representation of "no size to pick here" rather than a false single anchor.
    return {
      spot,
      intent,
      lo: SIZE_PEGS.quarter.fraction,
      hi: SIZE_PEGS.pot.fraction,
      bbLo: null,
      bbHi: null,
      // An overcall matches the bet faced — the "to" amount is simply calling that bet.
      toLo: ctx.toCall,
      toHi: ctx.toCall,
      sizeAgnostic: true,
    }
  }

  // --- Postflop: a pot-fraction band keyed by intent. ---
  // Bluff matches the value band on the line (polarised-barrel reasoning: size your bluffs like your
  // value bets so the line is unreadable). Protection charges the draws (¾–pot). Value is ½–¾.
  const band =
    intent === 'protection'
      ? PROTECTION_BAND
      : // value AND bluff both take the value band (the bluff deliberately matches the value sizing).
        VALUE_BAND

  // The "to" chip conversion. `ctx.pot` is the dead money *before* the hero acts — every committed chip
  // but NOT the hero's pending `toCall`. For a bet into an unbet pot (`toCall === 0`) that pot is the
  // base the bet is sized against; for a raise the base is the pot AFTER the hero calls (`pot + toCall`)
  // and the "to" total includes that call — a standard "raise to" approximation, kept a band so the
  // coarseness is honest.
  const base = spot === 'raise' ? ctx.pot + ctx.toCall : ctx.pot
  const callPart = spot === 'raise' ? ctx.toCall : 0
  const toLo = Math.round(band.lo * base) + callPart
  const toHi = Math.round(band.hi * base) + callPart

  return {
    spot,
    intent,
    lo: band.lo,
    hi: band.hi,
    bbLo: null,
    bbHi: null,
    toLo,
    toHi,
    sizeAgnostic: false,
  }
}
