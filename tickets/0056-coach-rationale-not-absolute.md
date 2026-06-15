---
id: 0056
title: Preflop coach — stop stating tier rationales as absolutes
type: chore
status: done
milestone:
priority: low
created: 2026-06-14
---

## Context

The preflop chart attaches one fixed rationale string per tier ([[0022-coach-preflop-chart]])
and prints it verbatim regardless of position, seat count, or the action faced. Some of
those strings are stated as **universal truths** that are actually position/format-dependent
and sometimes flatly false:

- `Trash — fold; it makes no money over time.` — printed for K7o/A9o/T9o on the button
  heads-up, which are profitable opens (see [[0054-coach-preflop-position-all-tiers]]).
- `Marginal hand — open only in late position; fold to pressure.` — printed above a `Good`
  verdict when the hero _calls_ pressure (see [[0053-coach-preflop-raise-aware]]).

A confidently-wrong absolute is worse than a hedged one for a beginner: they internalize
"this hand makes no money" as a rule.

## Acceptance criteria

- [x] Tier rationale wording is tied to the **position/action-adjusted advice** the grader
      actually gives, not a fixed per-tier label — so the sentence the player reads never
      contradicts the verdict or asserts a false universal. `openFoldRationale` now produces the
      advice wording for every `(tier, position, advice)`; `TIER_RATIONALE` is a pure _strength_
      descriptor with no absolute advice claim.
- [x] Specifically: no "makes no money over time" on a hand the (position-aware) grader would
      open; no "fold to pressure" printed above a graded-Good call of pressure. Also fixed the
      _inverted_ trap (caught in review): the never-open junk tail (72o) no longer claims it
      "opens later" — only genuine steal-range trash (K7o) says it steals when folded to in a
      late/blind seat.
- [x] The viewable starting-hand chart ([[0050-starting-hand-chart-view]]) stays consistent
      with whatever wording the grader emits — the chart view (`ChartOverlay`) renders neutral
      one-word strength labels ("Premium"…"Trash"), never advice prose, so it can't contradict
      the grader; left unchanged.
- [x] Tests assert the rationale matches the advice for a few position/action permutations;
      `pnpm verify` green.

## Resolution

`TIER_RATIONALE` is now a strength-only descriptor; `openFoldRationale(tier, position, advice,
canStealLater)` is the single source of the position/action-relative advice wording on the unraised
path (the facing-raise path was already self-consistent from [[0053-coach-preflop-raise-aware]]).
No emitted line contradicts the verdict or asserts a universal the position-aware grader breaks in
either direction. The viewable chart was already neutral, so it needed no change.

## Notes

Child of [[0051-coach-fidelity-epic]] — mostly a copy/wording follow-on that lands cleanly
**after** [[0053-coach-preflop-raise-aware]] and [[0054-coach-preflop-position-all-tiers]]
make the advice itself context-aware (the wording should follow the corrected advice, not
lead it). Low priority / small, but it's the difference between a coach that hedges
appropriately and one that teaches false rules with confidence.
