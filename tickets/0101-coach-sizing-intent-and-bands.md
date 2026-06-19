---
id: 0101
title: Sizing intent classification & recommended bands
type: feature
status: todo
milestone: M8
priority: medium
created: 2026-06-19
---

## Context

The deterministic core of [[0100-coach-betting-sizing-guidance]] and the part most likely to be wrong,
so it ships and is tested on its own before any UI consumes it. Given the spot the coach already reads
(`DecisionContext` + the equity read), produce two pure outputs:

- the **intent** of a bet/raise in this spot, and
- a **recommended size band** for that intent, expressed in pot-fraction pegs.

Both live in `@holdem/coach`, reuse the existing read, and import only `@holdem/*`.

## Acceptance criteria

- [ ] `classifySpot(ctx)` derives the betting situation deterministically: preflop **open** / **3-bet+**
      / limped-pot **overcall**, postflop **c-bet** / **lead** / **raise**, from `toCall`, the line,
      street, and position. (This same classification corrects the coach narrating a BTN overcall of a
      limped pot as an RFI/steal open — exploratory-testing finding, 2026-06-19.)
- [ ] `classifyIntent(ctx)` labels intent — **value** / **bluff** / **protection / thin value** /
      **steal** — from the existing equity read (ahead / behind / marginal-on-a-vulnerable-board) plus
      the spot, with the board's draw count feeding the protection case.
- [ ] `recommendedBand(ctx)` returns a size band (a `[lo, hi]` in pot fraction, plus the equivalent
      "to" chip range for the live pot) keyed to intent × spot, from the rules of thumb in
      [[0072-lesson-bet-sizing]]: opens ≈2–2.5bb (+~1bb/limper); 3-bets ≈3x IP / 4x OOP; value ≈½–¾
      pot; bluff sized to match the value bets on that line (reuse `polarizedBarrelRange`); protection
      sized to the draws present. A **band**, never a single number.
- [ ] Peg vocabulary is single-sourced with the primer (¼≈17%, ⅓≈20%, ½≈25%, ¾≈30%, pot≈33%) so the
      coach and lesson never drift.
- [ ] Pure & deterministic: no I/O, seeded where it touches the Monte-Carlo read, same `ctx` → same
      output. Heavy unit tests across intents, streets, positions, and seat counts — this is the
      module the rest of M8 trusts.
- [ ] `pnpm verify` green.

## Notes

Keep this strictly "what size _should_ the spot want, and why" — it does **not** look at the hero's
chosen action (that comparison is [[0102-coach-sizing-verdict-and-explain]]). Splitting recommendation
(spot-only, also usable _before_ the hero acts for the ActionBar anchoring in
[[0104-pwa-actionbar-sizing-anchoring]]) from grading (action-aware) is deliberate: the band is a
pre-action function, the verdict a post-action one.

No solver, no GTO claim — these are the teachable heuristics the primer already commits to. Where a
spot is genuinely size-agnostic (multiple bands are fine), say so rather than inventing a false single
band.
