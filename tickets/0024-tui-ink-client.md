---
id: 0024
title: 'Epic: Ink TUI play client'
type: epic
status: in-progress
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
state and captures input. It also genuinely de-risks M4: Ink is React, and the M4 PWA is React too,
so the first interactive UI over the packages shares the _paradigm_ with the PWA — the
hooks/reducer logic, the view-model derivation, and the whole play/coach loop carry over (only the
terminal-vs-DOM render components differ). Proving that loop in a terminal first is a low-risk dry
run for the browser.

This **becomes the primary play experience** and replaces the readline `pnpm play` loop for humans.
The existing `apps/cli` is **slimmed to a thin headless/scriptable engine harness** (not deleted) —
the cheap `printf … | …`-style smoke-test path stays, while the real correctness gate remains the
`vitest` suite that drives the pure packages directly.

## Acceptance criteria

- [ ] A new `apps/tui` Ink app renders a live poker table (board, hero hole cards, pot, every
      seat's stack, button, whose turn, street) and is fully playable at a **configurable table —
      default 6-max (you plus five `@holdem/bots` opponents), down to heads-up** — across a
      multi-hand session.
- [ ] A live **coach panel** shows the deterministic `@holdem/coach` verdict per hero decision
      (equity / pot odds / EV / good-leak) plus the preflop chart tier — reusing `coachDecision`
      and `classifyStartingHand`, not re-deriving anything — with the equity read **honest for the
      live table size** (see [[0031-coach-multiway-equity]]).
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
  render loop, rendering one in-progress hand read-only. Model the table for **N seats**, never
  hardcode two.
- [[0026-tui-table-view]] — the presentational table components (board, hole cards in colour, pot,
  every seat, street header) laid out for an **N-seat table**; all opponents' cards hidden until
  showdown.
- [[0027-tui-action-input]] — the keyboard action bar (fold/check/call/bet/raise/all-in + amount
  entry) → `legalActions` → `applyAction`, making a single hand fully playable (several bots may
  act between the hero's turns).
- [[0031-coach-multiway-equity]] — make the coach's equity read honest at any table size (vs the
  live opponent count, not one villain) — the pure-package prerequisite for multiway coaching.
- [[0028-tui-coach-panel]] — the live coach panel (verdict + preflop chart) as Ink components,
  showing the table-size-aware verdict.
- [[0029-tui-session-loop]] — multi-hand **multiway** session (default 6-max: stacks carry, button
  rotates, shuffle, play-again, players bust out down to a winner) + a table-setup screen choosing
  seat count and opponent personalities → the complete client.
- [[0030-cli-headless-harness]] — slim `apps/cli` to a non-interactive scriptable harness (N-seat
  capable); point `pnpm play` at the TUI; update docs.

**What matters most for this milestone:** it is a _shell_, so keep ALL poker/coach logic in the
pure packages and let the Ink layer only render state + capture input. Mirror the Bubble Tea
mental model the requester knows — a single reducer (`model` + `dispatch(msg)` + pure update) as
the MVU core — so the app stays testable and the game logic never leaks into components. Confirm
the current Ink + React major versions and the ESM/JSX tsconfig setup at scaffold time (this is the
first React/JSX in the repo).

**Real tables, not just heads-up.** Typical Hold'em is multiway (6-max / full-ring); heads-up is a
narrower training/endgame format. So the TUI seats a real table — **default 6-max**, configurable
down to heads-up — rather than the CLI's hardcoded heads-up. The engine already supports N seats
(side pots, `numActive`, the `opponents` array), and the bots seat fine one-`decide`-per-turn. The
one piece of genuine new work is the coach: its equity read must reflect the **number of opponents
actually in the pot** ([[0031-coach-multiway-equity]]), or it would overstate multiway equity and
mis-grade — so that ticket lands before the table seats more than two.

**Numbering:** `M3.5` — inserted between M3 and M4 so the existing arc keeps its numbers; it runs
**before** the PWA (M4), which still owns the browser/installable-app story.
