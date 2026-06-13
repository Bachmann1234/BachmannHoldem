---
id: 0004
title: Node CLI hand runner
type: feature
status: done
milestone: M0
priority: medium
created: 2026-06-13
---

## Context

A tiny terminal program to play out a hand against a trivial opponent. This is the fast feedback
loop for M0–M3 — it exercises the real engine code (not a prototype) with no UI required, and
becomes the harness we drive bots and the coach through later.

## Acceptance criteria

- [x] `pnpm play` (or similar) deals a hand and prompts for your action each street
- [x] Opponent is a placeholder "always-call" dummy
- [x] Prints board, pot, stacks, legal actions, and the showdown result
- [x] Lives in its own package/app so the engine stays UI-free

## Notes

Closes out M0: "play a full, rules-correct hand in the terminal." Depends on
[[0003-game-state-machine]]. Keep it thin — it's a harness, not a product.

Landed in `apps/cli` (`@holdem/cli`), run via `pnpm play`. The engine stays UI-free; the app
imports it as a workspace dep. Run with `tsx` (Node's native type-stripping won't rewrite the
engine's `.js` import specifiers). Pure bits — the always-call bot, the input parser, the
rendering — live in `table.ts` with unit tests; `play.ts` is the readline shell (buffered line
reader so typed-ahead/pasted input is never dropped). Heads-up vs. one always-call bot, stacks
carry between hands, button alternates, session ends on quit or a bust.
