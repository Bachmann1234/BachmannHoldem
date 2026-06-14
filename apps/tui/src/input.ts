/**
 * The pure keystroke → validated engine `Action` mapping for the TUI action bar (ticket 0027). The
 * `useInput` hook in {@link file://./components/ActionBar.tsx} is a thin wrapper that only feeds
 * keystrokes in and dispatches the `Action` that comes out, so every grammar/legality decision is a
 * pure, unit-tested function — either here or in `@holdem/format`.
 *
 * The verb/amount grammar itself ({@link parseAction} + {@link renderLegal}) now lives in the shared
 * `@holdem/format` package, so the TUI and the headless CLI accept identical input and can never
 * drift (ticket 0030 consolidated the two former copies). This module re-exports them and keeps the
 * genuinely terminal-specific piece — {@link interpretKey}, the character-by-character amount-entry
 * state machine — which builds on `parseAction`.
 */

import type { Action, LegalActions } from '@holdem/engine'
import { parseAction } from '@holdem/format'

// Re-exported so existing imports (`from './input.js'`) and the action bar keep one import surface.
export { parseAction, renderLegal, type ParseResult } from '@holdem/format'

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
