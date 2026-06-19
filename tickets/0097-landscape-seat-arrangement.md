---
id: 0097
title: Landscape seat arrangement (wide-arc coordinates)
type: feature
status: todo
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

- [ ] An orientation-keyed seat-coordinate set for landscape at every seat count (heads-up → 6-max):
      seats spread along a wide arc, the board sits in a central strip, and the same
      "no seat in the board/banner band" invariant holds for the landscape geometry.
- [ ] `CENTER` (pot + board anchor) and the board row placement are correct for the wide felt; the
      wager-chip placement (`wagerStyle`) works in both orientations off the shared, now-uniform
      scaling — no landscape-only pixel constant.
- [ ] Selection between portrait and landscape coordinate sets is driven by the felt's
      orientation/aspect (not a one-off media query sprinkled per component), in one place layout.ts
      owns, so future table features read "the current layout" without re-deriving orientation.
- [ ] Heads-up through 6-max each verified in landscape: no overlap, flank pills grow inward and stay
      on-screen (the edge-anchoring intent), hero seat clear of the action bar.
- [ ] Tests cover the landscape coordinate selection and the per-seat-count arrangement (mirroring the
      existing portrait layout tests).
- [ ] `pnpm verify` green.

## Notes

Depends on [[0096-felt-scaling-foundation]] — do not start before it lands, or this re-introduces the
exact `%`-over-px fragility 0095 is removing.

Completion surfaces (showdown banner/lift, all-in runout, side-pot tray) are handled in
[[0098-landscape-completion-surfaces]] — keep this ticket to the live-play arrangement so the two stay
reviewable.

A `frontend-design` pass on the wide-arc arrangement (where seats sit relative to the board and the
action bar in landscape) would feed the coordinate numbers here, same as the original table design fed
the portrait `SEAT_LAYOUTS`.
