---
id: 0012
title: 'Epic: GTO solver opponents'
type: epic
status: todo
milestone: stretch
priority: low
created: 2026-06-13
---

## Context

Replace heuristic ranges with game-theory-optimal play. Research-grade; deliberately last, behind
the `Opponent` interface so it's an internals swap, not a rewrite.

## Acceptance criteria

- [ ] Precomputed solver output (CFR-style) for key spots
- [ ] A bot consuming it, swapped in via the existing `Opponent` interface
- [ ] Coach can reference GTO ranges where available

## Notes

Months of work; only start once everything above is solid. Depends on the seam from
[[0006-heuristic-opponents]].
