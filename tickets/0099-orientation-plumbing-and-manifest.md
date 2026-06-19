---
id: 0099
title: Orientation plumbing — rotate handling & drop the portrait lock
type: task
status: done
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

- [x] Rotating the device mid-session (and mid-hand) re-lays-out cleanly between the portrait and
      landscape arrangements with **no lost state** — the active hand, pot, board reveal progress, and
      coach drawer survive the transition. _(Verified in Chromium: resized portrait→landscape→portrait
      mid-hand; HAND #1, pot, and hero cards (5♣6♥) preserved each way, arrangement + chrome switched
      cleanly. Orientation is component-local presentation (the `useOrientation` re-render is not a
      remount), so the reducer/session state is untouched.)_
- [x] The manifest no longer pins `orientation: 'portrait'`; the installed PWA can rotate. Any
      interim "rotate to portrait" guard, if one was added, is removed. _(Removed from
      `vite.config.ts`; confirmed absent from the built `dist/manifest.webmanifest`. No interim guard
      was ever added.)_
- [x] Orientation/size changes are observed in one place (e.g. a resize/orientation hook the felt
      reads) rather than per-component, consistent with the single layout owner from
      [[0097-landscape-seat-arrangement]]. _(The `useOrientation` hook (added in 0097) is the single JS
      observation point; the landscape CSS keys off the same `matchMedia('(orientation: landscape)')`
      condition.)_
- [x] Safe-area insets and the action bar behave in landscape (notch/home-indicator on the short
      edges) — controls stay reachable and unclipped. _(Added `padding-left/right: env(safe-area-inset-
left/right)` to the landscape play shell so the felt/topbar/action-bar inset from the side notch;
      the landscape action bar (0097) keeps controls in a reachable single row. Inert (0) on a
      non-notched device — can't simulate a real notch in a plain browser, so this is by-construction.)_
- [x] A quick a11y/usability pass: focus isn't lost on rotate, tap targets remain adequate, and the
      mid-runout CTA gating ([[0093-pwa-watchable-allin-runout]]) still holds across a rotate. _(Rotate
      is a re-render, not a remount, so focus is retained; landscape tap targets verified ≥~36px in
      0097; the runout's timers/gating live in `App` state, untouched by the presentation-only
      orientation change, so the CTA gating holds across a rotate.)_
- [x] `pnpm verify` green. _(+ `pnpm --filter @holdem/pwa build` clean.)_

## Notes

Depends on [[0096-felt-scaling-foundation]], [[0097-landscape-seat-arrangement]], and
[[0098-landscape-completion-surfaces]] — this is the "turn it on" step, last so the lock only comes
off once every surface is correct in both orientations.

Layout state lives in the model/session already (seat count, hand state); orientation is pure
presentation (like the runout's `runoutCount`), so prefer a component-local
resize/`matchMedia('(orientation: …)')` observer over threading orientation through the reducer.
