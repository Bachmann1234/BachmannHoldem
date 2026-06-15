---
id: BUG-0005
title: Play column collapses narrow and the layout jumps when switching Play/Learn
type: bug
status: fixed
severity: medium
milestone: M4.5
created: 2026-06-14
---

## Summary

In the PWA, the Play surface renders far too narrow (a thin column instead of the 460px app
column), and the layout visibly jumps when switching between the Play and Learn tabs. Regression
from the M4.5 navigation restructure ([[0046-pwa-learn-nav]]).

## Steps to reproduce

1. `pnpm play:pwa`, open the app (boots to Play / the setup screen).
2. Note the Play column is much narrower than the design's phone column.
3. Tap **Learn** (full-width, correct), then **Play** again — the layout jumps.

## Expected

Both Play and Learn render in the same centered ~460px column (540px ≥900px), with no width jump
when switching tabs.

## Actual

Play collapses to a shrink-to-fit narrow column; Learn is the correct width — so switching tabs
jumps the layout.

## Notes

Cause: `App` wraps `Session` in a plain `<div hidden={…}>` (apps/pwa/src/App.tsx). `.room` is a
flex row with `justify-content: center`; that wrapper is a shrink-to-fit flex item, so the nested
`.app` / `.app-stack`'s `width: 100%` resolves against the _wrapper_ (min-content) instead of
`.room`, collapsing it. Learn (`.screen`) is an un-wrapped direct flex child, so it sizes correctly
— hence the asymmetry and the jump.

Fix: make the wrapper layout-transparent so `.app` is effectively a direct flex child of `.room`
again — `display: contents` when Play is active, `display: none` when hidden (keeps `Session`
mounted across tab switches, as 0046 intended, without breaking the width chain). Affected:
`apps/pwa` only; pure packages untouched.
