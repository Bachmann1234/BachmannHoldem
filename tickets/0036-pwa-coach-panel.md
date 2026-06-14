---
id: 0036
title: PWA inline coach panel (DOM)
type: feature
status: todo
milestone: M4
priority: high
created: 2026-06-13
---

## Context

The coach is the point of the app (ROADMAP / LEARNING-APPROACH): score the **decision**, not the
result. Surface the shared model's `CoachResult` — the grade of the hero's most recent decision —
inline beside/under the table, the DOM analog of the TUI's `CoachPanel` ([[0028-tui-coach-panel]]).
It renders stored model state only (equity / pot odds / EV / good-vs-leak, plus the preflop
starting-hand classification when present); it does **no** verdict math — all of that lives in
`@holdem/coach` and is already computed by the reducer.

Design-sensitive: this is the learning surface and must read clearly on a phone, following the
approved design. Do not start until the design direction is confirmed.

## Acceptance criteria

- [ ] A `CoachPanel` component renders all three `CoachResult` states: `none` (dim placeholder
      before the hero's first decision), `verdict` (the `DecisionVerdict` laid out — equity, pot
      odds, EV, the good/leak call — plus the preflop chart verdict when present), and `error` (the
      one-line advisory notice — coaching never crashes the hand).
- [ ] Uses `@holdem/format` coach value formatters for every number/label (no re-formatting in the
      component); updates in place as the hand progresses and shows the hero's last decision while
      bots act.
- [ ] Mobile layout integrates with the table without obscuring play (e.g. a panel/sheet per the
      approved design); legible at phone width.
- [ ] Component-tested across the three states; `pnpm verify` green.

## Notes

Strictly presentational, like the TUI panel — the reducer already produced the `CoachResult`; this
ticket only lays it out. Keep the framing the LEARNING-APPROACH doc calls for: decision-quality
feedback is the measure, not win-rate-vs-bots. Reuse formatters from `@holdem/format` so the PWA and
TUI can never diverge on how a verdict reads. **Design-gated.** Depends on [[0035-pwa-play-loop]].
