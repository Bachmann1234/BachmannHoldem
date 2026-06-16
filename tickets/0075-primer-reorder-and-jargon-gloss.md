---
id: 0075
title: Reorder primer to preflop-first and gloss jargon on first use
type: task
status: todo
milestone: M4.6
priority: medium
created: 2026-06-16
---

## Context

Two cross-cutting fixes from the beginner-pedagogy review (2026-06-16) that span the whole primer
rather than any single lesson:

1. **Ordering.** The graded lessons currently run equity → pot odds → continue rule → EV →
   position → ranges. But ranges and position are the _first_ decisions in every hand (which hands,
   from which seat), made before any postflop equity-vs-price spot exists. Teaching advanced
   postflop evaluation before "which hands do I even play" inverts the natural play order.
2. **Jargon.** Undefined terms land in the first graded prompts — "overcards" appears in the very
   first equity spot, plus "top set", "set / trips", and "overbet" elsewhere — before any
   definition. A true beginner meets them cold.

## Acceptance criteria

- [ ] Reorder the `FOUNDATIONS` sequence so **preflop foundations (ranges + position) precede
      postflop evaluation (equity → pot odds → continue rule → EV)**, then draws
      ([[0074-lesson-draws-implied-odds]]). New v2 lessons slot into the reordered arc coherently.
- [ ] Gloss jargon on first use in graded prompts: brief parenthetical definitions for "overcards",
      "top set", "set / trips", "overbet" (and any other term that appears before its definition).
- [ ] Add a strong "read the rules reference first" signpost / soft gate before the primer, so a
      learner doesn't hit the equity lesson without knowing what a flush draw or overcard is.
- [ ] Existing tests stay green after the reorder (spot grading is unchanged — only sequence and
      copy move); purity preserved.

## Notes

Part of [[0070-foundations-primer-v2]]. Pure content/sequence change in
`packages/curriculum/src/foundations.ts` plus the PWA learn nav/list if order is encoded there
([[0046-pwa-learn-nav]], `apps/pwa/src/learn/lessonMeta.ts`). Coordinate with the rules reference
(`rulesContent.ts` / `RulesOverlay`) for the signpost. Do this once the new lessons exist so the
final order is set in a single pass.
