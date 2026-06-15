---
id: BUG-0008
title: PWA table is crowded on a phone — seats overflow the felt edges and the win banner overlaps
type: bug
status: fixed
severity: medium
milestone: M4
created: 2026-06-15
---

## Summary

On a phone-width felt the multiway PWA table is crowded: side/wing seats' info pills spill off the
left/right screen edges, the "X wins" result banner overlaps the lower wing seats, and the dealer
button tag renders as an oversized blob. Found playing 5-max on an Android phone (continuation of the
margin BUG-0004 ([[BUG-0004-4max-side-seats-overlap-board]]) flagged: _"5-max's lower wings clear the
board with less margin … worth a glance if it's ever reported"_ — it was reported).

## Steps to reproduce

1. Open the PWA on a phone-width viewport (~412px).
2. Deal a 5-max or 6-max table and play to a showdown.
3. Observe: the left/right seat pills are clipped by the screen edges; the "Seat X wins" banner sits
   on top of the bottom-flank seats; the dealer "BTN" tag is a large rounded blob, not a small tag.

## Expected

Every seat, the pot/board, and the result banner stay within the felt at any seat count; the dealer
tag is a small inline chip; the completed-hand view is vertically balanced.

## Actual

- Side seats were centred (`translate(-50%,-50%)`) on extreme x-coords (13%/87%), so their wide info
  pills overflowed the felt edges on a narrow screen.
- The 5/6-max lower wings sat at the same latitude (~54–57%) as the result banner, which grows
  downward from the board — so the banner overlapped them.
- The dealer position tag carried class `btn`, which collided with the global `.btn` action-button
  style (`display:flex; flex-direction:column; font-size:14px; padding:14px`), inflating the tiny
  tag into a button-shaped blob — and that, in turn, wrapped the seat label and grew the seat box.

## Notes

Layout-only (`apps/pwa` — `Seat.tsx`, `layout.ts`, `Center.tsx`, `styles.css`); pure packages
untouched. Fixes, verified at 412px across 2–6-max (incl. a worst-case all-`Station` stress):

- **Edge-anchor flank seats** (`.pseat-left`/`.pseat-right`) so a pill grows _inward_ from the felt
  edge and can never spill off-screen; cards stay centred over the pill.
- **Lower the 5/6-max wings** below the result-banner band; documented the band invariant on
  `SEAT_LAYOUTS`.
- **Rename the dealer tag** class `btn` → `postag-btn` to break the `.btn` collision; force the seat
  label onto one line.
- **Balance the win view**: lift the pot/board/banner block when the hand completes (count-aware —
  4% for ≤5-max, 2% for 6-max) so it's centred between the top seats and the bottom wings.

Shipped in `35b1c1d`. The opponent-naming / setup / coach-read UX that rode along is tracked
separately in [[0061-pwa-anonymized-opponents-and-table-read]].
