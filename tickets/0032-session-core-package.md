---
id: 0032
title: Extract the shared MVU session core into @holdem/session
type: feature
status: done
milestone: M4
priority: high
created: 2026-06-13
---

## Context

The PWA ([[0008-pwa-app-shell]]) is the second React shell over the same poker brain, and the
ROADMAP frames M3.5 as a deliberate dry-run for it: _"the hooks/reducer logic and the play/coach
loop carry over (only the terminal-vs-DOM render layer differs)."_ Today that logic — the MVU
`Model`, the pure `reducer`, the session state machine (seat compaction, button rotation, bust
handling), and the coach-grading wiring — lives in `apps/tui/src/model.ts` and
`apps/tui/src/reducer.ts`. Both files import **only** `@holdem/*` (engine / bots / coach); neither
touches `ink` or React. If the PWA copy-pastes them, the two shells will drift.

Extract that core into a new pure package, `@holdem/session`, so both shells consume one brain.
This is pure plumbing with **no behaviour change** — the TUI must render and play exactly as before.

## Acceptance criteria

- [x] New pure package `packages/session` (sibling shape to `packages/format`): `package.json`
      (`@holdem/session`, deps on `@holdem/engine`/`@holdem/bots`/`@holdem/coach`), `tsconfig.json`
      (project references to those packages), `src/index.ts` exporting the public API.
- [x] `apps/tui/src/model.ts` and `apps/tui/src/reducer.ts` move into `packages/session/src/` with
      their doc comments intact; `reducer.test.ts` moves with them and stays green.
- [x] `apps/tui` consumes `@holdem/session` (its `package.json` adds the workspace dep; `Root.tsx`/
      `App.tsx`/components import `Model`/`Msg`/`reducer`/helpers from `@holdem/session` instead of
      local `./model.js` / `./reducer.js`). No MVU logic remains in `apps/tui`.
- [x] Wired into the build: root `tsconfig.json` references `packages/session`; `apps/tui` tsconfig
      references it; `vitest.config.ts` coverage `include` gains `packages/session/src/**` (the
      moved `reducer.test.ts` already exercises it thoroughly — keep thresholds green).
- [x] Purity preserved: zero UI/DOM/Node/React imports in `packages/session`. `pnpm verify` green.

## Notes

Mechanical but load-bearing — every later M4 ticket builds on it. Do **not** change reducer/model
behaviour; this is a move + rewire, verified by the existing tests passing unchanged. The
action-input grammar already lives in `@holdem/format` (`action.ts`) — leave it there; `@holdem/session`
is just the model + reducer + session helpers. Keep the same public names so the TUI diff is purely
import-path churn. Blocks every other M4 ticket. See [[0025-tui-scaffold-mvu]] /
[[0029-tui-session-loop]] for the code being moved.
