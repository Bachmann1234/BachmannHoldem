---
id: 0010
title: 'Epic: Stats & leak detection'
type: epic
status: todo
milestone: M6
priority: medium
created: 2026-06-13
---

## Context

Where a trainer beats just playing online: turn accumulated hand history into longitudinal
feedback on your own tendencies.

## Acceptance criteria

- [ ] Aggregate hand history → stats (VPIP, aggression, fold-to-3bet, by position)
- [ ] Flag recurring leaks ("you over-fold the big blind")
- [ ] **Sample-size gating:** never surface a leak/stat as actionable below a minimum sample
      (and ideally show a confidence/"need N more hands" cue) — HUD stats are noise on small
      samples

## Notes

Builds on the IndexedDB hand history from [[0008-pwa-app-shell]]. Also enables the
"analyze my real hands" use case.

The sample-size gate comes from the validated learning approach — see
[../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md). Flagging "leaks" on too few hands is
worse than saying nothing.
