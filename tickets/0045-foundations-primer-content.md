---
id: 0045
title: Foundations primer content — the six concept lessons
type: feature
status: todo
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The actual teaching: the handful of concept lessons that make up the Foundations primer
([[0042-foundations-primer]]), authored as data for the [[0044-curriculum-engine]] engine. Each
lesson is taught **by retrieval, not prose**: a ~30-second explanation followed by an interactive
check the player answers and that is graded with an explanation — per the "test, don't re-read"
evidence in [../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md) (DeDonno 2008).

**Scope discipline (from the epic): this is a primer, not a course.** The handful of models the
coach actually uses, each one short. Resist growing it into a poker textbook — depth lives in the
feedback loop (coach + drills + M6), not in more reading.

## Acceptance criteria

- [ ] A `FOUNDATIONS` lesson sequence (exported from `@holdem/curriculum`) covering the six models the
      coach uses: **equity**, **pot odds**, **equity-vs-price (the continue rule)**, **EV /
      break-even**, **position**, and **ranges / board texture** — each tagged with its `Concept`
      ([[0043-coach-concept-tag]]).
- [ ] Each lesson: a tight ~30-second explanation string (plain, beginner-pitched, no jargon dump)
      plus at least one retrieval-check spot. The spots are built on real `DecisionContext`s and
      graded by the coach math through the engine (e.g. equity-vs-price: "you hold X, 25% equity, the
      price is 33% — call or fold?" graded by `coachDecision`), **not** hand-authored answer keys
      wherever the coach can rule.
- [ ] For the concepts the coach cannot grade as a continue-decision (position; board texture under
      ranges), use the preflop chart where it fits (position → opening-range tightness) and a clearly
      flagged minimal declarative check only as a last resort — documented in the lesson, kept to a
      minimum, and never contradicting the coach.
- [ ] Tests: every primer spot grades to the answer the coach actually returns (so a future coach
      retune can't silently desync the lesson), and each explanation/choice set is well-formed.
      `pnpm verify` green above thresholds.
- [ ] Purity preserved (content is pure data in the pure package): no UI/DOM/Node/network.

## Notes

Depends on [[0044-curriculum-engine]] and [[0043-coach-concept-tag]]. Consumed by the PWA lesson
player ([[0047-pwa-lesson-player]]); the lesson **content** lives here in the pure package (so M5
drills and both shells can reuse it) while all lesson **UI** lives in `apps/pwa`.

- **Honesty over coverage.** Better to ship six crisp, coach-true lessons than twelve padded ones.
  Each explanation should earn its ~30 seconds; the _retrieval check is the lesson_, the prose is
  just the setup.
- **Make the checks coach-true by construction.** Author each spot's `DecisionContext` so the coach's
  verdict is the intended teaching point (e.g. pick equity/price so `coachDecision` returns the
  `'leak'`/`'good'` you want to demonstrate), then assert it in the test. If a spot needs a specific
  equity, remember the coach's equity is a seeded Monte-Carlo read against `COACH_ASSUMED_RANGE` — pin
  the spot to hole cards/board whose read lands where you need it, and let the test prove it.
- Keep the explanation copy framework-agnostic (plain strings/markdown-ish, no JSX) so it stays pure.
