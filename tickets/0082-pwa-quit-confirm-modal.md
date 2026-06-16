---
id: 0082
title: Confirm before quitting a live session (quit-table modal)
type: feature
status: done
milestone: M4
priority: medium
created: 2026-06-16
---

## Context

The "End session" button in the between-hands `ActionBar` dispatches `{ type: 'quit' }`
immediately. Hitting it by accident ends the session and (per the resume design) discards the
save — there's no undo, so a mis-tap mid-game throws the whole table away. The hero should have to
confirm.

This only applies to the **live-session** quit. The session-over `ActionBar` also calls `onQuit`
("View summary →"), but the session is already over there, so that path must stay a one-tap action
with **no** confirmation.

## Acceptance criteria

- [ ] Tapping "End session" while a session is live opens a confirmation modal (e.g. "End this
      session? Your table and progress will be lost." / "End session" + "Keep playing") instead of
      quitting immediately.
- [ ] Confirming dispatches the existing `{ type: 'quit' }`; cancelling (button, scrim click, or
      Escape) dismisses the modal and leaves the session untouched.
- [ ] The session-over "View summary →" path is unchanged — still one tap, no modal.
- [ ] The modal follows the existing overlay conventions: `role="dialog"`, `aria-modal`, focus
      moved into the dialog on open, Escape closes, scrim click closes, focus restored to the opener
      on close. Reuse the `chart-scrim` / `chart-modal` styling rather than inventing a new scrim.
- [ ] A test covers: End session → modal appears (session not yet over) → confirm → `game-over`;
      and End session → modal → cancel → still playing.
- [ ] `pnpm verify` green.

## Notes

The quit flows live in `apps/pwa/src/components/ActionBar.tsx` (the `handOver` branch's
`quit-cta`, and the `sessionOver` branch's `View summary` — only the former gets the guard) and are
wired in `App.tsx` (`onQuit={() => dispatch({ type: 'quit' })}`, ~line 577).

Mirror the existing self-contained overlay pattern in
`apps/pwa/src/components/RulesOverlay.tsx` (portal to `<body>`, scrim + modal, focus management,
Escape-to-close) — `ChartOverlay` / `GlossaryOverlay` are the same shape. Keep the confirm state
local to the component owning the button; no reducer/`Msg` changes are needed (quit already exists).
Decide where the modal mounts so it can intercept the `handOver` quit without affecting the
session-over button.
