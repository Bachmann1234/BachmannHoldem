---
id: 0085
title: Tournament mode — escalate blinds over time
type: feature
status: todo
milestone: stretch
priority: low
created: 2026-06-16
---

## Context

Follow-up to the fixed-blinds picker ([[0084-blinds-picker-setup]]). A tournament option where the
blind level **steps up on a schedule** (every N hands / "levels") so a session naturally
accelerates toward an end, the way real tournaments do. Deferred out of the 0084 batch because the
engine currently freezes one fixed blind level into every hand, so escalation needs new level state
and a schedule — more than the "smallish" picker.

## Acceptance criteria

- [ ] A setup option to choose Cash (fixed, today's behaviour) vs Tournament (escalating).
- [ ] In tournament mode, blinds advance through a level schedule (e.g. every N hands) — the
      reducer owns the current level and advances it deterministically (pure, testable).
- [ ] The table surfaces the current level / blinds and a hint about when the next level hits.
- [ ] Cash mode is completely unaffected; the fixed-blinds picker (0084) still works.
- [ ] Pure-package tests cover level advancement and the schedule boundaries.
- [ ] `pnpm verify` green.

## Notes

Builds directly on 0084's `set-blinds` plumbing — instead of one frozen `{ sb, bb }`, the session
carries a level index that the reducer bumps as hands complete, re-deriving the blinds passed to
`dealHand` each hand. Design the schedule (level durations, how steep) and the table indicator when
this is pulled. Not part of the current batch — filed for later.
