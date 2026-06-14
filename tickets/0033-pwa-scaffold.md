---
id: 0033
title: PWA scaffold — Vite + React + vite-plugin-pwa, installable & offline
type: feature
status: todo
milestone: M4
priority: high
created: 2026-06-13
---

## Context

Stand up `apps/pwa` and the browser toolchain the rest of M4 builds on: Vite + React +
`vite-plugin-pwa`, wired into the workspace and the root build. By the end of this ticket the app
builds, serves, mounts a React root that drives the **real** shared session loop
([[0032-session-core-package]]) via `useReducer`, and is an installable, offline-capable PWA — the
DOM analog of the TUI scaffold ([[0025-tui-scaffold-mvu]]), before any table visuals or interaction
land.

## Acceptance criteria

- [ ] `apps/pwa` exists as a sibling to `apps/tui`: `package.json` (React + Vite + `vite-plugin-pwa` + `@vitejs/plugin-react`, deps on the pure packages incl. `@holdem/session`/`@holdem/odds`),
      `vite.config.ts`, `tsconfig.json` (ESM + `react-jsx`, project references), `index.html`, and
      wired into the root `tsconfig.json` references.
- [ ] `vite-plugin-pwa` configured for an installable Android PWA: web-app manifest (name, theme/
      background colour, display `standalone`, icons), an auto-updating service worker that
      precaches the app shell so a second load works **offline**.
- [ ] A minimal React root mounts and drives the shared `reducer` via `useReducer` — e.g. renders
      one dealt hand's state read-only (proving model→DOM wiring), no interaction required yet.
- [ ] Scripts: `dev`, `build`, `preview`; a root `pnpm play:pwa` (or similar) convenience script.
      `pnpm verify` green (typecheck + lint of the new app; app excluded from the pure-package
      coverage gate, like `apps/tui`).

## Notes

First Vite/DOM-React in the repo — **confirm current `vite` / `vite-plugin-pwa` / `@vitejs/plugin-react`
major versions** at build time rather than assuming, and match the repo's `react-jsx` + ESM tsconfig
style. Purity check does NOT apply to the app (it has DOM/Vite deps by design). Keep the equity Web
Worker out of scope here — it lands in [[0035-pwa-play-loop]] / wherever the coach offload is wired;
the seam (`equityAsync` + `WorkerFactory`) already exists in `@holdem/odds`. The visual design is
intentionally deferred to the design-led tickets ([[0034-pwa-table-view]] onward); this scaffold is
design-agnostic plumbing. Depends on [[0032-session-core-package]].
