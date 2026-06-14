---
id: 0048
title: Local-only lesson progress + completion hand-off
type: feature
status: todo
milestone: M4.5
priority: medium
created: 2026-06-14
---

## Context

The epic ([[0042-foundations-primer]]) requires that "lesson content/progress is local-only (no
backend); completing the primer hands the player off to free play and, when it exists, M5 drills."
The lesson player ([[0047-pwa-lesson-player]]) drives a lesson in memory; this ticket makes the
player's **progress** durable across reloads and closes the completion loop, keeping the app fully
offline (a precached static shell — there is no backend, by design, see ROADMAP).

## Acceptance criteria

- [ ] Lesson progress (which lessons/spots are completed) persists locally across reloads — `localStorage`
      (sync, simple, ample for a handful of lessons) unless the player already uses the IndexedDB seam
      from [[0037-pwa-hand-history]] and reuse is cleaner. Whatever the store, isolate it behind a
      tiny typed seam like the hand-history `HandHistoryStore`, and degrade gracefully (a storage
      failure never breaks the primer — mirror the history store's wrapped writes).
- [ ] The Learn lesson list ([[0046-pwa-learn-nav]]) reflects completion state (e.g. completed
      lessons marked), and the player resumes at the next unanswered lesson/spot rather than restarting.
- [ ] Completing the primer surfaces a clear hand-off: a prompt/CTA toward free play (and a
      forward-looking nod to M5 drills when they exist), per the epic.
- [ ] Tests: progress round-trips through the store (save → reload → reflected in the list), a store
      failure degrades gracefully, and completion shows the hand-off. `pnpm verify` green.

## Notes

Depends on [[0046-pwa-learn-nav]] and [[0047-pwa-lesson-player]]; the last UI ticket of the
milestone. Keep the persisted shape minimal and versioned-tolerant (a stored blob from an older
lesson set must not crash — ignore unknown ids). Don't put progress in the `@holdem/session` reducer
(it is primer state, not poker state). Match the M4 store idiom ([[0037-pwa-hand-history]]'s
`store.ts`) for the persistence seam and its graceful-degradation pattern.
