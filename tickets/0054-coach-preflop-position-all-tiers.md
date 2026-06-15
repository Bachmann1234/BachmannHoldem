---
id: 0054
title: Preflop coach — extend position-awareness beyond the marginal tier (incl. HU)
type: feature
status: todo
milestone:
priority: medium
created: 2026-06-14
---

## Context

`gradePreflop` only consults position for the **`marginal`** tier (`isLatePosition` feeds
`adviceFor`). `premium` / `strong` / `playable` always open; `trash` always folds —
identically at every seat and every table size ([[0022-coach-preflop-chart]]). The marginal
tier's position-awareness genuinely works (QJo/KTo/JTo correctly fold UTG and open CO/BTN —
verified, and a correction to an earlier review that thought it never fired). But everything
else being position-blind is wrong in **both** directions:

- **Too loose early.** `playable` speculative hands open from UTG at a 6-max table. Verified
  via a position sweep (`--button=0..5 --hero=r12 --seeds=1-120 --json`): 87s, 65s, 76s,
  A2s, A5s, 44, 66, JTs all grade `open` from UTG. A winning 6-max reg does not open
  87s/65s/76s/A2s/44 UTG — those are CO/BTN-or-fold.
- **Too tight late / heads-up.** `trash` never loosens, even on the button or in the blinds.
  Reproduced:

  ```
  pnpm sim -- --seats=2 --button=0 --hero=r6 --seed=6
  #   You [7s Kh]  BTN
  #   Starting hand: Trash — fold; it makes no money over time.
  #   Leak — the math pointed the other way.
  ```

  K7o (and A9o, T9o) on the button heads-up are trivially profitable opens; HU the button
  opens ~80%+ of hands. The chart also does not widen for HU vs 6-max (K7o = trash at BTN in
  both), and the blinds never get steal-defense / blind-vs-blind widening.

Net: the coach mis-teaches positional opening ranges — over-opening from EP and over-folding
from the button / blinds / heads-up.

## Acceptance criteria

- [ ] Position gates the **whole** opening range, not just the `marginal` tier: `playable`
      speculative hands fold from early position at a full table (no UTG 87s/65s/76s/A2s/44
      6-max), and the openable range widens through CO/BTN.
- [ ] `trash` can loosen in late position / the blinds so standard button & blind opens
      (K7o, A9o, T9o, etc.) are no longer graded `Trash`/`Leak`.
- [ ] Heads-up (and SB-vs-BB) uses a wider opening range than the 6-max chart — the single
      chart applied everywhere is the root of the HU false negatives.
- [ ] Verified via a `--button` sweep across positions and seat counts: a sample of hands
      grades the way a winning player opens them per position; the marginal-tier behavior
      that already works is preserved.
- [ ] New tests cover a hand graded across positions (EP fold → LP open) and the HU button
      widening; `pnpm verify` green.

## Notes

Child of [[0051-coach-fidelity-epic]] (GAP 2). Pairs naturally with
[[0053-coach-preflop-raise-aware]] (both make preflop grading context-aware) and with
[[0056-coach-rationale-not-absolute]] (the "makes no money over time" wording is exactly the
false-absolute this ticket exposes). Position is already in the `DecisionContext` /
`isLatePosition`; this is mostly widening which tiers consult it plus a HU/blind range. Note
this also touches the viewable starting-hand chart ([[0050-starting-hand-chart-view]]) —
keep the displayed chart and the grader consistent. Deterministic + pure as today.
