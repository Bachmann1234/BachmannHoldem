---
id: 0037
title: PWA local hand-history storage (IndexedDB)
type: feature
status: done
milestone: M4
priority: medium
created: 2026-06-13
---

## Context

Persist completed hands locally so the play history survives reloads and offline use — the storage
foundation the M6 stats & leak-detection work ([[0010-stats-and-leak-detection]]) is built on. The
app is client-only with no backend, so this is IndexedDB in the browser. M4's job is the **durable
store + the recording seam**, not the analytics UI (that's M6); a minimal "recent hands" view is
enough to prove it round-trips.

## Acceptance criteria

- [x] A typed hand-history store over IndexedDB: append a completed hand's record (the
      serialisable result of a finished `HandState` — players, stacks, board, hero's decisions +
      their coach verdicts, timestamp) and read them back ordered.
- [x] The play loop ([[0035-pwa-play-loop]]) records each hand exactly once when it completes, via a
      narrow seam — no storage calls scattered through the reducer/render (the reducer stays pure;
      persistence is a shell effect).
- [x] Works offline and persists across reloads; a minimal history view (or list) confirms records
      round-trip. Storage failures degrade gracefully (play is never blocked by a write error).
- [x] The store's serialisation/shaping logic is unit-tested (fake-indexeddb or an injected store
      interface); `pnpm verify` green.

## Notes

Keep the record shape stable and explicit — M6 will query it for VPIP/PFR/aggression and leak
detection, and LEARNING-APPROACH requires those stats be **gated behind a minimum sample size**, so
store enough per hand to compute them later. Define a small store interface so the recording seam is
testable without a real IndexedDB and so M6 can read through the same contract. Don't build the
stats/analytics here — just the durable log + the recording hook. Depends on
[[0035-pwa-play-loop]].
