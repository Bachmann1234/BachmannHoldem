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
 *   When the verdict also carries `missedValueBet` (ticket 0055 — the hero checked an unbet pot
 *   while comfortably ahead), the sentence adds the value-bet nudge ("…but with {equity} equity
 *   you're ahead — bet for value rather than checking."). All clients render this line, so the
 *   nudge surfaces once, here, for the terminal, TUI, and PWA alike.
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
    // Over-passivity nudge (ticket 0055): the check is fine, but with this much equity the hero is
    // ahead and leaving value by not betting — surfaced here so every client gets it for free.
    if (verdict.missedValueBet) {
      return `Taking the free card is fine, but with ${equity} equity you're ahead — bet for value rather than checking.`
    }
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

/**
 * The EV-row metric for a verdict — the `{ label, value }` pair every client prints at the top of a
 * postflop coach block — with the **label corrected for spots that have nothing to call** (ticket
 * 0055).
 *
 * {@link DecisionVerdict.callEv} is `evOfCall(...)`, the chip EV of *calling* relative to folding.
 * On a priced spot (a real call/raise) that is exactly what it is, so the label is `EV(call)`. But
 * on a **free check or a bet** there is nothing to call: with `callAmount === 0` the EV-of-call math
 * collapses to `equity × pot` — the hero's *pot-equity* (their chip share of the pot), not the EV of
 * any call. The number was always correct; only the `EV(call)` label misled about what it measures.
 * So when `potOddsThreshold === 0` (the coach's own "no price to call" signal — `potOdds(0, pot)`),
 * we relabel it `Pot equity`. The **value is unchanged** in both cases — only the label moves — so
 * the three renderers stay byte-identical and the chip number a player learns to read never shifts.
 *
 * A raise into a bet (a priced spot, `toCall > 0`) keeps `EV(call)`: there *is* a call to compare
 * against, so the EV-of-call framing is the honest one.
 *
 * Pure formatting, like the rest of this module: it reads the label off `potOddsThreshold` and runs
 * the value through {@link signedChips}, so the terminal, the TUI, and the PWA's EV card all derive
 * the same label/value from one place and can never diverge.
 */
export function evMetric(verdict: DecisionVerdict): {
  readonly label: string
  readonly value: string
} {
  // potOddsThreshold === 0 is exactly potOdds(0, pot) — nothing to call (a free check or a bet),
  // where callEv is really equity×pot (pot-equity), not the EV of a call. Relabel, keep the value.
  const label = verdict.potOddsThreshold === 0 ? 'Pot equity' : 'EV(call)'
  return { label, value: signedChips(verdict.callEv) }
}
