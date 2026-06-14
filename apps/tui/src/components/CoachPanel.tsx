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
 * Colour is via Ink `color` props; component tests strip ANSI, so they assert on the rendered text,
 * never on escape bytes. The value formatters it renders with (`pct` / `signedChips` /
 * `VERDICT_LABEL`) live in the shared `@holdem/format` package, so the coach read is phrased
 * identically here and in the headless CLI harness (ticket 0030 consolidated the former copies).
 */

import { Box, Text } from 'ink'
import type { DecisionVerdict } from '@holdem/coach'
import { pct, signedChips, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '../model.js'

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
