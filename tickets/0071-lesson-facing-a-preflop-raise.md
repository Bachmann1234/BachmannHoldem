---
id: 0071
title: 'Lesson: facing a preflop raise — call / fold / 3-bet'
type: feature
status: todo
milestone: M4.6
priority: high
created: 2026-06-16
---

## Context

The M4.5 primer's position and ranges lessons only ever grade **open-or-fold in an unraised pot**.
But a beginner's most frequent real decision is the opposite: _someone has already raised — do I
call, fold, or re-raise?_ The primer never addresses defending against a raise, 3-betting, or big-
blind defense. This is the single most common decision in real play and it is absent
(beginner-pedagogy review, 2026-06-16).

## Acceptance criteria

- [ ] A new `FOUNDATIONS` lesson teaching the call / fold / 3-bet decision when facing a single
      raiser preflop, tagged with its `Concept` ([[0043-coach-concept-tag]]).
- [ ] ~30-second beginner-pitched explanation (no jargon dump): why a raise narrows what you should
      continue with, why position and the raiser's likely range matter, and when to fold vs. flat
      vs. 3-bet.
- [ ] At least one retrieval-check spot built on a real `DecisionContext` and graded by the
      **raise-aware** coach ([[0053-coach-preflop-raise-aware]], [[0052-coach-narrow-range-on-action]])
      through the engine — not an answer key.
- [ ] Test: the spot grades to the verdict the coach actually returns (so a coach retune can't
      silently desync the lesson); copy/choices well-formed; purity preserved.

## Notes

Depends on the raise-aware preflop coach work ([[0053-coach-preflop-raise-aware]],
[[0052-coach-narrow-range-on-action]]) and the curriculum engine ([[0044-curriculum-engine]]).
Part of [[0070-foundations-primer-v2]]. If the coach grades call/fold-vs-raise cleanly but not the
_size_ of a 3-bet, keep the check to the call/fold/3-bet _choice_ and defer sizing to
[[0072-lesson-bet-sizing]]. Pairs naturally with the reordered "ranges + position first" sequence
([[0075-primer-reorder-and-jargon-gloss]]).
