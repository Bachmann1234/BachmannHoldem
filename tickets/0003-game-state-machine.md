---
id: 0003
title: Game state machine
type: feature
status: done
milestone: M0
priority: high
created: 2026-06-13
---

## Context

The rules engine: drive a hand from posting blinds through showdown, enforcing legal play. Has
zero "intelligence" — it only enforces the rules. Everything else (bots, coach, UI) trusts it,
so it must be ruthlessly tested.

## Acceptance criteria

- [x] Hand setup: seats, button, blinds, starting stacks, hole-card dealing
- [x] Betting rounds: preflop / flop / turn / river with correct action order
- [x] `legalActions(state)` → fold / check / call / bet / raise with valid min/max amounts
- [x] `applyAction(state, action)` advances state immutably
- [x] Pot accounting including **side pots** for all-ins of differing sizes
- [x] Showdown resolution via [[0002-hand-evaluator]], incl. split pots
- [x] Tests for tricky cases: multi-way all-ins, short-stack side pots, blind-vs-blind, walk

## Notes

Model state as immutable snapshots (`applyAction` returns a new state) — clean to test, replay,
and later render in the UI. Lands in `packages/engine/src/state.ts`. Side pots are the classic
correctness trap; cover them explicitly.
