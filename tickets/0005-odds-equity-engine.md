---
id: 0005
title: 'Epic: Odds & equity engine'
type: epic
status: todo
milestone: M1
priority: high
created: 2026-06-13
---

## Context

The math layer powering both coaching and bots. Build in `packages/odds`, runnable from Node and
(via a Web Worker wrapper) the PWA.

## Acceptance criteria

- [ ] Monte Carlo equity calculator: hand vs hand, hand vs range, vs partial board
- [ ] Pot odds, outs, and EV-of-action helpers
- [ ] Exact river enumeration as a correctness oracle for the simulator
- [ ] Web Worker wrapper so sims never block the UI (same API usable from Node)

## Notes

`equity("AhKh", board="7h2d9c")` returning a win% is the test oracle for everything downstream.
Break into per-feature tickets when pulled. Depends on [[0002-hand-evaluator]].
