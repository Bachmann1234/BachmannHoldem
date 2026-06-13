---
id: 0022
title: Preflop hand-strength chart guidance
type: feature
status: done
milestone: M3
priority: high
created: 2026-06-13
---

## Context

Preflop, equity-vs-a-range is a fuzzy guide and players need a crisp, memorable rule: a
**chart-based** starting-hand classification. Given the player's two hole cards, classify the
holding into a strength tier and give plain open/fold guidance — the kind of starting-hand chart a
beginner actually internalises. This is the deterministic preflop half of the coach
([../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md): teach the principle, not a solver
output).

## Acceptance criteria

- [x] A pure function in `packages/coach` that maps a two-card starting hand to a strength tier
      (e.g. premium / strong / playable / marginal / trash) plus a short human-readable rationale,
      driven by a **chart** (a declared table of hand classes), not an ad-hoc equity sim.
- [x] Handles the standard starting-hand groupings: pocket pairs, suited vs offsuit, broadways,
      suited connectors, and the long tail of trash.
- [x] Exported from `src/index.ts`; co-located `*.test.ts` pins representative hands per tier
      (AA/KK premium, suited connectors playable, 72o trash, etc.); `pnpm verify` green above the
      coverage thresholds.

## Notes

Depends on [[0021-coach-decision-verdict]] (same package). Reuse the range syntax and combo
machinery already in `@holdem/bots` `handReading.ts` — the `RANGE_TEXT` width tables and
`parseRange`/combo matching are a ready basis for declaring the chart's hand classes; prefer
expressing tiers as ranges and testing membership over hand-rolling rank comparisons. Match the
house style (heavy doc comments, `.js` specifiers, `RangeError` on malformed input). Feeds
[[0023-coach-cli-wiring]].

Keep it chart-based and deterministic — the chart is a teaching artifact, so the tiers and the
rationale strings matter as much as the classification. No equity simulation is required for the
classification itself.
</content>
