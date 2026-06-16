---
id: 0073
title: 'Lesson: board texture — wet vs. dry, and what the board makes possible'
type: feature
status: done
milestone: M4.6
priority: high
created: 2026-06-16
---

## Context

Board texture is named in the acceptance criteria of both [[0042-foundations-primer]] and
[[0045-foundations-primer-content]] ("ranges / board texture") but was never shipped — a documented
scope-vs-reality gap (beginner-pedagogy review, 2026-06-16). A beginner needs to read a board (dry
vs. wet, what straights/flushes/pairs it enables) to know whether their hand or the opponent's range
is helped — the input to nearly every postflop decision the rest of the primer evaluates.

## Acceptance criteria

- [x] A new `FOUNDATIONS` lesson on board texture: dry vs. wet, what a board makes possible, and how
      that shifts which hands are strong — tagged with its `Concept` ([[0043-coach-concept-tag]]).
      _(`foundations-board-texture`, concept `equity-vs-price` — locked reuse.)_
- [x] ~30-second beginner-pitched explanation grounded in concrete boards (e.g. a dry A-7-2 rainbow
      vs. a wet 9-8-7 two-tone), defining "wet/dry" on first use. _(Exactly those two boards.)_
- [x] A retrieval check graded by the coach where it can rule (the board-aware range work,
      [[0057-coach-board-aware-range]], shifts the read by texture so a continue spot can demonstrate
      it); otherwise a minimal, clearly-flagged declarative check per the
      [[0045-foundations-primer-content]] escape hatch — documented, never contradicting the coach.
      _(Fully coach-graded, no declarative carve-out needed: two `CoachSpot`s, the SAME QQ facing the
      SAME large barrel, flip call→fold between the dry and wet board purely via the board-aware
      polarized range — `trace.assumedRange === 'board-aware'` proven in the test. A code-review pass
      softened the wet-board copy so the ~52% overpair reads as the close call it is, not a comfortable
      one.)_
- [x] Test + purity per the [[0045-foundations-primer-content]] bar.

## Notes

Closes the 0042/0045 board-texture scope gap. Part of [[0070-foundations-primer-v2]]; depends on
[[0044-curriculum-engine]] and benefits from [[0057-coach-board-aware-range]] so the check can be
coach-true rather than declarative. Feeds the M5.5 board-reading drills
([[0078-drills-board-reading-and-actions]]).
