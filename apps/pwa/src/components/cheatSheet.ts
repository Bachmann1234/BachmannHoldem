/**
 * The beginner **number-sense cheat-sheet** data (ticket 0081) — the pot-odds → equity quick-reference
 * pegs and the rule-of-2-and-4 row the {@link GlossaryOverlay} renders, plus the new number-sense
 * vocabulary (equity, pot odds, EV, outs, break-even) a true beginner's whole value prop rests on
 * ([../../docs/LEARNING-APPROACH.md]: "number sense is the beginner value prop").
 *
 * **The numbers are DERIVED, never hand-typed.** Every required-equity peg and every rule-of-2-and-4 figure
 * is computed at module load from `@holdem/odds` (`potOdds`, `outsToEquity`) — the SAME math the coach
 * narrates and the calculation drills (ticket 0077) grade against — so the cheat-sheet can never drift from
 * the engine. A reader must NOT replace these with literal percentages: that is exactly the drift this
 * module exists to prevent (the ticket is explicit). The only literals here are the *inputs* (the bet sizes
 * and out counts a beginner looks up) and the human labels; every *answer* is a function of the inputs.
 *
 * Pure data + formatting, no React — co-located with the overlay that renders it, and unit-tested by
 * asserting each cell equals the `@holdem/odds` computation for its inputs (so the test fails the moment a
 * value is hand-typed or the engine's math changes).
 */

import { outsToEquity, potOdds } from '@holdem/odds'

/** Render an equity fraction (`0..1`) as a whole-percent string, e.g. `0.25 → "25%"`. The cheat-sheet is a coarse "good enough" read. */
function asPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/**
 * The required equity to call a bet of a given size, DERIVED from {@link potOdds}. A bet of `fraction · P`
 * into a pot of `P` leaves hero facing a call of `fraction · P` into a pot of `P + fraction · P` (the dead
 * money plus the villain's bet — the win-pot convention the generator and coach use), so the break-even
 * equity is `potOdds(fraction · P, P + fraction · P)`. Pot-size-independent (the ratio is scale-free), so
 * we compute against a notional `P = 1`. Exported so the test can re-derive and assert no value is typed.
 *
 * @param fraction The bet size as a fraction of the pot (e.g. `0.5` = a half-pot bet).
 */
export function requiredEquityForBet(fraction: number): number {
  const pot = 1
  const call = fraction * pot
  return potOdds(call, pot + call)
}

/** One row of the pot-odds → equity quick-reference table: a bet size and the equity a call needs to break even. */
export interface PotOddsPeg {
  /** The bet size, as the beginner sees it on the felt (e.g. `"Half pot"`). */
  readonly bet: string
  /** The bet as a fraction of the pot — the input the equity is derived from. */
  readonly fraction: number
  /** The required break-even equity as a whole-percent string — DERIVED from {@link requiredEquityForBet}. */
  readonly requiredEquity: string
}

/** The common bet sizes a beginner meets, as fractions of the pot — the *inputs* to the derived table. */
const PEG_FRACTIONS: readonly { readonly bet: string; readonly fraction: number }[] = [
  { bet: 'Quarter pot', fraction: 0.25 },
  { bet: 'Third pot', fraction: 1 / 3 },
  { bet: 'Half pot', fraction: 0.5 },
  { bet: 'Two-thirds pot', fraction: 2 / 3 },
  { bet: 'Three-quarter pot', fraction: 0.75 },
  { bet: 'Pot-sized', fraction: 1 },
]

/**
 * The pot-odds → equity quick-reference table — for each common bet size, the equity a call needs to break
 * even, computed from {@link requiredEquityForBet} (so a half-pot bet reads `25%`, a pot-sized bet `33%`,
 * exactly the coach's pricing). Built once at module load; the {@link GlossaryOverlay} renders it as the
 * cheat-sheet the calc drills and the coach point at.
 */
