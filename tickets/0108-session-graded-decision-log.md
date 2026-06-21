---
id: 0108
title: Retain the session's graded coach decisions instead of discarding each hand
type: feature
status: todo
milestone: M9
priority: high
created: 2026-06-20
---

## Context

The end-of-session synthesis ([[0107-end-of-session-coach-synthesis]]) needs the coach's rulings from
**every hand of the session** to look back over. But today the session keeps only the **most recent**
ruling: `model.coach` is a single `CoachResult` that the reducer **resets to `{ kind: 'none' }` every
hand** (`packages/session/src/model.ts`). The graded `verdict`/`preflop` variants — which carry the
exact `DecisionContext`, the hero's `Action`, and the `DecisionVerdict` / `PreflopVerdict` — are
overwritten on the next decision and gone for good when the hand ends. So at `session-over` there is
nothing to synthesize from.

This ticket adds **retention**: as each graded coach ruling is produced during play, append it to a
session-scoped log on the model, so the full sequence of the hero's graded decisions survives to
`session-over` / `game-over`. This is the data foundation the rest of M9 builds on; it changes no
grading logic.

## Acceptance criteria

- [ ] The session `Model` gains a retained, append-only log of the session's graded coach decisions —
      each entry capturing what `CoachResult`'s graded variants already hold (`kind` `verdict` |
      `preflop`, the `DecisionVerdict` / `PreflopVerdict`, the `DecisionContext`, and the hero's
      `Action`), plus enough hand-identity context to **anchor** an entry to a specific hand (e.g. a
      hand index/ordinal within the session, and the hero's hole cards if available) so synthesis can
      say "in hand #7…".
- [ ] Only **graded** rulings are retained — `{ kind: 'none' }` and `{ kind: 'error' }` carry no spot
      and are not logged.
- [ ] The reducer appends to the log at the **same point** it currently sets `model.coach` for a graded
      decision; the live `model.coach` reset-each-hand behavior is **unchanged** (the live coach panel
      keeps showing only the current decision). Retention is additive — it does not alter live coaching.
- [ ] The log is reset when a **new session** starts (`setup` / new game), not between hands.
- [ ] The retained log is available on the model in the `session-over` / `game-over` phases for
      [[0109-coach-session-synthesis]] to read.
- [ ] Co-located reducer tests cover: a multi-hand session accumulates one entry per graded hero
      decision in order; `none`/`error` rulings are not logged; the log survives the hand-over →
      next-hand transition; a fresh session starts with an empty log.
- [ ] `pnpm verify` fully green.

## Notes

**Keep the entry a thin capture, not a re-grade.** The graded `CoachResult` variants already hold
everything an entry needs — copy those fields through; do not recompute the verdict. (`serializeSpot`
exists for persistence to hand history, but in-memory retention can hold the live objects directly; no
serialization is required for this ticket.)

**Anchoring.** Synthesis wants to point at concrete hands ("hands #7 and #14"). Capture a stable
per-hand ordinal at append time. Hole cards, if reachable at the decision point, make the anchor
readable in the recap ([[0110-pwa-session-recap-screen]]) — the hand-history record already proves
hole cards are capturable at decision time (schema v3, `apps/pwa/src/history/record.ts`).

**Scope.** This is in-memory session state only — no IndexedDB, no schema bump. It is deliberately the
mirror of the live `coach` field, accumulated rather than replaced. Memory is bounded by a session's
hand count (tens), so no pruning is needed.
