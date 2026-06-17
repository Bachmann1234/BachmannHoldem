---
id: 0011
title: 'Epic: LLM coaching polish (deferred idea — not committed)'
type: epic
status: todo
milestone: stretch
priority: low
created: 2026-06-13
---

## Context

Optional polish: natural-language explanations on top of the trustworthy math. The LLM narrates
deterministic numbers — it never computes them.

**Deprioritized (2026-06-17): moved off the committed arc (was M7) to a deferred idea, alongside the
GTO stretch ([[0012-gto-solver]]).** Rationale: this is pure narration polish, and it is the _only_
thing in the whole app that would introduce a network boundary (the serverless key-proxy below). That
cost — a backend to own, a key to hold, an online dependency in an otherwise offline static shell —
isn't worth it just to reword numbers the deterministic coach already explains well. Only pull this if
it clearly earns that cost. See `docs/ROADMAP.md` ("Deferred — ideas, not committed").

## Acceptance criteria

- [ ] Thin serverless key-proxy (the only server-side code in the project) to hold the API key
- [ ] Feed coach output to Claude for plain-English "why" + cross-session pattern commentary
- [ ] Graceful offline fallback to deterministic-only coaching

## Notes

Introduces the only network dependency. Depends on [[0007-coaching-engine]]. Use the latest
Claude model available at build time.
