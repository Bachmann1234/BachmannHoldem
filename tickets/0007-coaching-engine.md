---
id: 0007
title: 'Epic: Coaching engine (deterministic)'
type: epic
status: todo
milestone: M3
priority: high
created: 2026-06-13
---

## Context

The actual point of the app, in `packages/coach` — and still no AI. Turns the deterministic math
into per-decision feedback.

## Acceptance criteria

- [ ] Per-decision feedback: your equity, the pot odds, the EV-correct action, good/leak verdict
- [ ] Preflop hand-strength guidance (chart-based)
- [ ] Wired into the CLI runner so the terminal becomes a real coach

## Notes

All correctness is deterministic math owned here; the optional LLM layer ([[0011-llm-coaching]])
only narrates it. Depends on [[0005-odds-equity-engine]].
