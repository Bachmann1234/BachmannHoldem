---
id: 0047
title: PWA lesson player — explain → check → grade → explain
type: feature
status: done
milestone: M4.5
priority: high
created: 2026-06-14
---

## Context

The heart of the Foundations primer UI ([[0042-foundations-primer]]): the screen that actually
teaches a lesson by **retrieval**. It renders a lesson's ~30-second explanation, presents the
retrieval-check spot, lets the player pick an answer, then **grades it and explains** — all driven by
the pure [[0044-curriculum-engine]] engine and [[0045-foundations-primer-content]] content. This is
the DOM analog of how `CoachDrawer` renders a graded `DecisionVerdict`, but for a lesson check.

**UI ticket — depends on the design direction.** Implement against the design brief / mockups handed
off before this milestone's UI work. Build on the M4 "playful" design system
(`apps/pwa/src/styles.css`); reuse the verdict-badge / metric-card / explainer patterns from
`CoachDrawer.tsx` where they fit, so a graded check looks of-a-piece with a graded hand.

## Acceptance criteria

- [x] Reached from the Learn lesson list ([[0046-pwa-learn-nav]]): selecting a lesson opens its
      player. Renders the explanation, then the check spot with its answer **choices** as the player's
      tappable options.
- [x] On answering, the UI calls the pure engine's `grade` ([[0044-curriculum-engine]]) — it does
      **no** grading math itself — and shows the result: correct/incorrect, the right answer, and the
      explanation built from the deterministic coach numbers (reuse `@holdem/format` for any
      numbers/labels so the primer and the play coach phrase a verdict identically).
- [x] The player can advance through a lesson's spots and on to the next lesson; reaching the end of
      the sequence hands the player back toward free play / (future) M5 drills, per the epic's
      "completing the primer hands the player off."
- [x] Accessible like the rest of the PWA (focus management, keyboard, `data-testid`s for tests),
      matching the `CoachDrawer` a11y bar.
- [x] Tests: answering correctly and incorrectly each render the engine's verdict + explanation;
      advancing moves to the next spot/lesson. `pnpm verify` green.

## Notes

Depends on [[0046-pwa-learn-nav]] (the route/list to launch from), [[0044-curriculum-engine]] (grade),
and [[0045-foundations-primer-content]] (content). Progress persistence is [[0048-pwa-lesson-progress]]
— this ticket can drive in-memory progress and let that ticket make it durable. Presentational only,
exactly like `CoachDrawer`: all correctness lives in the pure engine; the component renders what
`grade` returns. Match the M4 component idiom and reuse CSS classes rather than inventing parallel
ones.
