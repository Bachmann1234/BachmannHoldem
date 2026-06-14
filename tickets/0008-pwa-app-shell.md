---
id: 0008
title: 'Epic: PWA app shell'
type: epic
status: in-progress
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

### Decomposition (M4)

**What matters most:** the PWA is the _second_ React shell over the same poker brain, so the win is
**sharing, not re-porting** — the MVU model/reducer/coach loop the TUI already proved carries over
verbatim (ROADMAP: "only the terminal-vs-DOM render layer differs"). Extract that core once, then
build the DOM layer on top. And per LEARNING-APPROACH, the coach (decision-quality feedback) is the
asset the table exists to serve — keep it first-class, not buried.

**Design-in-the-loop (the M4 exception):** the table/controls/coach-panel tickets are gated on a
confirmed visual direction (a designer in the loop) before implementation — see
[[0034-pwa-table-view]] / [[0035-pwa-play-loop]] / [[0036-pwa-coach-panel]]. The plumbing tickets
([[0032-session-core-package]], [[0033-pwa-scaffold]]) are design-agnostic.

Broken into per-feature tickets, in dependency order:

- [[0032-session-core-package]] — extract the shared MVU core into pure `@holdem/session` (blocks all)
- [[0033-pwa-scaffold]] — Vite + React + `vite-plugin-pwa`; installable & offline shell
- [[0034-pwa-table-view]] — the mobile-first poker-table DOM view _(design-gated)_
- [[0035-pwa-play-loop]] — setup + action controls + bot turns + session _(design-gated)_
- [[0036-pwa-coach-panel]] — inline coach panel _(design-gated)_
- [[0037-pwa-hand-history]] — local hand-history storage (IndexedDB)
- [[0038-pwa-deploy]] — deploy to free static hosting over HTTPS (closes the epic)

Per ROADMAP, large UI milestones get a **mid-milestone `/milestone-review` checkpoint** (~6 tickets
in / when drift shows) in addition to the boundary review.
