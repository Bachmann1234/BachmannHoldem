---
id: 0098
title: Verify completion surfaces (banner, runout, side pots) in landscape
type: task
status: todo
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

- [ ] The completed-hand block (board + result banner) is positioned so it never overlaps seats or the
      action bar in landscape, at every seat count — the landscape analog of the `completeRise`
      lift/drop decision, derived from the landscape arrangement rather than hardcoded for portrait.
- [ ] The all-in runout plays correctly in landscape: progressive street reveal, opponents' cards
      visible, banner + winner rings withheld until the river, no overlap during any beat.
- [ ] The multi-pot tray and the side-pot attribution grid (including the `+N more` tail) render
      within the felt in landscape without growing into seats — re-tune the cap/placement for the wide
      geometry if the portrait values don't fit.
- [ ] Folded-hand muck reveal and winning-hand highlight read correctly in the landscape seat
      positions.
- [ ] Tests cover the landscape lift direction and the side-pot tray placement (extending the
      `Center.test.tsx` showdown/lift and multi-pot suites to the landscape geometry).
- [ ] `pnpm verify` green.

## Notes

Depends on [[0097-landscape-seat-arrangement]] (needs the landscape coordinates to position against).

`completeRise` is a prime candidate to _simplify_ if [[0096-felt-scaling-foundation]] made the block
sizing uniform — check whether the lift can be expressed once over "the current layout" instead of as
a per-orientation special case.
