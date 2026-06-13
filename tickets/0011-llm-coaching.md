---
id: 0011
title: 'Epic: LLM coaching polish (optional)'
type: epic
status: todo
milestone: M7
priority: low
created: 2026-06-13
---

## Context

Optional polish: natural-language explanations on top of the trustworthy math. The LLM narrates
deterministic numbers — it never computes them.

## Acceptance criteria

- [ ] Thin serverless key-proxy (the only server-side code in the project) to hold the API key
- [ ] Feed coach output to Claude for plain-English "why" + cross-session pattern commentary
- [ ] Graceful offline fallback to deterministic-only coaching

## Notes

Introduces the only network dependency. Depends on [[0007-coaching-engine]]. Use the latest
Claude model available at build time.
