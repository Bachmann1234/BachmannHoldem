---
id: 0029
title: TUI session loop + opponent selection
type: feature
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

Tie the pieces into a complete client: a multi-hand session that carries stacks between hands,
alternates the button, shuffles a fresh deck per hand, offers "play another / quit", and ends on a
bust — plus an opponent-personality picker at startup so you can choose who to sit down against
(TAG / LAG / rock / calling station). This is the ticket that turns the TUI from "one playable
hand" into the real play experience.

## Acceptance criteria

- [ ] A session loop: stacks persist across hands, the button alternates, each hand gets a freshly
      shuffled deck, and the app prompts to play again or quit; the session ends when either player
      busts, with a final summary.
- [ ] A startup screen to pick the opponent personality from the four `@holdem/bots` presets
      (`PERSONALITIES`), defaulting to TAG; the chosen bot plays the whole session.
- [ ] The full client is playable end to end with the table view, action bar, and coach panel
      working together. `pnpm verify` green; the session/selection state lives in the reducer and
      is unit-tested.

## Notes

Depends on [[0028-tui-coach-panel]]. Mirror the session mechanics already in
`apps/cli/src/play.ts` `main`/`playHand` (starting stacks, blinds, alternating button, Fisher–Yates
shuffle, bust detection) — port the _logic_ into the reducer, not the readline I/O. Reuse
`@holdem/bots` `PERSONALITIES` + `heuristicOpponent` for the picker (this also delivers the
"choose your opponent" idea raised during M3). Keep shuffling/RNG in the app shell (the engine is
deterministic), as the CLI does. The `pnpm play` rename + CLI slimming is the final ticket
[[0030-cli-headless-harness]].
