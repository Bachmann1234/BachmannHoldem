---
id: 0008
title: 'Epic: PWA app shell'
type: epic
status: todo
milestone: M4
priority: high
created: 2026-06-13
---

## Context

The first "real" version: a native-feeling, installable Android PWA in `apps/pwa`, built on the
already-tested engine/odds/bots/coach packages.

## Acceptance criteria

- [ ] React + Vite + `vite-plugin-pwa` — installable to home screen, works offline
- [ ] Poker-table UI: play vs bots with inline coaching feedback
- [ ] Local hand-history storage (IndexedDB)
- [ ] Deployed to free static hosting over HTTPS

## Notes

No engine porting — the pure-TS packages are consumed directly. This is "just" the UI + storage +
PWA plumbing. Depends on [[0006-heuristic-opponents]] and [[0007-coaching-engine]].
