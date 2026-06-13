---
id: 0007
title: 'Epic: Coaching engine (deterministic)'
type: epic
status: done
milestone: M3
priority: high
created: 2026-06-13
---

## Context

The actual point of the app, in `packages/coach` — and still no AI. Turns the deterministic math
into per-decision feedback.

## Acceptance criteria

- [x] Per-decision feedback: your equity, the pot odds, the EV-correct action, good/leak verdict
- [x] Preflop hand-strength guidance (chart-based)
- [x] Wired into the CLI runner so the terminal becomes a real coach

## Notes

All correctness is deterministic math owned here; the optional LLM layer ([[0011-llm-coaching]])
only narrates it. Depends on [[0005-odds-equity-engine]].

Decomposed into per-feature tickets (built in order): [[0021-coach-decision-verdict]] (the
`packages/coach` scaffold + the per-decision verdict: equity, pot odds, EV-correct action,
good/leak), [[0022-coach-preflop-chart]] (chart-based preflop hand-strength guidance), and
[[0023-coach-cli-wiring]] (wire the verdict into `pnpm play` so the terminal becomes a real coach).

**What matters most for M3:** deterministic per-decision verdicts, still no AI, reusing the M1 math
([[0005-odds-equity-engine]]) and the M2 seams (`DecisionContext` + `estimateEquity` from
[[0006-heuristic-opponents]]) rather than reinventing them. The headline pitfall is the same pot
accounting trap the bots faced — `ctx.pot` is the pot _before_ the call and excludes `ctx.toCall`,
so map directly to `potOdds(toCall, pot)` / `evOfCall({ equity, pot, callAmount: toCall })`.
