---
id: 0080
title: Spaced repetition of missed drill spots — persist and re-queue
type: feature
status: todo
milestone: M6
priority: medium
created: 2026-06-16
---

## Context

The drill loop has **no spaced repetition of mistakes** — missed spots are never saved or
resurfaced, and drill progress is deliberately ephemeral (in-memory only) as of M5. This is the
single biggest retention lever for a learning app and the one most directly called for by the
spaced-repetition principle in `docs/LEARNING-APPROACH.md` (learning-app review, 2026-06-16). Ticket
[[0068-pwa-drills-nav-summary]] already specified the session summary shape to be "derivable so M6
can persist it" — this is that M6 follow-through.

## Acceptance criteria

- [ ] Missed spots (and the concept they exercise) are **persisted** across sessions — a lightweight
      IndexedDB-backed store, reusing the `HandHistoryStore` pattern.
- [ ] Later sessions **re-queue** weak/failed concepts (resurface a missed spot type, not
      necessarily the byte-identical deal) so the learner gets spaced reps on their mistakes.
- [ ] Integrates with the interleaved session composer ([[0066-drills-themed-sets]]) rather than
      replacing it; re-queued spots interleave, not block.
- [ ] Tests cover persistence + re-queue selection; degrades gracefully when storage is unavailable.

## Notes

**Cross-milestone:** tagged **M6** because it depends on durable storage
([[0010-stats-and-leak-detection]]), but it is the retention payoff of the M5.5 Drills v2 epic
([[0076-drills-v2]]) — coordinate the two. Sequence after the M6 stats persistence layer exists so
both share one storage approach rather than inventing a second. Feeds naturally into per-concept
mastery ([[0081-drills-mastery-difficulty-glossary]]).
