---
id: BUG-0011
title: Pot-odds lesson presents a range-adjusted read (~17%) as raw hand strength
type: bug
status: open
severity: medium
milestone: M4.5
created: 2026-06-16
---

## Summary

The pot-odds lesson's spot asserts the hero's hand "is only worth ~17%" with no indication that
this figure is the coach's _range-adjusted read against a tight value range after a ~3x overbet_,
not the hand's raw equity (QJ on A-K-x has materially more raw equity — a gutshot plus two
overcards). Presented as bare hand strength, the lesson silently teaches "trust the magic number"
and quietly contradicts the outs-counting the equity lesson just taught. It is not wrong _given the
model_, but it is misleadingly framed.

## Steps to reproduce

1. Open the Foundations primer → pot-odds lesson.
2. Read the spot copy: "your hand is only worth ~17%."

## Expected

The copy should signal that the number is an exploitative read against a tight opponent's range
(what the coach assumes), not raw hand strength — preserving the "coach-true by construction"
integrity at the _explanation_ level, not just the grading level. Either show the rough reasoning
or name it as a range-adjusted estimate the coach computes.

## Actual

The figure is stated as if it were the objective equity of the hand, with no mention of the range
assumption or the overbet that produces it.

## Notes

Affected content: `packages/curriculum/src/foundations.ts` (pot-odds lesson spot copy). The code
comment in the spot's construction already documents the `ultraTight` range assumption — the fix is
to surface that honesty in the learner-facing copy. Sibling defect:
[[BUG-0010-continue-rule-lesson-omits-implied-odds]]. Surfaced by the beginner-pedagogy review
(2026-06-16).
