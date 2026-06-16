---
id: 0070
title: 'Epic: Foundations primer v2 — the load-bearing lessons'
type: epic
status: todo
milestone: M4.6
priority: high
created: 2026-06-16
---

## Context

The M4.5 primer ([[0042-foundations-primer]]) shipped six crisp, coach-true lessons — but a
beginner-pedagogy review (2026-06-16) found it teaches a player how to **evaluate a continue
decision** before teaching most of what _generates_ those decisions. A learner who completes all
six lessons understands equity and pot odds but still cannot actually play a hand or make a bet:
the primer has no lesson on facing a preflop raise (the most common real decision), no bet-sizing
lesson, no board-texture lesson, and no draws/implied-odds lesson — the last of which makes the
flagship continue rule subtly wrong (see [[BUG-0010-continue-rule-lesson-omits-implied-odds]]).

Board texture is additionally a **documented scope gap**: epic 0042 and ticket
[[0045-foundations-primer-content]] both list "ranges / board texture" in their acceptance
criteria, but board texture was never shipped. This epic reconciles that and closes the four
load-bearing gaps.

Slotted as **M4.6** (the M3.5/M4.5 precedent — insert a half-step without renumbering the arc). It
extends M4.5's mission ("build the framework the coach assumes") rather than starting a new track,
and like M4.5 it precedes the deeper drills (M5.5, [[0076-drills-v2]]): drilling a concept you were
never taught is just faster confusion.

## Acceptance criteria

- [ ] **Reorder so preflop foundations precede postflop evaluation.** The graded lesson order puts
      ranges + position (the first decisions in every hand) _before_ equity → pot odds → continue
      rule → EV. Today the order is inverted ([[0075-primer-reorder-and-jargon-gloss]]).
- [ ] **Lesson: facing a preflop raise** — call / fold / 3-bet against an opener, graded by the
      raise-aware coach ([[0071-lesson-facing-a-preflop-raise]]).
- [ ] **Lesson: bet sizing as the bettor** — how much to bet and why (value vs. protection vs.
      bluff sizing), the counterpart to the pot-odds lesson's "responding to a size"
      ([[0072-lesson-bet-sizing]]).
- [ ] **Lesson: board texture** — wet vs. dry, what the board makes possible; closes the 0042/0045
      scope gap ([[0073-lesson-board-texture]]).
- [ ] **Lesson: draws & implied odds** — the caveat that makes the continue rule correct; the
      durable fix for [[BUG-0010-continue-rule-lesson-omits-implied-odds]]
      ([[0074-lesson-draws-implied-odds]]).
- [ ] **Jargon glossed on first use** in graded prompts — "overcards", "top set", "set / trips",
      "overbet" currently appear before any definition; add brief parenthetical glosses and a
      strong "read the rules reference first" signpost ([[0075-primer-reorder-and-jargon-gloss]]).
- [ ] Every new lesson is **coach-true by construction** and graded by the deterministic coach
      math, not hand-authored answer keys wherever the coach can rule — same bar as
      [[0045-foundations-primer-content]]. Content stays pure data in `@holdem/curriculum`.

## Notes

Reuses the [[0044-curriculum-engine]] spot → ask → grade → explain engine and the
[[0047-pwa-lesson-player]] UI — no new engine, no new player. Depends on the coach's raise-aware
preflop work ([[0053-coach-preflop-raise-aware]], [[0052-coach-narrow-range-on-action]]) and
board-aware range ([[0057-coach-board-aware-range]]) for grading the new spots.

**Open question — gradability.** The coach grades _continue_ decisions and preflop open/call/fold;
two of these lessons stress that seam. _Facing a preflop raise_ is gradable today (raise-aware
range narrowing exists). _Bet sizing as the bettor_ is a decision the coach does **not** currently
rule on — [[0072-lesson-bet-sizing]] must either lean on a minimal, clearly-flagged declarative
check (the [[0045-foundations-primer-content]] escape hatch) or motivate a small coach/curriculum
addition. Decide per-lesson; do not silently author an answer key the live coach could contradict.

**Scope discipline (inherited from 0042):** still a primer, not a course. Four load-bearing
lessons, each short, each earning its ~30 seconds. Depth lives in the feedback loop (coach, drills,
and M6 leak detection), not in more reading.

Roadmap narrative (`docs/ROADMAP.md`) does not yet mention M4.6/M5.5 — update the arc there when
this epic is pulled, keeping the doc's "no ticket lists" rule.
