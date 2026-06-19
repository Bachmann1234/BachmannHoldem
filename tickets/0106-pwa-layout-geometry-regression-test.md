---
id: 0106
title: Automated layout-geometry regression test for the responsive felt
type: task
status: todo
milestone: M7
priority: low
created: 2026-06-19
---

## Context

Filed from the M7 milestone review. M7's correctness is two coupled halves: the **TS half** (seat
coordinates in `layout.ts`, `completeRise` lift, line caps) is well unit-tested, but the **CSS half**
— the `--u` design-pixel clamp, the `@media (orientation: landscape)` block that lifts the play-shell
width cap and compacts the action bar, and the corner-control compaction — is **not** unit-testable.
jsdom computes none of `cqh` / `calc()` / `@media` / container queries, so the live geometry was
verified only by manual Chromium measurement during 0096–0099. The cross-file coupling is loudly
commented (e.g. `layout.test.ts`'s `CORNER_CONTROL_TOP` proxy explicitly says "this assertion alone
won't catch it"), but it is **not machine-checked** — a future CSS edit (say, enlarging the Coach FAB
padding) could re-introduce the original 0097 wing-vs-control collision or the 0098 pot-into-top-seat
overlap and still pass all of `pnpm verify`.

This closes that gap by automating the two historical no-overlap invariants that manual QA caught.

## Acceptance criteria

- [ ] A browser-driven layout smoke test (Playwright is the natural fit — the no-overlap checks need a
      real engine that computes `cqh`/`@media`) loads the play felt at a small set of viewports —
      at minimum **932×430 landscape** and **390×844 portrait**, 6-max — and asserts, via
      `getBoundingClientRect`, the invariants that regressed during M7:
  - the 5/6-max lower-wing pills do **not** overlap the bottom-corner History / Coach FAB controls (the 0097 bug);
  - the completed-hand pot/board/banner block does **not** overlap any seat — notably the 6-max top-centre seat (the 0098 bug);
  - no seat/board overlap and the hero seat clears the action bar.
- [ ] The test runs against a built/preview server (or the dev server) deterministically (seed the
      table so coordinates are stable), and reaches a completed-hand state to exercise the showdown lift.
- [ ] Wired as a **separate `test:e2e` script**, deliberately **not** part of the default `pnpm verify`
      gate, so the existing format/lint/typecheck/vitest gate (and the pre-push hook) stay browser-free.
      Document how to run it (and that `npx playwright install chromium` is a prerequisite). Decide
      whether/how to add it to CI as its own job.
- [ ] Adding `@playwright/test` must not break `pnpm verify`: the e2e files are excluded from the
      `tsc -b` build and the vitest include globs, and pass eslint + prettier.

## Notes

**Why this wasn't done inline during the M7 review:** unlike the other review findings (doc/comment
fixes, the `completeRise` lookup-table refactor), this adds a **new test framework + a ~150 MB browser
dependency + CI implications** — a deliberate infrastructure decision rather than a code fix, so it
earns its own ticket rather than a bolt-on that could destabilize the just-green gate.

Relates to the coupling caveats in [[0097-landscape-seat-arrangement]] and the verification gap noted in
[[0098-landscape-completion-surfaces]] (5-max + multi-pot side-pot grid in landscape were covered by
unit tests + by-construction bounds, not a live render — a Playwright pass could close those too).
The orchestrator already proved the approach by hand during the milestone (driving the felt with the
Playwright MCP and measuring `getBoundingClientRect` overlaps); this ticket makes that repeatable.
