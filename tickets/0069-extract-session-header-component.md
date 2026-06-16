---
id: 0069
title: Extract a shared immersive SessionHeader (LessonPlayer / DrillSession)
type: chore
status: todo
milestone: M5
priority: low
created: 2026-06-16
---

## Context

Filed from the M5 milestone review (2026-06-16). After the M5 drill UI reused the lesson player's
spot/answer/result pieces via the extracted `SpotPlayer`
([[0067-pwa-drills-session]]), one immersive-screen block stayed duplicated: the **appbar + segmented
progress bar + concept tag** header renders near-identically in `LessonPlayer.tsx` (lines ~131–173)
and `DrillSession.tsx` (lines ~108–148). The only differences are data — the eyebrow text
(`LESSON n OF total` vs `SPOT i OF N`), the title, the concept-label source, and the read-phase 0%
fill the lesson player adds.

Cosmetic, not a correctness or layering issue (the per-ticket reviews and the milestone review both
flagged it as LOW). Worth doing before the design of that header evolves, so a tweak lands in one
place instead of two.

## Acceptance criteria

- [ ] A shared presentational `SessionHeader` component (sibling to `SpotPlayer`) that both
      `LessonPlayer` and `DrillSession` render, parameterised by the data that actually differs
      (eyebrow, title, concept label, step count + current step, and the lesson's read-phase 0%-fill
      case).
- [ ] `LessonPlayer` and `DrillSession` consume it; the duplicated header JSX is removed from both.
- [ ] No behaviour or markup change a user or test can observe — same classes, same `data-testid`s,
      same progress-fill logic. The existing LessonPlayer / DrillSession / App tests stay green.
- [ ] `pnpm verify` green.

## Notes

Pure presentational refactor — no engine/pure-package changes, no CSS changes (reuse the existing
`appbar`/`lesson-head`/`lesson-steps`/`concept-tag` classes). Mirrors the `SpotPlayer` extraction's
"one implementation, two callers" pattern from [[0067-pwa-drills-session]]. Keep the read-phase
fill (the lesson player shows 0% during its teach phase; the drill loop has no read phase) as a
prop, not a fork.
