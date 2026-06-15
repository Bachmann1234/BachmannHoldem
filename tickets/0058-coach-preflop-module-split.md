---
id: 0058
title: Split the growing preflop coach into position / rationale modules
type: chore
status: todo
milestone:
priority: low
created: 2026-06-15
---

## Context

The coach-fidelity milestone ([[0051-coach-fidelity-epic]]) grew `packages/coach/src/preflop.ts`
to ~900 lines and `verdict.ts` to ~525 (≈60% doc comments). `preflop.ts` now carries the
strength chart, the position model (`classifyPosition` / `Position` / `EARLY_SEATS` /
`isInPosition`), the steal range (`STEAL_OPEN_RANGE` / `isStealSpot`), the facing-raise bands
(`facingRaiseAdvice` + cutoffs), the position-aware `adviceFor`, and two rationale builders
(`openFoldRationale` + the facing-raise wording) — several distinct concerns in one file.

The milestone-review (2026-06-15) flagged this as a LOW code-smell: still cohesive and
well-documented, but the file is doing enough that the next feature on top would benefit from a
split. Not a blocker — purely readability/maintainability.

## Acceptance criteria

- [ ] Extract a focused module for the position model (`classifyPosition`, `Position`,
      `EARLY_SEATS`, `isInPosition`, `WIDENING_POSITIONS`) and/or a rationale module (the
      open/fold + facing-raise wording builders) out of `preflop.ts`.
- [ ] The public API surface (what `src/index.ts` re-exports) is unchanged — this is an internal
      reorganization, not an API change.
- [ ] Purity preserved (no new deps); `pnpm verify` green; coverage stays above the
      `vitest.config.ts` thresholds.
- [ ] No behavior change: the existing coach/preflop tests pass unmodified (or only by moving,
      not rewriting, test files).

## Notes

Follow-up from the [[0051-coach-fidelity-epic]] milestone review. Pure refactor; sequence it
whenever the preflop coach next needs a feature (e.g. [[0057-coach-board-aware-range]]) so the
split lands as part of work that touches the area rather than as churn for its own sake. Match the
engine/odds module conventions (heavy doc comments, `.js` import specifiers, co-located tests).
