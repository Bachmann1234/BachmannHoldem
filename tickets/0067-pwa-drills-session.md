---
id: 0067
title: PWA drills route + session loop
type: feature
status: todo
milestone: M5
priority: high
created: 2026-06-16
---

## Context

The UI that hosts M5 drills ([[0009-drills-and-quizzes]]): a screen that runs a composed, interleaved
drill session — deal a spot, present the answer choices, grade the pick via the pure engine, explain,
advance — looping at speed. This is the drill analog of the Foundations lesson player
([[0047-pwa-lesson-player]]); the heavy lifting is already done by the pure packages, so this is a
**presentational** shell.

**UI ticket — reuse, don't reinvent.** The lesson player already renders a curriculum `Spot`'s
choices and a `gradeSpot` result against the M4 "playful" design system. A drill spot _is_ the same
`Spot`, graded by the same `gradeSpot`. Reuse those components/patterns (and `CoachDrawer`'s
verdict-badge / metric-card / explainer idiom) so a drilled spot looks of-a-piece with a graded
lesson check and a graded live hand.

## Acceptance criteria

- [ ] A drills route/screen that, given selected theme(s) + a seed, runs a session composed by
      [[0066-drills-themed-sets]]: renders the current spot's prompt and answer **choices** as
      tappable options.
- [ ] On answering, the UI calls the pure engine's `gradeSpot` ([[0044-curriculum-engine]]) — it does
      **no** grading math itself — and shows the result: correct/incorrect, the coach-blessed answer,
      and the explanation built from the deterministic numbers (reuse `@holdem/format` so a drill, a
      lesson, and the live coach phrase a verdict identically).
- [ ] The player advances to the next spot and loops through the session; the session is fast and
      keyboard/tap friendly. Reuse the lesson-player advance/answer interaction rather than a parallel
      one.
- [ ] Reuse existing components where they fit (the spot/choice renderer, verdict/explanation
      display); only add drill-specific chrome (e.g. a progress indicator within the session). No
      parallel CSS — reuse `apps/pwa/src/styles.css` classes.
- [ ] Accessible like the rest of the PWA (focus management, keyboard, `data-testid`s), matching the
      lesson-player / `CoachDrawer` a11y bar.
- [ ] Tests: answering correctly and incorrectly each render the engine's verdict + explanation;
      advancing moves to the next spot; the session reaches its end. `pnpm verify` green.

## Notes

Depends on [[0066-drills-themed-sets]] (the composed session), [[0044-curriculum-engine]]
(`gradeSpot`), and [[0047-pwa-lesson-player]] (the component patterns to reuse). The nav entry point
to launch a session and the end-of-session summary are [[0068-pwa-drills-nav-summary]] — this ticket
can drive an in-memory session and a minimal "session over" state; that ticket makes the entry +
recap first-class.

- **Presentational only**, exactly like the lesson player and `CoachDrawer`: all correctness lives in
  the pure engine; the component renders what `gradeSpot` returns. Match the M4 component idiom and
  reuse classes rather than inventing parallel ones.
- Drill progress is **ephemeral** this milestone — longitudinal stats are M6
  ([[0010-stats-and-leak-detection]]). Don't build persistence here.
