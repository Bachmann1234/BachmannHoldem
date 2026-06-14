---
id: 0028
title: TUI live coach panel
type: feature
status: done
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

The payoff of the whole project, in the TUI: a live coach panel that shows the deterministic
`@holdem/coach` verdict for each hero decision — equity, pot odds, the chip EV of calling, the
EV-correct action, and the good/leak/break-even tag — plus, preflop, the starting-hand chart tier
and rationale. This is the TUI rendering of what `apps/cli` prints as a `── Coach ──` block today.

## Acceptance criteria

- [x] A coach-panel component that renders a `DecisionVerdict` (and, preflop, a
      `StartingHandVerdict`) as laid-out Ink components: equity & pot odds as percents, EV as a
      signed chip number, the EV-correct action, and a colour-coded good/leak/break-even headline.
- [x] The verdict is computed via `coachDecision(ctx, action)` (and `classifyStartingHand`
      preflop) from the hero's spot — the `DecisionContext` captured **before** the action is
      applied (while it is still the hero's turn, as `decisionContext` requires) — and shown after
      the hero acts. Coaching is advisory: a verdict error degrades to a notice, never crashes the
      app.
- [x] The panel updates in place as the hand progresses. Component is `ink-testing-library`-tested
      across good / leak / break-even and a preflop tier; `pnpm verify` green.

## Notes

Depends on [[0027-tui-action-input]] and [[0031-coach-multiway-equity]], and reuses
[[0007-coaching-engine]]'s `@holdem/coach` exactly as `apps/cli/src/play.ts` `coachHero` does (incl.
the capture-context-before-applying ordering and the advisory try/catch). With 0031 in place the
verdict's equity already reflects the **live number of opponents** at the table — the panel just
renders the `DecisionVerdict` it gets, doing **no** verdict math of its own. Colour-code the verdict (green good / red leak / yellow
break-even) and reuse the percent/signed-chip formatting conventions from the CLI's `table.ts`
(`62.5%`, `+4`, a bare `0` for near-zero EV).
