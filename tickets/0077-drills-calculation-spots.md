---
id: 0077
title: Calculation / estimation drill type — retrieve the math as a number
type: feature
status: todo
milestone: M5.5
priority: high
created: 2026-06-16
---

## Context

The single biggest gap on the practice side: the Foundations primer _teaches_ the math (pot odds,
equity, break-even), but every drill reduces to a binary Call/Fold pick — the player never
**retrieves the number**. Active recall of the math is skipped (learning-app review, 2026-06-16).
The pieces to fix this already exist: the `declarative` spot kind is supported by `gradeSpot` (the
drill generator just never emits it), and the seeded equity oracle and `potOdds` helpers already
compute the answers.

## Acceptance criteria

- [ ] A non-binary drill spot type that asks the player to **produce a number**, e.g.: "what pot
      odds / price are you getting?", "estimate your equity here", "what equity do you need to
      call?" — with input (or graded buckets) rather than a 2-option choice.
- [ ] Graded against the **deterministic coach numbers the app already computes** (the equity oracle,
      `potOdds`), with a tolerance band for estimates so a "close enough" rule-of-2-and-4 answer is
      correct — no hand-authored answer keys.
- [ ] Emitted by the generator (extend `DrillKind` / `@holdem/drills`) and rendered in the drills
      session UI ([[0067-pwa-drills-session]]); feedback shows the exact number and how it's derived.
- [ ] Deterministic + seeded like the existing generators (`mulberry32`), tests assert the spot
      grades to the computed value within tolerance; purity preserved in the pure package.

## Notes

Part of [[0076-drills-v2]]. Reuses the `declarative`/answer machinery in
`packages/curriculum/src/grade.ts` and the math in the odds/equity engine. Pairs with the
show-the-math feedback in [[0079-drills-feedback-depth-and-crosslinks]] — once the player produces
the number, the feedback should reinforce the derivation. This is the highest-leverage item in the
epic; consider pulling it first.
