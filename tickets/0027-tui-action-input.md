---
id: 0027
title: TUI interactive action bar
type: feature
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

Make a hand actually playable: an action bar that captures keyboard input for the hero's legal
moves — fold / check / call / bet / raise / all-in, with bet-amount entry — turns it into a legal
engine `Action`, and applies it. This is where Ink's `useInput` replaces the readline `LineReader`,
and the MVU loop advances the hand.

## Acceptance criteria

- [ ] An action-bar component showing the hero's legal actions (with amounts) from
      `legalActions(state)`, and a `useInput` handler that maps keystrokes to a chosen `Action`,
      including a bet/raise amount-entry affordance and an all-in shortcut.
- [ ] Only legal actions are selectable; an illegal/garbled keystroke is ignored or shown as a
      gentle hint, never crashes. The chosen `Action` is dispatched through the reducer and applied
      with `applyAction`, advancing the model; the bot acts on its turn.
- [ ] One full hand is playable start to finish in the TUI. The input→action mapping logic is
      pure and unit-tested (reuse or mirror `apps/cli/src/table.ts`'s `parseAction` grammar);
      `pnpm verify` green.

## Notes

Depends on [[0026-tui-table-view]]. The pure input-grammar (`c`, `b50`, `allin`, bare verb =
minimum) already exists as `parseAction` in `apps/cli/src/table.ts` — reuse it or lift it into a
shared spot rather than re-implementing the verb/amount parsing. Keep the keystroke→Action decision
pure and testable; Ink's `useInput` should be a thin wrapper that calls into it. Validate every
action against `legalActions` so the engine never receives an illegal move (it throws on one). At a
multiway table, **several bots may act in turn between the hero's decisions** — drive the loop off
`state.toAct` (prompt only when it is the hero's seat, otherwise let the next bot act), not a
hardcoded hero/bot alternation.
Coaching the decision comes next in [[0028-tui-coach-panel]]; session/again/bust flow is
[[0029-tui-session-loop]].
