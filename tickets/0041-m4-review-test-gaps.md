---
id: 0041
title: Close two M4 test gaps (bet-amount clamp, reducer coach-error branch)
type: task
status: done
milestone: M4
priority: low
created: 2026-06-14
---

## Context

The M4 milestone review found two load-bearing branches whose behaviour is correct but not directly
covered by a test. Both are cheap to pin and worth locking in before M5/M6 build on top.

## Acceptance criteria

- [x] **Bet-amount clamp** (`apps/pwa/src/components/ActionBar.tsx` → `ActionBar.test.tsx`): a test
      that drives the slider/`betTo` to a value OUTSIDE the legal `[min,max]` and asserts the committed
      `bet`/`raise` action's `amount` is clamped into range (the code clamps via `clamp(...)`; the
      invariant is currently only exercised on happy-path size buttons).
- [x] **Reducer coach-error branch** (`packages/session/src/reducer.ts` `coachHero` → `reducer.test.ts`):
      a test that makes the coach throw for a spot and asserts the reducer degrades to
      `model.coach.kind === 'error'` (today this is covered only indirectly via the PWA drawer's
      error-state component test).
- [x] `pnpm verify` green; session coverage thresholds held or improved.

## Notes

Both are behaviour-locking tests, not bug fixes — the implementations are already correct. Build the
inputs from real engine/coach calls (`createHand`/`applyAction`), don't fabricate `HandState`.
Surfaced by the M4 milestone review.
