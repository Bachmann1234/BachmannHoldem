---
id: 0026
title: TUI table view components
type: feature
status: done
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

The presentational layer: Ink components that render the poker table from a `HandState` — the board,
the hero's hole cards (in colour by suit), the pot, **every seat's stack** (an N-seat table, up to
6-max), the dealer button, whose turn it is, and the street header. This is the visual heart of the
TUI and replaces the hand-padded strings of `apps/cli/src/table.ts`'s `renderState`/`renderResult`
with real flexbox-laid-out components.

## Acceptance criteria

- [x] Pure presentational Ink components (no game logic, no input) that, given the model's
      `HandState` + hero seat, render: street header, board cards, pot total, **all N seats** (each
      with name, stack, current bet, button/folded/all-in/to-act marks), and the hero's hole cards.
      Lay the seats out so a full 6-max table stays readable.
- [x] Hero hole cards are shown; **every opponent's cards stay hidden (`?? ??`) until showdown**,
      matching the current CLI's reveal rule. Suit colour (e.g. red hearts/diamonds) via
      `chalk`/Ink colour.
- [x] A showdown/result view (winning hand + payouts) for a completed hand. Components are
      covered with `ink-testing-library` snapshot/behaviour tests; `pnpm verify` green.

## Notes

Depends on [[0025-tui-scaffold-mvu]]. Reuse `formatCard` from `@holdem/engine`; reuse the engine's
existing reveal logic (`isComplete`) for the hidden/shown decision exactly as
`apps/cli/src/table.ts` `renderSeat` does. Keep components pure functions of props so they test
cleanly. No input handling here — that is [[0027-tui-action-input]]. Mirror the information the CLI
already shows so nothing regresses; this is a richer rendering of the same data, not new data.
