---
id: 0102
title: Sizing verdict, risk/reward guardrail & explanation
type: feature
status: done
milestone: M8
priority: medium
created: 2026-06-19
---

## Context

Turns the recommendation from [[0101-coach-sizing-intent-and-bands]] into a graded verdict the clients
render. Compares the hero's actual bet/raise size to the recommended band, produces a grade with a
plain-language _why_, and carries it on the verdict the way `missedValueBet` / `heroBet` already ride
along. Part of [[0100-coach-betting-sizing-guidance]]; this is where the cheap tier-1 win — the
risk/reward sanity guardrail — becomes visible.

## Acceptance criteria

- [x] `DecisionVerdict` carries a deterministic `sizing` read — the classified `intent`, the
      recommended `band`, a `verdict` of good / too-big / too-small, and a `why` — and the whole read
      is `null` when the action isn't a bet/raise (a fold/call/check has no size to grade). Mutually
      consistent with the existing continue-verdict fields.
- [x] **Risk/reward guardrail (needs no fold-equity):** the egregiously-dominated sizes are flagged
      from arithmetic alone — an over-shove ("you risked 200 to win 3"; only worse hands fold and only
      better hands call), an absurd min-bet ("lays 5:1, charging nothing"). This flips the ATo
      open-shove from a green "exactly right" to a clear sizing leak while the _hand_ grade stays
      correct.
- [x] The continue-decision verdict is unchanged — sizing is an **additional** signal layered on, not
      a re-grade. A good continue with a bad size reads as "right call, wrong size", never as a flipped
      continue verdict.
- [x] `explainDecision` emits a sizing line in one place all clients share, in the primer's peg
      vocabulary, distinguishing value / bluff / protection intent in the wording (so it never
      mis-describes a protection bet as value, etc.).
- [x] Seeded & deterministic; tests cover in-band (good), over (too-big, incl. the shove guardrail),
      under (too-small, incl. the min-bet), the size-agnostic spot (no false leak), and that
      fold/call/check produce `sizing: null` with no spurious line.
- [x] `pnpm verify` green.

## Notes

Depends on [[0101-coach-sizing-intent-and-bands]]. The guardrail cases are worth landing first within
this ticket — they're the highest value per effort (a real wrong verdict fixed) and they don't depend
on the fuller band nuance being perfectly tuned.

Stay deterministic: the _why_ is risk/reward and purpose, never a fabricated optimal number or a
solver claim. EV-of-size illustration via `evOfBet` (under labelled assumptions) is explicitly a
deferred follow-up from the epic, not this ticket.
