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
  potTotal,
  isComplete,
  type HandState,
  type PlayerState,
} from '@holdem/engine'
import type { DecisionVerdict, StartingHandVerdict } from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'

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
  for (const p of state.players) {
    const won = state.payouts[p.seat] ?? 0
    if (won > 0) lines.push(`  ${who(p.seat)} collect ${won}`)
  }
  return lines.join('\n')
}

/**
 * Render the coach's feedback on the hero's decision in the existing `── Section ──` /
 * two-space-indented style of {@link renderState} / {@link renderResult}.
 *
 * Always shows the postflop-math view of the spot the hero faced: the estimated equity, the
 * pot-odds threshold it is judged against, the chip EV of calling, the EV-correct action
 * (continue vs. fold), and the good/leak/break-even verdict — all taken verbatim from the
 * {@link DecisionVerdict} the coach computed (the harness does no math of its own), formatted with
 * the shared `@holdem/format` helpers. When the decision was preflop, pass the
 * {@link StartingHandVerdict} too and its starting-hand chart tier + rationale lead the block,
 * mirroring how a learner reaches for the chart first preflop and the pot-odds math postflop.
 */
export function renderCoachFeedback(
  verdict: DecisionVerdict,
  preflop?: StartingHandVerdict,
): string {
  const lines = ['', `── Coach ${'─'.repeat(39)}`]
  if (preflop) {
    // The rationale is a self-contained, tier-named sentence (e.g. "Premium holding — …"),
    // so we render it as-is rather than prefixing `cap(tier)` and doubling the tier word.
    lines.push(`  Starting hand: ${preflop.rationale}`)
  }
  lines.push(
    `  Equity ${pct(verdict.equity)}  vs pot odds ${pct(verdict.potOddsThreshold)}` +
      `  EV(call) ${signedChips(verdict.callEv)}`,
  )
  lines.push(`  EV-correct: ${verdict.correctDecision}`)
  lines.push(`  ${VERDICT_LABEL[verdict.verdict]}`)
  return lines.join('\n')
}
