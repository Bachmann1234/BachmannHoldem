---
id: 0068
title: PWA drills nav entry + end-of-session summary
type: feature
status: done
milestone: M5
priority: medium
created: 2026-06-16
---

## Context

Makes M5 drills ([[0009-drills-and-quizzes]]) discoverable and gives a session a satisfying close.
The session loop ([[0067-pwa-drills-session]]) runs a drill but needs (a) a way in — a drills entry
in the app's navigation where the player picks theme(s) and starts — and (b) a way out — an
end-of-session summary that recaps how they did, by concept.

This also delivers the Foundations primer's promised hand-off: the M4.5 lesson player already
"hands the player back toward free play / (future) M5 drills" ([[0047-pwa-lesson-player]]); that
forward reference now has a real destination.

## Acceptance criteria

- [x] A **drills entry point** in the app navigation (alongside the Learn/play entries, matching the
      M4.5 nav idiom from [[0046-pwa-learn-nav]]): a screen to choose theme(s) from the
      [[0066-drills-themed-sets]] catalogue and start a session, launching [[0067-pwa-drills-session]].
- [x] An **end-of-session summary**: after the last spot, recap the session — score (how many
      coach-correct), and a per-`Concept` breakdown so the player sees which topics they drilled and
      where they slipped. Offer "drill again" (new seed) and a route back to play/learn.
- [x] Wire the Foundations primer hand-off: completing the primer can route the player toward drills
      (honour the existing forward reference from [[0047-pwa-lesson-player]]/[[0048-pwa-lesson-progress]]).
- [x] **Honest framing.** Per [../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md), drills
      _complement_ playing volume — they don't replace it. The summary/entry copy must not position
      drilling as a substitute for play, and improvement is framed as decision-quality, not a score to
      grind.
- [x] Accessible + tested like the rest of the PWA (`data-testid`s; entry → session → summary flow
      covered). `pnpm verify` green.

## Notes

Depends on [[0067-pwa-drills-session]] (the loop it brackets) and [[0066-drills-themed-sets]] (the
theme catalogue to list + the `Concept` tags to summarise by). Reuse the M4 nav + card/badge idiom;
no parallel CSS.

- **Ephemeral summary, not stored stats.** The recap is computed from the just-finished in-memory
  session; durable cross-session stats/leak-detection are M6 ([[0010-stats-and-leak-detection]]).
  Keep the summary derivable from the session result so M6 can later persist the same shape.
- Keep the concept breakdown leaning on the existing `Concept` vocabulary so a drill summary, a
  lesson, and the coach all speak the same language.
