---
id: 0062
title: Make the coach's verdict math archetype-aware (per-villain reads)
type: feature
status: done
milestone: M4
priority: medium
created: 2026-06-15
---

## Context

The coach now _names_ each opponent's archetype in its on-demand table read
([[0061-pwa-anonymized-opponents-and-table-read]]), but its actual verdict **math** still grades
against a single generic villain range derived only from the betting line — it does not consume
`botKind`. So it'll tell you "Nia is a calling station" yet still grade your thin value bet against a
balanced range, not a station's call-everything range. `packages/coach/src/verdict.ts` already
carries a TODO for exactly this ("a future ticket may layer a per-villain read").

## Acceptance criteria

- [x] The coach can take the live opponents' archetypes (or the relevant villain's) as an input.
      Optional `villainArchetype?` param on `coachDecision` (coach-local `VillainArchetype` type, no
      session import — keeps the session→coach→bots direction). Absent ⇒ byte-identical line-only grade.
- [x] The assumed range / call probabilities shift by archetype (e.g. station → wider calling range,
      reward thinner value and fewer bluffs; rock → tighter, reward more folds and more steals).
      station/lag → +1 tier (wider), rock → −1 (tighter), tag → 0; plus a ±0.05 bluff-fraction nudge on
      the barrel call-down. Directions mirror the `BOT_TIPS` narration.
- [x] Heads-up and multiway both handled (which villain's read applies postflop is part of the design).
      Selection lives in the reducer (coach stays pure): heads-up → the lone villain; multiway facing a
      bet → the aggressor (largest current-street commit, ties to lowest seat); multiway unbet → none
      (line-only).
- [x] Existing coach tuning/tests stay green; new behaviour is covered and the shift is bounded (a
      read nudges the range, it doesn't swing the verdict wildly). Bound is structural: ±1 tier / ±0.05,
      clamped at the poles. Tuning sweep: station read stays ~+1.9pp of the line-only misleading rate,
      inside the 0059-validated band; tag is byte-identical; rock improves fidelity.
- [x] Purity preserved — the archetype is passed in; the coach stays a pure function of its inputs.

## Notes

This is the deeper, riskier half of the opponent-read work (the narration shipped in `0061`). Touches
the tuned/tested `@holdem/coach` package, so it deserves its own careful effort with a tuning sweep —
relates to the coach-fidelity epic [[0051-coach-fidelity-epic]] and the line-based range work
[[0052-coach-narrow-range-on-action]] / [[0057-coach-board-aware-range]].

**Accepted limitation:** `serializeSpot` does not carry the archetype, so a "Copy ruling" blob
re-grades to the line-only verdict. Deliberate for this ticket — archetype is a live-play enrichment;
a follow-up can serialise it if the shared ruling needs to reproduce the per-villain read.
