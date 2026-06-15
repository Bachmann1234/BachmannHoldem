---
id: BUG-0007
title: Coach grades a standard big-blind defend vs a small raise as a leak
type: bug
status: fixed
severity: medium
milestone: coach-fidelity
created: 2026-06-15
---

## Summary

The raise-aware preflop grading from [[0053-coach-preflop-raise-aware]] treated the **big blind
exactly like an out-of-position cold-caller**, so it over-folded the single most common preflop
spot: defending the BB against a small raise. Calling a 2.5–3× raise from the BB with a perfectly
standard defend (e.g. A♥T♣, or any marginal/playable hand) was graded a `Leak`.

## Steps to reproduce

```
# Hero (seat 0) is the big blind (button=4 → BB = button+2 = seat 0); UTG raises to 5 (2.5–3x).
pnpm sim -- --seats=6 --button=4 --villain=1:r5 --hero=c --seed=2
#   You [ ... a playable/marginal hand ... ]  BB
#   Starting hand: Facing a 3x raise out of position — fold this speculative cold-call.
#   Leak — the math pointed the other way.
```

Spotted in the PWA: A♥T♣ in the BB facing a raise to 5 (the hand had already posted the BB and
was getting ~3-to-call into a 13 pot, closing the action) was flagged as a leak.

## Expected

The big blind defends **wide** against a small raise — it has already posted the blind, is getting
a discounted price, and closes the action. A call of a 2.5–3× raise with ATo (or marginal hands
like KJo / suited gappers) is a standard defend and should grade `good`.

## Actual

`facingRaiseAdvice` only knew "in position" vs "out of position". The BB classified as out of
position, the small-raise rule keeps the `playable`/`marginal` tiers _only in position_, so the BB
folded them → calling graded a `Leak`. Pot odds / the BB's price-and-closing discount were never
consulted.

## Notes

**Fixed** in `packages/coach/src/preflop.ts`: `facingRaiseAdvice` now takes the hero's
{@link Position} (not just a boolean) and adds a **big-blind defend** branch — vs a raise below
`LARGE_RAISE_MIN_BB` the BB continues everything down to `marginal` (folds only the unconnected
`trash` tail), regardless of position. A cold-call from any other seat keeps the tighter
position-gated rule, so the [[0053-coach-preflop-raise-aware]] target (a loose OOP _cold-call_ of a
small raise is a leak) is preserved, as is the 0053 behaviour that a BB call of a **6×** raise with
a speculative hand is still a leak (vs a large raise the BB gets no special widening). Tests added
for the BB defend vs small/large raises and the cold-call-vs-BB distinction.

Deliberately **not** done (deferred): in-position set-mining of small pairs vs a large raise — the
coarse `playable` tier lumps pairs with suited junk, so it can't be loosened cleanly without
isolating pairs; left as a later refinement (related: [[0059-coach-tuning-wide-sweep]]). The small
blind is also not specially widened (it is out of position and does not close the action).
