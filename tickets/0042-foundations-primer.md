---
id: 0042
title: 'Epic: Foundations primer — how to think about a hand'
type: epic
status: in-progress
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The app delivers **procedural** knowledge — the coach ([[0007-coaching-engine]]) scores your
decisions and drills (M5, [[0009-drills-and-quizzes]]) drill the reps — but nothing teaches the
**declarative** knowledge those rest on: _what_ equity is, _why_ you weigh it against the price,
what position buys you, what a "range" is. The coach narrates numbers (`equity`,
`potOddsThreshold`, `callEv`, `verdict` — see `packages/coach/src/verdict.ts`) against a mental
framework it **assumes the player already holds**. To someone starting from little, "equity 25%,
threshold 33%, leak" is a correct signal that reads as noise — they pattern-match numbers instead
of understanding, and drilling a skill you have no concept for is just faster confusion.

This is the explicit-instruction layer the pedagogy already endorses but the roadmap never cashed
in: `docs/LEARNING-APPROACH.md` cites **DeDonno (2008) — explicitly teaching strategy/probability
measurably improved play**. M4.5 builds that teaching. It also shores up the doc's one admitted
weak pillar (bots as a learning spine): a player who arrives holding the framework treats the bots
as decision _generators_ for a coach they can now read, not an opponent to beat.

Slotted as **M4.5** (the M3.5 precedent — insert a half-step without renumbering the arc): it goes
**before** M5 because the concepts are the dependency drills rely on, the same way the math (M1)
preceded the coach (M3).

## Acceptance criteria

- [ ] A standalone **"Learn the fundamentals"** path in the PWA (its own tab/route), separate from
      free play and the M5 drill sets.
- [ ] A short sequence of concept lessons covering the models the coach already uses internally:
      **equity**, **pot odds**, **equity-vs-price (the continue rule)**, **EV / break-even**,
      **position**, and **ranges / board texture**.
- [ ] Each lesson is taught by **retrieval, not prose**: a ~30-second explanation followed by an
      interactive check the player answers (e.g. "25% equity, 33% price — call or fold?"), graded
      with an explanation — per the "test, don't re-read" evidence in
      [../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md).
- [ ] Lessons reuse the spot → ask → grade → explain machinery the M5 drills will share (don't
      build a parallel engine); the concept checks are graded by the same deterministic coach math,
      not hand-authored answer keys where the coach can rule.
- [ ] **Enabling primitive:** the coach verdict (`DecisionVerdict`) carries a `concept` tag naming
      the idea a decision exercises, so the play coach, the primer, and future drills cross-link
      ("this is the pot-odds idea from Foundations"). Pure addition — no change to the existing math
      or the layering (`@holdem/coach` stays pure).
- [ ] Lesson content/progress is local-only (no backend); completing the primer hands the player
      off to free play and, when it exists, M5 drills.

## Decomposition (`/work-milestone M4.5`, 2026-06-14)

Split into six per-feature tickets in dependency order — the pure poker-brain layer first, then the
PWA UI. **What matters most:** the checks are graded by the **deterministic coach math, not
hand-authored answer keys** (the lesson can never disagree with the live coach), and the spot →
ask → grade → explain engine is **reusable by M5 drills** — so it is a new pure package, not PWA
code. The lessons teach by **retrieval, not prose**.

Pure layer (the poker brain — build and verify before any UI):

- [[0043-coach-concept-tag]] — tag every coach verdict with the `Concept` it exercises (the
  enabling primitive; pure addition to `@holdem/coach`).
- [[0044-curriculum-engine]] — new pure `@holdem/curriculum` package: the spot → ask → grade →
  explain engine, grading via the coach, designed for M5 to reuse.
- [[0045-foundations-primer-content]] — the six concept lessons authored as pure data on that engine.

PWA UI layer (built **after** the design hand-off — the M4 precedent of a designer driving
look-and-feel before build applies; see `docs/design/m4.5-foundations-primer-brief.md`):

- [[0046-pwa-learn-nav]] — top-level navigation + the "Learn the fundamentals" route/list.
- [[0047-pwa-lesson-player]] — the lesson player: explain → check → grade → explain.
- [[0048-pwa-lesson-progress]] — local-only progress persistence + the completion hand-off.

## Notes

Decomposes into per-feature tickets via `/work-milestone M4.5`. Depends on the M4 PWA shell
([[0008-pwa-app-shell]]) and the coach ([[0007-coaching-engine]]); is a prerequisite for the full
value of [[0009-drills-and-quizzes]] (M5). Keep the concept-`concept` enrichment in the pure coach
package so both shells and drills benefit; keep all lesson UI in `apps/pwa`.

Scope discipline: this is a **primer**, not a course — the handful of models the coach actually
uses, each one short. Resist growing it into a poker textbook; depth lives in the feedback loop
(coach + drills + M6 leak detection), not in more reading.
