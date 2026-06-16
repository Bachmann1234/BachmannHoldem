---
id: 0081
title: Per-concept mastery + adaptive difficulty, and a beginner cheat-sheet
type: feature
status: todo
milestone: M5.5
priority: low
created: 2026-06-16
---

## Context

The drill generator picks pot sizes, prices, and seat geometry by uniform random
(`POT_BUCKETS`, `PRICE_FRACTIONS`) — it never gets harder as you improve or easier when you
struggle, and `DrillConfig` has no difficulty knob at all. There is also no per-concept mastery
signal (the session summary is per-session, counts-only) and the glossary is just **6 terms** —
thin for a true beginner whose whole value prop is number sense (learning-app review, 2026-06-16).

## Acceptance criteria

- [ ] **Per-concept mastery** tracked across sessions (e.g. "pot-odds: 70% over 40 reps"), surfaced
      so the learner sees progress — builds on the persistence from
      [[0080-drills-spaced-repetition]].
- [ ] **Adaptive difficulty**: a difficulty input on `DrillConfig` that weights spot selection
      toward weak concepts / harder parameters as mastery rises (and eases when it drops), replacing
      pure uniform-random selection.
- [ ] **Grow the glossary toward a cheat-sheet**: expand beyond the current 6 terms and add a
      pot-odds → equity quick-reference table (the rule-of-2-and-4 / common bet-size → required-equity
      pegs) as a reference surface reachable from drills and the coach.
- [ ] Deterministic where seeded; tests cover mastery aggregation and difficulty weighting; purity
      preserved in the pure package.

## Notes

Part of [[0076-drills-v2]]; lowest priority in the epic (polish/retention depth) and depends on the
mistake persistence in [[0080-drills-spaced-repetition]] for mastery state. The cheat-sheet/glossary
expansion extends `glossaryTerms.ts` / `GlossaryOverlay` and complements the drill feedback
cross-links in [[0079-drills-feedback-depth-and-crosslinks]]. Per-concept mastery overlaps M6 stats
([[0010-stats-and-leak-detection]]) — share the storage/aggregation rather than duplicating it.
