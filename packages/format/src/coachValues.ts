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

/**
 * The deterministic **"why" line** for a postflop decision: a single, label-free sentence that
 * states the *reason* behind the verdict by connecting the numbers the verdict already carries —
 * the spot-specific explanation the three metric cards only imply.
 *
 * It is the shared phrasing every play client and the Foundations primer render, for the same reason
 * {@link pct} / {@link signedChips} / {@link VERDICT_LABEL} live here: the coach must never explain a
 * verdict one way at the table and another in a lesson. It does **no** poker math — it reads
 * `equity` / `potOddsThreshold` / `callEv` / `correctDecision` / `verdict` straight off the verdict
 * and formats them. This is the *deterministic* half of "say why"; rich natural-language narration
 * (outs, draws, board texture) is the optional LLM layer ([[0011-llm-coaching]]), not this.
 *
 * Four cases, mirroring {@link coachDecision}'s own branches:
 * - **Free check** (`potOddsThreshold === 0`): no price, so any equity continues — no EV claim.
 * - **Break-even** (`verdict === 'breakEven'`): equity sits on the price; the call is a wash.
 * - **Priced continue** (`correctDecision === 'continue'`): equity beats the price, so calling is +EV.
 * - **Priced fold** (`correctDecision === 'fold'`): equity trails the price, so folding is +EV.
 *
 * The sentence is **label-free** (no "Good"/"Leak" prefix) so a client can pair it with its own
 * headline — the play coach's {@link VERDICT_LABEL}, the primer's encouraging copy — without
 * repeating the tag.
 */
export function explainDecision(verdict: DecisionVerdict): string {
  const equity = pct(verdict.equity)
  // A free check has no price to weigh equity against, so it never talks about a break-even % or EV.
  if (verdict.potOddsThreshold === 0) {
    return `There's no price to call, so taking the free card is automatic — you keep your ${equity} share for nothing.`
  }
  const price = pct(verdict.potOddsThreshold)
  // Break-even: equity is within the tolerance band of the price, so the call is a coin-flip.
  if (verdict.verdict === 'breakEven') {
    return `Your ${equity} equity sits right on the ${price} the call needs — a coin-flip, so continuing and folding are equal in value.`
  }
  // Clear decision: equity is meaningfully above or below the break-even price. `callEv`'s sign is
  // the EV-correct side; report the chip EV of calling either way so the magnitude teaches too.
  const chips = `calling is worth ${signedChips(verdict.callEv)} chips`
  if (verdict.correctDecision === 'continue') {
    return `Your ${equity} equity beats the ${price} the call needs, so continuing is the +EV play — ${chips}.`
  }
  return `Your ${equity} equity falls short of the ${price} the call needs, so folding is the +EV play — ${chips}.`
}
