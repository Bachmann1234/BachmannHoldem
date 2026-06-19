---
id: 0098
title: Verify completion surfaces (banner, runout, side pots) in landscape
type: task
status: done
milestone: M7
priority: medium
created: 2026-06-19
---

## Context

The live-play arrangement ([[0097-landscape-seat-arrangement]]) is only half the felt; the moments a
hand _ends_ have their own layout logic that assumes a tall felt and must be re-checked for the wide
one. Part of [[0095-responsive-felt-and-landscape]]. The surfaces:

- the **showdown block lift** (`completeRise` in `Center.tsx`) — chooses to drop the board/banner
  block at ≤4-max and lift it at 5/6-max so the downward-growing result banner clears the seats. That
  direction logic is portrait-reasoned and needs a landscape answer.
- the **all-in runout reveal** ([[0093-pwa-watchable-allin-runout]]) — street-by-street board reveal
  with the banner withheld until the river.
- the **multi-pot tray + attribution** ([[0090-pwa-multi-pot-display]],
  [[0091-pwa-side-pot-showdown-attribution]], [[0094-pwa-banner-pot-line-cap]]) — the per-pot pods and
  the `+N more` collapse, which grow the block vertically.

## Acceptance criteria

- [x] The completed-hand block (board + result banner) is positioned so it never overlaps seats or the
      action bar in landscape, at every seat count — the landscape analog of the `completeRise`
      lift/drop decision, derived from the landscape arrangement rather than hardcoded for portrait.
      _(`completeRise(seatCount, orientation, potCount)`: ≤4-max DROP −6/−8 (banner into open lower
      felt); 5/6-max GENTLE LIFT — 6-max +1 (its top-centre seat caps the lift), 5-max +4. Verified
      collision-free in Chromium at 6-max (top=45, pot/board/banner clear of all seats incl. the
      top-centre seat) and heads-up (top=52 drop, clear of both seats).)_
- [x] The all-in runout plays correctly in landscape: progressive street reveal, opponents' cards
      visible, banner + winner rings withheld until the river, no overlap during any beat. _(Runout
      reuses `Center` with `revealBoardCount`/`showResult`, so the corrected landscape lift governs its
      position — the board sits in the cleared spot and reveals into it; no separate change needed.)_
- [x] The multi-pot tray and the side-pot attribution grid (including the `+N more` tail) render
      within the felt in landscape without growing into seats — re-tune the cap/placement for the wide
      geometry if the portrait values don't fit. _(Landscape line cap `maxPotLines`→2 (vs 4), AND the
      wide grid is narrowed to `max-width: 60%` in landscape so it stays in the central band clear of
      the far-edge wings by construction. The horizontal tray is height-flat, unaffected.)_
- [x] Folded-hand muck reveal and winning-hand highlight read correctly in the landscape seat
      positions. _(These live in Seat.tsx via reveal/winning/muck props, positioned by the landscape
      coordinates `tableLayout` already returns — orientation-independent beyond the coordinate.)_
- [x] Tests cover the landscape lift direction and the side-pot tray placement (extending the
      `Center.test.tsx` showdown/lift and multi-pot suites to the landscape geometry). _(Landscape
      lift-direction suite + the 6-max-lifts-less-than-5-max invariant + landscape line-cap tests;
      portrait byte-identical guard.)_
- [x] `pnpm verify` green. _(+ `pnpm --filter @holdem/pwa build` clean.)_

## Notes

Depends on [[0097-landscape-seat-arrangement]] (needs the landscape coordinates to position against).

`completeRise` is a prime candidate to _simplify_ if [[0096-felt-scaling-foundation]] made the block
sizing uniform — check whether the lift can be expressed once over "the current layout" instead of as
a per-orientation special case.

### Verification notes

The first implementation pass derived the landscape lifts by reasoning alone and got 5/6-max wrong:
it lifted both by +9, on the premise that the lower wings constrain the banner and that 5/6 are
symmetric. Browser verification disproved both — the narrow single-pot banner clears the far-edge
wings _horizontally_ at any y, and 6-max has a top-centre seat the +9 lift drove the pot label into.
Corrected to a gentle, seat-count-aware lift (6-max < 5-max). **Lesson: completion-surface geometry
must be checked against a real rendered showdown, not reasoned in the abstract.**

Verified live in Chromium: **6-max** (the hard case — top-centre seat _and_ wings) and **heads-up**
(≤4-max drop) showdowns, both collision-free. **5-max** (no top-centre seat, gentler +4 lift) and the
**multi-pot attribution grid** (a side-pot showdown is impractical to force in a live drive) are
covered by the unit tests + geometry + the by-construction 60%-width / 2-line grid bounds rather than a
live render — a residual gap worth a glance if a multi-way side-pot showdown ever looks off in landscape.
