---
id: BUG-0006
title: Starting-hand chart is pinned to the bottom and clipped when opened from the coach drawer
type: bug
status: fixed
severity: medium
milestone:
created: 2026-06-14
---

## Summary

Opening the starting-hand chart ([[0050-starting-hand-chart-view]]) from the coach drawer's preflop
verdict renders the chart pinned to the bottom of the screen and clipped (the top rows — AA, AKs… —
are cut off), instead of centered. Opening it from the Learn section is fine.

## Steps to reproduce

1. Play a hand; on a preflop decision open the coach drawer and tap "See the starting-hand chart".
2. The chart appears at the bottom, partly below the fold, with its top rows cut off.

## Expected

The chart opens centered in the viewport (as it does from the Learn section), fully visible.

## Actual

It's anchored to the bottom and clipped — only the lower tiers are visible.

## Notes

Cause: `ChartOverlay` uses `position: fixed`, but it is rendered _inside_ the coach `.drawer`, which
slides via `transform: translateY(...)` (apps/pwa/src/styles.css). A transformed ancestor becomes
the containing block for `position: fixed` descendants, so the overlay positions against the drawer
(bottom-anchored, `max-height: 80%`, scrollable) rather than the viewport.

Fix: render `ChartOverlay` through a React portal to `document.body` so it escapes the drawer's
transformed subtree and its `fixed` positioning resolves against the viewport again. Affects both
entry points identically (and any future caller). `apps/pwa` only.
