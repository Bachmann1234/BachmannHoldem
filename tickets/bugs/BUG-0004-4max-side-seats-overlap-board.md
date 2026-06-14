---
id: BUG-0004
title: 4-max side seats overlap the community cards
type: bug
status: fixed
severity: medium
milestone: M4
created: 2026-06-14
---

## Summary

At a 4-max PWA table the two side seats (left/right) were positioned on the board's vertical band,
so their info pills — and, at showdown, their revealed hole cards — overlapped the community cards
in the centre of the felt. Found playing on an Android phone (narrow viewport).

## Steps to reproduce

1. Open the PWA on a phone-width viewport (~412px).
2. Set up a 4-max table and deal in.
3. Observe the left/right seats: their pills already overlap the centre; at the flop and at showdown
   the board cards sit behind the side seats' cards/pills.

## Expected

The community cards (and pot) own the centre of the felt; no seat overlaps them at any seat count.

## Actual

`SEAT_LAYOUTS[4]` placed both side seats at `y=44%`, dead level with the board/`CENTER` (`y=45%`).
On a narrow felt the fixed-width 5-card board spans most of the width at that latitude, so the side
seats' wide info pills and revealed cards collided with it. 4-max was the only seat count with seats
on the board band — 3-max (`y=27`), 5-max (`19`/`54`) and 6-max (`24`/`57`) all clear it.

## Notes

Fix: moved the 4-max side seats up into the upper arc (`[16,31]` / `[84,31]`), clear of the board
band, consistent with the other layouts; the hero stays bottom and one opponent stays top-centre.
Documented the "no seat in the board's ~40–50% band" invariant on `SEAT_LAYOUTS`. Layout-only, no
game logic — `apps/pwa/src/components/layout.ts`. Verified at a 412px viewport (preflop + flop) that
the board renders clear of all seats. 5-max's lower wings (`y=54`) clear the board with less margin;
left as-is since it didn't visibly collide, worth a glance if it's ever reported.
