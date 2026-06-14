---
id: 0043
title: Tag every coach verdict with the concept it exercises
type: feature
status: todo
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The enabling primitive for the whole milestone ([[0042-foundations-primer]]). The coach narrates
numbers (`equity`, `potOddsThreshold`, `callEv`, `verdict`) against a mental framework it **assumes
the player already holds**. M4.5 teaches that framework — and to cross-link the primer, the play
coach, and the future M5 drills ("this is the pot-odds idea from Foundations"), every verdict needs
to name **which idea it exercises**.

This is a **pure addition** to `@holdem/coach`: a `concept` tag on the verdict shapes. No change to
the existing equity / pot-odds / EV math, the classification, or the layering — `@holdem/coach`
stays pure and the field is additive (existing consumers ignore it).

## Acceptance criteria

- [ ] A `Concept` string-union type, exported from `@holdem/coach`, covering the models the coach
      actually uses: `'equity'`, `'pot-odds'`, `'equity-vs-price'`, `'ev'`, `'position'`, `'ranges'`
      (the same set [[0042-foundations-primer]] lists). Each value carries a doc comment.
- [ ] `DecisionVerdict` (postflop, `verdict.ts`) gains a `readonly concept: Concept` field set to the
      idea the graded decision exercises — the continue decision against a price is `'equity-vs-price'`;
      a free check (no price) is `'equity'` (there is no price to weigh). Decide and **document** the
      mapping in the doc comment; keep it derived from the spot, not hand-fed.
- [ ] `PreflopVerdict` (chart, `preflop.ts`) gains the same `readonly concept: Concept` field, set to
      `'ranges'` (the starting-hand chart is the ranges/strength-tier idea). Document why.
- [ ] Tests cover the concept assignment for each branch (free check, priced continue, preflop), and
      the existing verdict/preflop tests stay green. `pnpm verify` green above coverage thresholds.

## Notes

Done first — [[0044-curriculum-engine]] and the primer content build on it. Keep it minimal and
purely additive: the `concept` is a label on an already-correct verdict, **not** a new code path
through the math. Export `Concept` from `src/index.ts` (it flows out via `export * from './verdict.js'`).

Mapping rationale to bake into the doc comments: a single verdict touches equity, pot odds, and EV
all at once, so `concept` names the **primary idea the decision turns on** — facing a price, that is
weighing equity against the price (`'equity-vs-price'`); with no price, it is just reading equity
(`'equity'`). Preflop is graded off the chart, so it is the `'ranges'` idea. `'pot-odds'`, `'ev'`,
and `'position'` are part of the union now so the primer ([[0045-foundations-primer-content]]) and
M5 drills can tag spots that isolate those ideas even though the live verdict rolls them into
`'equity-vs-price'`. Mirror the coach house style (heavy doc comments, `.js` specifiers).
