---
id: 0031
title: Make the coach's equity read multiway-aware
type: feature
status: todo
milestone: M3.5
priority: high
created: 2026-06-13
---

## Context

The coach currently estimates the hero's equity against **one** assumed villain — `coachDecision`
calls `estimateEquity`, which builds a two-seat spot (hero vs a single `COACH_ASSUMED_RANGE`). That
was correct for the heads-up CLI, but the TUI ([[0024-tui-ink-client]]) seats a full table (default
6-max). Equity against several opponents is **much lower** than heads-up — pocket aces are ~85%
heads-up but only ~55–60% against five hands — so at a multiway table the heads-up read would badly
**overstate** the hero's equity and mis-grade decisions (calling a multiway pot "good" on equity
that only holds one-on-one). Fix the read so the coach grades honestly at any table size.

## Acceptance criteria

- [ ] `coachDecision` estimates the hero's equity against the number of opponents actually live in
      the pot — `ctx.numActive - 1` villains, each on `COACH_ASSUMED_RANGE` — using the N-seat
      Monte-Carlo path the odds engine already supports, not a single assumed villain.
- [ ] Heads-up behaviour is unchanged (`numActive === 2` → one opponent → the current result); the
      read stays deterministic (fixed `COACH_SEED`).
- [ ] Tests across heads-up / 3-way / 6-way confirm the reported equity for a fixed hand **falls as
      opponents increase**, and that the good/leak verdict flips appropriately for a hand that is
      +EV heads-up but −EV multiway. `pnpm verify` green (coverage gate honoured).

## Notes

Depends on [[0007-coaching-engine]] (the coach) and is a prerequisite for honest multiway coaching
in [[0028-tui-coach-panel]] / [[0029-tui-session-loop]] — build it before the TUI seats more than
two. The single-villain build lives in `@holdem/bots` `handReading.ts` `estimateEquity` (a two-seat
`exactEquity`/`monteCarloEquity` spot); extend it (or add a coach-level multi-seat query) to put
`opponentCount` villain `rangeSeat`s in the spot. `monteCarloEquity` already takes an N-seat
`seats` array, so this is a bounded change, not a rewrite. `DecisionContext.numActive` gives the
live count.

Out of scope (note, don't do here): making the **bots** read their own equity multiway-aware. The
bots also currently assume a single villain, but they are deliberately _plausible, not optimal_
([../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md)), so a heads-up-flavoured bot read is
an acceptable simplification for now — flag it as a possible follow-up rather than widening this
ticket. This ticket is about the **coach's correctness for the learner**.
