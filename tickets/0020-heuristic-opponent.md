---
id: 0020
title: HeuristicOpponent — equity + pot odds + personality → action
type: feature
status: todo
milestone: M2
priority: high
created: 2026-06-13
---

## Context

The headline deliverable of the epic ([[0006-heuristic-opponents]]): a real `Opponent` that plays a
hand by combining the three pieces the earlier tickets built — the equity read
([[0018-bot-hand-reading]]), pot-odds / EV decision math from `@holdem/odds`
(`potOdds`/`evOfCall`/`callIsProfitable`/`evOfBet`), and a `Personality`
([[0019-bot-personality]]) — into a legal `Action`. This is the ticket that satisfies all three of
the epic's acceptance criteria at once: range-based, equity+pot-odds-driven, behind the stable
`Opponent` seam.

## Acceptance criteria

- [ ] A `HeuristicOpponent` implementing the `Opponent` interface from [[0017-opponent-seam]],
      constructed from a `Personality` (and a seed for deterministic Monte-Carlo reads).
- [ ] Decision flow, given a `DecisionContext`: 1. Read equity via [[0018-bot-hand-reading]] against the personality-implied villain range. 2. Facing a bet: compare equity to `potOdds` / use `callIsProfitable` / `evOfCall` to decide
      fold vs call, and let **aggression** decide when to turn a call into a raise (and size it). 3. Unbet pot (can check): **aggression** + equity decide check vs bet, and the bet size (pot
      fraction from the personality), clamped to the legal `bet`/`raise` min/max.
      All returned actions are **legal** per `legalActions` (respect min/max, all-in caps, the
      reopen rule) — never construct an illegal action.
- [ ] The personality axes visibly change behaviour: a tight-passive bot folds marginal spots and
      rarely raises; a loose-aggressive bot continues wider and bets/raises more. Demonstrate this in
      tests (same spot, different personalities → different action distributions).
- [ ] Deterministic for a fixed seed (so tests and replays are stable).
- [ ] Unit tests: clear +EV call is called/raised, clear −EV fold is folded, a strong hand in an
      unbet pot gets bet by an aggressive bot and sometimes checked by a passive one; a full
      `HeuristicOpponent`-vs-`HeuristicOpponent` hand (and vs a reference bot) runs to completion with
      only legal actions across many seeds.

## Notes

Depends on [[0017-opponent-seam]], [[0018-bot-hand-reading]], [[0019-bot-personality]], and
[[0005-odds-equity-engine]]. Reuse the odds package for **all** equity and EV math — do not
re-derive pot odds or equity here.

This is where [LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md) matters most: aim for _plausible
over strong_. The bot should make believable, mostly-sensible decisions that are fun to play against
and produce good coachable spots — not exploit-proof, not a solver. Avoid degenerate, obviously
exploitable lines (e.g. only ever betting the nuts), but don't chase GTO — that's the deferred
[[0012-gto-solver]] dropping into this same seam later. Keep `packages/bots` pure; wiring a chosen
personality into the CLI/PWA play loop is a later/M4 concern, not part of this ticket.
