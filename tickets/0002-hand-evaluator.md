---
id: 0002
title: 7-card hand evaluator
type: feature
status: todo
milestone: M0
priority: high
created: 2026-06-13
---

## Context

Given 7 cards (2 hole + up to 5 board), determine the best 5-card hand and return a value that
can be compared against any other hand. This is the most algorithm-heavy part of M0 and the
engine that both equity sims and showdown resolution rely on.

## Acceptance criteria

- [ ] `evaluate7(cards: Card[]): HandValue` returns a totally-orderable score
- [ ] Correctly ranks all 9 categories (high card → straight flush), incl. wheel (A-5) straights
- [ ] Tie-breaking by kickers is correct
- [ ] `compareHands` / a way to pick winner(s) at showdown, including exact ties (chopped pots)
- [ ] Exhaustive tests against known rankings + a few hand-picked tricky cases
- [ ] Fast enough to call in a tight Monte Carlo loop (benchmark noted in PR)

## Notes

Start **simple but correct**: enumerate the 21 five-card combinations of the 7 cards, rank each,
take the max. Plenty fast for a single-player trainer. Only move to a lookup-table / perfect-hash
evaluator if equity sims ([[0005-odds-equity-engine]]) actually feel slow — defer that
optimization. Lands in `packages/engine/src/evaluator.ts`. Depends on [[0001-card-primitives]].
