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

Two things to hold in balance (see [../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md)):

1. Bots are the **least evidence-backed _learning_ mechanism** — practising vs. weak/exploitable
   bots can teach habits that don't transfer to real games. So aim for _plausible_ over _strong_,
   treat the bots as a decision-point generator for the coach, and don't make win-rate-vs-bots the
   measure of progress.
2. **Playing the bots is also just meant to be fun** — a poker app that's enjoyable to play is a
   goal in itself. Point 1 is about not over-trusting bots as a learning yardstick; it is **not** a
   reason to strip the play experience down to a drill.
