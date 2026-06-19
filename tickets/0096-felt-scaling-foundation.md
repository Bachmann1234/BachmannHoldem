---
id: 0096
title: Scale the felt as a single unit (kill the %-over-px mismatch)
type: task
status: done
milestone: M7
priority: medium
created: 2026-06-19
---

## Context

The load-bearing first step of [[0095-responsive-felt-and-landscape]]. The felt positions seats in
percentages (`SEAT_LAYOUTS`, `CENTER` in `apps/pwa/src/components/layout.ts`) but draws cards, pills,
and the board at fixed pixel sizes. When the felt's pixel dimensions change (a different phone, or a
shorter landscape window), the `%` coordinates and the px contents scale at different rates and
collide. Make the **whole felt scale as one unit** so a percentage coordinate maps to the same
_relative_ spot — and the same _apparent_ card size — at any felt size. This is the foundation that
lets [[0097-landscape-seat-arrangement]] add a landscape coordinate table without re-introducing the
per-size pixel patching the portrait layout accreted.

## Acceptance criteria

- [x] The felt is rendered against a fixed-aspect "design canvas" (the dimensions the current
      `SEAT_LAYOUTS`/`CENTER` numbers were authored against) and scaled to fit its container as a
      single unit, so cards, pills, board, and seat coordinates grow/shrink together. _(Implemented
      as a shared `--u` design-pixel driven by `100cqh / 701` on `.felt` — the felt scene scales as
      one unit; no transform, so text stays crisp. Reference felt height 701px ⇒ `--u`=1px.)_
- [x] **Portrait output is visually unchanged.** Across the supported portrait phone width range the
      table looks as it does today (this is a sizing refactor, not a redesign). The seat-position
      numbers in `SEAT_LAYOUTS` should survive largely intact. _(Verified in Chromium: at the 460×900
      reference felt is 701px tall ⇒ `--u`=1px ⇒ cards/pills byte-identical to pre-0096; at 320×680
      the scene scales to 0.672× with no seat/center overflow. `SEAT_LAYOUTS` unchanged.)_
- [x] The `%`-over-px workarounds are removed where the scaling layer subsumes them — at minimum
      `WAGER_DROP_PX` (`layout.ts` `wagerStyle`); review `completeRise` and Seat.tsx edge-anchoring and
      simplify or delete what the uniform scale makes unnecessary. Anything kept is justified in a
      comment. _(`WAGER_DROP_PX = 56` deleted ⇒ `WAGER_DROP_PCT = 8` (the px was 8% of the 701px
      reference). `completeRise` kept — it's already felt-%, encodes a per-seat-count arrangement
      fact, not a px hack; comment rewritten. Seat edge-anchoring kept — a label-width concern
      orthogonal to scale; comment added.)_
- [x] Layout tests in `Center.test.tsx` (and any seat-position tests) are re-baselined to the scaled
      model; the existing assertions about lift direction / pot placement still hold (or are updated
      with a rationale). _(`layout.test.ts` wager assertions re-baselined to the pure-% model +
      strengthened with two bound invariants; `Center.test.tsx` lift-direction values unchanged and
      still pass.)_
- [x] No interaction regressions: tap targets (action bar, coach FAB, seats) stay correctly sized and
      hit-testable after scaling; text stays crisp (no blurry transform scaling of fonts). _(Container-
      query units, not `transform: scale()` — children lay out at real px, so hit-rects and font
      rasterization are native. Coach FAB / History left at fixed px as corner-anchored chrome.)_
- [x] `pnpm verify` green. _(format + lint + typecheck + 1142 tests + coverage gate all green.)_

## Notes

**Approach to decide in design pass:** `transform: scale()` of a fixed-px canvas (smallest diff —
coordinates and child px sizes are authored once and the wrapper scales everything; watch font
crispness and hit-target math under transforms) vs container-query units `cqw`/`cqh` (more idiomatic
CSS, no transform, but rewrites more size declarations). Either way the goal is identical: one knob
sizes the felt, and `[x%, y%]` coordinates become orientation-/size-stable.

**Why portrait-first and unchanged:** keeping the proven portrait result pixel-identical is the
regression safety net — if portrait drifts, the refactor went wrong. Land this with portrait only;
landscape arrangement is the _next_ ticket, deliberately, so this PR is "same look, better foundation"
and easy to review.

Sequences before [[0097-landscape-seat-arrangement]], [[0098-landscape-completion-surfaces]],
[[0099-orientation-plumbing-and-manifest]].
