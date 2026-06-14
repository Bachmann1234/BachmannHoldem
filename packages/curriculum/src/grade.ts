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
import {
  coachDecision,
  gradePreflop,
  type Concept,
  type DecisionVerdict,
  type PreflopVerdict,
} from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import { synthesizeContext, type Spot, type ActionChoice } from './spot.js'

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
  return (
    `${VERDICT_LABEL[verdict.verdict]} ` +
    `Equity ${pct(verdict.equity)} vs pot-odds price ${pct(verdict.potOddsThreshold)}; ` +
    `calling is worth ${signedChips(verdict.callEv)} chips.`
  )
}

/**
 * Build the explanation for a preflop chart-graded verdict. The chart carries no equity/EV numbers
 * (it is a deterministic tier lookup, not a sim), so the explanation is the chart's own tier
 * rationale plus the verdict headline — still sourced from the verdict, never re-authored per spot.
 */
function explainPreflop(verdict: PreflopVerdict): string {
  return `${VERDICT_LABEL[verdict.verdict]} ${verdict.rationale}`
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
 * Throws {@link RangeError} on a malformed spot (bad context, via {@link synthesizeContext}) or an
 * out-of-range `chosenIndex`, in the odds/bots idiom.
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

  // Coach- and preflop-graded spots share the "grade by running the coach" path. Synthesise the full
  // context once from the minimal authoring inputs (the design-note seam), then let the coach rule.
  const context =
    spot.kind === 'coach'
      ? synthesizeContext(spot.context)
      : synthesizeContext(
          { holeCards: spot.holeCards, board: [], pot: 0, toCall: 0, numActive: spot.numPlayers },
          { seat: spot.seat, buttonIndex: spot.buttonIndex, numPlayers: spot.numPlayers },
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
