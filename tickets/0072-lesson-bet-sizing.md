---
id: 0072
title: 'Lesson: bet sizing as the bettor — how much, and why'
type: feature
status: done
milestone: M4.6
priority: high
created: 2026-06-16
---

## Context

The pot-odds lesson teaches a beginner how to _respond_ to bet sizes (a third-pot is ~20%, half-pot
~25%, full-pot ~33%) but never how to _choose_ one when they are the bettor. A learner finishes the
primer able to face a bet but not to make one intelligently — yet the play loop and the M5.5 drills
constantly ask them to size bets (beginner-pedagogy review, 2026-06-16). This is the bettor-side
counterpart to the pot-odds lesson.

## Acceptance criteria

- [x] A new `FOUNDATIONS` lesson on choosing a bet size: value vs. protection vs. bluff intent, and
      how size relates to the pot-odds price it lays the opponent (the inverse of what the pot-odds
      lesson taught), tagged with its `Concept` ([[0043-coach-concept-tag]]). _(`foundations-bet-sizing`,
      concept `pot-odds` — locked reuse.)_
- [x] ~30-second beginner-pitched explanation that connects "the size I pick is the price I'm
      offering" back to the pot-odds pegs the learner already knows. _(Pegs reused verbatim: third
      ≈ 20%, half ≈ 25%, full ≈ 33%; the spot adds 3/4-pot ≈ 30%, 1/4-pot ≈ 17%.)_
- [x] A retrieval check. **Gradability resolved:** bet sizing is not coach-rulable (the coach grades
      whether to _continue_, never what _size_ to bet), so this uses the **clearly-flagged
      `DeclarativeSpot` carve-out** (the [[0045-foundations-primer-content]] escape hatch) — the
      lightest coach-true option. No sizing grader was bolted onto the coach. The authored explanation
      is self-contained and never invokes/contradicts a coach verdict. Spot: top set on a wet
      9♦8♠7♠ board, choose tiny / big / check → the big value-and-protection bet is correct.
- [x] Test + purity per the [[0045-foundations-primer-content]] bar.

## Notes

Part of [[0070-foundations-primer-v2]]; depends on [[0044-curriculum-engine]]. This is the lesson
most likely to need a deliberate gradability decision — flag it for the epic owner before
authoring. Relates to the M5.5 bet/raise drill actions ([[0078-drills-board-reading-and-actions]]):
ideally the lesson concept and the drill action share framing.
