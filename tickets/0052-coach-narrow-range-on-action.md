---
id: 0052
title: Postflop coach — narrow the assumed villain range on the betting line
type: feature
status: done
milestone:
priority: high
created: 2026-06-14
---

## Context

The postflop coach reads the hero's equity against a **static** assumed range
(`COACH_ASSUMED_RANGE`, currently `'medium'`) that **never changes no matter how the
villain bets** ([[0021-coach-decision-verdict]]). So when a villain fires multiple streets
into a scary board, the coach's equity estimate stays flat or even _rises_ (the hero's hand
"improves" against a wide range as the board pairs/connects), the exact opposite of how a
hand's real equity moves against someone who keeps betting. The coach then tells the hero
the call is correct and worth chips.

Concrete, reproduced via the ground-truth harness (hero equity vs the villain's _actual_
cards):

```
pnpm sim -- --seed=28 --seats=2 --hero=c,c,c,c,c
# river, hero Kc 3d (bottom pair) on 5d 3s 7s 6h 8h, villain has barreled all three streets:
#   Coach: Equity 65.2%  vs pot odds 30.3%  EV(call) +23  →  continue / Good
#   Ground truth (vs actual cards): equity 0.0%  →  ⚠ Coach diverges from ground truth
```

A sweep quantifies the leak: across seeds 1–60 heads-up, ~8% of priced postflop decisions
are "misleading" against ground truth, and they skew ~6:1 toward _over-calling_ (coach says
continue when the EV-correct play is fold). This is the single most expensive thing a
beginner could learn from the coach — it manufactures calling stations.

## Acceptance criteria

- [x] The postflop equity read narrows the assumed villain range as a function of the
      betting line — at minimum: tighter after a villain bet/raise, tighter still after
      multiple barrels and/or large sizing — instead of always using the static
      `COACH_ASSUMED_RANGE`.
- [x] The narrowing is deterministic (seeded, same `(ctx, action)` → same verdict) so the
      coach stays a stable, testable asset ([[0021-coach-decision-verdict]]).
- [~] On the seed-28 line (and similar barreled spots), the coach no longer grades calling
  down a clearly-beaten hand as `good` / EV-positive. **Partially — see Resolution.**
  The seed-28 equity read collapsed (river 65.2% → 36.4%, turn 57.8% → 41.9%), but the
  literal spot still grades `Good`: against the tightest _preflop_ bucket (`ultraTight` =
  AA-JJ/AK) bottom pair on a low coordinated board genuinely retains ~36% equity (it beats
  the AK-high combos), so a non-board-aware range cannot fold it. The good→leak flip is
  proven on an ace-high spot; the structural fix is filed as [[0057-coach-board-aware-range]].
- [x] A `pnpm sim --seeds=1-60 --json` ground-truth sweep shows the share of "misleading"
      priced postflop spots fall materially vs today's baseline (record before/after numbers
      in the PR). **Before: 14/180 (heads-up, seeds 1-60). After: 11/180** (−21%; the
      over-call direction the leak skews toward fell most). Bounded by the five preflop
      `RangeWidth` buckets — deeper reductions need [[0057-coach-board-aware-range]].
- [x] The bots are reconsidered in step (or the divergence justified): the coach aliases the
      bots' `DEFAULT_RANGE_WIDTH`, so decide whether the narrowing lives in the shared read
      (tightening both) or only in the coach, and document why. **Coach-only**, justified in
      the `COACH_ASSUMED_RANGE` doc comment: bots pick width by personality and are tuned for
      fun/believable play; the unbet baseline stays aliased so the "no read" prior is shared.
- [x] Existing coach/bot tests stay green; new tests cover the narrowed read on a barreled
      line; `pnpm verify` green.

## Resolution

`assumedRangeForLine(ctx)` (in `packages/coach/src/verdict.ts`) picks the assumed villain
width deterministically from the betting line: an unbet pot keeps the `'medium'` baseline; a
bet/raise narrows to `'tight'`; a large bet (≥ `LARGE_BET_POT_FRACTION` = 0.6 of the pot the
bet faced, i.e. `toCall / (pot − toCall)`) **or** any turn/river bet narrows to `'ultraTight'`.
The narrowing is coach-only (bots untouched). Known ceiling: the buckets are preflop opening
ranges with no board awareness, so a beaten single pair can still out-equity an `ultraTight`
range that contains AK-high on a low board — the residual misleads and the literal seed-28
grade. Follow-up: [[0057-coach-board-aware-range]].

## Notes

Highest-leverage child of [[0051-coach-fidelity-epic]] — the root cause behind the
calling-station finding. Note the standing project view that "bots-as-spine is the weak
pillar": the static range is exactly that weakness, shared by coach and bots. Building a
read-narrowing function also doubles as a baseline for any future per-villain read the
verdict's docstring already anticipates ("a future ticket may let the caller narrow this
with a read"). The harness's ground-truth check ([[0030-cli-headless-harness]]) is the
acceptance instrument. Keep the equity read pure (`@holdem/odds` / `@holdem/bots`), no I/O.
