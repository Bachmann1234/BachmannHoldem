---
id: 0076
title: 'Epic: Drills v2 — calculation reps, board reading, deeper feedback'
type: epic
status: todo
milestone: M5.5
priority: medium
created: 2026-06-16
---

## Context

The M5 drills ([[0009-drills-and-quizzes]]) shipped excellent _plumbing_ — every spot graded by the
live coach via `gradeSpot` with no answer keys, and a genuine interleaved session composer — but a
_starter_ set of activities. A beginner-pedagogy/learning-app review (2026-06-16) found the practice
_surface_ thin: three themes (`preflop-ranges`, `pot-odds-calls`, `postflop-equity`), every spot a
**binary** (Call/Fold or Open/Fold), **flop-only** boards, and — most importantly — the app
_teaches_ the math in Foundations but never makes the player **retrieve it as a number**. There is
also no spaced repetition of mistakes, the single biggest retention lever for a learning app.

This epic is a depth pass on M5, not a new track. Slotted **M5.5** (half-step convention): it
follows M5 and the M4.6 framework it drills against ([[0070-foundations-primer-v2]]), and one piece
(mistake re-queue) leans into M6 persistence — flagged below.

## Acceptance criteria

- [ ] **Calculation / estimation drill type** — "what price are you getting?", "estimate your
      equity", "what equity do you need to call?" — graded against the deterministic coach numbers
      the app already computes, not multiple-choice ([[0077-drills-calculation-spots]]). Highest
      leverage: closes the teach-the-math-but-never-retrieve-it gap.
- [ ] **Board-reading + richer actions** — hand-ranking recognition theme, turn/river spots (not
      flop-only), and breaking the hard-wired Call/Fold binary to offer bet/raise/size choices
      where the coach can grade them ([[0078-drills-board-reading-and-actions]]).
- [ ] **Deeper, more instructive feedback** — move from one-shot reveal toward show-the-math
      ("needed 33%, had ~28% — that's the fold"), and cross-link the drill result into the existing
      `ChartOverlay` and `GlossaryOverlay` ([[0079-drills-feedback-depth-and-crosslinks]]).
- [ ] **Spaced repetition of missed spots** — persist missed spots and re-queue weak concepts in
      later sessions ([[0080-drills-spaced-repetition]]). **Straddles M6** (needs durable storage);
      see that ticket.
- [ ] **Per-concept mastery + adaptive difficulty, and a real cheat-sheet** — track per-concept
      correctness to weight spot selection toward weak concepts, and grow the 6-term glossary toward
      a beginner cheat-sheet incl. a pot-odds → equity quick-reference ([[0081-drills-mastery-difficulty-glossary]]).

## Notes

Reuses the pure `@holdem/drills` generator ([[0065-drills-spot-generator]],
[[0066-drills-themed-sets]]), the curriculum grader ([[0044-curriculum-engine]],
`packages/curriculum/src/grade.ts`), and the drills UI ([[0067-pwa-drills-session]],
[[0068-pwa-drills-nav-summary]]). Several review findings are _already partly built_: the
`declarative` spot kind exists in `grade.ts` (the generator just never emits it), and
`ChartOverlay`/`GlossaryOverlay`/`RulesOverlay` exist but aren't wired into the drill result — so
some of this is wiring, not net-new engine.

**Cross-milestone note.** [[0080-drills-spaced-repetition]] depends on persistence, which is M6
territory ([[0010-stats-and-leak-detection]]); it is tagged M6 and referenced here rather than owned
here. Drill progress was deliberately ephemeral in M5 — this epic is where that constraint starts to
lift, so coordinate with the M6 stats work before building durable mistake storage.

Don't position drills as a substitute for playing volume (the [[0009-drills-and-quizzes]] /
LEARNING-APPROACH discipline still holds). Update `docs/ROADMAP.md` to name M4.6 and M5.5 when this
is pulled.
