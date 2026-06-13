/**
 * Pure helpers for the terminal hand runner (ticket 0004): the trivial opponent, the
 * human-input parser, and the text rendering. Kept free of any I/O so they can be
 * unit-tested — `play.ts` is the thin readline shell that wires them to a real terminal.
 */

import {
  formatCard,
  describeHand,
  potTotal,
  isComplete,
  type HandState,
  type Action,
  type LegalActions,
  type PlayerState,
} from '@holdem/engine'
import type { DecisionVerdict, StartingHandVerdict } from '@holdem/coach'

/** Result of parsing a line of human input: a legal action, or a message to reprint. */
export type ParseResult = { ok: true; action: Action } | { ok: false; error: string }

/** A one-line, human-readable menu of the legal actions, with amounts. */
export function renderLegal(legal: LegalActions): string {
  const parts: string[] = []
  if (legal.fold) parts.push('(f)old')
  if (legal.check) parts.push('(k)check')
  if (legal.call) parts.push(`(c)all ${legal.call.amount}`)
  if (legal.bet) parts.push(`(b)et ${legal.bet.min}-${legal.bet.max}`)
  if (legal.raise) parts.push(`(r)aise to ${legal.raise.min}-${legal.raise.max}`)
  if (legal.bet || legal.raise) parts.push('(a)llin')
  return parts.join('  ')
}

/**
 * Parse a line of human input against the legal actions. Accepts single-letter or
 * full-word verbs and an optional amount (`b50`, `b 50`, `bet 50`); for bet/raise a
 * missing amount means the minimum, and `a`/`allin` means the maximum.
 */
export function parseAction(input: string, legal: LegalActions): ParseResult {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)\s*(\d+)?$/)
  if (!m) return { ok: false, error: 'Could not read that — try again.' }
  const verb = m[1]!
  const amount = m[2] === undefined ? null : Number(m[2])

  const illegal = (name: string): ParseResult => ({
    ok: false,
    error: `${name} is not legal here.`,
  })

  switch (verb) {
    case 'f':
    case 'fold':
      return legal.fold ? { ok: true, action: { type: 'fold' } } : illegal('Fold')
    case 'k':
    case 'check':
      return legal.check ? { ok: true, action: { type: 'check' } } : illegal('Check')
    case 'c':
    case 'call':
      return legal.call ? { ok: true, action: { type: 'call' } } : illegal('Call')
    case 'a':
    case 'allin':
    case 'shove':
      if (legal.bet) return { ok: true, action: { type: 'bet', amount: legal.bet.max } }
      if (legal.raise) return { ok: true, action: { type: 'raise', amount: legal.raise.max } }
      return illegal('All-in')
    case 'b':
    case 'bet':
      return amountAction('bet', legal.bet, amount)
    case 'r':
    case 'raise':
      return amountAction('raise', legal.raise, amount)
    default:
      return { ok: false, error: `Unknown action "${verb}".` }
  }
}

function amountAction(
  type: 'bet' | 'raise',
  range: { min: number; max: number } | null,
  amount: number | null,
): ParseResult {
  if (!range) return { ok: false, error: `${cap(type)} is not legal here.` }
  const to = amount ?? range.min // bare verb means the minimum
  if (to < range.min || to > range.max) {
    return { ok: false, error: `${cap(type)} must be to ${range.min}-${range.max}.` }
  }
  return { ok: true, action: { type, amount: to } }
}

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

function renderSeat(state: HandState, p: PlayerState, heroSeat: number): string {
  const name = p.seat === heroSeat ? 'You' : 'Bot'
  // Hide the opponent's cards until the hand is over.
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
  return `  ${name.padEnd(3)} [${cards}]  stack ${p.stack}${bet}  ${marks}`.trimEnd()
}

/** Render the outcome of a completed hand: the showdown (if any) and the payouts. */
export function renderResult(state: HandState, heroSeat: number): string {
  const lines = ['', `── Result ${'─'.repeat(38)}`]
  if (state.endReason === 'showdown') {
    for (const p of state.players) {
      if (p.status === 'folded') continue
      const who = p.seat === heroSeat ? 'You' : 'Bot'
      const hv = state.showdownHands[p.seat]
      lines.push(
        `  ${who}: ${p.holeCards.map(formatCard).join(' ')}  — ${hv ? describeHand(hv) : ''}`,
      )
    }
  } else {
    lines.push('  Everyone else folded.')
  }
  for (const p of state.players) {
    const won = state.payouts[p.seat] ?? 0
    if (won > 0) lines.push(`  ${p.seat === heroSeat ? 'You' : 'Bot'} collect ${won}`)
  }
  return lines.join('\n')
}

/** Format a `0..1` equity/pot-odds fraction as a one-decimal percent, e.g. `0.625 → "62.5%"`. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** Format a chip EV as a signed number, e.g. `4 → "+4"`, `-1.5 → "-1.5"`, `0 → "0"`. */
function signedChips(ev: number): string {
  // Round to one decimal *first* so a near-zero EV renders a bare, unsigned `0` rather than
  // a misleading signed zero (`-0.04 → "0"`, not `"-0"`; also handles JS negative zero).
  const rounded = Math.round(ev * 10) / 10
  if (rounded === 0) return '0'
  // Trim a trailing `.0` so whole-chip EVs read clean (`+4`, not `+4.0`).
  const magnitude = Math.abs(rounded).toFixed(1).replace(/\.0$/, '')
  return rounded < 0 ? `-${magnitude}` : `+${magnitude}`
}

/** The human-readable headline for each {@link DecisionVerdict.verdict} tag. */
const VERDICT_LABEL: Readonly<Record<DecisionVerdict['verdict'], string>> = {
  good: 'Good — your action agreed with the math.',
  leak: 'Leak — the math pointed the other way.',
  breakEven: 'Break-even — a coin-flip spot; either way is fine.',
}

/**
 * Render the coach's feedback on the hero's decision in the existing `── Section ──` /
 * two-space-indented style of {@link renderState} / {@link renderResult}.
 *
 * Always shows the postflop-math view of the spot the hero faced: the estimated equity, the
 * pot-odds threshold it is judged against, the chip EV of calling, the EV-correct action
 * (continue vs. fold), and the good/leak/break-even verdict — all taken verbatim from the
 * {@link DecisionVerdict} the coach computed (the CLI does no math of its own). When the
 * decision was preflop, pass the {@link StartingHandVerdict} too and its starting-hand chart
 * tier + rationale lead the block, mirroring how a learner reaches for the chart first
 * preflop and the pot-odds math postflop.
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
