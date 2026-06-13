---
id: 0023
title: Wire the coach into the CLI runner
type: feature
status: done
milestone: M3
priority: high
created: 2026-06-13
---

## Context

Turn `pnpm play` from a bare hand runner into a real coach: after (or alongside) each hero decision,
surface the deterministic verdict the coach computes — your equity, the pot odds, the EV-correct
action, the good/leak tag, and preflop the starting-hand chart guidance. This is the milestone's
payoff: the terminal becomes the feedback loop the whole design front-loads.

## Acceptance criteria

- [x] `apps/cli` consumes `@holdem/coach` and prints the per-decision verdict for the hero's spots
      (postflop: equity / pot odds / EV-correct action / good-or-leak; preflop: the chart tier +
      rationale).
- [x] The coaching output is readable in the existing terminal rendering style (see `table.ts`) and
      does not break the play loop or leak the bot's hole cards.
- [x] Rendering helpers added in `apps/cli` are unit-tested in the existing `table.test.ts` style;
      `pnpm verify` green.

## Notes

Depends on [[0021-coach-decision-verdict]] and [[0022-coach-preflop-chart]]. `apps/cli` is the thin
Node harness (excluded from the coverage gate), so the coach math stays in the pure package and the
CLI only formats and prints it — keep all verdict computation in `@holdem/coach`, mirroring how
`play.ts` delegates bot decisions to `@holdem/bots`.

Add `@holdem/coach` to `apps/cli`'s `package.json` and its `tsconfig.json` references. Decide the
UX: show the coach feedback _after_ the hero acts (verdict on the actual choice) — that matches
"coach the decision" and keeps the existing input loop intact. Keep the pure rendering helpers in
`table.ts` (testable) and only the I/O in `play.ts`.
</content>
