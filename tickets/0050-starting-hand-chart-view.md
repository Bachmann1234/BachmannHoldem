---
id: 0050
title: Viewable starting-hand chart (the chart the coach references)
type: feature
status: done
milestone:
priority: medium
created: 2026-06-14
---

## Context

The coach refers to "the chart" (its preflop verdicts say things like "premium tier — always open")
and the Foundations **ranges** lesson says _"a starting-hand chart is just those tiers written
down"_ — but the chart was never **viewable** anywhere. It lived only as data in `@holdem/coach`
(`PREFLOP_CHART` + `classifyStartingHand`). This makes it visible: the classic **13×13 grid**, each
cell coloured by its strength tier, reachable both while learning and while playing.

No new poker math — the grid is enumerated from the existing `classifyStartingHand`, so the visible
chart can never disagree with how the live coach grades a hand.

## Acceptance criteria

- [x] `@holdem/coach` exports a pure `startingHandChart(): ChartCell[][]` (+ `CHART_RANKS`,
      `ChartCell`) — the 13×13 grid (pairs on the diagonal, suited upper-right, offsuit lower-left),
      each cell labelled (`"AA"`/`"AKs"`/`"AKo"`) and tagged with its `PreflopTier`, read from
      `classifyStartingHand` (same source of truth as the live coach). Tested.
- [x] A PWA chart view renders the grid coloured by tier with a tier legend, in the M4.5 design
      language (token system, no forked palette). Accessible (labelled dialog, close + Escape).
- [x] Reachable from the **Learn** section (a reference entry) **and** from the coach's **preflop
      verdict** in the play drawer (a "see the chart" affordance).
- [x] Tests cover the new entry points open/close the chart; `pnpm verify` green.

## Notes

User-requested between milestones (the coach kept citing a chart with no way to see it). Keep the
enumerator pure in `@holdem/coach` ([[0022-coach-preflop-chart]]) so both shells + the primer can
reuse it; the chart view itself is PWA UI. A single overlay component serves both entry points
(Learn reference + the coach drawer's preflop body) rather than two parallel views.
