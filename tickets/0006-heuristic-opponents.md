---
id: 0006
title: 'Epic: Heuristic opponents'
type: epic
status: todo
milestone: M2
priority: medium
created: 2026-06-13
---

## Context

Computer opponents to play against, in `packages/bots`. Cheap to compute, surprisingly good for
training, and a clean seam for a smarter/GTO bot later.

## Acceptance criteria

- [ ] Range-based bots with a tight/loose × passive/aggressive personality matrix
- [ ] Decisions driven by the equity engine + pot odds
- [ ] An `Opponent` interface stable enough that a GTO bot ([[0012-gto-solver]]) drops in later

## Notes

Depends on [[0005-odds-equity-engine]]. The `Opponent` interface is the important deliverable —
get that seam right and the bot internals can evolve freely.