export const POT_ODDS_PEGS: readonly PotOddsPeg[] = PEG_FRACTIONS.map(({ bet, fraction }) => ({
  bet,
  fraction,
  requiredEquity: asPercent(requiredEquityForBet(fraction)),
}))

/** One rule-of-2-and-4 row: an out count and its approximate equity on the flop (×4) and turn (×2). */
export interface OutsPeg {
  /** The out count — the input the approximations are derived from. */
  readonly outs: number
  /** A common drawing hand at this out count, for recognition (e.g. `"Flush draw"`). */
  readonly draw: string
  /** Approx equity with two cards to come (flop), DERIVED from `outsToEquity(outs, 2)` — the "×4" rule. */
  readonly flop: string
  /** Approx equity with one card to come (turn), DERIVED from `outsToEquity(outs, 1)` — the "×2" rule. */
  readonly turn: string
}

/** The common drawing-hand out counts a beginner memorises — the *inputs* to the derived rule-of-2-and-4 table. */
const OUTS_INPUTS: readonly { readonly outs: number; readonly draw: string }[] = [
  { outs: 4, draw: 'Gutshot straight' },
  { outs: 8, draw: 'Open-ended straight' },
  { outs: 9, draw: 'Flush draw' },
  { outs: 15, draw: 'Flush + straight draw' },
]

/**
 * The rule-of-2-and-4 quick-reference table — for each common draw, the approximate equity on the flop
 * (×4 / two cards to come) and turn (×2 / one card), DERIVED from {@link outsToEquity}. So a 9-out flush
 * draw reads `36%` on the flop and `18%` on the turn — the arithmetic the coach teaches at the table.
 */
export const OUTS_PEGS: readonly OutsPeg[] = OUTS_INPUTS.map(({ outs, draw }) => ({
  outs,
  draw,
  flop: asPercent(outsToEquity(outs, 2)),
  turn: asPercent(outsToEquity(outs, 1)),
}))

/** One number-sense glossary term — the beginner vocabulary the cheat-sheet decodes alongside the tables. */
export interface NumberSenseTerm {
  /** The term as it reads, e.g. `"Pot odds"`. */
  readonly term: string
  /** Its plain-English meaning — number sense, in words. */
  readonly meaning: string
}

/**
 * The number-sense vocabulary the beginner cheat-sheet adds (ticket 0081) — equity, pot odds, EV, outs,
 * break-even. These need no coach `GradeTermId` (no coach explanation deep-links them yet), so they live in
 * the glossary's own content rather than the shared hand-strength registry — keeping that exhaustive
 * `Record<GradeTermId, …>` map untouched. Plain English, no false universals (the learning doc's discipline).
 */
export const NUMBER_SENSE_TERMS: readonly NumberSenseTerm[] = [
  {
    term: 'Equity',
    meaning:
      'Your share of the pot: how often you win it if all the cards came with no more betting. A coin-flip is 50% equity; the best hand has the most.',
  },
  {
    term: 'Pot odds',
    meaning:
      'The price you are being offered to call: what the call costs as a fraction of the pot you would win. Call 25 to win a pot of 100 and you are getting 4-to-1, so you need 20% equity.',
  },
  {
    term: 'Break-even equity',
    meaning:
      'The least equity a call needs to be worth it: exactly your pot odds. Above it, calling makes money over time; below it, it loses. The quick-reference table is this number for common bet sizes.',
  },
  {
    term: 'Outs',
    meaning:
      'The cards still to come that make your hand the winner. A flush draw has 9 outs; an open-ended straight draw 8. Count them, then turn them into equity with the rule of 2 and 4.',
  },
  {
    term: 'Rule of 2 and 4',
    meaning:
      'The mental shortcut for a draw’s equity from its outs: on the flop multiply outs by 4 (two cards to come), on the turn by 2 (one card). Roughly right, close enough to decide.',
  },
  {
    term: 'EV',
    meaning:
      'Expected value: what a decision is worth on average over many times, in chips. A +EV call gains chips in the long run even when it loses this once; a −EV call loses over time.',
  },
]
