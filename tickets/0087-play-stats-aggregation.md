---
id: 0087
title: Play-side stats aggregation (VPIP / PFR / aggression / fold-to-3bet, overall + by position)
type: feature
status: done
milestone: M6
priority: high
created: 2026-06-16
---

## Context

The first M6 acceptance criterion ([[0010-stats-and-leak-detection]]): aggregate the hero's stored
hand history into the core HUD stats — **VPIP**, **PFR**, **aggression factor**, **fold-to-3bet** —
both **overall** and **by position**. This is the read-side projection the Stats UI
([[0089-stats-screen]]) renders and leak detection ([[0088-leak-detection]]) reasons over.

## Acceptance criteria

- [x] A pure module (`apps/pwa/src/history/stats.ts`) that projects `HandHistoryRecord[]` →
      aggregated stats. **No new store, no second aggregation pass** — a pure function of the records
      the existing `HandHistoryStore.list()` returns, exactly the way `drills/mastery.ts` projects the
      drill store's records.
- [x] Computes, **overall** and **broken down by `Position`**: VPIP, PFR, aggression factor
      ((bets+raises)/calls), and fold-to-3bet. Each stat carries its **sample size** (the count it was
      computed over) alongside the value, so a thin sample is visible as thin (mirrors
      `ConceptMastery.reps`).
- [x] Position is derived by **reusing `classifyPosition` / `Position` from `@holdem/coach`** (the
      5-bucket `early`/`middle`/`late`/`small-blind`/`big-blind` model), fed from the record's
      `buttonIndex` + `heroSeat` + `seatCount`. Do **not** reinvent position arithmetic.
- [x] Records lacking the v2 fields ([[0086-history-record-position-facing]]) — old v1 records with no
      `buttonIndex` / facing context — are **excluded** from the position and fold-to-3bet aggregates
      (counted only where their data supports it), never crashing the aggregation.
- [x] Co-located unit tests (jsdom-free) over hand-crafted record arrays: VPIP/PFR/AF math, the
      fold-to-3bet derivation, the by-position split, empty input, and v1-record tolerance.
- [x] `pnpm verify` fully green.

## Notes

**The stat definitions (be exact).**

- **VPIP** — share of hands where the hero voluntarily put money in preflop: a `call`/`bet`/`raise`
  in `decisions` filtered to `preflop`. Blind posts are never in `decisions`, so they correctly don't
  count (see the record doc).
- **PFR** — share of hands with a preflop `bet`/`raise`.
- **Aggression factor** — `(bets + raises) / calls` counted across **all** streets from `decisions`.
  Define the `calls === 0` case explicitly (e.g. report the raw counts + a guarded ratio; don't emit
  `Infinity`/`NaN` into the UI).
- **Fold-to-3bet** — of the hands where the hero open-raised preflop and then **faced a re-raise**
  (a later preflop decision whose faced bet level exceeds the hero's own raise-to amount — see the
  facing context captured in [[0086-history-record-position-facing]]), the share where the hero
  folded. The denominator is "faced a 3bet after opening", not "all hands".

**Reuse, don't reinvent (the epic is explicit).** Play-side stats come from the hand-history log;
drill-side mastery already lives in `drills/mastery.ts` and is **not** re-aggregated here. Position
comes from `@holdem/coach`'s `classifyPosition`. This module is the play-side analog of `mastery.ts`:
a pure view over a store's records, the single place these numbers are computed.

**Sample size travels with every number.** Don't gate _here_ (that's [[0088-leak-detection]] /
[[0089-stats-screen]]'s job for actionable claims) — but every returned stat must carry the `n` it
was computed over so the consumer can gate and the UI can show "over N hands". This mirrors
`ConceptMastery.reps` carrying the denominator.

**Shape it for both consumers.** Return a structured result the leak detector ([[0088-leak-detection]])
can reason over (overall + per-position stats with samples) and the UI ([[0089-stats-screen]]) can
render directly. Keep it plain data; no formatting strings here (formatting is the UI's job, like
`formatMastery` sits next to `masteryByConcept`).
