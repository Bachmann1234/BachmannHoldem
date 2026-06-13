---
id: 0004
title: Node CLI hand runner
type: feature
status: todo
milestone: M0
priority: medium
created: 2026-06-13
---

## Context

A tiny terminal program to play out a hand against a trivial opponent. This is the fast feedback
loop for M0–M3 — it exercises the real engine code (not a prototype) with no UI required, and
becomes the harness we drive bots and the coach through later.

## Acceptance criteria

- [ ] `pnpm play` (or similar) deals a hand and prompts for your action each street
- [ ] Opponent is a placeholder "always-call" dummy
- [ ] Prints board, pot, stacks, legal actions, and the showdown result
- [ ] Lives in its own package/app so the engine stays UI-free

## Notes

Closes out M0: "play a full, rules-correct hand in the terminal." Depends on
[[0003-game-state-machine]]. Keep it thin — it's a harness, not a product.
