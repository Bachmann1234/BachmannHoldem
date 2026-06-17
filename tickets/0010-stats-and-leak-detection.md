---
id: 0010
title: 'Epic: Stats & leak detection'
type: epic
status: done
milestone: M6
priority: medium
created: 2026-06-13
---

## Context

Where a trainer beats just playing online: turn accumulated hand history into longitudinal
feedback on your own tendencies.

## Acceptance criteria

- [x] Aggregate hand history → stats (VPIP, aggression, fold-to-3bet, by position)
- [x] Flag recurring leaks ("you over-fold the big blind")
- [x] **Sample-size gating:** never surface a leak/stat as actionable below a minimum sample
      (and ideally show a confidence/"need N more hands" cue) — HUD stats are noise on small
      samples

## Notes

Builds on the IndexedDB hand history from [[0008-pwa-app-shell]]. Also enables the
"analyze my real hands" use case.

The sample-size gate comes from the validated learning approach — see
[../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md). Flagging "leaks" on too few hands is
worse than saying nothing.

**Reuse the M5.5 durable store — do NOT invent a second one.** M5.5 ([[0080-drills-spaced-repetition]])
already built `apps/pwa/src/drills/store.ts` — `DrillProgressStore` / `IndexedDbDrillProgressStore`,
a per-concept aggregate (`correct`/`total`/`missStreak`/`lastMissedAt`) — deliberately as the
**shared durable layer M6 stats consume**, reusing the `IndexedDbHandHistoryStore` pattern
([[0008-pwa-app-shell]], `apps/pwa/src/history/store.ts`). It already powers per-concept drill
mastery + adaptive difficulty ([[0081-drills-mastery-difficulty-glossary]],
`apps/pwa/src/drills/mastery.ts` is the pure read-side projection). When building the stats/leak
aggregation here:

- **Drill-side stats** (per-concept mastery, accuracy over time) should READ/extend that existing
  store + the `mastery.ts` aggregation, not re-aggregate in a second place.
- **Play-side stats** (VPIP/PFR/aggression/fold-to-3bet from real hands) come from the hand-history
  log (`apps/pwa/src/history/`). If a new aggregate store is needed for those, follow the **same**
  `IndexedDbHandHistoryStore`/`DrillProgressStore` pattern (tiny typed interface, injectable lazy
  factory, versioned schema, graceful degradation) so there is one storage idiom across the app —
  not a third competing approach.

The sample-size gate applies to BOTH sides — drill mastery is also noise on tiny rep counts
(`difficultyForMastery` in `mastery.ts` already gates on a minimum sample; mirror that discipline
for any surfaced "you have a leak" / "you've mastered X" claim).

## Decomposition (2026-06-16)

Broken into per-feature tickets, in dependency order. **What matters most for M6:** (1) the
sample-size gate is the load-bearing pedagogy invariant — every surfaced stat carries its `n` and no
leak fires below a minimum sample (mirror `MASTERY_REPS_THRESHOLD`); (2) reuse over reinvent — play
stats are a pure read-side projection over the existing hand-history log (no new store), drill stats
read the existing `mastery.ts`, position reuses `@holdem/coach`'s `classifyPosition`; (3) the v1
hand-history record lacks the button + facing context that "by position" and "fold-to-3bet" need, so
a schema-v2 extension is the foundation.

- [[0086-history-record-position-facing]] — extend the hand-history record (schema v2) with
  `buttonIndex` + per-decision facing context. The data foundation for position & fold-to-3bet.
- [[0087-play-stats-aggregation]] — pure aggregation: VPIP / PFR / aggression / fold-to-3bet, overall
  - by position, each carrying its sample size.
- [[0088-leak-detection]] — named leaks over the stats, with the mandatory sample-size gate and a
  "need N more hands" cue.
- [[0089-stats-screen]] — the Stats screen (4th tab): play stats + leaks + the drill mastery readout.
