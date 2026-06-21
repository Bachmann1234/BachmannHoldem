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

**BYOK reframing (2026-06-20).** The deferral rationale above hinges on the serverless key-proxy being
"the only server-side code in the project." A **bring-your-own-key** approach removes exactly that: the
user pastes their own Anthropic key (stored in the app's existing IndexedDB durable layer) and the PWA
calls the API **directly from the browser** (Anthropic TS SDK `dangerouslyAllowBrowser` +
`anthropic-dangerous-direct-browser-access`) — no proxy, no backend, no key of ours. That deletes the
one cost that parked this. If pulled, the narration model is **Haiku 4.5** (`claude-haiku-4-5`) —
narration is just rewording numbers already computed, the cheapest possible LLM job (fractions of a
cent per session on the user's own key).

**Substrate is now [[0107-end-of-session-coach-synthesis]] (M9).** That epic ships the deterministic
`SessionRecap` — a structured object the coach owns and computes offline. This ticket, if ever pulled,
becomes the **thin optional layer** that rewords that recap (and the live per-decision verdicts) in a
warmer voice, gated on a key, degrading to the deterministic text when no key is present. It computes
nothing — it only narrates what M9 already produced.
