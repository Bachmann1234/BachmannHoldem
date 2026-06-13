---
id: 0002
title: 7-card hand evaluator
type: feature
status: done
milestone: M0
priority: high
created: 2026-06-13
---

## Context

Given 7 cards (2 hole + up to 5 board), determine the best 5-card hand and return a value that
can be compared against any other hand. This is the most algorithm-heavy part of M0 and the
engine that both equity sims and showdown resolution rely on.

## Acceptance criteria

- [x] `evaluate7(cards: Card[]): HandValue` returns a totally-orderable score
- [x] Correctly ranks all 9 categories (high card → straight flush), incl. wheel (A-5) straights
- [x] Tie-breaking by kickers is correct
- [x] `compareHands` / a way to pick winner(s) at showdown, including exact ties (chopped pots)
- [x] Exhaustive tests against known rankings + a few hand-picked tricky cases
- [x] Fast enough to call in a tight Monte Carlo loop (benchmark noted below)

## Notes

Start **simple but correct**: enumerate the 21 five-card combinations of the 7 cards, rank each,
take the max. Plenty fast for a single-player trainer. Only move to a lookup-table / perfect-hash
evaluator if equity sims ([[0005-odds-equity-engine]]) actually feel slow — defer that
optimization. Lands in `packages/engine/src/evaluator.ts`. Depends on [[0001-card-primitives]].

## Resolution

Implemented in `packages/engine/src/evaluator.ts` (exported via the engine index):

- `evaluate7(cards)` enumerates the C(n,5) five-card combinations of a 5-, 6-, or
  7-card hand and keeps the best. `evaluate5(cards)` ranks an exact five.
- A hand's strength is a single packed integer `score` (`category·16^5` + five
  descending tie-break ranks) so plain `<`/`>`/`===` resolves category, kickers, and
  exact ties. `HandValue` also carries the decoded `category` + `ranks` for display.
- `compareHands(a, b)` and `pickWinners(hands)` — the latter returns all winning
  indices, so chopped pots fall out naturally.

**Tests** (`evaluator.test.ts`): per-category recognition, wheel + steel-wheel, kicker
tie-breaks, best-of-7 selection, showdown winners/chops, and an **exhaustive sweep of
all 2,598,960 distinct 5-card hands** asserting the textbook category frequencies.

**Benchmark** (compiled output, Node, MacBook): ~**4.8 µs per `evaluate7`**
(~0.21M 7-card hands/sec). Easily fast enough for the trainer's equity sims; the
perfect-hash / lookup-table evaluator stays deferred until equity actually feels slow.
