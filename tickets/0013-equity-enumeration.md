---
id: 0013
title: Exact equity by board enumeration (the oracle)
type: feature
status: done
milestone: M1
priority: high
created: 2026-06-13
---

## Context

The first slice of the odds engine ([[0005-odds-equity-engine]]) and the correctness oracle for
everything downstream. Given fully-known hole cards for two or more players and a partial board,
compute **exact** equity (win% / tie%) by enumerating every completion of the board from the
remaining deck and scoring each with the engine evaluator. Slower than Monte Carlo but exact, so
it is the reference the simulator is tested against.

## Acceptance criteria

- [x] New pure-TS package `packages/odds` (`@holdem/odds`), mirroring the engine's conventions
      (package.json/tsconfig shape, `.js` import specifiers, co-located `*.test.ts`, no UI/network deps).
- [x] `exactEquity({ hands, board })` enumerates the remaining-deck completions and returns each
      seat's `{ win, tie, equity }` (equity = win + tie/ties-share), summing to 1 across seats.
- [x] Works from an empty board (preflop, 2 known hands) through turn (1 card to come).
- [x] Validates inputs: no duplicate cards across hands+board, legal board sizes (0/3/4/5).
- [x] Unit tests against textbook spots (e.g. AA vs KK preflop ≈ 82/18; a known coin-flip;
      a locked/dead hand at 0%; an exact tie split).

## Notes

Depends on [[0002-hand-evaluator]]. Keep the equity types (`HandEquity`, `EquityRequest`) here as
the shared shape Monte Carlo ([[0014-monte-carlo-equity]]) and the worker reuse.
