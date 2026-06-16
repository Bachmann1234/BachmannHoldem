---
id: 0078
title: Board-reading drills + turn/river spots + bet/raise actions
type: feature
status: done
milestone: M5.5
priority: medium
created: 2026-06-16
---

## Context

The M5 drill surface is the thinnest part of the practice loop relative to real play
(learning-app review, 2026-06-16): `generateCoachSpot` only ever deals a **flop**
(`dealBoard('flop')`), every postflop spot is a hard-wired **Call/Fold** binary (`COACH_CHOICES`),
and the most basic beginner skill — recognizing what hand you have / what beats what — has no drill
at all (even though `describeHandClass` / `handClassLabel` already exist to seed it).

## Acceptance criteria

- [x] **Hand-ranking recognition theme** — "what do you have / what's the best hand here?" — seeded
      from the existing hand-class helpers, graded deterministically.
- [x] **Turn and river spots** — extend `generateCoachSpot` beyond flop-only (the dealer already
      supports later streets via `BOARD_SIZE` / `dealBoard`), so board reading and continue
      decisions appear on every street.
- [x] **Richer actions** — break the hard-wired `COACH_CHOICES` binary so some spots offer
      bet/raise/size choices where the coach can grade them; align the bet/size framing with the
      M4.6 bet-sizing lesson ([[0072-lesson-bet-sizing]]).
- [x] New themes registered in `@holdem/drills` themes ([[0066-drills-themed-sets]]) and selectable
      in the drills nav ([[0068-pwa-drills-nav-summary]]); deterministic + seeded; tests + purity
      per package convention.

## Notes

Part of [[0076-drills-v2]]. Where the coach cannot grade a chosen action (e.g. bet sizing — see the
gradability open question in [[0072-lesson-bet-sizing]]), either defer that action variant or use a
clearly-flagged declarative check; never an answer key the live coach could contradict. Board
reading shares its concept with the M4.6 board-texture lesson ([[0073-lesson-board-texture]]).
