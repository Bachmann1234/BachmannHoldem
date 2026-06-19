---
id: 0097
title: Landscape seat arrangement (wide-arc coordinates)
type: feature
status: done
milestone: M7
priority: medium
created: 2026-06-19
---

## Context

With the felt scaling as one unit ([[0096-felt-scaling-foundation]]), percentage seat coordinates
finally hold at any size — so a landscape arrangement is just a second coordinate table, no per-size
pixel patching. This ticket adds it: a wide-arc `SEAT_LAYOUTS` for landscape (and a landscape
`CENTER` / board placement) so the table _uses_ the wide-short felt instead of squashing the portrait
layout into it. Part of [[0095-responsive-felt-and-landscape]].

## Acceptance criteria

- [x] An orientation-keyed seat-coordinate set for landscape at every seat count (heads-up → 6-max):
      seats spread along a wide arc, the board sits in a central strip, and the same
      "no seat in the board/banner band" invariant holds for the landscape geometry. _(`LANDSCAPE_SEAT_LAYOUTS`
      in layout.ts; band invariant pinned in layout.test.ts.)_
- [x] `CENTER` (pot + board anchor) and the board row placement are correct for the wide felt; the
      wager-chip placement (`wagerStyle`) works in both orientations off the shared, now-uniform
      scaling — no landscape-only pixel constant. _(`LANDSCAPE_CENTER`; `wagerStyle(seat, center)` takes
      the active centre; `WAGER_DROP_PCT=8` clears the pill in both orientations — the landscape `--u`
      stays height-bound so the drop is the same felt-fraction.)_
- [x] Selection between portrait and landscape coordinate sets is driven by the felt's
      orientation/aspect (not a one-off media query sprinkled per component), in one place layout.ts
      owns, so future table features read "the current layout" without re-deriving orientation.
      _(`tableLayout(count, orientation)` is the single owner; `useOrientation` is the one signal source.)_
- [x] Heads-up through 6-max each verified in landscape: no overlap, flank pills grow inward and stay
      on-screen (the edge-anchoring intent), hero seat clear of the action bar. _(6-max — the densest,
      binding case — verified collision-free in Chromium from 932×430 down to 740×360 (felt 227px); 3/4-max
      have no lower wings and heads-up is trivially clear; all counts pinned by unit tests. Required the
      two scope additions below.)_
- [x] Tests cover the landscape coordinate selection and the per-seat-count arrangement (mirroring the
      existing portrait layout tests). _(layout.test.ts + Table.test.tsx, matchMedia mocked.)_
- [x] `pnpm verify` green. _(+ `pnpm --filter @holdem/pwa build` clean.)_

## Notes

Depends on [[0096-felt-scaling-foundation]] — do not start before it lands, or this re-introduces the
exact `%`-over-px fragility 0095 is removing.

Completion surfaces (showdown banner/lift, all-in runout, side-pot tray) are handled in
[[0098-landscape-completion-surfaces]] — keep this ticket to the live-play arrangement so the two stay
reviewable.

A `frontend-design` pass on the wide-arc arrangement (where seats sit relative to the board and the
action bar in landscape) would feed the coordinate numbers here, same as the original table design fed
the portrait `SEAT_LAYOUTS`.

### Scope added during implementation (user-approved)

Browser verification surfaced that the wide-arc coordinates alone could not satisfy "no overlap / hero
clear of the action bar" at real phone-landscape sizes — the decomposition had assumed the felt would
be wide and tall enough, but two pieces of chrome were sized for portrait and squeezed it:

1. **Lift the play-shell width cap in landscape.** `.app-stack` is capped at 460px (a phone-width
   column); in landscape that letterboxed the felt to ~434px wide — short AND narrow — so the wide arc
   never got horizontal room. Landscape now lifts the cap (`min(100%, 1024px)`) so the felt actually
   spans the viewport. This is what makes the wide-arc arrangement meaningful.
2. **Compact the action bar in landscape.** The portrait bar reserves a 140px floor (~36% of a 390px
   landscape viewport), crushing the felt to ~190px → re-collision + hero off-felt. Landscape lays the
   bet-row and action buttons in a single ~74px row and drops the floor, handing ~60px back to the felt.
   The bottom-corner controls (History / Coach FAB) are also compacted so the 5/6-max wings clear them.

The user chose the "compact bottom bar" direction (over a side-control column or deferring to 0099) and
approved folding both into this ticket, since 0097's own acceptance depended on them. All pure CSS under
`@media (orientation: landscape)`; portrait is untouched. The `completeRise` showdown-lift is still
portrait-tuned — re-deriving it for landscape is correctly left to [[0098-landscape-completion-surfaces]].
