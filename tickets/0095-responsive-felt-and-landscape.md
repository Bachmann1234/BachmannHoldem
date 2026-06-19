---
id: 0095
title: Responsive felt & landscape play
type: epic
status: in-progress
milestone: M7
priority: medium
created: 2026-06-19
---

## Context

The table felt only lays out correctly in a tall, narrow portrait window. Rotate to landscape (or
shrink the height) and it falls apart: the community cards overlap the flank seats, the pot label
overlaps the top seats' cards, and the hero's seat pill is clipped behind the action bar. Today this
is masked, not solved — the PWA manifest sets `orientation: 'portrait'`, so an _installed_ app locks
upright and only a browser tab rotated to landscape shows the breakage. This epic makes the felt
genuinely orientation- and size-agnostic, then adds a real landscape arrangement on top.

**Root cause — pixels over percentages.** Seat positions are percentages of the felt
(`SEAT_LAYOUTS` is `[x%, y%]`, `CENTER` is `[50, 45]` — `apps/pwa/src/components/layout.ts`), but the
things drawn _on_ the felt (cards, info pills, the board row) are fixed pixels. In portrait the felt
is tall enough that the `%` y-coordinates spread seats far enough apart that the px-sized cards don't
collide. Shrink the felt's height (landscape) and the same `%` coordinates pull seats vertically
together while their pixel cards stay the same size → overlap. The code already fights a small version
of this and lost: `wagerStyle` had to abandon `%` for a hardcoded `WAGER_DROP_PX = 56` because "the
needed percentage grows as the felt shrinks, so no single % clears it on every screen." The
showdown-block `completeRise` lift-direction special-casing and the Seat.tsx edge-anchoring are
further symptoms of the same impedance mismatch.

**The decision: fix sizing first (#3), then arrangement (#2) falls out cheap.** Two concerns are
tangled here and must be separated:

- _Sizing_ — cards/pills are fixed px while the felt is `%`. This is the actual defect, and it
  already generates portrait workarounds (`WAGER_DROP_PX`, `completeRise`, edge-anchoring).
- _Arrangement_ — a tall arc (portrait) vs a wide arc (landscape). This genuinely differs by
  orientation; you can't avoid a second coordinate set if you want to _use_ the landscape space
  rather than letterbox a small portrait table into it.

The trap is shipping a landscape `SEAT_LAYOUTS` _alone_ (option "#2"): it re-commits to `%`-over-px,
so it works at exactly one landscape size and then needs its own `WAGER_DROP_PX`-style pixel patches —
two fragile coordinate systems to maintain forever, each table feature re-tuned and re-tested in both.
Instead, make the felt **scale as a single unit** first (option "#3": a fixed-aspect design canvas
scaled by one transform / container-query units, so cards, pills, board, and seats grow and shrink
together). Once that exists, percentage seat coordinates _hold at any size_, so adding a landscape
arrangement becomes a clean second coordinate table with **no per-size pixel patching** — and the
existing portrait px-hacks can be deleted rather than duplicated.

This is a discretionary UI investment, not part of the learning arc (M0–M6). It's sequenced after the
committed milestones and reclaims the now-free M7 number (the old "LLM coaching = M7" is deprecated to
a deferred idea in [`../docs/ROADMAP.md`](../docs/ROADMAP.md)).

## Acceptance criteria

- [ ] The table renders correctly across the full phone size range in **both** orientations: no
      board/seat overlap, no clipped pills, no pot-label collision, at heads-up through 6-max.
- [ ] Portrait output is **visually unchanged** by the foundation work (the seat-position numbers
      largely survive; only how the felt is sized changes) — verified by re-baselined layout tests.
- [ ] The `%`-over-px workarounds (`WAGER_DROP_PX`, `completeRise` special-casing, ad-hoc
      edge-anchoring) are removed or demonstrably subsumed by the scaling layer, not duplicated into a
      landscape path.
- [ ] All completion surfaces — showdown banner/lift, the all-in runout reveal
      ([[0093-pwa-watchable-allin-runout]]), and the multi-pot tray + attribution
      ([[0090-pwa-multi-pot-display]] / [[0091-pwa-side-pot-showdown-attribution]] /
      [[0094-pwa-banner-pot-line-cap]]) — are correct in landscape.
- [ ] Rotating the device mid-session re-lays-out cleanly with no lost state; the manifest no longer
      hard-locks `orientation: 'portrait'`.
- [ ] `pnpm verify` green.

## Notes

Decomposes into, in dependency order:

- [[0096-felt-scaling-foundation]] — uniform-scaled design canvas; portrait visually unchanged; delete
  the px hacks; re-baseline layout tests. **The load-bearing one — everything below rests on it.**
- [[0097-landscape-seat-arrangement]] — orientation-keyed `SEAT_LAYOUTS` (wide arc) + `CENTER` + board
  placement. Safe to add only once 0096 lands.
- [[0098-landscape-completion-surfaces]] — showdown lift (`completeRise`), all-in runout, multi-pot
  tray/attribution verified and tuned for landscape.
- [[0099-orientation-plumbing-and-manifest]] — rotate/resize handling, state preserved across
  orientation, drop the `orientation: portrait` manifest lock, a11y.

**Run a `milestone-review` checkpoint** mid-milestone (per the ROADMAP process note for UI-heavy
milestones) and again at completion — layout work is exactly where drift hides.

**Open question for 0096:** uniform `transform: scale()` of a fixed design canvas vs container-query
units (`cqw`/`cqh`). Scale is the smallest diff (one wrapper, coordinates untouched) but needs care
that hit-targets and font rendering stay crisp; container units are more "native CSS" but touch more
declarations. Decide in 0096's design pass.
