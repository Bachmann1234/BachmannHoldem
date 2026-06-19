---
id: 0096
title: Scale the felt as a single unit (kill the %-over-px mismatch)
type: task
status: todo
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

- [ ] The felt is rendered against a fixed-aspect "design canvas" (the dimensions the current
      `SEAT_LAYOUTS`/`CENTER` numbers were authored against) and scaled to fit its container as a
      single unit, so cards, pills, board, and seat coordinates grow/shrink together.
- [ ] **Portrait output is visually unchanged.** Across the supported portrait phone width range the
      table looks as it does today (this is a sizing refactor, not a redesign). The seat-position
      numbers in `SEAT_LAYOUTS` should survive largely intact.
- [ ] The `%`-over-px workarounds are removed where the scaling layer subsumes them — at minimum
      `WAGER_DROP_PX` (`layout.ts` `wagerStyle`); review `completeRise` and Seat.tsx edge-anchoring and
      simplify or delete what the uniform scale makes unnecessary. Anything kept is justified in a
      comment.
- [ ] Layout tests in `Center.test.tsx` (and any seat-position tests) are re-baselined to the scaled
      model; the existing assertions about lift direction / pot placement still hold (or are updated
      with a rationale).
- [ ] No interaction regressions: tap targets (action bar, coach FAB, seats) stay correctly sized and
      hit-testable after scaling; text stays crisp (no blurry transform scaling of fonts).
- [ ] `pnpm verify` green.

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
