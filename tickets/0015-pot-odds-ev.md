---
id: 0015
title: Pot odds, outs, and EV-of-action helpers
type: feature
status: todo
milestone: M1
priority: high
created: 2026-06-13
---

## Context

The decision-math layer on top of equity ([[0005-odds-equity-engine]]): turn an equity number and
a betting situation into the quantities the coach ([[0007-coaching-engine]]) and bots
([[0006-heuristic-opponents]]) reason with.

## Acceptance criteria

- [ ] `potOdds(callAmount, pot)` → the break-even equity needed to call.
- [ ] `outsToEquity` / rule-of-2-and-4 style helper, and a way to count outs to the best hand on a
      given board (or a documented approximation).
- [ ] `evOfCall` / `evOfShove`-style helpers: given equity, pot, and amounts, the chip EV of an
      action, plus a `callIsProfitable` verdict (equity vs pot-odds threshold).
- [ ] Unit tests on worked examples (a clear +EV call, a clear −EV call, a break-even spot).

## Notes

Pure functions, no engine state needed beyond what is passed in. Depends on
[[0013-equity-enumeration]]. These are the verdict primitives the deterministic coach narrates.
