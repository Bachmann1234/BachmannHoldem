---
id: 0066
title: Themed drill sets + interleaved session composer
type: feature
status: done
milestone: M5
priority: high
created: 2026-06-16
---

## Context

With the generator landed ([[0065-drills-spot-generator]]), M5 needs the epic's two remaining
deterministic pieces ([[0009-drills-and-quizzes]]):

1. **Themed drill sets** — named, coherent practice topics (preflop ranges, pot-odds calls, …), each
   a generator config tagged with the `Concept` it exercises.
2. **Interleaving** — a session composer that mixes spot types **randomly within a session, not
   blocked by topic**. This is the load-bearing learning-science requirement, not a nicety: the
   validated approach ([../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md)) says interleaved
   and retrieval practice transfer better than blocked drilling.

Both stay in the pure `@holdem/drills` package so the UI ([[0067-pwa-drills-session]]) just renders
the composed session.

## Acceptance criteria

- [x] A small catalogue of **themes**, each: a stable id, a human title, the `Concept` it exercises
      (the tag from [[0043-coach-concept-tag]], so it lines up with the coach/primer vocabulary), and
      a generator config that constrains [[0065-drills-spot-generator]] to produce spots of that kind
      (e.g. "preflop ranges" → `PreflopSpot`s; "pot-odds calls" → `CoachSpot`s with a non-trivial
      `toCall`). Cover at least the two the epic names plus one more.
- [x] A **session composer**: given a set of themes, a length, and a seed, produce an ordered list of
      generated spots that **interleaves** the themes — consecutive spots should not be blocked by
      topic. Seeded ⇒ reproducible. Document the interleaving policy and _why_ (cite the learning
      approach), and assert in tests that a multi-theme session is actually interleaved (no long
      same-theme runs), not accidentally blocked.
- [x] Each composed spot remains graded by the existing `gradeSpot` (no answer keys), and its theme
      `Concept` is recoverable so the UI can show "this drilled <concept>."
- [x] Tests: each theme generates only legal spots of its declared kind; the composer interleaves and
      is deterministic per seed; an all-one-theme session degrades gracefully (no interleave needed).
      `pnpm verify` green above thresholds.
- [x] Purity: zero UI/DOM/Node/network deps; imports only `@holdem/*`/relative/`vitest`.

## Notes

Depends on [[0065-drills-spot-generator]] (the generator it configures) and reuses
[[0044-curriculum-engine]]'s `Concept`/`Spot`. Feeds [[0067-pwa-drills-session]] (renders the
session) and [[0068-pwa-drills-nav-summary]] (lists themes + summarises by concept).

- **Interleaving is the headline, not a detail.** The epic calls it out explicitly and the learning
  doc makes it the differentiator from naive blocked drilling. Implement a real interleave (e.g.
  round-robin / shuffled-without-long-runs), test it, and comment the rationale so a future reader
  doesn't "simplify" it back into blocked order.
- **Don't position drills as a replacement for playing volume** — the learning doc is explicit that
  drills _complement_ volume. Keep any user-facing framing (copy the UI ticket will reuse) honest;
  no "drills are all you need" language baked into theme titles/descriptions.
- Keep the theme catalogue data-driven (a list of configs), so adding a theme is a data edit, not new
  control flow — mirrors how the spot model avoided a generic rules engine.
- House style as in [[0065-drills-spot-generator]]: heavy doc comments, `.js` specifiers,
  co-located tests.
