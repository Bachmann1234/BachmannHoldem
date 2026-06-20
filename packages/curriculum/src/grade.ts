/**
 * The **grade** seam — turn a {@link Spot} plus the player's chosen answer into a verdict the UI
 * renders (ticket 0044).
 *
 * This is the curriculum's whole point: a single {@link gradeSpot} that the Foundations primer and
 * every M5 drill funnel through, so a new drill spot "drops into the same grade with no new engine
 * code" (the epic's requirement). It does exactly four things — *spot → ask → grade → explain* — and
 * **re-derives nothing**: it hands the spot's inputs to the deterministic coach (`coachDecision`
 * postflop, `gradePreflop` preflop) and reports what the coach ruled.
 *
 * **The correct answer is whatever the coach rules — never a stored literal.** For a coach-graded
 * spot {@link gradeSpot} runs the grader over the spot's context, and the player is correct exactly
 * when the coach does **not** rule *their own* chosen action a leak (`'good'` and `'breakEven'` both
 * pass). For display it also reports `correctIndex` — the first offered choice the coach blesses, a
 * canonical "right answer" — but correctness is judged on the player's action, not index-equality
 * with that one, so multiple valid continues and coin-flip spots are scored consistently with the
 * verdict the result reports. There is no answer key to drift out of sync with the live coach. The
 * {@link DeclarativeSpot} carve-out is the lone exception (its `correct` flags are authored, because
 * the coach cannot rule there) and is clearly the non-default path.
 *
 * **The `concept` tag flows through.** Coach-graded results carry the underlying
 * {@link DecisionVerdict}/{@link PreflopVerdict}, whose `concept` ([[0043-coach-concept-tag]]) the UI
 * uses to cross-link the spot to its lesson. Declarative results carry the author's `concept` tag
 * instead.
 *
 * **The explanation is built from the deterministic numbers, via `@holdem/format`.** Coach-graded
 * explanations are phrased with the *same* `pct` / `signedChips` / `VERDICT_LABEL` helpers the live
 * play coach uses, so the primer narrates a verdict identically to the table — never a parallel
 * wording.
 *
 * Purity: zero I/O, no Node/DOM/network. The only randomness is the coach's seeded equity read.
 */

import type { DecisionContext } from '@holdem/bots'
import { evaluate7, HAND_CATEGORY_NAMES } from '@holdem/engine'
import {
  coachDecision,
  gradePreflop,
  gradeSizing,
  type Concept,
  type DecisionVerdict,
  type PreflopVerdict,
  type SizingRead,
} from '@holdem/coach'
import { potOdds } from '@holdem/odds'
import {
  explainDecision,
  explainPreflop as explainPreflopWhy,
  pct,
  VERDICT_LABEL,
} from '@holdem/format'
import {
  synthesizeContext,
  type Spot,
  type ActionChoice,
  type CalculationSpot,
  type CalculationQuantity,
  type HandReadingSpot,
  type NumericChoice,
} from './spot.js'

/**
 * The coach verdict backing a graded coach spot — either the postflop {@link DecisionVerdict} or the
 * preflop {@link PreflopVerdict}. A graded {@link DeclarativeSpot} has none (the coach did not rule),
 * so this is the *optional* carrier on {@link GradeResult}.
 */
export type SpotVerdict = DecisionVerdict | PreflopVerdict

/**
 * The outcome of grading one spot — the flat, serialisable value the UI renders after the player
 * answers.
 *
 * It reports the player's pick against the *correct* pick (the index into the spot's `choices`), the
 * boolean correctness, the {@link Concept} the spot exercised, the underlying coach `verdict` (absent
 * only for the declarative carve-out), and the {@link explanation} string. No engine state, no
 * functions — it logs, serialises, and round-trips trivially.
 */
