---
id: 0065
title: '@holdem/drills — seeded spot generator'
type: feature
status: todo
milestone: M5
priority: high
created: 2026-06-16
---

## Context

The epic ([[0009-drills-and-quizzes]]) needs to "deal a situation, ask for the right action, score it
via the coach." The shared `spot → ask → grade → explain` engine already exists
([[0044-curriculum-engine]]) — but its spots are **hand-authored** (the Foundations primer's fixed
content). M5 drills need spots **generated** procedurally from random deals, on demand, in unbounded
supply.

That generation is new behaviour — it owns **seeded randomness**, which `@holdem/curriculum`
deliberately avoids (curriculum is content + a pure grader; the only randomness it touches is the
coach's own seeded equity read). So generation belongs in a **new pure package**
`@holdem/drills`, sibling to curriculum, depending on it for the `Spot`/`gradeSpot` primitives.

This ticket is the spine of M5: the package scaffold + a deterministic generator that emits
curriculum `Spot`s the existing `gradeSpot` already rules on, with no new engine code.

## Acceptance criteria

- [ ] New pure package `packages/drills` (`@holdem/drills`), sibling shape to `packages/curriculum`:
      `package.json` (deps on `@holdem/curriculum` + whatever `@holdem/engine`/`@holdem/bots`/
      `@holdem/coach` the deal needs), `tsconfig.json` with project references, `src/index.ts`
      exporting the public API.
- [ ] A **seeded RNG** the generator threads through every random choice, so a given seed always
      produces the same spot. No `Math.random()`. (Mirror however the codebase already seeds the
      equity sims — reuse that seam if one exists rather than inventing a parallel PRNG.)
- [ ] A **spot generator**: given a seed (and later a theme config, [[0066-drills-themed-sets]]),
      deal a legal situation and return a curriculum `Spot` — a `CoachSpot` (postflop continue
      decision) or `PreflopSpot` (starting-hand chart) — whose answer choices are graded by the
      **existing** `gradeSpot`, never a stored answer key. The deal must produce a _legal,
      coherent_ board/holding (no duplicate cards, board length valid for the street, pot/`toCall`
      consistent).
- [ ] **No answer keys, honoured end-to-end.** A generated spot's correct answer is whatever the
      deterministic coach rules over it via `gradeSpot` — assert this in tests (generate a spot,
      grade every choice, exactly the coach-blessed one(s) score correct).
- [ ] Wired into the build: root `tsconfig.json` references `packages/drills`; `vitest.config.ts`
      coverage `include` gains `packages/drills/src/**` (gate it like every pure package);
      `pnpm-workspace.yaml` already globs `packages/*` (confirm). Tests cover determinism (same seed →
      same spot), card/board legality, and the no-answer-key invariant. `pnpm verify` green above
      thresholds.
- [ ] Purity: zero UI/DOM/Node/network deps; imports only `@holdem/*`/relative/`vitest`.

## Notes

Depends on [[0044-curriculum-engine]] (`Spot`, `synthesizeContext`, `gradeSpot`), and reuses the
M0–M3 packages for the deal + grading. **Reuse, do not re-derive:** the spot must flow straight into
the existing `gradeSpot` — if generation tempts you to add a new grade path, stop; the seam is done.

- **The pot-accounting pitfall carries over verbatim** (see [[0044-curriculum-engine]] /
  [[0021-coach-decision-verdict]]): a `CoachSpot`'s `pot` is the dead money _before_ the call and
  `toCall` is the chips to add. The generator must produce a `SpotContext` whose `pot`/`toCall` are
  consistent and forwarded untouched — never fold `toCall` into `pot`.
- **Determinism is the testability contract.** Seed-in → spot-out must be pure so a session
  ([[0066-drills-themed-sets]]) and its tests are reproducible. The coach's equity read is itself
  seeded; keep the whole chain seeded.
- Don't build themes here — this ticket is the generation primitive. Themed configs + the
  interleaved session composer are [[0066-drills-themed-sets]]. Keep the generator parameterised
  enough to accept a theme config there without a rewrite.
- Mirror the curriculum/coach house style exactly: heavy doc comments, `.js` import specifiers,
  `RangeError` validation idiom, co-located `*.test.ts`.
