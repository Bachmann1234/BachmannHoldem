---
id: 0024
title: 'Epic: Ink TUI play client'
type: epic
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

**M3.5**, slotted between the coach (M3) and the PWA (M4): a full-screen terminal client for
playing hands, built with **Ink** (React for the terminal — declarative components + Yoga flexbox
layout). It is a richer, swappable shell over the same already-tested pure packages
(`engine` / `odds` / `bots` / `coach`) — exactly the "the poker brain is the asset, the UI is a
swappable shell" principle the project is built on. No poker logic changes; the TUI only renders
state and captures input. It also de-risks M4: the first real interactive UI over the packages,
proving the play/coach loop in a terminal before the PWA repeats it in the browser.

This **becomes the primary play experience** and replaces the readline `pnpm play` loop for humans.
The existing `apps/cli` is **slimmed to a thin headless/scriptable engine harness** (not deleted) —
the cheap `printf … | …`-style smoke-test path stays, while the real correctness gate remains the
`vitest` suite that drives the pure packages directly.

## Acceptance criteria

- [ ] A new `apps/tui` Ink app renders a live poker table (board, hero hole cards, pot, both
      stacks, button, whose turn, street) and is fully playable heads-up vs. a `@holdem/bots`
      opponent across a multi-hand session.
- [ ] A live **coach panel** shows the deterministic `@holdem/coach` verdict per hero decision
      (equity / pot odds / EV / good-leak) plus the preflop chart tier — reusing `coachDecision`
      and `classifyStartingHand`, not re-deriving anything.
- [ ] `pnpm play` launches the TUI; the slimmed `apps/cli` keeps a non-interactive scriptable
      mode under its own script. README/ROADMAP updated to match.
- [ ] `pnpm verify` stays green: the pure-package coverage gate is untouched (the TUI app, like
      the CLI and the future PWA, is excluded from it) and TUI components have their own
      `ink-testing-library` component tests.

## Notes

Reuses the M3 coach ([[0007-coaching-engine]]) and the M2 bot seam ([[0006-heuristic-opponents]]),
consumed exactly the way `apps/cli/src/play.ts` consumes them today. Decomposed into per-feature
tickets (built in order):

- [[0025-tui-scaffold-mvu]] — `apps/tui` package + Ink/React toolchain + the MVU (reducer-driven)
  render loop, rendering one in-progress hand read-only.
- [[0026-tui-table-view]] — the presentational table components (board, hole cards in colour, pot,
  stacks, seats, street header), bot cards hidden until showdown.
- [[0027-tui-action-input]] — the keyboard action bar (fold/check/call/bet/raise/all-in + amount
  entry) → `legalActions` → `applyAction`, making a single hand fully playable.
- [[0028-tui-coach-panel]] — the live coach panel (verdict + preflop chart) as Ink components.
- [[0029-tui-session-loop]] — multi-hand session (stacks carry, button alternates, shuffle,
  play-again, bust) + opponent personality selection at startup → the complete client.
- [[0030-cli-headless-harness]] — slim `apps/cli` to a non-interactive scriptable harness; point
  `pnpm play` at the TUI; update docs.

**What matters most for this milestone:** it is a _shell_, so keep ALL poker/coach logic in the
pure packages and let the Ink layer only render state + capture input. Mirror the Bubble Tea
mental model the requester knows — a single reducer (`model` + `dispatch(msg)` + pure update) as
the MVU core — so the app stays testable and the game logic never leaks into components. Confirm
the current Ink + React major versions and the ESM/JSX tsconfig setup at scaffold time (this is the
first React/JSX in the repo).

**Numbering:** `M3.5` — inserted between M3 and M4 so the existing arc keeps its numbers; it runs
**before** the PWA (M4), which still owns the browser/installable-app story.