export interface GradeResult {
  /**
   * Whether the player's chosen action is one the coach does **not** rule a leak (`'good'` or
   * `'breakEven'`) — i.e. they made a correct play. Judged on their own action, so when several
   * choices are valid (multiple continues, or a coin-flip spot) any of them counts as correct, in
   * step with the {@link verdict} reported here. For the declarative carve-out it is the authored flag.
   */
  readonly correct: boolean
  /** The index (into the spot's `choices`) the player picked. */
  readonly chosenIndex: number
  /** The index (into the spot's `choices`) the coach/author ruled correct. */
  readonly correctIndex: number
  /** The mental model the spot exercised — flows from the coach verdict, or the author declares it. */
  readonly concept: Concept
  /**
   * The coach verdict the grade rests on, so the `concept`/numbers are auditable downstream. Present
   * for coach- and preflop-graded spots; `undefined` for the declarative carve-out, where no coach
   * ruled.
   */
  readonly verdict?: SpotVerdict
  /** The teaching explanation — built from the deterministic numbers (coach spots) or authored. */
  readonly explanation: string
}

/**
 * Validate the chosen index against the spot's choices in the odds/bots `RangeError` idiom — caught
 * once here so every grade path shares the same contract and message.
 */
function validateChosenIndex(chosenIndex: number, numChoices: number): void {
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= numChoices) {
    throw new RangeError(
      `chosenIndex must be an integer in 0..${numChoices - 1}, got ${chosenIndex}`,
    )
  }
}

/**
 * Whether a coach verdict counts the hero's action as the *correct* play. The coach grades an action
 * `'good'` when it agreed with the math, `'breakEven'` when the spot is a coin-flip (never a
 * mistake), and `'leak'` only when it disagreed — so a choice is "the right answer" exactly when its
 * action does **not** grade as a leak. This is the single rule that turns the coach's per-action
 * verdict into the spot's per-choice correctness, identically for the postflop and preflop graders.
 */
function actionIsCorrect(verdict: SpotVerdict): boolean {
  return verdict.verdict !== 'leak'
}

/**
 * Build the one-line explanation for a coach-graded (postflop) verdict from its deterministic
 * numbers, phrased with the shared `@holdem/format` helpers so it reads identically to the live
 * play coach. Reports the equity read, the pot-odds price, the chip EV, and the verdict headline.
 */
function explainCoach(verdict: DecisionVerdict): string {
  // The verdict label (the tag headline) + the shared deterministic "why" line, so a primer lesson
  // and the live play coach phrase the reasoning identically (the shared builder lives in
  // @holdem/format for exactly that reason — no duplicated wording here).
  return `${VERDICT_LABEL[verdict.verdict]} ${explainDecision(verdict)}`
}

/**
 * Build the explanation for a preflop chart-graded verdict — the verdict headline plus the shared
 * deterministic preflop "why" line ({@link explainPreflopWhy}, `@holdem/format`'s `explainPreflop`).
 * The chart carries no equity/EV numbers (it is a tier lookup, not a sim), so the "why" walks the
 * position/raise reasoning instead, exactly as the live play coach now renders it — the preflop
 * counterpart to {@link explainCoach} delegating to `explainDecision`, so a primer lesson and the play
 * coach phrase the reasoning identically (no duplicated wording here). Sourced from the verdict/trace,
 * never re-authored per spot.
 */
function explainPreflop(verdict: PreflopVerdict): string {
  return `${VERDICT_LABEL[verdict.verdict]} ${explainPreflopWhy(verdict)}`
}

/**
 * Compute the deterministic value a {@link CalculationSpot} asks the player to retrieve — the seam
 * that makes a calculation spot honour the no-answer-key invariant. *Nothing is stored*: the value is
 * derived here, at grade time, from the math the rest of the app already computes, so a drill can never
 * disagree with the live coach.
 *
 * - `'pot-odds'` / `'required-equity'` → `potOdds(toCall, pot)`. These are *the same number* — the
 *   break-even equity a call needs *is* the price the call costs — so both grade against `potOdds`,
 *   which is exactly the `potOddsThreshold` the coach's {@link DecisionVerdict} reports for the same
 *   deal (the coach computes it the same way). The pot-accounting convention is the spot's, untouched:
 *   `potOdds` divides by `pot + toCall`.
 * - `'equity'` → the coach's **own seeded equity read** for the deal:
 *   `coachDecision(synthesizeContext(ctx), { type: 'call' }).equity`. Grading against the coach's read
 *   — rather than a fresh sim with a different seed/method — is what guarantees the number the drill
 *   grades is byte-identical to the equity the live coach would narrate, so the two can never contradict.
 *   (Calling vs folding does not change the equity read; the action only steers the verdict, and we read
 *   only `.equity`.)
 *
 * Throws {@link RangeError} (via {@link synthesizeContext} / the odds helpers) on a malformed context.
 */
