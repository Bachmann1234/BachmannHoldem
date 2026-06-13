---
id: 0001
title: Card / deck primitives
type: feature
status: done
milestone: M0
priority: high
created: 2026-06-13
---

## Context

The foundational types every other package depends on. Cards need a representation that's cheap
to copy/store and friendly to a future bitmask hand evaluator.

## Acceptance criteria

- [x] `Card` encoded as an integer 0..51 (rank = `card % 13`, suit = `card / 13`)
- [x] `makeDeck()` returns 52 unique cards
- [x] `parseCard` / `formatCard` round-trip; `parseCards` for lists
- [x] `rankOf` / `suitOf` / `rankIndex` / `suitIndex` accessors
- [x] Unit tests passing

## Notes

Implemented in `packages/engine/src/card.ts`. Encoding is deliberately hidden behind helpers so
nothing downstream depends on the integer layout. Enables [[0002-hand-evaluator]].
