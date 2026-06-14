/**
 * The shared coach value formatters: how every play client renders the numbers a
 * {@link DecisionVerdict} carries — equity/pot-odds percents ({@link pct}), the signed chip EV
 * ({@link signedChips}), and the human headline for each verdict tag ({@link VERDICT_LABEL}).
 *
 * These were duplicated, byte-for-byte, in `apps/cli/src/table.ts` and
 * `apps/tui/src/components/CoachPanel.tsx`; consolidating them here (ticket 0030) means the coach
 * read can never phrase a verdict one way in the terminal harness and another in the TUI. Pure — no
 * Ink, no Node, no colour: a client wraps these in its own presentation (the CLI in a `── Coach ──`
 * text block, the TUI in colour-coded Ink `<Text>`), but the *value formatting* is identical and
 * lives only here.
 */

import type { DecisionVerdict } from '@holdem/coach'

/** Format a `0..1` equity/pot-odds fraction as a one-decimal percent, e.g. `0.625 → "62.5%"`. */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** Format a chip EV as a signed number, e.g. `4 → "+4"`, `-1.5 → "-1.5"`, `0 → "0"`. */
export function signedChips(ev: number): string {
  // Round to one decimal *first* so a near-zero EV renders a bare, unsigned `0` rather than
  // a misleading signed zero (`-0.04 → "0"`, not `"-0"`; also handles JS negative zero).
  const rounded = Math.round(ev * 10) / 10
  if (rounded === 0) return '0'
  // Trim a trailing `.0` so whole-chip EVs read clean (`+4`, not `+4.0`).
  const magnitude = Math.abs(rounded).toFixed(1).replace(/\.0$/, '')
  return rounded < 0 ? `-${magnitude}` : `+${magnitude}`
}

/** The human-readable headline for each {@link DecisionVerdict.verdict} tag. */
export const VERDICT_LABEL: Readonly<Record<DecisionVerdict['verdict'], string>> = {
  good: 'Good — your action agreed with the math.',
  leak: 'Leak — the math pointed the other way.',
  breakEven: 'Break-even — a coin-flip spot; either way is fine.',
}