function computeQuantity(spot: CalculationSpot): number {
  const { pot, toCall } = spot.context
  switch (spot.quantity) {
    case 'pot-odds':
    case 'required-equity':
      // The price / the break-even equity — one number, two framings. Exactly the coach's
      // potOddsThreshold for the same pot/toCall (the coach computes potOdds(toCall, pot) too).
      return potOdds(toCall, pot)
    case 'equity':
      // The coach's OWN seeded read — never a fresh sim — so the graded equity can never disagree with
      // what the live coach narrates for this deal. The chosen action ('call') is immaterial to the
      // equity field; we read only `.equity`.
      return coachDecision(synthesizeContext(spot.context), { type: 'call' }).equity
  }
}

/**
 * Find the index of the offered bucket that **contains** `value` under the half-open `[lo, hi)`
 * convention ({@link NumericChoice}): `lo <= value < hi`. Returns `-1` when no offered bucket contains
 * the value — the ill-posed case {@link gradeSpot} turns into a {@link RangeError}, mirroring the
 * coach path's "offers no choice the coach grades as correct" guard. Because the buckets are half-open
 * at the top, adjacent buckets sharing a boundary never both match, so a value lands in at most one.
 */
function findContainingBucket(choices: readonly NumericChoice[], value: number): number {
  return choices.findIndex((choice) => value >= choice.lo && value < choice.hi)
}

/**
 * Build the explanation for a graded {@link CalculationSpot} — the EXACT computed number and *how it is
 * derived*, phrased with `@holdem/format`'s {@link pct} so the drill narrates a percentage identically
 * to the rest of the app (pairs with ticket 0079's show-the-math feedback). One sentence per
 * {@link CalculationQuantity}, each walking the arithmetic from the spot's own pot/toCall:
 *
 * - `'pot-odds'` → "Pot odds: 30 to call into a 90 pot ⇒ 30/120 = 25% — that's the price you're getting."
 * - `'required-equity'` → the same fraction framed as the equity the call demands.
 * - `'equity'` → the coach's seeded read, stated as the share of the pot, with the rule-of-2-and-4
 *   "close enough" framing the bucket tolerance embodies.
 */
function explainCalculation(
  quantity: CalculationQuantity,
  value: number,
  pot: number,
  toCall: number,
): string {
  const v = pct(value)
  // `pot` is the win-pot (already includes the villain's bet), so the total you'd play for is
  // `pot + toCall` and the price is `toCall / total` — the exact potOdds arithmetic, named once here so
  // the two price framings can't drift in how they spell the denominator.
  const total = pot + toCall
  switch (quantity) {
    case 'pot-odds':
      return `Pot odds: ${toCall} to call into a ${pot} pot ⇒ ${toCall}/${total} = ${v}. That's the price you're getting.`
    case 'required-equity':
      return `Required equity: ${toCall} to call into a ${pot} pot ⇒ ${toCall}/${total} = ${v}. You need about ${v} equity to break even on the call.`
    case 'equity':
      return `Your equity here is about ${v}: your share of the pot at showdown. A rule-of-2-and-4 estimate in the right ballpark is good enough.`
  }
}

/**
 * The true hand category a {@link HandReadingSpot} resolves to — the *derived* answer that makes the
 * hand-reading kind honour the no-answer-key invariant (ticket 0078). *Nothing is stored*: the category
 * is read here, at grade time, from the **same** {@link evaluate7} the showdown ranks every real hand
 * with, so a board-reading drill can never disagree with the live evaluator.
 *
 * Returns the human category *name* (`HAND_CATEGORY_NAMES[category]`, e.g. `"Two Pair"`) rather than the
 * numeric category, because that name is exactly the {@link HandReadingChoice.label} the player taps, so
 * {@link gradeSpot} can match the derived answer to an offered choice by plain string equality.
 *
 * Throws {@link RangeError} (via {@link evaluate7}) on a board that, with the two hole cards, is not a
 * legal 5..7-card hand — i.e. a board shorter than the flop. The generator only ever deals flop/turn/river
 * boards, so this guards a hand-authored spot, in the odds/bots idiom.
 */
