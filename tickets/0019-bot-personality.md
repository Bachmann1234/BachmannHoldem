---
id: 0019
title: Personality matrix — tight/loose × passive/aggressive
type: feature
status: done
milestone: M2
priority: medium
created: 2026-06-13
---

## Context

The epic asks for "range-based bots with a **tight/loose × passive/aggressive** personality matrix"
([[0006-heuristic-opponents]]). This ticket defines that matrix as data: the parameters that
distinguish a nit from a calling station from a maniac, plus the named presets covering the four
quadrants. The decision policy ([[0020-heuristic-opponent]]) reads these knobs; the equity perception
layer ([[0018-bot-hand-reading]]) may read the range-width knob to pick the assumed opponent range.

Keeping personality as a plain, documented parameter object (not baked into the policy) is what makes
the matrix legible and the bots tunable — and it keeps the play experience varied and _fun_, which
[LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md) calls a first-class goal, not just a drill knob.

## Acceptance criteria

- [x] A `Personality` type capturing two orthogonal axes: - **Tightness** (tight↔loose): how much equity / how strong a holding the bot requires to
      continue — e.g. a continuing-equity threshold and/or the width of the range it plays and the
      range it assigns villain. - **Aggression** (passive↔aggressive): how often it bets/raises rather than checks/calls with a
      given hand, and how big it sizes (as a fraction of pot).
      Document each field's units and range clearly (the doc-comment density of engine/odds).
- [x] Named presets covering the four quadrants, using standard poker labels, e.g.:
      tight-aggressive (TAG), loose-aggressive (LAG), tight-passive (rock/nit), loose-passive
      (calling station). Plus a sensible default.
- [x] The parameters are consumed by — and therefore validated against — the policy in
      [[0020-heuristic-opponent]]; provide validation (ranges in `0..1`, etc.) with clear errors.
- [x] Unit tests: presets are well-formed and meaningfully distinct (e.g. tight threshold > loose
      threshold; aggressive bet-frequency > passive); validation rejects out-of-range knobs.

## Notes

Depends on [[0017-opponent-seam]]. Pure data + small helpers — no equity calls, no engine state.
This is deliberately a small ticket: the value is a crisp, named matrix the policy and the UI can
select from. Coordinate the exact knob names/shape with [[0018-bot-hand-reading]] and
[[0020-heuristic-opponent]] so the three fit together without churn.

Honour the balance in [LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md): tune presets toward
_plausible_ opponents, not maximally strong ones — the point is believable, varied, enjoyable play
that also generates good coachable decisions.
