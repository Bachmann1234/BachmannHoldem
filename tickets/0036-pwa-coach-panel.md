---
id: 0036
title: PWA inline coach panel (DOM)
type: feature
status: done
milestone: M4
priority: high
created: 2026-06-13
---

## Context

The coach is the point of the app (ROADMAP / LEARNING-APPROACH): score the **decision**, not the
result. The confirmed design (`docs/design/m4-pwa/`) makes the coach **on-demand** — a corner **FAB**
that opens a **bottom drawer** (`.coach-fab` + `CoachDrawer` in `app.jsx`/`styles.css`), _not_ an
always-on panel. After the hero acts the FAB shows a quiet ✓ / ! / · dot. The drawer lays out the
shared model's `CoachResult` (equity % + win/lose bar, pot odds, EV-of-call metric cards, the
good/leak verdict, plus the preflop chart classification when present). It does **no** verdict math —
all of that lives in `@holdem/coach` and is already computed by the reducer.

Design-sensitive but **direction confirmed** — build the drawer to the design. **Coach tone:
encouraging** (the warm copy variant in the design's `TONE_COPY`).

**Resolved (user decision, 2026-06-14): post-action verdict only.** Ship the drawer over the existing
post-action `CoachResult` (good/leak verdict + equity/pot-odds/EV metrics + preflop chart). Do NOT
add a pre-action "live read" — that needs a `@holdem/coach` API addition and is deferred to a later
coach-package ticket, keeping M4 "just the UI." The drawer's empty/`none` state simply prompts the
hero to act and check back.

## Acceptance criteria

- [x] A coach FAB (with the post-action ✓/!/· dot) opens a bottom drawer rendering all three
      `CoachResult` states: `none` (placeholder prompting "open during your turn"), `verdict` (the
      `DecisionVerdict` laid out — equity + win/lose bar, pot odds, EV metric cards, the good/leak
      call with encouraging copy — plus the preflop chart verdict when present), and `error` (the
      one-line advisory notice — coaching never crashes the hand).
- [x] Uses `@holdem/format` coach value formatters for every number/label (no re-formatting in the
      component); updates in place as the hand progresses and shows the hero's last decision while
      bots act.
- [x] Mobile layout integrates with the table without obscuring play (e.g. a panel/sheet per the
      approved design); legible at phone width.
- [x] Component-tested across the three states; `pnpm verify` green.

## Notes

Strictly presentational, like the TUI panel — the reducer already produced the `CoachResult`; this
ticket only lays it out. Keep the framing the LEARNING-APPROACH doc calls for: decision-quality
feedback is the measure, not win-rate-vs-bots. Reuse formatters from `@holdem/format` so the PWA and
TUI can never diverge on how a verdict reads; if the encouraging copy touches numbers, keep it in
`@holdem/format`. Build the drawer to `docs/design/m4-pwa/`. Depends on [[0035-pwa-play-loop]].