function handReadingAnswer(spot: HandReadingSpot): string {
  // Read the made hand off the SAME evaluator the showdown uses — never a stored flag. 5..7 cards
  // (2 hole + a flop/turn/river board) is exactly what evaluate7 accepts, so this reads the best hand
  // correctly on every street.
  const value = evaluate7([...spot.holeCards, ...spot.board])
  return HAND_CATEGORY_NAMES[value.category]
}

/**
 * Build the explanation for a graded {@link HandReadingSpot} — the made hand named in plain English, so
 * a wrong read still teaches *what the cards actually were*. States the true category the evaluator
 * derived; the cards themselves are already on the felt the drill renders, so this names only the verdict
 * the read resolved to (the show-the-cards-spelled-out feedback pairs with ticket 0079).
 */
function explainHandReading(answer: string): string {
  return `You have ${answer} here. That's the best five-card hand your cards make on this board.`
}

/**
 * Grade one {@link SizingSpot} choice's candidate size against the coach's recommended band — the seam
 * that makes a sizing spot honour the no-answer-key invariant by **reusing the live sizing coach**. The
 * correct size is *not* stored: {@link gradeSpot} runs the coach's `gradeSizing` over a `{ type: 'bet',
 * amount: choice.toAmount }` action and the correct choice is whichever it grades `verdict === 'good'`,
 * so a sizing drill can never disagree with the size the live coach would bless at the table.
 *
 * Returns the {@link SizingRead} for the choice's bet. `gradeSizing` returns `null` only for a non-bet
 * action; a sizing choice is *always* a bet, so this never returns `null` — the `!` documents that
 * invariant (the action is constructed here as a bet).
 */
function gradeSizingChoice(context: DecisionContext, toAmount: number): SizingRead {
  // Grade a BET (not a raise — the spot is unbet, `toCall === 0`) of the candidate size against the
  // coach's band. The action is the one the live coach grades a hero's bet by, so the drill's correct
  // size and the table's size verdict are one and the same read.
  return gradeSizing(context, { type: 'bet', amount: toAmount })!
}

/**
 * Run the spot's grader over a coach-graded choice's action and return the verdict. Postflop spots
 * run {@link coachDecision} over the synthesised context; preflop spots run {@link gradePreflop}. One
 * helper so {@link gradeSpot} stays a thin dispatcher and the "grade by running the coach" rule lives
 * in exactly one place.
 */
function gradeChoiceVerdict(
  spotKind: 'coach' | 'preflop',
  context: DecisionContext,
  choice: ActionChoice,
): SpotVerdict {
  return spotKind === 'coach'
    ? coachDecision(context, choice.action)
    : gradePreflop(context, choice.action)
}

/**
 * Grade one {@link Spot} against the player's chosen answer — the single seam the primer and every
 * M5 drill grade through.
 *
 * **How the correct answer is derived (the cardinal rule).** For a coach- or preflop-graded spot,
 * {@link gradeSpot} synthesises the {@link DecisionContext} once (via {@link synthesizeContext}),
 * runs the coach over the *chosen* choice's action to get the verdict the result reports, and
 * separately scans the offered choices to find the first one the coach does **not** rule a leak —
 * that index is `correctIndex` (the canonical right answer, for display). The player is `correct`
 * when the coach does not rule *their own* chosen action a leak — not when their index equals
 * `correctIndex` — so a second valid continue or a break-even pick is scored correct, consistent
 * with the reported verdict. Nothing is read off a stored answer key; the coach is the only
 * authority. (The declarative carve-out is the sole exception: it reads the authored `correct`
 * flags, because the coach cannot rule on that concept.)
 *
 * **The calculation kind (ticket 0077) derives its answer too — just a number, not an action.** A
 * {@link CalculationSpot} carries no correct flag: {@link gradeSpot} *computes* the asked quantity
 * (`potOdds(toCall, pot)` for the price quantities, the coach's seeded `.equity` for the equity
 * quantity) and the correct bucket is whichever offered `[lo, hi)` range *contains* that value. The
 * player is correct iff their chosen bucket is that one — the bucket width is the estimate tolerance.
 * It throws when no offered bucket contains the value (an ill-posed spot), mirroring the coach path's
 * "offers no choice the coach grades as correct" guard.
 *
 * **The hand-reading kind (ticket 0078) derives its answer too — a made hand, not an action or number.**
 * A {@link HandReadingSpot} carries no correct flag: {@link gradeSpot} runs `evaluate7([...holeCards,
 * ...board])` (the same evaluator the showdown ranks every real hand with) and the correct choice is
 * whichever offered category *label* equals `HAND_CATEGORY_NAMES[category]`. The player is correct iff
 * their chosen label is that one. It throws when no offered label matches the true category (an ill-posed
 * spot), mirroring the same guard.
 *
 * **The sizing kind (ticket 0105) derives its answer too — a bet size, not an action/number/hand.** A
 * {@link SizingSpot} carries no correct flag: {@link gradeSpot} runs the coach's `gradeSizing` (the same
 * band grader the live play coach grades a hero's bet by) over each offered `{ type: 'bet', amount }` and
 * the correct choice is whichever it grades `verdict === 'good'`. The player is correct iff their chosen
 * size is that in-band one, and the explanation is the *chosen* size's own `why` — so an out-of-band pick
 * is explained with exactly the `why` the coach gives in play. It throws when no offered size grades
 * 'good' (an ill-posed spot), mirroring the same guard.
 *
 * Throws {@link RangeError} on a malformed spot (bad context, via {@link synthesizeContext}), an
 * out-of-range `chosenIndex`, a calculation spot whose buckets do not cover the computed value, a
 * hand-reading spot that offers no label matching the true category, or a sizing spot that offers no
 * in-band ('good') size, in the odds/bots idiom.
 *
 * @param spot The retrieval check to grade.
 * @param chosenIndex The index into `spot.choices` the player picked.
 */
