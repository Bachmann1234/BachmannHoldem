---
id: 0099
title: Orientation plumbing — rotate handling & drop the portrait lock
type: task
status: todo
milestone: M7
priority: medium
created: 2026-06-19
---

## Context

The final step of [[0095-responsive-felt-and-landscape]]: now that both orientations lay out
correctly, let the app actually live in both. Today the PWA manifest hard-locks
`orientation: 'portrait'` (`apps/pwa/vite.config.ts`), so an installed app can't rotate at all — that
lock was the de-facto guard against the broken landscape layout, and it's no longer needed once
0096–0098 land. This ticket handles the live rotate transition, makes sure no state is lost across it,
and removes the lock.

## Acceptance criteria

- [ ] Rotating the device mid-session (and mid-hand) re-lays-out cleanly between the portrait and
      landscape arrangements with **no lost state** — the active hand, pot, board reveal progress, and
      coach drawer survive the transition.
- [ ] The manifest no longer pins `orientation: 'portrait'`; the installed PWA can rotate. Any
      interim "rotate to portrait" guard, if one was added, is removed.
- [ ] Orientation/size changes are observed in one place (e.g. a resize/orientation hook the felt
      reads) rather than per-component, consistent with the single layout owner from
      [[0097-landscape-seat-arrangement]].
- [ ] Safe-area insets and the action bar behave in landscape (notch/home-indicator on the short
      edges) — controls stay reachable and unclipped.
- [ ] A quick a11y/usability pass: focus isn't lost on rotate, tap targets remain adequate, and the
      mid-runout CTA gating ([[0093-pwa-watchable-allin-runout]]) still holds across a rotate.
- [ ] `pnpm verify` green.

## Notes

Depends on [[0096-felt-scaling-foundation]], [[0097-landscape-seat-arrangement]], and
[[0098-landscape-completion-surfaces]] — this is the "turn it on" step, last so the lock only comes
off once every surface is correct in both orientations.

Layout state lives in the model/session already (seat count, hand state); orientation is pure
presentation (like the runout's `runoutCount`), so prefer a component-local
resize/`matchMedia('(orientation: …)')` observer over threading orientation through the reducer.
