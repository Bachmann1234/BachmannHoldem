---
id: BUG-0010
title: Continue-rule lesson teaches "fold when equity < price" without the implied-odds caveat
type: bug
status: fixed
severity: high
milestone: M4.5
created: 2026-06-16
---

## Summary

The continue-rule lesson states the rule as absolute — "continue when your equity beats the
price, fold when it does not; everything else postflop is detail on top of this single
comparison" — while the equity lesson's headline example is a **flush draw**. For draws the
_current_-equity-vs-price comparison is the wrong test: because you win future bets when you hit
(implied odds), draws are routinely a profitable continue at immediate odds _worse_ than the rule
implies. A beginner who internalizes the rule as written will **incorrectly fold profitable
draws** — and draws are exactly the curriculum's marquee equity example. This is a correctness
defect in shipped teaching content, not a coverage gap.

## Steps to reproduce

1. Open the Foundations primer → equity lesson (the example is a flush draw).
2. Continue to the equity-vs-price / continue-rule lesson.
3. Read the rule statement and the "everything else postflop is detail" framing.

## Expected

The continue rule should flag its single most important exception: draws can be called "a little
light" relative to immediate equity because of implied odds, with a forward pointer to the draws
lesson ([[0074-lesson-draws-implied-odds]]). The rule is correct for made hands at showdown value;
it should not be presented as universal when the curriculum's own example is a draw.

## Actual

The rule is stated as absolute ("fold when it does not … everything else postflop is detail on top
of this single comparison"), with no implied-odds caveat anywhere in the primer.

## Notes

Affected content: `packages/curriculum/src/foundations.ts` (continue-rule lesson copy). Minimum
fix: add one caveat sentence + forward pointer; the durable fix is the dedicated draws lesson in
[[0070-epic-foundations-primer-v2]]. Surfaced by the beginner-pedagogy review (2026-06-16). Sibling
honesty defect: [[BUG-0011-pot-odds-lesson-range-read-as-raw-equity]]. Whatever caveat copy lands
must stay coach-true — keep the assertion consistent with what `coachDecision` actually returns for
the spots in the lesson.
