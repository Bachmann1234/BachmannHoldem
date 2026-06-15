---
id: 0055
title: Coach value betting & aggression, not just fold-vs-continue
type: feature
status: done
milestone:
priority: medium
created: 2026-06-14
---

## Context

The coach grades **only the fold-vs-continue decision** — `coachDecision` scores a
`bet`/`raise` exactly like a `call`/`check` (any non-fold is a "continue"), and sizing is
explicitly out of scope ([[0021-coach-decision-verdict]]). So half of winning poker —
extracting value, betting for protection, bluffing, denying equity — is invisible to the
coach, and a beginner is never told when they are _leaving money on the table_.

Reproduced:

```
pnpm sim -- --seed=29 ...   # hero flops an overpair Ts Td on 6h 7s 2d vs a passive bot
# Checking it down all three streets:  every street → Good
# BETTING the same overpair:           identical verdict (Equity 62.0%  EV(call) +2.5  Good)
```

The coach cannot say "you should be betting here for value" — it blesses the passive line.
It also cannot grade sizing: a QQ min-raise (`r4`) and a 75bb overbet (`r150`) both grade
`Premium / Good`. A learner drilled on this becomes passive and never learns to bet.

A secondary, cheap fix in the same area: the postflop block prints `EV(call)` even on a
**free check** and on a **bet**, where there is nothing to call — it is really equity×pot and
the label misleads about what the number is.

## Acceptance criteria

- [x] When the hero has high equity in an unbet / small pot and just checks or flat-calls,
      the coach flags a **missed value bet** (over-passivity) rather than only blessing the
      continue. `DecisionVerdict.missedValueBet` fires on `toCall === 0 && check && equity ≥
    VALUE_BET_THRESHOLD` (0.60); surfaced once for all clients via the `explainDecision`
      nudge. (Scoped to the unbet-pot check — the murkier flat-call-could-raise case is left
      out deliberately; see Resolution.)
- [x] Fix the misleading `EV(call)` label for spots with nothing to call (a free check and a
      bet) — label it as the pot-equity value it is, or omit it. New shared `evMetric(verdict)`
      relabels to `Pot equity` when `potOddsThreshold === 0`, used by all three coach renderers
      (CLI / TUI / PWA) and the CLI ground-truth diagnostic; the value is unchanged.
- [x] Any sizing/aggression guidance stays deterministic where it can be, and is clearly
      scoped: full bet-sizing optimization is **not** required here (it needs fold-equity
      assumptions we don't own — see notes). Bet-sizing is explicitly NOT done.
- [x] Tests cover the over-passivity flag and the relabeled metric; `pnpm verify` green.

## Resolution

Added `VALUE_BET_THRESHOLD` + `DecisionVerdict.missedValueBet` in `packages/coach/src/verdict.ts`
(deterministic; the flag is additive and never flips the `good` verdict on a free check). The
nudge is surfaced through `explainDecision` and the `EV(call)→Pot equity` relabel through a new
`evMetric` helper in `packages/format/src/coachValues.ts`, so the CLI, TUI, and PWA stay
identical. Deliberately scoped out: bet-_sizing_ (needs the fold-equity assumption the
deterministic engine doesn't own — candidate for the optional LLM layer [[0011-llm-coaching]])
and the flat-call-could-raise case. The gated equity is already table-size aware (read against
`numActive - 1` villains); the pot-control nuance of a thin multiway value bet is a sizing
concern left out of scope.

## Notes

Child of [[0051-coach-fidelity-epic]] (cross-cutting). The deferral was deliberate at
[[0021-coach-decision-verdict]]: correct sizing needs `evOfBet`'s `villainCallProbability`,
a fold-equity assumption the deterministic engine doesn't own. So scope this as (a) a
heuristic over-passivity flag — e.g. equity ≥ ~60% in a small/unbet pot ⇒ "bet for value" —
which is deterministic, plus (b) the cheap `EV(call)` relabel; richer sizing/bluff narration
likely belongs to the optional LLM layer ([[0011-llm-coaching]]), not this ticket. Decide
the (a)/(b)-now vs LLM-later split when pulled. The `explainDecision` "why" line
([[0049-coach-why-line]]) is the natural place to surface the value-bet nudge.
