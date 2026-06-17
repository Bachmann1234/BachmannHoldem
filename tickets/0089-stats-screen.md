---
id: 0089
title: Stats screen + nav (play stats + leaks + drill mastery readout)
type: feature
status: todo
milestone: M6
priority: medium
created: 2026-06-16
---

## Context

The M6 user-facing surface ([[0010-stats-and-leak-detection]]): a **Stats** screen that turns the
aggregated play stats ([[0087-play-stats-aggregation]]) and detected leaks ([[0088-leak-detection]])
into the "analyze my hands" experience, alongside the **drill-side mastery readout** that already
exists. The ROADMAP frames "Analyze my hands" as one of the three co-equal ways to get better
(beside Play and Drills, which are tabs), so Stats becomes the **4th top-level tab**.

## Acceptance criteria

- [ ] A `StatsView` (in `apps/pwa/src/components/`) reachable as a new `'stats'` top-level tab: extend
      `TabBar`'s `Tab` union + the tab list, and add a `StatsBranch` render path in `App.tsx`
      (matching the existing `LearnBranch` / `DrillsBranch` shape), reusing the stores `App` already
      creates (`historyStore` for play stats, `drillProgressStore` for mastery).
- [ ] **Play-side section:** renders VPIP / PFR / aggression / fold-to-3bet (overall, with the
      by-position breakdown available), each showing its **sample size** ("over N hands"), reading
      through `HandHistoryStore.list()` → [[0087-play-stats-aggregation]]. Async read degrades to an
      inline notice on failure (never a crash) — mirror `HistoryView`'s load-state handling.
- [ ] **Leaks section:** renders [[0088-leak-detection]] results — confirmed leaks shown plainly, and
      **below-sample candidates shown as a "need N more hands" cue**, never as a confirmed leak. The
      empty / not-enough-data state reads as encouraging ("keep playing — N hands so far"), not blank.
- [ ] **Drill-side section:** surfaces the existing per-concept mastery readout by **reading
      `drills/mastery.ts`** (`masteryByConcept` / `formatMastery`) over the drill store — **no
      re-aggregation**. Read-only here; this is the unified "how am I doing" home, the Drills lobby
      keeps its own inline readout.
- [ ] Matches the established PWA design idioms (the existing CSS/components, glossary/jargon
      affordances where stat names appear) — it should read as part of the same app, not a bolt-on.
- [ ] Tests (`StatsView.test.tsx` + an `App.nav`-style test) cover: the tab navigates, populated
      stats render with samples, the below-sample leak cue renders instead of a confirmed leak, and
      the empty state renders. `pnpm verify` fully green.

## Notes

**Nav placement decision.** Stats is the 4th tab (Play / Learn / Drills / Stats). The bottom `TabBar`
only shows on lobby surfaces; the Stats screen is a lobby surface (like the Drills lobby), so it shows
the tab bar. Keep the Play `Session` mounted across tab switches exactly as today (the `display:
contents/none` trick in `App.tsx`) — switching to Stats must not tear down a live hand.

**This is the integration ticket — surface, don't compute.** All the math is done in
[[0087-play-stats-aggregation]] / [[0088-leak-detection]] (play) and `drills/mastery.ts` (drills).
This ticket only reads those and renders. If a number needs a new derivation, that belongs in the
aggregation module, not the component (keep the component a thin wiring layer, like `DrillsBranch`).

**Sample-size honesty is the whole point (the learning doc).** The UI must make a thin sample read as
thin — show the "over N hands" denominator next to every stat and the "need N more hands" cue for
pending leaks. Never render a confirmed-leak treatment for a below-sample candidate. This is the
visible payoff of the gating built in [[0088-leak-detection]]; don't undermine it in the view.

**Glossary reuse.** Stat names (VPIP, PFR, aggression factor, fold-to-3bet) are jargon — reuse the
existing glossary-term affordance (`GlossaryText` / `glossaryTerms.ts`) so a learner can tap to learn
what each means, consistent with how the rest of the app handles jargon. Add any missing terms there.
