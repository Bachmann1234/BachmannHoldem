---
id: 0088
title: Leak detection with mandatory sample-size gating
type: feature
status: todo
milestone: M6
priority: high
created: 2026-06-16
---

## Context

The second and third M6 acceptance criteria ([[0010-stats-and-leak-detection]]): turn the aggregated
stats ([[0087-play-stats-aggregation]]) into **named, actionable leaks** ("you over-fold the big
blind"), and — the load-bearing pedagogy guard — **never surface a leak below a minimum sample
size**, ideally with a "need N more hands" confidence cue. This is the single most important
correctness property of the milestone: per `docs/LEARNING-APPROACH.md`, _flagging a "leak" on too few
hands is worse than saying nothing_ — HUD stats are noise on small samples.

## Acceptance criteria

- [ ] A pure module (`apps/pwa/src/history/leaks.ts`) that takes the [[0087-play-stats-aggregation]]
      stats and returns a list of detected leaks, each with: a stable id/key, a human-readable
      description, the offending stat + its value, and the **sample size** it was judged on.
- [ ] **Sample-size gate (mandatory).** A leak is never returned as _actionable_ unless the specific
      stat it keys off meets a minimum sample threshold. A named exported constant (the analog of
      `MASTERY_REPS_THRESHOLD` in `drills/mastery.ts`) defines the threshold; mirror that discipline.
- [ ] **Confidence / "need N more hands" cue.** For a stat that is trending leak-ward but still below
      sample, the module reports it as **pending/insufficient-sample** (with how many more hands are
      needed), distinct from "no leak" and from "confirmed leak" — so the UI can show the cue rather
      than either crying wolf or staying silent.
- [ ] At least the canonical leaks the epic names are detectable when sample + thresholds are met:
      over-folding the big blind (fold-heavy BB), and at least one of {too-passive / low aggression,
      too-loose VPIP, too-tight VPIP}. Keep the rule set small and honest, not exhaustive.
- [ ] The gate applies to **both** play-side leaks here and is consistent with the drill-side
      discipline (`difficultyForMastery` already gates on a minimum rep sample) — don't claim "you've
      mastered X" / "you have a leak in X" on a thin sample on either side.
- [ ] Co-located unit tests: a leak fires above sample, the same stat **does not** fire below sample
      (returns pending with the right "N more" count), and the no-leak case.
- [ ] `pnpm verify` fully green.

## Notes

**This is where the milestone's pedagogy lives — get the gate right.** The thresholds are tunable
knobs (document them like `mastery.ts` documents `MASTERY_REPS_THRESHOLD` / `MASTERY_HARD_THRESHOLD`),
but the _structure_ — three states (confirmed / pending-insufficient-sample / clear) per candidate
leak — is the requirement. Don't collapse "below sample" into "no leak"; the whole point is to tell
the learner _"keep playing, I need N more hands before I can call this."_

**Pure rules over the stats, not a re-read of the records.** Consume the
[[0087-play-stats-aggregation]] result; do not re-aggregate the hand log. Keep it plain data
(ids/values/samples) — the UI ([[0089-stats-screen]]) owns the copy/formatting, the same seam split
as `masteryByConcept` (data) vs `formatMastery` (strings).

**Honest framing (the learning doc).** A leak is a decision-quality signal, not a scolding. Phrase
descriptions as coachable tendencies tied to a stat the learner can see, and keep them few — a couple
of well-gated, true leaks beat a wall of speculative ones.
