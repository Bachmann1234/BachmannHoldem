---
id: 0021
title: Coach package scaffold + per-decision verdict
type: feature
status: done
milestone: M3
priority: high
created: 2026-06-13
---

## Context

The spine of the coaching engine, in a new `packages/coach`. Given the imperfect-information view
of a spot the player faced and the action they actually took, produce a **deterministic verdict**:
the player's equity, the pot odds, the EV-correct continue decision, and a good/leak classification
of what they did. This is the asset the whole app exists for — coach the _decision_, not the result
(see [../docs/LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md)).

All correctness here is math we already own in `@holdem/odds`; reuse it, do not re-derive it. The
optional LLM layer ([[0011-llm-coaching]]) will only narrate these numbers later.

## Acceptance criteria

- [x] `packages/coach` scaffolded like the sibling pure packages (`package.json`, `tsconfig.json`,
      `src/index.ts`), wired into root `tsconfig.json` references and the `vitest.config.ts`
      coverage `include`, and passing `pnpm verify` above the coverage thresholds.
- [x] A `coachDecision(ctx, action)` (taking a `@holdem/bots` `DecisionContext` and the engine
      `Action` the player chose) returns a verdict with: hero equity, the pot-odds threshold, the
      chip EV of calling, the EV-correct continue decision (fold vs call/check), and a good/leak
      tag for the action the player actually took.
- [x] Pure: zero UI/DOM/Node/network deps; public API exported from `src/index.ts`; co-located
      `*.test.ts` covering the value/leak/break-even cases.

## Notes

Depends on [[0005-odds-equity-engine]] and reuses the M2 seams from [[0006-heuristic-opponents]].

- **Reuse, don't reinvent.** The coach consumes the same imperfect-information view a bot does:
  import `DecisionContext` and `estimateEquity` from `@holdem/bots`, and `potOdds` / `evOfCall` /
  `callIsProfitable` from `@holdem/odds`. Compute the player's equity against an assumed villain
  range exactly as the bot perception layer does (a sensible default width, e.g. `'medium'`). New
  package deps: `@holdem/engine`, `@holdem/odds`, `@holdem/bots`.
- **The pot-accounting pitfall (the easiest bug here — same one the bots hit).** `ctx.pot` is the
  pot _before_ the player's call and already includes everyone's committed chips but **not** the
  `ctx.toCall` the player must still add. Map directly: `potOdds(ctx.toCall, ctx.pot)` and
  `evOfCall({ equity, pot: ctx.pot, callAmount: ctx.toCall })`. Do **not** add `toCall` into `pot`
  (the helper does that) nor subtract committed chips.
- **Keep the verdict to the math we own exactly.** The hard deterministic call is the fold/continue
  decision against pot odds (and value-betting an unbet pot). Recommending an exact bet/raise _size_
  needs fold-equity assumptions we don't own deterministically — keep sizing out of the hard verdict
  (a future ticket / the LLM can advise on it). A "leak" is a clearly −EV continue or a fold of a
  clearly +EV spot; a break-even spot (equity == pot odds) is not a leak. Decide and document a
  small tolerance band so floating-point noise near break-even doesn't flip the verdict.
- Mirror the odds/bots house style exactly: heavy doc comments, `.js` import specifiers, validation
  idiom, `RangeError` on malformed input. Feeds [[0023-coach-cli-wiring]].
