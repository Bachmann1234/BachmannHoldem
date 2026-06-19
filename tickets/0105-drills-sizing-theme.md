---
id: 0105
title: 'Drill: pick the bet size'
type: feature
status: todo
milestone: M8
priority: low
created: 2026-06-19
---

## Context

A "what size?" drill theme for [[0100-coach-betting-sizing-guidance]], reusing the band logic as the
grader. The drills system ([[0076-drills-v2]]) generates spots and grades them with the live coach; a
sizing drill falls out almost for free once [[0101-coach-sizing-intent-and-bands]] exists — the
recommended band _is_ the answer key. Lower priority than the play-loop surfaces; pull after the coach
core and the two UI surfaces land.

## Acceptance criteria

- [ ] A new drill theme presents a bet/raise spot and asks the player to choose a size (from the peg
      options or a constrained slider), graded against the recommended band from
      [[0101-coach-sizing-intent-and-bands]] — in-band correct, out-of-band explained with the same
      _why_ the coach gives in play.
- [ ] Tagged with its `Concept` like the other themes (`themes.ts`), so it feeds per-concept mastery
      and the by-concept session summary; mapped to the most fitting existing concept (likely
      `pot-odds`, matching how [[0072-lesson-bet-sizing]] was tagged).
- [ ] Reuses the shared spot generator and grading path — no bespoke sizing engine in the drill.
- [ ] Tests cover spot generation and the band-based grading (good / too-big / too-small).
- [ ] `pnpm verify` green.

## Notes

Depends on [[0101-coach-sizing-intent-and-bands]] (and benefits from the peg vocabulary settled there).
Mirrors the existing themes' shape; the only new idea is "the answer is a band, grade distance from
it" — which the coach core already encodes.
