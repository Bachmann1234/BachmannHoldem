---
id: 0044
title: '@holdem/curriculum — the spot → ask → grade → explain engine'
type: feature
status: done
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The epic ([[0042-foundations-primer]]) requires that the primer's concept checks "reuse the spot →
ask → grade → explain machinery the M5 drills will share (don't build a parallel engine); the
concept checks are graded by the same deterministic coach math, not hand-authored answer keys where
the coach can rule." That machinery does not exist yet, and it must be **reusable by M5 drills**
([[0009-drills-and-quizzes]]) — so it belongs in a new **pure** package, not in the PWA.

This ticket builds the generic engine and its data model. **No lesson content** — that is
[[0045-foundations-primer-content]]. Think of it as the relationship `@holdem/coach` is to a live
hand: a pure grader the UI shells render.

## Acceptance criteria

- [x] New pure package `packages/curriculum` (`@holdem/curriculum`), sibling shape to
      `packages/coach`/`packages/format`: `package.json` (deps on `@holdem/engine`, `@holdem/bots`,
      `@holdem/coach`; whatever of `@holdem/odds`/`@holdem/format` the grader needs), `tsconfig.json`
      with project references, `src/index.ts` exporting the public API.
- [x] A **spot** model: a self-contained, serialisable description of one retrieval check — a prompt,
      a small set of answer **choices** the player picks from, and the engine inputs needed to grade
      it (e.g. a `DecisionContext` + the `Action` each choice maps to, for coach-graded spots).
- [x] A **grade** function that, given a spot and the player's chosen answer, returns a result
      carrying: correct/incorrect, the chosen-vs-correct answer, the underlying coach verdict (so the
      `concept` tag from [[0043-coach-concept-tag]] flows through), and an **explanation** built from
      the deterministic numbers. Coach-graded spots run `coachDecision` / the preflop chart — they do
      **not** carry a hand-authored answer key. Document the seam clearly enough that an M5 drill spot
      drops into the same `grade` with no new engine code.
- [x] A **lesson** model: an ordered grouping of a short explanation (the ~30s teach) plus one or
      more spots, tagged with the `Concept` it teaches. (Content is the next ticket; here just the
      type + any sequencing helpers, e.g. "next unanswered spot".)
- [x] Wired into the build: root `tsconfig.json` references `packages/curriculum`; `vitest.config.ts`
      coverage `include` gains `packages/curriculum/src/**` (gate it like every pure package). Tests
      cover grading a correct and an incorrect answer for a coach-graded spot, and the
      explanation/verdict round-trip. `pnpm verify` green above thresholds.
- [x] Purity: zero UI/DOM/Node/network deps; imports only `@holdem/*`/relative/`vitest`.

## Notes

Depends on [[0043-coach-concept-tag]] (the verdict carries `concept`). Feeds
[[0045-foundations-primer-content]] (content), [[0047-pwa-lesson-player]] (the UI that renders a
spot and dispatches an answer), and M5 ([[0009-drills-and-quizzes]]) — design the spot/grade types
to serve a randomised drill set, not just a fixed primer.

- **Reuse the coach, don't re-derive.** Grading a "25% equity vs 33% price — call or fold?" spot is
  exactly `coachDecision(ctx, chosenAction)` from [[0021-coach-decision-verdict]] + reading
  `verdict.verdict`/`correctDecision`. A starting-hand spot is the preflop chart. Build the spot so
  the correct answer is **whatever the coach rules**, never a literal stored alongside it — that is
  the epic's "graded by the same deterministic coach math, not hand-authored answer keys" rule, and
  it keeps the primer honest (the lesson can never disagree with the live coach).
- **The "where the coach can rule" carve-out.** Some concepts ([[0045-foundations-primer-content]]
  will need position, board texture) do not map onto a single continue-verdict. Keep the spot model
  general enough to express a coach-graded spot **and** a small declarative spot the content ticket
  fills, but make coach-grading the default path and clearly the preferred one. Don't over-build a
  generic rules engine — a discriminated union of spot kinds is plenty.
- **The pot-accounting pitfall** carries over from the coach: when a content author hands the engine
  a `DecisionContext`, `ctx.pot` is the pot **before** the call and `ctx.toCall` is the chips to add.
  The engine just forwards them to `coachDecision`, which maps them directly — don't double-count.
- Mirror the coach/odds house style exactly: heavy doc comments, `.js` import specifiers, validation
  idiom (`RangeError` on malformed spots), co-located `*.test.ts`.
