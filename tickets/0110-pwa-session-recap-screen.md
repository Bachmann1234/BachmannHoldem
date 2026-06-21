---
id: 0110
title: End-of-session recap screen — render the coach's synthesis on game-over
type: feature
status: todo
milestone: M9
priority: medium
created: 2026-06-20
---

## Context

[[0108-session-graded-decision-log]] retains the session's graded decisions and
[[0109-coach-session-synthesis]] folds them into a structured `SessionRecap`. This ticket renders that
recap to the player at the end of a session — the visible payoff of
[[0107-end-of-session-coach-synthesis]]: when the session ends, the coach's _"looking over your hands
tonight, here's the thing to work on"_ read appears on the `game-over` screen.

The `game-over` phase is already the end-of-session summary surface (the reducer transitions the final
hand to `session-over`, which the hero dismisses to `game-over` — `packages/session/src/model.ts`).
This adds the synthesized recap to that screen.

## Acceptance criteria

- [ ] On the `game-over` screen, the PWA calls `synthesizeSession` over the retained log
      ([[0108-session-graded-decision-log]]) and renders the resulting `SessionRecap`: the one or two
      prioritized takeaways, each with its deterministic plain-English line and its **anchored exemplar
      hands** (e.g. "hands #7, #14").
- [ ] The clean-session and too-few-hands branches render their honest copy
      ([[0109-coach-session-synthesis]]) — a positive note when nothing stood out, an explicit
      "too few hands to call a pattern" when the session was short — never a manufactured criticism.
- [ ] Works **fully offline with zero config** — no key, no network. This screen renders the
      deterministic recap only; the optional LLM narration ([[0011-llm-coaching]]) is **out of scope**
      here (it would later swap in reworded text behind a feature gate, leaving this deterministic
      render as the fallback).
- [ ] Visual treatment is consistent with the existing coach surfaces (the live coach panel / review
      drawer) so it reads as the same coach voice — reuse existing coach-panel styling/components
      rather than inventing a new visual language.
- [ ] The recap does not block the existing `game-over` actions (start a new session, etc.) — it is
      added to that screen, not a modal that traps the player.
- [ ] Co-located component test(s): a multi-takeaway recap renders its takeaways + exemplars; the
      clean-session and too-few-hands recaps render their respective copy.
- [ ] `pnpm verify` fully green.

## Notes

**Pure render of an owned structure.** All the analysis is done in `@holdem/coach`
([[0109-coach-session-synthesis]]); this component only renders the `SessionRecap`. Keep it a
presentation component — no synthesis logic leaks into the PWA.

**Relationship to the Stats screen.** This is the per-session, in-the-moment review at the end of a
play session; the M6 Stats tab ([[0089-stats-screen]]) remains the longitudinal "analyze my hands
over time" view. They are complementary surfaces, not duplicates — this one is reached by _finishing a
session_, the Stats tab by _navigating to it_.

**Future BYOK narration hook.** Leave the seam clean: this screen takes a `SessionRecap` and renders
its deterministic lines. When [[0011-llm-coaching]] lands, a narration layer can produce reworded lines
from the same `SessionRecap` and this screen renders those instead when a key is present — no
restructuring required.
