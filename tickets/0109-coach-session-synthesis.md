---
id: 0109
title: Deterministic session synthesis — retained verdicts to a prioritized, hand-anchored recap
type: feature
status: todo
milestone: M9
priority: high
created: 2026-06-20
---

## Context

With the session retaining its graded decisions ([[0108-session-graded-decision-log]]), this ticket
adds the **brain**: a pure, deterministic function in `@holdem/coach` that folds that log into a small,
prioritized recap — the _"looking over your hands tonight, here's what I'd work on"_ read that
[[0107-end-of-session-coach-synthesis]] is about. It is the deterministic source of truth; an optional
LLM layer ([[0011-llm-coaching]]) would later only reword its output, never compute it.

Crucially this synthesizes over the session's **own per-decision verdicts** — facts about the specific
hands played — **not** population-level aggregate leak stats. That keeps every statement honest about
sample (it is describing decisions that actually happened, not extrapolating a tendency) and sidesteps
the M6 sample-size gate ([[0088-leak-detection]]) rather than fighting it.

## Acceptance criteria

- [ ] A pure `synthesizeSession(log): SessionRecap` lives in `@holdem/coach` (no UI, no I/O, no
      network) and is fully deterministic: same log → same recap.
- [ ] It folds the retained verdicts into a **prioritized** recap of **at most one or two** takeaways —
      not a per-hand dump. Prioritization groups the session's **leaks** (postflop `verdict === 'leak'`
      by `concept`; preflop `'leak'` by tier/advice shape) and surfaces the **dominant theme** — the
      concept the hero leaked on most this session — over noise.
- [ ] Each takeaway is **anchored to specific hands** — it names the exemplar hands (by the per-hand
      ordinal / hole cards captured in [[0108-session-graded-decision-log]]) that earned it, so the
      recap can say "you called off light on the river in hands #7 and #14," not "you over-call."
- [ ] **Honest empty / low-signal handling.** A clean session (no leaks) returns a positive,
      truthful recap ("solid session — nothing stood out as a leak"), not a manufactured criticism. A
      session with **too few graded decisions to say anything** returns an explicit "too few hands this
      session to call out a pattern — here's what I noticed" rather than overclaiming. No fabricated
      advice when the signal isn't there.
- [ ] `SessionRecap` is a **structured object** (the prioritized takeaways, each with its theme, its
      anchored exemplars, and a deterministic plain-English line) — shaped so the PWA renders it
      directly ([[0110-pwa-session-recap-screen]]) **and** so an LLM narration layer
      ([[0011-llm-coaching]]) could later reword it without computing anything. The deterministic
      plain-English line IS the offline default.
- [ ] Co-located tests cover: dominant-theme selection across mixed leaks; the one/two-takeaway cap;
      exemplar anchoring; the clean-session and too-few-hands branches; determinism (same input → same
      output).
- [ ] `pnpm verify` fully green.

## Notes

**Reuse the verdict signal — recompute nothing.** Each retained entry already carries a graded
`DecisionVerdict` (with `verdict` ∈ `good`/`leak`/`breakEven` and a `concept` tag —
`equity-vs-price` / `pot-odds` / `ev` / `position`) or `PreflopVerdict` (`tier`, `advice`, `good`-vs-
`leak`). Synthesis is a pure aggregation over those fields. No equity, pot-odds, or EV is recomputed —
the live coach already did that work; this only counts, ranks, and selects exemplars.

**Why not aggregate stats.** VPIP/PFR/fold-to-3bet etc. are the M6 longitudinal view and are
sample-gated for good reason. This recap deliberately speaks in terms of _graded decisions that
happened this session_, which need no population gate because they make no population claim. Keep the
two distinct: M6 = "your tendencies over time," M9 = "what I saw in tonight's hands."

**Tone is hand-written and deterministic.** The plain-English lines are template/prose the coach owns
(the same discipline as the leak `message` prose in `apps/pwa/src/history/leaks.ts`), not LLM output.
The LLM, if ever enabled, only rephrases these.

**Voice consistency.** Lean on existing coach vocabulary where it fits — the `Concept` tags and the
sizing `Intent` atoms ([[0101-coach-sizing-intent-and-bands]]) are the shared language the live coach
already speaks, so the recap sounds like the same coach.
