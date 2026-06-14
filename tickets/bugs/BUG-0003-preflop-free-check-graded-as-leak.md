---
id: BUG-0003
title: Coach grades a free big-blind check as a leak
type: bug
status: fixed
severity: medium
milestone: M4
created: 2026-06-14
---

## Summary

Preflop, checking the big-blind option (no raise to call) with a weak hand was graded **"Leak — the
math pointed the other way"**, because `gradePreflop` applied the open/fold starting-hand chart to a
free check. A free check strictly dominates folding (you see a free flop), so it can never be a leak.

## Steps to reproduce

1. Sit in the big blind; the pot is folded/limped around (no raise), so you can check for free.
2. Check with a hand the chart calls trash (e.g. K♥8♥, or any junk).
3. Open the coach drawer.

## Expected

Checking for a free flop is correct → the verdict is **Good**, with a rationale about taking the free
flop. (Folding away a free look would be the mistake.)

## Actual

The drawer showed "Leak — the math pointed the other way · The chart pointed to folding it here",
with "Starting hand: Trash — fold" — telling the player that folding a free check was better.

## Notes

- **Cause:** `@holdem/coach` `gradePreflop` (added by [[BUG-0001-preflop-pot-odds-folds-strong-hands]])
  computed `verdict` purely from the chart's open/fold advice vs. `action.type !== 'fold'`, so a
  `check` counted as "continued" against "fold" advice → leak. The chart governs _entering the pot
  for chips_; it does not apply when continuing is free.
- **Fix:** `gradePreflop` now short-circuits `action.type === 'check'` to `verdict: 'good'` with a
  free-flop rationale, regardless of tier (checking is only legal when `toCall === 0`). Raising the
  limpers still grades through the chart. Covered by a new `preflop.test.ts` case.
