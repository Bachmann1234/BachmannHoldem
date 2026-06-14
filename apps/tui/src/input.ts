/**
 * The pure keystroke/grammar → validated engine `Action` mapping for the TUI action bar
 * (ticket 0027). This is the *whole* of the TUI's input rules and it is kept free of Ink: the
 * `useInput` hook in {@link file://./components/ActionBar.tsx} is a thin wrapper that only feeds
 * keystrokes in and dispatches the `Action` that comes out, so every grammar/legality decision is
 * a pure, unit-tested function here.
 *
 * The verb/amount grammar deliberately mirrors `apps/cli/src/table.ts`'s `parseAction` semantics
 * exactly — single-letter or full-word verbs (f/k/c/b/r/a), an optional amount, bare bet/raise =
 * the minimum, and a/allin/shove = the maximum — so the two clients accept the same input. Apps
 * must not depend on one another, so it is re-implemented (not imported) here.
 *
 * NOTE (ticket 0030): the CLI keeps its own `parseAction` for now; 0030 owns de-duplicating both
 * copies into a shared home. This module is kept cleanly separable (no Ink, no app-shell state) so
 * that consolidation is a straight lift.
 */

import type { Action, LegalActions } from '@holdem/engine'

/** Result of parsing a line of input: a legal action, or a message to show as a gentle hint. */
export type ParseResult = { ok: true; action: Action } | { ok: false; error: string }

/**
 * Parse a line of input against the legal actions. Accepts single-letter or full-word verbs and
 * an optional amount (`b50`, `b 50`, `bet 50`); for bet/raise a missing amount means the minimum,
 * and `a`/`allin`/`shove` means the maximum. Mirrors `apps/cli/src/table.ts`'s `parseAction`.
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

/**
 * A one-line, human-readable menu of the legal actions, with amounts — the action bar's prompt.
 * Mirrors `renderLegal` in `apps/cli/src/table.ts`.
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
 * The outcome of interpreting a single keystroke against the in-progress amount buffer. A pure
 * model of the action bar's character-by-character input so the keystroke handling is testable
 * without Ink:
 *
 * - `buffer` — the keystroke was absorbed into (or cleared from) the typed amount buffer; the bar
 *   should show the new `buffer` and keep waiting.
 * - `action` — a complete, *legal* {@link Action} was produced (e.g. Enter on a buffered bet, or a
 *   one-shot verb like `f`/`c`); the caller dispatches it and clears the buffer.
 * - `error` — the keystroke produced something illegal/garbled here; show `message` as a gentle
 *   hint and (typically) reset the buffer. Never crashes, never an illegal action.
 * - `ignore` — a key with no meaning for input right now (e.g. an arrow); do nothing.
 */
export type KeyResult =
  | { kind: 'buffer'; buffer: string }
  | { kind: 'action'; action: Action }
  | { kind: 'error'; message: string }
  | { kind: 'ignore' }

/** The subset of Ink's `Key` flags {@link interpretKey} reacts to (kept Ink-free for testing). */
export interface KeyFlags {
  readonly return?: boolean
  readonly backspace?: boolean
  readonly delete?: boolean
  readonly escape?: boolean
}

/**
 * Interpret one keystroke against the current amount-entry `buffer`, returning the next input
 * state (see {@link KeyResult}). Pure — no Ink, no model — so it can be unit-tested directly.
 *
 * Behaviour:
 * - A digit while a verb is buffered extends the amount (`b` then `5` then `0` → buffer `b50`).
 * - A bare verb keystroke (`f`/`k`/`c`/`a`) with an empty buffer fires immediately if legal —
 *   these take no amount, so there is nothing to wait for. `b`/`r` start an amount buffer (so the
 *   hero can type the size), but if that verb is also a complete legal move with no amount it can
 *   still be committed with Enter (= the minimum).
 * - Enter commits the buffer through {@link parseAction}; an empty buffer Enter is ignored.
 * - Backspace/Delete trims the buffer; Escape clears it.
 * - Anything illegal-here or unparseable is an `error` hint and never reaches the engine.
 */
export function interpretKey(
  buffer: string,
  input: string,
  key: KeyFlags,
  legal: LegalActions,
): KeyResult {
  if (key.escape) return { kind: 'buffer', buffer: '' }

  if (key.backspace || key.delete) {
    return { kind: 'buffer', buffer: buffer.slice(0, -1) }
  }

  if (key.return) {
    if (buffer.length === 0) return { kind: 'ignore' }
    const parsed = parseAction(buffer, legal)
    return parsed.ok
      ? { kind: 'action', action: parsed.action }
      : { kind: 'error', message: parsed.error }
  }

  // Only printable, grammar-relevant characters matter; ignore control/arrow keys etc.
  if (input.length !== 1 || !/[a-z0-9]/i.test(input)) return { kind: 'ignore' }
  const ch = input.toLowerCase()

  // A digit only makes sense once a bet/raise verb is buffered.
  if (/[0-9]/.test(ch)) {
    if (buffer.length === 0) return { kind: 'ignore' }
    return { kind: 'buffer', buffer: buffer + ch }
  }

  // A letter that keeps the buffer a prefix of an amount-bearing verb (`bet`/`raise`) is absorbed —
  // those verbs wait for digits + Enter, so the hero can spell them out before sizing.
  const next = buffer + ch
  if (startsAmountVerb(next)) return { kind: 'buffer', buffer: next }

  // Otherwise the keystroke must be a complete, legal one-shot verb (f/k/c/a) on an empty buffer —
  // fire it. Anything else (an unknown letter, an illegal-here verb, junk after a verb) is a gentle
  // hint and resets the buffer; it never reaches the engine.
  const parsed = parseAction(ch, legal)
  if (parsed.ok) return { kind: 'action', action: parsed.action }
  return { kind: 'error', message: parsed.error }
}

/**
 * Does the buffer-so-far spell the prefix of an amount-bearing verb (`bet`/`raise`)? Such verbs
 * wait for the hero to type a size and press Enter rather than firing on the first letter.
 */
function startsAmountVerb(buffer: string): boolean {
  return ['b', 'bet', 'r', 'raise'].some(
    (verb) => verb.startsWith(buffer) || buffer.startsWith(verb),
  )
}
