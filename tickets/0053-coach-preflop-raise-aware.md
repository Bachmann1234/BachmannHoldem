---
id: 0053
title: Preflop coach — grade facing a raise/3-bet differently from opening
type: feature
status: done
milestone:
priority: high
created: 2026-06-14
---

## Context

`gradePreflop` ([[0022-coach-preflop-chart]]) grades a preflop continue **purely from the
hole-card tier** — `advice = adviceFor(tier, isLatePosition)`. The size of the bet the hero
faces, whether it is a raise, and whether it is a 3-bet are **never inputs**. The chart is
an _opening_ chart applied unchanged to spots where the hero is _calling_ a raise, so it
blesses loose cold-calls that a winning player snap-folds. The module docstring admits it:
"the chart is an opening chart, so this also lets a charted hand continue facing a raise."

Reproduced live with the harness (`--button` puts the hero in the BB, `--villain` makes the
opponent open-raise so the hero faces it):

```
pnpm sim -- --seats=2 --button=1 --villain=1:r12 --hero=c --seed=39
#   Bot 1 raises 12.  /  You calls.   (hero 6 4s, out of position)
#   Starting hand: Marginal hand — open only in late position; fold to pressure.
#   Good — your action agreed with the math.        <-- blesses calling a 6x raise OOP
```

```
pnpm sim -- --seats=2 --button=1 --villain=1:r20 --hero=c --seed=49   # QTo calls 10x OOP → Good
pnpm sim -- --seats=2 --button=1 --villain=1:r12 --hero=c --seed=32   # 33 cold-calls 12bb OOP → Good
```

The rationale string ("fold to pressure") directly contradicts the verdict ("Good") on a
call _of_ pressure. A beginner is taught to flat raises and 3-bets with marginal,
speculative, and dominated hands out of position at prices up to 10x — a premier beginner
leak, actively reinforced.

## Acceptance criteria

- [x] `gradePreflop` detects when the hero is facing a raise/3-bet (a `toCall` larger than a
      limp / the big blind) and grades against a **defend** standard, not the open chart.
      Detect: `ctx.currentBet > ctx.bigBlind`; size: `round(currentBet / bigBlind)` in BB.
- [x] The continue range tightens with the price faced: a small (~3x) raise keeps a
      reasonable flatting range; a large raise (≥ ~5–6x) or any 3-bet collapses to a
      value/3-bet-or-fold range. Out-of-position cold-calls of speculative junk are graded
      as leaks. Two regimes via `LARGE_RAISE_MIN_BB`=5 / `THREE_BET_MIN_BB`=9 in
      `facingRaiseAdvice`; the `playable` thin flat survives only in position.
- [x] The rationale string matches the verdict — no "fold to pressure" printed above a
      `Good` for a call of pressure. The facing-raise path emits a rationale built from the
      defend decision made. (Full rationale-follows-advice generalisation across the
      _unraised_ path is [[0056-coach-rationale-not-absolute]].)
- [x] Verified on the seed-39 / seed-49 / seed-32 spots above (and a few 6-max equivalents
      via `--villain`): the loose OOP calls now grade as leaks; legitimate defends (e.g. a
      strong hand 3-betting, a pair/broadway calling a small raise in position) still grade
      `good`.
- [x] New tests cover open vs facing-raise for the same hand; `pnpm verify` green.

## Notes (resolution)

`facingRaiseAdvice(tier, raiseBb, latePosition)` in `packages/coach/src/preflop.ts` is the
defend standard; `gradePreflop` routes to it when `currentBet > bigBlind` and keeps the
opening chart otherwise. Deferred / known limitations (not blockers):

- The heads-up BB-defend "in position" rationale wording is wrong because `isLatePosition`
  treats both heads-up seats as late — handed to [[0054-coach-preflop-position-all-tiers]]
  (the position ticket), which corrects HU position handling at its source.
- A sub-min-raise all-in (raise < ~2x) routes through the defend standard and can over-fold;
  rare in this app's deep-stacked spots, noted for a later pass.
- The curriculum (`gradeSpot`) hardcodes `toCall: 0` for preflop spots, so lessons cannot yet
  author a _facing-a-raise_ drill — a curriculum authoring gap, not a coach defect.

## Notes

Child of [[0051-coach-fidelity-epic]] (GAP 1). The `DecisionContext` already carries the
pot/`toCall` the postflop coach uses, so the "are we facing a raise, and how big" signal is
available without new plumbing. A full defend chart is solver territory; a tiered
price-gated rule (keep pairs/strong aces/broadways vs small raises; fold speculative offsuit
junk; require position for thin flats) is enough to stop the confidently-wrong grades. Keep
it deterministic and pure like the rest of the chart.
