---
id: 0025
title: TUI app scaffold + Ink/MVU render loop
type: feature
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

Stand up the `apps/tui` package and the Ink/React toolchain, and establish the MVU
(reducer-driven) render loop the rest of the milestone builds on. By the end of this ticket the app
launches, drives the **real** `@holdem/engine`, and renders a single in-progress hand read-only
(no input yet) — proving the toolchain and the model→view wiring before any interaction lands.

## Acceptance criteria

- [ ] `apps/tui` exists as a sibling to `apps/cli`: `package.json` (Ink + React deps + a dev script
      via `tsx`), `tsconfig.json` (ESM + JSX for React, referencing the pure packages it uses), and
      wired into the root `tsconfig.json` references.
- [ ] An MVU core: a single `Model` (engine `HandState` + UI state) and a pure `reducer(model, msg)`
      with a typed message union — the Bubble Tea mental model, in React. The root Ink component
      renders the model; no game logic lives in components. Model the table generically for **N
      seats** — do not bake in a heads-up (2-seat) assumption; the milestone seats up to 6.
- [ ] Running the app (e.g. `pnpm --filter @holdem/tui dev`) renders a static snapshot of one hand
      created via `createHand` and exits cleanly. `pnpm verify` green (typecheck/lint of the new
      app included; the app is excluded from the pure-package coverage gate).

## Notes

First React/JSX in the repo — **confirm the current Ink + React major versions** and the matching
`tsconfig` JSX setup (`"jsx": "react-jsx"`, ESM module resolution) at build time rather than
assuming. Add `ink-testing-library` as a dev dep now so [[0026-tui-table-view]] onward can
component-test. Keep the reducer pure and exported so it is unit-testable independent of Ink.
Consume `@holdem/engine` exactly as `apps/cli/src/play.ts` does. Feeds every later TUI ticket; the
`pnpm play` rename and CLI slimming happen later in [[0030-cli-headless-harness]] — leave
`apps/cli` untouched here.
