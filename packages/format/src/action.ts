/**
 * The pure action-input grammar shared by every play client: the verb/amount → validated engine
 * {@link Action} parser ({@link parseAction}) and the legal-actions menu renderer
 * ({@link renderLegal}).
 *
 * This used to live, byte-for-byte duplicated, in both `apps/cli/src/table.ts` and
 * `apps/tui/src/input.ts` — apps must not depend on one another, so the two clients each re-spelled
 * the grammar and the standing instruction was to keep the copies identical until a shared home
 * existed (ticket 0030). This is that home: a pure package (no Node/DOM/Ink, only `@holdem/engine`
 * types) the clients both import, so the input grammar can never silently diverge between them
 * again. The TUI's keystroke state machine (`interpretKey`) stays in the TUI because it is
 * terminal-specific; it builds on this `parseAction`.
 *
 * The grammar: single-letter or full-word verbs (`f`/`k`/`c`/`b`/`r`/`a`), an optional amount
 * (`b50`, `b 50`, `bet 50`), a bare bet/raise meaning the **minimum**, and `a`/`allin`/`shove`
 * meaning the **maximum**. Every returned action is guaranteed legal against the supplied
 * {@link LegalActions}, so a caller can hand it straight to `applyAction` without re-checking.
 */

import type { Action, LegalActions } from '@holdem/engine'

/** Result of parsing a line of input: a legal action, or a message to show the player. */
export type ParseResult = { ok: true; action: Action } | { ok: false; error: string }

/**
 * A one-line, human-readable menu of the legal actions, with amounts — the prompt both clients
 * print to tell the player what they can do (and what each verb is keyed to).
 */
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
 * Parse a line of input against the legal actions. Accepts single-letter or full-word verbs and an
 * optional amount (`b50`, `b 50`, `bet 50`); for bet/raise a missing amount means the minimum, and
 * `a`/`allin`/`shove` means the maximum.
 *
 * The returned action is always guaranteed legal against `legal`, so the caller can dispatch it
 * straight into `applyAction` (which throws on an illegal move) without re-checking.
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

/**
 * Resolve a bet/raise verb against its legal range: reject if the verb is not legal here, default a
 * bare verb to the minimum, and bounds-check an explicit amount.
 */
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

/** Capitalise the first letter of a verb for an error message (`bet` → `Bet`). */
function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1)
}