export function gradeSpot(spot: Spot, chosenIndex: number): GradeResult {
  validateChosenIndex(chosenIndex, spot.choices.length)

  if (spot.kind === 'declarative') {
    // The carve-out: the coach cannot rule, so correctness is the authored flag and the explanation
    // and concept are the author's. The first flagged-correct choice is the canonical answer.
    const correctIndex = spot.choices.findIndex((c) => c.correct)
    if (correctIndex < 0) {
      throw new RangeError('declarative spot must have at least one correct choice')
    }
    const chosen = spot.choices[chosenIndex]
    return {
      correct: chosen !== undefined && chosen.correct,
      chosenIndex,
      correctIndex,
      concept: spot.concept,
      explanation: spot.explanation,
    }
  }

  if (spot.kind === 'calculation') {
    // The numeric-retrieval kind: compute the asked quantity from the math the app already owns
    // (potOdds for the price quantities, the coach's seeded read for equity) and the correct bucket is
    // whichever offered range CONTAINS that value — derived here, never stored on the spot (the
    // no-answer-key invariant, applied to a number instead of an action). The player is correct iff
    // their own chosen bucket is that containing bucket.
    const value = computeQuantity(spot)
    const correctIndex = findContainingBucket(spot.choices, value)
    if (correctIndex < 0) {
      // No offered bucket contains the computed value — an ill-posed spot (the buckets don't cover the
      // answer). Mirror the coach path's "offers no correct choice" guard in the odds/bots idiom.
      throw new RangeError(
        `calculation spot offers no bucket containing the computed value ${value}`,
      )
    }
    return {
      // Correct iff the player landed the value in the right bucket. The bucket width IS the tolerance.
      correct: chosenIndex === correctIndex,
      chosenIndex,
      correctIndex,
      concept: spot.concept,
      // No coach verdict to attach (like the declarative carve-out): the value is the whole grade, and
      // the explanation shows it derived from the spot's own numbers via @holdem/format.
      explanation: explainCalculation(spot.quantity, value, spot.context.pot, spot.context.toCall),
    }
  }

  if (spot.kind === 'hand-reading') {
    // The board-reading recognition kind: derive the made hand from the SAME evaluate7 the showdown uses
    // and the correct choice is whichever offered category LABEL equals that derived name — derived here,
    // never stored on the spot (the no-answer-key invariant, applied to the engine's evaluator instead of
    // the coach). The player is correct iff their own chosen label is that derived category.
    const answer = handReadingAnswer(spot)
    const correctIndex = spot.choices.findIndex((c) => c.label === answer)
    if (correctIndex < 0) {
      // No offered choice names the true category — an ill-posed spot (the generator failed to offer the
      // true category). Mirror the calculation path's "no bucket contains the value" guard.
      throw new RangeError(
        `hand-reading spot offers no choice matching the true category "${answer}"`,
      )
    }
    return {
      // Correct iff the player named the category the evaluator derived.
      correct: chosenIndex === correctIndex,
      chosenIndex,
      correctIndex,
      concept: spot.concept,
      // No coach verdict to attach (like the calculation/declarative kinds): the made hand IS the grade,
      // and the explanation names it so a wrong read still teaches what the cards were.
      explanation: explainHandReading(answer),
    }
  }

  if (spot.kind === 'sizing') {
    // The "what size?" kind (ticket 0105): grade each candidate bet size against the coach's recommended
    // band by running the SAME `gradeSizing` the live play coach grades a hero's bet by — the band grader
    // IS the drill grader. The correct choice is the one it grades 'good'; nothing is stored on the spot
    // (the no-answer-key invariant, applied to the coach's sizing read).
    const context = synthesizeContext(spot.context)
    const correctIndex = spot.choices.findIndex(
      (choice) => gradeSizingChoice(context, choice.toAmount).verdict === 'good',
    )
    if (correctIndex < 0) {
      // No offered size grades 'good' — an ill-posed spot (the generator failed to offer an in-band size).
      // Mirror the calculation/hand-reading "no correct choice on offer" guard in the odds/bots idiom.
      throw new RangeError('sizing spot offers no choice the coach grades as a good size')
    }
    // The explanation is the CHOSEN size's own `why` — so an out-of-band pick is explained with exactly
    // the `why` the coach gives the hero in play (in-band states the purpose, out-of-band the risk/reward
    // arithmetic), the ticket's headline acceptance criterion.
    return {
      // Correct iff the player picked the in-band ('good') size.
      correct: chosenIndex === correctIndex,
      chosenIndex,
      correctIndex,
      concept: spot.concept,
      // No coach *continue* verdict to attach (like the calculation/hand-reading kinds): the size grade
      // IS the teaching, and its `why` is the live coach's own sizing explanation for the chosen size.
      explanation: gradeSizingChoice(context, spot.choices[chosenIndex]!.toAmount).why,
    }
  }

  // Coach- and preflop-graded spots share the "grade by running the coach" path. Synthesise the full
  // context once from the minimal authoring inputs (the design-note seam), then let the coach rule.
  const context =
    spot.kind === 'coach'
      ? synthesizeContext(spot.context)
      : synthesizeContext(
          { holeCards: spot.holeCards, board: [], pot: 0, toCall: 0, numActive: spot.numPlayers },
          {
            seat: spot.seat,
            buttonIndex: spot.buttonIndex,
            numPlayers: spot.numPlayers,
            // Threaded through only when the spot faces a raise; absent ⇒ the unchanged unraised-open
            // synthesis, so every existing PreflopSpot grades byte-for-byte as before.
            facingRaiseBb: spot.facingRaiseBb,
          },
        )

  // The correct choice is whatever the coach blesses — the FIRST offered choice whose action does
  // not grade as a leak. Derived, never stored.
  const correctIndex = spot.choices.findIndex((choice) =>
    actionIsCorrect(gradeChoiceVerdict(spot.kind, context, choice)),
  )
  if (correctIndex < 0) {
    // Every offered action is a leak — an ill-posed spot (the author offered no correct answer).
    throw new RangeError('spot offers no choice the coach grades as correct')
  }

  // The verdict the result REPORTS is the coach's ruling on the player's OWN pick — so the
  // explanation narrates what the player actually did.
  const chosenVerdict = gradeChoiceVerdict(spot.kind, context, spot.choices[chosenIndex]!)
  const explanation =
    spot.kind === 'coach'
      ? explainCoach(chosenVerdict as DecisionVerdict)
      : explainPreflop(chosenVerdict as PreflopVerdict)

  return {
    // Correctness is the player's OWN action grade, not index-equality with the first non-leak
    // choice: when several choices are valid (two continues both 'good', or a break-even spot where
    // every action grades 'breakEven') judging by `chosenIndex === correctIndex` would mark a
    // genuinely correct play wrong and contradict the `verdict` this same result reports.
    correct: actionIsCorrect(chosenVerdict),
    chosenIndex,
    correctIndex,
    concept: chosenVerdict.concept,
    verdict: chosenVerdict,
    explanation,
  }
}
