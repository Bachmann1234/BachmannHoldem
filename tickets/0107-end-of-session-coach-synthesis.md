---
id: 0107
title: 'Epic: End-of-session coach synthesis'
type: epic
status: todo
milestone: M9
priority: medium
created: 2026-06-20
---

## Context

At the end of a play session, the coach should look back over the hands you just played and give
**one synthesized read** — _"looking over your hands tonight, here's the thing to work on"_ — anchored
to the specific spots that earned it. Today the coach grades each decision **live and then throws it
away**: `model.coach` is reset to `{ kind: 'none' }` every hand and never retained. So the moment a
session ends, every ruling the coach made is gone, and the `game-over` screen has nothing to
synthesize from.

This is the **narrow/deep, per-session** complement to M6's **broad/longitudinal** Stats screen
([[0010-stats-and-leak-detection]]). M6 answers "across all your hands, what are your tendencies?" and
is gated on sample size — so a single 20–40-hand session almost never confirms a population-level leak,
and an aggregate run would honestly have to say "keep playing, not enough hands." This epic answers a
**different, gate-free** question: "in _these specific hands you just played_, what did I actually see?"
Those are **facts about real decisions**, not population claims — so they sidestep the M6 sample gate
honestly instead of fighting it.

**Determinism, as always.** The recap is folded from the session's own deterministic per-decision
verdicts (the `DecisionVerdict` / `PreflopVerdict` the coach already computed live). The math is the
source of truth, it works fully offline with zero config, and there is no server and no network
boundary. An optional LLM **narration** layer ([[0011-llm-coaching]]) can later reword the structured
recap in a warmer voice — but it would only re-phrase numbers this epic already computed, never compute
them, and the recap degrades to its own deterministic text when no key is present. Build the
deterministic recap first; it is useful on its own and it is the trustworthy substrate the LLM narrates.

## Acceptance criteria

- [ ] The session **retains** each hero decision's coach verdict across the whole session instead of
      discarding it each hand (foundation — [[0108-session-graded-decision-log]]).
- [ ] A **pure, deterministic** `synthesizeSession` in `@holdem/coach` folds the session's retained
      verdicts into a small, prioritized recap: the one or two things to work on, each **anchored to
      the specific hands** that earned them, with an honest "clean session / too few hands to call it"
      when nothing rises ([[0109-coach-session-synthesis]]).
- [ ] The PWA renders the recap on the `game-over` state — the end-of-session review screen
      ([[0110-pwa-session-recap-screen]]).
- [ ] No server, no network dependency, no key required: the whole feature runs offline. The recap
      output is a **structured object** an optional LLM layer ([[0011-llm-coaching]]) could later
      narrate without computing anything.

## Notes

**Synthesize over live per-decision verdicts, NOT aggregate leak stats.** This is the load-bearing
design decision. Per-session aggregate leak claims collide with M6's mandatory sample-size gate
([[0088-leak-detection]]) — one session rarely clears the gate, so an aggregate recap would usually be
"not enough hands." Synthesizing over the session's _own graded decisions_ keeps every statement a fact
about a hand that was actually played ("you called off light on the river in hands #7 and #14"), which
is both honest about sample and far more concrete than a population stat.

**Reuse the rulings that already exist — don't re-grade or invent a second grading path.** `CoachResult`
(`packages/session/src/model.ts`) already carries, per graded decision, the exact `DecisionContext` +
`Action` + the `DecisionVerdict` / `PreflopVerdict`. Each verdict already exposes the signal synthesis
needs: `verdict` (`good` / `leak` / `breakEven`) and a `concept` tag on the postflop side
(`equity-vs-price` / `pot-odds` / `ev` / `position`), `tier` / `advice` / `good`-vs-`leak` on the
preflop side. Synthesis is a pure fold over those — group the leaks, find the dominant theme, pick the
sharpest exemplars. No equity is recomputed.

**Relationship to [[0011-llm-coaching]] (BYOK narration).** This epic is the deterministic substrate;
0011 becomes the thin _optional_ layer on top. BYOK (the user brings their own Anthropic key, the PWA
calls the API directly from the browser — no proxy) removes the **only** reason 0011 was deferred (the
serverless key-proxy). That layer is out of scope here; this epic ships and stands on its own with no
key.

## Decomposition (2026-06-20)

Dependency-ordered. The first ticket is the data foundation (without retention there is nothing to
synthesize); the second is the pure brain logic; the third is the UI.

- [[0108-session-graded-decision-log]] — retain each hero decision's coach verdict into a
  session-scoped log instead of discarding it each hand; expose it at `session-over` / `game-over`.
- [[0109-coach-session-synthesis]] — pure `synthesizeSession` in `@holdem/coach`: retained verdicts →
  a small, prioritized, hand-anchored recap, with honest empty/low-sample handling.
- [[0110-pwa-session-recap-screen]] — render the recap on the `game-over` screen.
