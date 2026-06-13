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

/** Result of parsing a line of human input: a legal action, or a message to reprint. */
export type ParseResult = { ok: true; action: Action } | { ok: false; error: string }

/**
 * The placeholder opponent: it never folds and never raises. It checks when it can and
 * otherwise calls. (`legalActions` returns the call amount already capped at its stack,
 * so a call here is an all-in when it is short.)
 */
export function alwaysCallBot(legal: LegalActions): Action {
  if (legal.check) return { type: 'check' }
  if (legal.call) return { type: 'call' }
  // Unreachable in heads-up play, but stay total: the only thing always offered is fold.
  return { type: 'fold' }
}

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
