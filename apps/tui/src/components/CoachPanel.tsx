/**
 * The live coach panel (ticket 0028) — the TUI rendering of what `apps/cli` prints as a
 * `── Coach ──` block, and the payoff of the whole project in the terminal.
 *
 * Purely presentational: it renders the {@link CoachResult} the pure reducer already computed and
 * stored on the model. It does **no** verdict math of its own — all of it lives in `@holdem/coach`,
 * which the reducer calls (capturing the spot before the action is applied) and hands the panel a
 * finished {@link DecisionVerdict} postflop or {@link PreflopVerdict} preflop. With ticket 0031 in
 * place that verdict's equity already reflects the live number of opponents in the pot, so the panel
 * just lays out the numbers it is given.
 *
 * Four states, one per {@link CoachResult.kind}:
 * - `'verdict'` — a postflop grade: equity vs pot odds + EV(call), the EV-correct continue
 *   decision, and a colour-coded good/leak/break-even headline (green / red / yellow).
 * - `'preflop'` — a preflop grade off the starting-hand chart: the tier rationale and the
 *   colour-coded headline, with no pot-odds math to contradict the chart (ticket BUG-0001).
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
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import { explainDecision, explainPreflop, pct, evMetric, VERDICT_LABEL } from '@holdem/format'
import type { CoachResult } from '@holdem/session'

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
        <Verdict verdict={coach.verdict} />
      ) : coach.kind === 'preflop' ? (
        <PreflopGrade verdict={coach.verdict} />
      ) : coach.kind === 'error' ? (
        <Text dimColor>{`  ${coach.message}`}</Text>
      ) : (
        <Text dimColor>{'  No decision yet, act to see the coach read it.'}</Text>
      )}
    </Box>
  )
}

/**
 * The laid-out *postflop* verdict body: the numbers, the EV-correct action, and the colour-coded
 * headline. Postflop only — preflop is graded by the chart and rendered by {@link PreflopGrade},
 * which carries no pot-odds math to contradict the chart (ticket BUG-0001).
 */
function Verdict({ verdict }: { readonly verdict: DecisionVerdict }): React.JSX.Element {
  // The EV metric's label is corrected for spots with nothing to call (a free check / a bet),
  // where `callEv` is really pot-equity, not the EV of a call (ticket 0055 — `evMetric`).
  const ev = evMetric(verdict)
  return (
    <Box flexDirection="column">
      <Text>
        {`  Equity ${pct(verdict.equity)}  vs pot odds ${pct(verdict.potOddsThreshold)}` +
          `  ${ev.label} ${ev.value}`}
      </Text>
      <Text>{`  EV-correct: ${verdict.correctDecision}`}</Text>
      <Text color={VERDICT_COLOR[verdict.verdict]}>{`  ${VERDICT_LABEL[verdict.verdict]}`}</Text>
      <Text dimColor>{`  ${explainDecision(verdict)}`}</Text>
    </Box>
  )
}

/**
 * The laid-out *preflop* grade: the starting-hand chart rationale (a self-contained, tier-named
 * sentence, rendered as-is) and the colour-coded good/leak headline. There is deliberately no
 * equity / pot-odds / EV-correct line here — preflop is graded off the chart, not the pot-odds math
 * (ticket BUG-0001), so the panel never shows the self-contradicting "open for value" + "EV-correct:
 * fold" pairing.
 */
function PreflopGrade({ verdict }: { readonly verdict: PreflopVerdict }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text>{`  Starting hand: ${verdict.rationale}`}</Text>
      <Text color={VERDICT_COLOR[verdict.verdict]}>{`  ${VERDICT_LABEL[verdict.verdict]}`}</Text>
      {/* The shared deterministic preflop "why" line (ticket 0060) — the preflop counterpart to the
          postflop `explainDecision` the {@link Verdict} body renders, so the TUI narrates the chart's
          reasoning the same way the CLI sim and the PWA coach drawer do. */}
      <Text dimColor>{`  ${explainPreflop(verdict)}`}</Text>
    </Box>
  )
}
