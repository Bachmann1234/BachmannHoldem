---
id: 0079
title: Deepen drill feedback (show the math) and cross-link chart + glossary
type: feature
status: todo
milestone: M5.5
priority: medium
created: 2026-06-16
---

## Context

Drill feedback is better than pass/fail — the result sheet shows the coach verdict, price, and chip
EV via the same `@holdem/format` helpers as the live table — but it's a **one-shot reveal**, not a
teach-the-decision moment (learning-app review, 2026-06-16). A break-even spot and an obvious fold
get the same one-line treatment, the player is never scaffolded to produce the number, and the
existing reference tools (`ChartOverlay`, `GlossaryOverlay`) aren't reachable from the result even
though they exist and grade against the same data.

## Acceptance criteria

- [ ] Feedback shows the **math the player should have computed** — e.g. "needed 33%, had ~28% —
      that's why it's a fold" — not just the verdict label, especially distinguishing close
      (break-even) spots from clear ones.
- [ ] **Cross-link the result into existing reference tools**: "see the chart" → `ChartOverlay`,
      "look up this term" → `GlossaryOverlay` (reuse `GlossaryText`), from the drill `ResultSheet`.
- [ ] Reuses existing `explainCoach` / `explainDecision` output and overlays — no parallel
      explanation engine, no new reference UI.
- [ ] Tests cover the enriched feedback shape; works for both choice spots and the new calculation
      spots ([[0077-drills-calculation-spots]]).

## Notes

Part of [[0076-drills-v2]]. Mostly wiring: the overlays (`ChartOverlay.tsx`, `GlossaryOverlay.tsx`,
`glossaryTerms.ts`) and the formatter already exist — this connects them to the
`DrillSession`/`ResultSheet` flow ([[0067-pwa-drills-session]]). Deeper _leak-pattern_ feedback
("you're over-folding to small bets") is correctly M6 leak detection ([[0010-stats-and-leak-detection]]),
not this ticket — keep scope to per-spot instructive feedback. Glossary expansion lives in
[[0081-drills-mastery-difficulty-glossary]].
