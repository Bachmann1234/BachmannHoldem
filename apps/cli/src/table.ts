/**
 * The string renderers for the headless CLI harness (ticket 0030): the table view, the result
 * block, and the coach feedback block it prints to the transcript. Kept free of any I/O so they can
 * be unit-tested — `sim.ts` is the thin harness that wires them to `process.stdout`.
 *
 * The genuinely-shared, framework-agnostic helpers the harness also uses — the action-input grammar
 * (`parseAction` / `renderLegal`) and the coach value formatters (`pct` / `signedChips` /
 * `VERDICT_LABEL`) — now live in the pure `@holdem/format` package, shared with the TUI so the two
 * clients can never diverge on them (ticket 0030 consolidated the former per-app copies). This file
 * imports them and keeps only the renderers, which are this harness's own presentation.
 */

import {
  formatCard,
  describeHand,
  handWinnings,
  potTotal,
  isComplete,
  type HandState,
  type PlayerState,
} from '@holdem/engine'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL, explainDecision } from '@holdem/format'
import type { GroundTruth } from './analysis.js'

/** Re-exported for the harness so it has one import surface (`from './table.js'`). */
export { parseAction, renderLegal } from '@holdem/format'

/** Capitalise the first letter of a word for a section header (`preflop` → `Preflop`). */
function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1)
}

/** Render the current table: street, board, pot, and each seat. `heroSeat`'s cards show. */
export function renderState(state: HandState, heroSeat: number): string {
  const board = state.board.length ? state.board.map(formatCard).join(' ') : '—'
  const lines = [
    '',
    `── ${cap(state.street)} ${'─'.repeat(40)}`,
    `Board: ${board}    Pot: ${potTotal(state)}`,
  ]
  for (const p of state.players) lines.push(renderSeat(state, p, heroSeat))
  return lines.join('\n')
}

/** Render one seat's row: who, (revealed) cards, stack, current bet, and any markers. */
function renderSeat(state: HandState, p: PlayerState, heroSeat: number): string {
  const name = p.seat === heroSeat ? 'You' : `Bot ${p.seat}`
  // Hide the opponents' cards until the hand is over.
  const reveal = p.seat === heroSeat || isComplete(state)
  const cards = reveal ? p.holeCards.map(formatCard).join(' ') : '?? ??'
  const marks = [
    p.seat === state.buttonIndex ? 'BTN' : '',
    p.status === 'folded' ? 'folded' : '',
    p.status === 'allin' ? 'all-in' : '',
    state.toAct === p.seat ? '<= to act' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const bet = p.committed > 0 ? `  bet ${p.committed}` : ''
  return `  ${name.padEnd(5)} [${cards}]  stack ${p.stack}${bet}  ${marks}`.trimEnd()
}

/** Render the outcome of a completed hand: the showdown (if any) and the payouts. */
export function renderResult(state: HandState, heroSeat: number): string {
  const who = (seat: number): string => (seat === heroSeat ? 'You' : `Bot ${seat}`)
  const lines = ['', `── Result ${'─'.repeat(38)}`]
  if (state.endReason === 'showdown') {
    for (const p of state.players) {
      if (p.status === 'folded') continue
      const hv = state.showdownHands[p.seat]
      lines.push(
        `  ${who(p.seat)}: ${p.holeCards.map(formatCard).join(' ')}  — ${hv ? describeHand(hv) : ''}`,
      )
    }
  } else {
    lines.push('  Everyone else folded.')
  }
  // Winners read from `handWinnings`, not `payouts` — a returned uncalled bet is not a win (BUG-0002).
  for (const [seat, won] of Object.entries(handWinnings(state))) {
    lines.push(`  ${who(Number(seat))} collect ${won}`)
  }
  return lines.join('\n')
}

/**
 * Render the coach's feedback on a *postflop* decision in the existing `── Section ──` /
 * two-space-indented style of {@link renderState} / {@link renderResult}.
 *
 * Shows the postflop-math view of the spot the hero faced: the estimated equity, the pot-odds
 * threshold it is judged against, the chip EV of calling, the EV-correct action (continue vs. fold),
 * and the good/leak/break-even verdict — all taken verbatim from the {@link DecisionVerdict} the
 * coach computed (the harness does no math of its own), formatted with the shared `@holdem/format`
 * helpers. Preflop is graded off the chart instead — see {@link renderPreflopCoach}.
 */
export function renderCoachFeedback(verdict: DecisionVerdict): string {
  const lines = ['', `── Coach ${'─'.repeat(39)}`]
  lines.push(
    `  Equity ${pct(verdict.equity)}  vs pot odds ${pct(verdict.potOddsThreshold)}` +
      `  EV(call) ${signedChips(verdict.callEv)}`,
  )
  lines.push(`  EV-correct: ${verdict.correctDecision}`)
  lines.push(`  ${VERDICT_LABEL[verdict.verdict]}`)
  // The deterministic "why" line the TUI/PWA already render (`explainDecision`); the harness now
  // renders it too so the scriptable coach matches the app it is meant to exercise.
  lines.push(`  ${explainDecision(verdict)}`)
  return lines.join('\n')
}

/**
 * Render the **ground-truth** check beneath a postflop coach block: the hero's *exact* equity vs the
 * villains' actual cards (the omniscient read the coach does not have), the EV-correct call it
 * implies, and — when the coach's advice disagrees with it — a one-line warning that following the
 * coach would be a mistake here. This is the testing instrument, not player-facing coaching: it is
 * what lets a sweep see where the coach's assumed-range read leads the hero astray.
 */
export function renderGroundTruth(
  truth: GroundTruth,
  verdict: DecisionVerdict,
  toCall: number,
): string {
  const lines = [
    `  Ground truth (vs actual cards): equity ${pct(truth.equity)}` +
      `  EV(call) ${signedChips(truth.callEv)}  true-correct: ${truth.correct}`,
  ]
  if (toCall > 0 && verdict.correctDecision !== truth.correct) {
    lines.push(
      `  ⚠ Coach diverges from ground truth — its "${verdict.correctDecision}" would be a mistake here.`,
    )
  }
  return lines.join('\n')
}

/**
 * Render the coach's feedback on a *preflop* decision off the starting-hand chart, in the same
 * `── Coach ──` block style.
 *
 * Preflop is graded by the chart, not pot odds (ticket BUG-0001): the rationale is a self-contained,
 * tier-named sentence (e.g. "Premium holding — …"), rendered as-is, followed by the good/leak
 * headline. There is deliberately no equity / pot-odds / EV-correct line — the pot-odds math
 * under-rates position and fold equity preflop and would fold clear opens, so showing it would only
 * contradict the chart verdict above it.
 */
export function renderPreflopCoach(verdict: PreflopVerdict): string {
  return [
    '',
    `── Coach ${'─'.repeat(39)}`,
    `  Starting hand: ${verdict.rationale}`,
    `  ${VERDICT_LABEL[verdict.verdict]}`,
  ].join('\n')
}
