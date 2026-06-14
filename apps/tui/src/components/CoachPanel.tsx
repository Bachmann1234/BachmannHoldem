/**
 * The live coach panel (ticket 0028) — the TUI rendering of what `apps/cli` prints as a
 * `── Coach ──` block, and the payoff of the whole project in the terminal.
 *
 * Purely presentational: it renders the {@link CoachResult} the pure reducer already computed and
 * stored on the model. It does **no** verdict math of its own — all of it lives in `@holdem/coach`,
 * which the reducer calls (capturing the spot before the action is applied) and hands the panel a
 * finished {@link DecisionVerdict} (+ a preflop {@link StartingHandVerdict}). With ticket 0031 in
 * place that verdict's equity already reflects the live number of opponents in the pot, so the panel
 * just lays out the numbers it is given.
 *
 * Three states, one per {@link CoachResult.kind}:
 * - `'verdict'` — the laid-out grade: (preflop) the starting-hand rationale, then equity vs pot
 *   odds + EV(call), the EV-correct continue decision, and a colour-coded good/leak/break-even
 *   headline (green / red / yellow).
 * - `'error'` — coaching is advisory, so a coach throw degrades to a dim one-line notice here; the
 *   game continues uninterrupted.
 * - `'none'` — no hero decision graded yet: a dim placeholder.
 *
 * Colour is via Ink `color` props; component tests strip ANSI, so they assert on the rendered text
 * (and on the pure formatters below), never on escape bytes.
 */

import { Box, Text } from 'ink'
import type { DecisionVerdict } from '@holdem/coach'
import type { CoachResult } from '../model.js'

/**
 * Format a `0..1` equity/pot-odds fraction as a one-decimal percent, e.g. `0.625 → "62.5%"`.
 *
 * NOTE (ticket 0030): this is a deliberate, exact copy of `apps/cli/src/table.ts`'s `pct`. The CLI
 * keeps its own copy today; ticket 0030 owns de-duplicating the percent/signed-chip formatting into
 * a shared home. Until then these two copies must stay byte-for-byte identical — keep this cleanly
 * separable so the move is a lift, not a rewrite.
 */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/**
 * Format a chip EV as a signed number, e.g. `4 → "+4"`, `-1.5 → "-1.5"`, `0 → "0"`.
 *
 * NOTE (ticket 0030): an exact copy of `apps/cli/src/table.ts`'s `signedChips`; see {@link pct}.
 * The bare-`0` handling matters: a near-zero EV renders an unsigned `0` (never `-0`), and whole-chip
 * EVs drop the trailing `.0` (`+4`, not `+4.0`).
 */
export function signedChips(ev: number): string {
  // Round to one decimal *first* so a near-zero EV renders a bare, unsigned `0` rather than
  // a misleading signed zero (`-0.04 → "0"`, not `"-0"`; also handles JS negative zero).
  const rounded = Math.round(ev * 10) / 10
  if (rounded === 0) return '0'
  // Trim a trailing `.0` so whole-chip EVs read clean (`+4`, not `+4.0`).
  const magnitude = Math.abs(rounded).toFixed(1).replace(/\.0$/, '')
  return rounded < 0 ? `-${magnitude}` : `+${magnitude}`
}

/** The human-readable headline for each {@link DecisionVerdict.verdict} tag (mirrors the CLI). */
const VERDICT_LABEL: Readonly<Record<DecisionVerdict['verdict'], string>> = {
  good: 'Good — your action agreed with the math.',
  leak: 'Leak — the math pointed the other way.',
  breakEven: 'Break-even — a coin-flip spot; either way is fine.',
}

/** The Ink `color` prop for each verdict tag: green good / red leak / yellow break-even. */
const VERDICT_COLOR: Readonly<Record<DecisionVerdict['verdict'], string>> = {
  good: 'green',
  leak: 'red',
  breakEven: 'yellow',
}

/** Props for {@link CoachPanel}: the stored coach result to render. */
export interface CoachPanelProps {
  readonly coach: CoachResult
}

/**
 * Render the coach's grade of the hero's last decision. A pure function of {@link CoachResult} —
 * no engine state, no math, just layout. The `── Coach ──` header frames the block (matching the
 * table view's section style); the body switches on the result kind.
 */
export function CoachPanel({ coach }: CoachPanelProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text>{`── Coach ${'─'.repeat(39)}`}</Text>
      {coach.kind === 'verdict' ? (
        <Verdict verdict={coach.verdict} rationale={coach.preflop?.rationale} />
      ) : coach.kind === 'error' ? (
        <Text dimColor>{`  ${coach.message}`}</Text>
      ) : (
        <Text dimColor>{'  No decision yet — act to see the coach read it.'}</Text>
      )}
    </Box>
  )
}

/** The laid-out verdict body: the numbers, the EV-correct action, and the colour-coded headline. */
function Verdict({
  verdict,
  rationale,
}: {
  readonly verdict: DecisionVerdict
  /** The preflop starting-hand rationale, present only when the decision was preflop. */
  readonly rationale?: string
}): React.JSX.Element {
  return (
    <Box flexDirection="column">
      {/* Preflop, the chart tier leads — the rationale is a self-contained, tier-named sentence,
          so it is rendered as-is (no `cap(tier)` prefix), exactly like the CLI. */}
      {rationale ? <Text>{`  Starting hand: ${rationale}`}</Text> : null}
      <Text>
        {`  Equity ${pct(verdict.equity)}  vs pot odds ${pct(verdict.potOddsThreshold)}` +
          `  EV(call) ${signedChips(verdict.callEv)}`}
      </Text>
      <Text>{`  EV-correct: ${verdict.correctDecision}`}</Text>
      <Text color={VERDICT_COLOR[verdict.verdict]}>{`  ${VERDICT_LABEL[verdict.verdict]}`}</Text>
    </Box>
  )
}
