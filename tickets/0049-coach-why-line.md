---
id: 0049
title: Deterministic "why" line for the coach (shared across shells + primer)
type: feature
status: done
milestone:
priority: high
created: 2026-06-14
---

## Context

The play coach grades a decision and shows the **numbers** (equity / pot-odds / EV), a good/leak
**headline**, and a **generic, identical-every-time** definition note ("equity is your share… pot
odds are the price… continue when equity beats the price"). It never states the **spot-specific
reason** that connects them — it shows `25%`, `33%`, `-3.2` and a "leak" badge and leaves the player
to infer "25 < 33, so folding was right." The _why_ is implicit in three cards, not stated.

The Foundations primer ([[0042-foundations-primer]]) exposed the gap: `packages/curriculum/src/grade.ts`
already synthesises a causal sentence (`explainCoach`), but (a) the live play coach
(`apps/pwa/src/components/CoachDrawer.tsx`, `apps/tui/src/components/CoachPanel.tsx`) doesn't show
one, and (b) even the primer's result drawer doesn't render it. So the lessons _could_ explain the
why and the table can't — an inconsistency, and an easy, deterministic win.

This is the **deterministic** half of "say why" — synthesised from the numbers the coach already
owns, no AI. Rich natural-language narration (outs, draws, board texture in prose) stays
**M7 / LLM** ([[0011-llm-coaching]]) by design; the coach's equity is a range-based Monte-Carlo
number, not decomposed into outs, so a deterministic line explains the equity-vs-price logic, not
where the equity comes from.

## Acceptance criteria

- [x] `@holdem/format` exports a pure `explainDecision(verdict: DecisionVerdict): string` that builds
      a one-sentence, label-free deterministic explanation from the verdict's numbers
      (`equity` / `potOddsThreshold` / `callEv` / `correctDecision` / `verdict`), covering: a priced
      **continue** decision, a priced **fold** decision, a **free check** (no price), and a
      **break-even** coin-flip. Numbers render through the existing `pct` / `signedChips`.
- [x] The PWA `CoachDrawer` renders `explainDecision(verdict)` for postflop verdicts, replacing the
      generic static note (the spot-specific line teaches what the generic one only defined).
- [x] The TUI `CoachPanel` renders the same line under the postflop verdict.
- [x] The PWA primer lesson-result drawer (`LessonPlayer`) renders the same line for its
      continue-decision (coach-graded) spots, so the lesson and the live table explain a verdict
      identically.
- [x] The primer reuses the shared builder: `curriculum`'s `grade.ts` `explainCoach` delegates to
      `explainDecision` (no duplicated phrasing).
- [x] Tests cover each branch of `explainDecision`; the shell + primer tests stay green; `pnpm verify`
      green.

## Notes

A small, cross-cutting coach enhancement pulled between milestones (precedes M5, whose drills reuse
the same result surface). Keep `explainDecision` pure in `@holdem/format` (no UI/DOM) — it's the same
"phrase the verdict identically across all clients" concern that already lives there
([[0030-cli-headless-harness]] consolidated `pct`/`signedChips`/`VERDICT_LABEL` there for exactly
this reason). Preflop already shows the chart `rationale` (its own why), so this ticket is the
**postflop** line. Reuses, doesn't re-derive: the math is all on the verdict already.
