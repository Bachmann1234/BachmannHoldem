---
id: 0018
title: Equity-based hand reading for bots (the perception layer)
type: feature
status: todo
milestone: M2
priority: high
created: 2026-06-13
---

## Context

A bot decides by answering "how good is my hand _right now_?" — and the epic mandates that the
answer come from **the equity engine + pot odds** ([[0006-heuristic-opponents]]), not a hand-rolled
strength table. This ticket is the perception layer: given the bot's own hole cards, the board, and
an **assumed opponent range**, estimate the bot's equity by reusing `@holdem/odds` (`exactEquity` /
`monteCarloEquity` / `parseRange`). The policy layer ([[0020-heuristic-opponent]]) then turns that
equity number, with pot odds, into an action.

The bot cannot see villain's cards, so unlike the odds package's known-vs-known oracle, the bot
must reason against a **range**. That is exactly what `monteCarloEquity` with a `rangeSeat` and
`parseRange` already supports — this ticket wires hole-cards + board + an assumed range into an
equity estimate, choosing exact enumeration vs Monte Carlo appropriately (e.g. exact when the board
is far enough along to be cheap, sampled otherwise), and keeping it deterministic via a passed seed.

## Acceptance criteria

- [ ] A function (e.g. `estimateEquity({ holeCards, board, opponentRange, seed, ... })`) returning the
      bot's equity as a `HandEquity`-style fraction in `0..1`, computed **entirely via `@holdem/odds`**
      (no re-implementing equity). Reuse `exactEquity`, `monteCarloEquity`, `parseRange`,
      `rangeSeat`/`fixedSeat`.
- [ ] Sensible exact-vs-Monte-Carlo selection (documented): cheap enough to enumerate → exact;
      otherwise a bounded, seeded `monteCarloEquity` so results are deterministic and fast.
- [ ] A reasonable default "opponent range" abstraction so the policy layer has something to read
      against (e.g. a few named ranges, or a width parameter the personality can later tighten/widen
      — coordinate the exact shape with [[0019-bot-personality]]). Preflop and postflop both work.
- [ ] Range cards that collide with the bot's cards / board are handled (the MC sampler already
      rejects per-iteration collisions; ensure inputs are well-formed and document the behaviour).
- [ ] Unit tests on known spots: a monster (e.g. top set on a dry board) reads as high equity vs a
      reasonable range; a weak hand reads low; a known preflop matchup lands near its textbook number
      within Monte-Carlo tolerance; results are reproducible for a fixed seed.

## Notes

Depends on [[0017-opponent-seam]] (the `DecisionContext` it reads from) and
[[0005-odds-equity-engine]] (the math it must reuse, not duplicate). Keep this layer about _reading
the hand_ — no betting decisions here; those are [[0020-heuristic-opponent]].

Per [LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md), aim for _plausible_ equity reads, not
perfect ones — the bots should be believable opponents and clean decision-point generators, not
solvers. An assumed-range model that is roughly right is the goal.
