---
id: 0046
title: PWA top-level navigation + Learn the fundamentals route
type: feature
status: done
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The epic ([[0042-foundations-primer]]) calls for a standalone **"Learn the fundamentals"** path "in
the PWA (its own tab/route), separate from free play and the M5 drill sets." Today the PWA has **no
navigation at all** — `apps/pwa/src/App.tsx` boots straight into the table-setup screen. To host the
primer alongside play (and, later, M5 drills) we need a top-level way to choose a path.

This ticket introduces that navigation shell and the Learn route's entry point. The lesson player
itself is [[0047-pwa-lesson-player]]; progress/persistence is [[0048-pwa-lesson-progress]].

**UI ticket — depends on the design direction.** Implement against the design brief / mockups handed
off before this milestone's UI work (the M4 precedent: a designer drives look-and-feel before
build). Build on the existing M4 "playful" design system in `apps/pwa/src/styles.css`.

## Acceptance criteria

- [x] A top-level navigation surface (home/menu) lets the player choose **Play** (the existing
      free-play session) or **Learn the fundamentals** (the primer). Matches the agreed design.
- [x] The existing free-play flow is reachable unchanged from the new shell — the table setup →
      play → summary loop and the hand-history/coach affordances behave exactly as before (no
      regression to [[0035-pwa-play-loop]]/[[0036-pwa-coach-panel]]/[[0037-pwa-hand-history]]).
- [x] A **Learn** route renders a lesson list/map built from the `FOUNDATIONS` sequence
      ([[0045-foundations-primer-content]]) — each lesson shown with its concept and selectable. The
      individual lesson player is wired in [[0047-pwa-lesson-player]]; this ticket lands the
      list/route and the entry point into it.
- [x] Navigation state stays out of the poker `@holdem/session` reducer (it is app-shell UI, like the
      coach-drawer open flag) — keep the session model unpolluted.
- [x] Tests (Testing Library, the existing PWA pattern): the menu renders both paths, choosing Play
      reaches the setup screen, choosing Learn reaches the lesson list. `pnpm verify` green.

## Notes

Depends on [[0045-foundations-primer-content]] (the lesson list reads `FOUNDATIONS`). Precedes
[[0047-pwa-lesson-player]] and [[0048-pwa-lesson-progress]]. The PWA has no router dependency today
— prefer a tiny local view-state switch over adding `react-router` unless the design genuinely needs
URL routing; keep it lightweight and offline-first (the whole app is a precached shell). Don't
purity-check the app (it has its own tooling/coverage story). Reuse existing components/CSS classes
rather than inventing parallel ones; match the M4 component idiom (`React.JSX.Element`, doc comments,
`data-testid` for tests).
