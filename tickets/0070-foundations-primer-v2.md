---
id: 0070
title: 'Epic: Foundations primer v2 — the load-bearing lessons'
type: epic
status: in-progress
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
this epic is pulled, keeping the doc's "no ticket lists" rule. _(Done: the ROADMAP already carries
the M4.6 narrative as of this milestone.)_

## Decomposition (pulled 2026-06-16)

Already broken into the five per-feature tickets the acceptance criteria name. Execution order
(dependency + pedagogy): [[0071-lesson-facing-a-preflop-raise]] → [[0074-lesson-draws-implied-odds]]
→ [[0073-lesson-board-texture]] → [[0072-lesson-bet-sizing]] → [[0075-primer-reorder-and-jargon-gloss]]
(the reorder/jargon pass runs last, once every new lesson exists, so the final sequence is set in one
go).

**What matters most:** every new lesson stays _coach-true by construction_ — graded by the live coach
math wherever the coach can rule, never by a hand-authored answer key the table could contradict. The
declarative carve-out from [[0045-foundations-primer-content]] is the flagged last resort, used only
where the coach genuinely cannot rule (and documented as such in the lesson).

### Locked decisions (integrator calls on the epic's open questions)

- **Concept tags — reuse the existing six, do not extend the `Concept` union.** `Concept` is the
  vocabulary the coach _emits on every verdict_; the coach only ever stamps the original six, so a
  new tag would be one no live verdict ever carries (and the coach-graded spots would still report
  the coach's own tag, not the new one). Each v2 lesson's `Lesson.concept` therefore reuses the
  closest existing tag — facing-a-raise → `ranges`, draws → `equity-vs-price`, board-texture →
  `equity-vs-price`, bet-sizing → `pot-odds` — which also makes each coach-graded spot's verdict tag
  agree with the lesson's declared concept for free. The brittle `foundations.test.ts` shape tests
  ("exactly six … in this order", "each Concept exactly once") relax to invariants (well-formed,
  unique ids, valid declared concept, declarative only where justified); [[0075-primer-reorder-and-jargon-gloss]]
  pins the final canonical order.
- **Per-lesson gradability:**
  - **0071 facing a raise** — coach-gradable. `gradePreflop` is already raise-aware
    ([[0053-coach-preflop-raise-aware]]); the only gap is that `PreflopSpot`/`synthesizeContext` only
    ever build an _unraised_ pot. Extend the spot shape + synthesis to carry the faced raise (so the
    synthesised `DecisionContext` has `currentBet > bigBlind`) and reuse the existing grading — do not
    reimplement the defend logic. The 3-bet button grades identically to Call (both "continue"), so
    keep the graded teaching point to continue-vs-fold.
  - **0072 bet sizing** — **not** coach-rulable (the coach grades whether to _continue_, never what
    size to _bet_). Use the flagged `DeclarativeSpot` carve-out; do not add a sizing grader to the
    coach for a primer.
  - **0073 board texture** — prefer a coach-graded continue spot where the board-aware range
    ([[0057-coach-board-aware-range]]) shifts the read by texture; declarative only where the coach
    cannot rule.
  - **0074 draws & implied odds** — coach-graded where the draw continue lands within the coach's
    immediate-equity read; declarative for the _implied-odds-light_ call (future-street winnings the
    coach does not model), which is the actual teaching point.
