---
id: 0014
title: Monte Carlo equity (hand vs hand / range / partial board)
type: feature
status: todo
milestone: M1
priority: high
created: 2026-06-13
---

## Context

The fast, general equity path: when exact enumeration is too large (preflop with unknown villain
cards, ranges), sample. Builds on the exact oracle ([[0013-equity-enumeration]]) for correctness.

## Acceptance criteria

- [ ] `monteCarloEquity({ hands, board, ranges, iterations, seed })` returning the same
      `HandEquity[]` shape as the exact path.
- [ ] Supports unknown villain holdings drawn from a **range** (a set of two-card combos), and a
      hero hand vs one or more ranges, on any partial board.
- [ ] **Seeded, deterministic PRNG** (no `Math.random`) so tests are reproducible.
- [ ] Converges to the exact oracle within tolerance on fully-known spots (assert |MC − exact| is
      small at high iteration counts).
- [ ] Simple range parsing helper (e.g. `"AA, KK, AKs, AKo"` → combos), skipping combos that
      collide with known cards.

## Notes

Depends on [[0013-equity-enumeration]]. The seeded PRNG + range representation become the basis the
bots ([[0006-heuristic-opponents]]) and coach ([[0007-coaching-engine]]) consume.
