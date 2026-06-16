---
id: 0009
title: 'Epic: Drills & quizzes'
type: epic
status: in-progress
milestone: M5
priority: medium
created: 2026-06-13
---

## Context

The highest-efficiency learning loop: spot-based reps with instant feedback, faster than playing
full hands.

## Acceptance criteria

- [ ] Spot generator: deal a situation, ask for the right action, score it via the coach
- [ ] Themed drill sets (preflop ranges, pot-odds calls, etc.)
- [ ] **Interleave** spot types within a session (randomized, not blocked by topic) — the
      learning-science evidence says interleaved + retrieval practice transfers better than
      blocked drilling

## Decomposition (`/work-milestone M5`, 2026-06-16)

Split into four per-feature tickets in dependency order — the pure poker-brain layer first, then the
PWA UI. **What matters most:** generated spots are graded by the **deterministic coach math via the
existing `gradeSpot`, never an answer key** (a drill can never disagree with the live coach), and
**interleaving is the load-bearing learning-science requirement**, not a nicety — randomize spot
types within a session, never blocked by topic ([../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md)).

The M4.5 primer already built the shared `spot → ask → grade → explain` engine
([[0044-curriculum-engine]]) for M5 to reuse — so M5 adds only **generation** (new, owns seeded
randomness) and the **drill UI**, reusing the lesson-player components. Generation lives in a new pure
`@holdem/drills` package, not curriculum (curriculum stays content + a pure, randomness-free grader).

Pure layer (the poker brain — build and verify before any UI):

- [[0065-drills-spot-generator]] — new pure `@holdem/drills` package: a seeded generator that deals a
  situation into a curriculum `Spot` the existing `gradeSpot` rules on (no answer keys).
- [[0066-drills-themed-sets]] — themed drill sets (preflop ranges, pot-odds calls, …) + the
  **interleaved** session composer.

PWA UI layer (reuse the M4.5 lesson player + M4 design system):

- [[0067-pwa-drills-session]] — the drills route + session loop: deal → choose → grade → explain →
  advance, rendering the same `Spot`/`gradeSpot` as the lesson player.
- [[0068-pwa-drills-nav-summary]] — drills nav entry (pick themes, start) + end-of-session summary by
  `Concept`, and the primer → drills hand-off.

## Notes

Reuses [[0007-coaching-engine]] for verdicts and [[0044-curriculum-engine]] for the spot/grade engine.
Depends on [[0008-pwa-app-shell]] for the UI and the M4.5 primer ([[0042-foundations-primer]]) for the
framework the drills rest on.

The interleaving requirement comes from the validated learning approach — see
[../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md). Drills are high-efficiency reps but
**complement** playing volume rather than replacing it; don't position them as a substitute. Drill
progress is **ephemeral** this milestone; durable cross-session stats/leak-detection are M6
([[0010-stats-and-leak-detection]]).
