---
id: 0029
title: TUI multiway session loop + table setup
type: feature
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

Tie the pieces into a complete client: a multi-hand **multiway** session (default 6-max) that
carries stacks between hands, rotates the button, shuffles a fresh deck per hand, offers "play
another / quit", and removes players as they bust — plus a table-setup screen at startup to choose
the seat count (heads-up through 6-max) and the opponents you sit down against (the four
`@holdem/bots` presets — TAG / LAG / rock / calling station). This is the ticket that turns the TUI
from "one playable hand" into the real play experience, at a realistic table rather than heads-up.

## Acceptance criteria

- [ ] A multiway session loop: stacks persist across hands, the **button rotates** among the live
      seats, each hand gets a freshly shuffled deck dealt to the seats still holding chips, and the
      app prompts to play again or quit. A player who busts is removed; the session ends when only
      the hero (or one player) remains, or the hero busts/quits, with a final summary.
- [ ] A table-setup screen: choose the **number of seats** (default 6-max, down to heads-up) and
      assign each opponent seat a `@holdem/bots` personality (`PERSONALITIES`) — sensible defaults
      (e.g. a varied spread; heads-up defaults to TAG) so it is one keypress to just play.
- [ ] The full client is playable end to end at a multiway table with the table view, action bar,
      and coach panel working together. `pnpm verify` green; the session/seating/selection state
      lives in the reducer and is unit-tested (incl. button rotation and bust removal).

## Notes

Depends on [[0028-tui-coach-panel]]. Mirror the session mechanics in `apps/cli/src/play.ts`
`main`/`playHand` (starting stacks, blinds, Fisher–Yates shuffle, bust detection) but **generalise
heads-up → N seats**: the engine's `createHand` already takes an N-length `stacks` array and posts
blinds / sets the first actor for any table size, and handles side pots — so the per-hand rules are
free. The new app-level logic is the _session_ orchestration: button rotation around the live
seats, dropping busted players, re-seating the remaining stacks into the next hand, and ending when
one player is left. Port that into the reducer, not the readline I/O; keep shuffling/RNG in the app
shell (the engine is deterministic), as the CLI does.

Reuse `@holdem/bots` `PERSONALITIES` + `heuristicOpponent` for the per-seat opponents (this also
delivers the "choose your opponent" idea raised during M3) — keep one bot instance per seat so each
carries its own PRNG. Bots act in `state.toAct` order, so several may act between the hero's turns.
The coach equity is already table-size-aware via [[0031-coach-multiway-equity]]. The `pnpm play`
rename + CLI slimming is the final ticket [[0030-cli-headless-harness]].
