---
id: 0057
title: Postflop coach — board-aware / polarised assumed range on barreled lines
type: feature
status: todo
milestone:
priority: medium
created: 2026-06-14
---

## Context

[[0052-coach-narrow-range-on-action]] made the coach narrow the assumed villain range on the
betting line, which cut the heads-up "misleading" priced-postflop share from 14/180 to 11/180
and dropped the seed-28 barrel read from ~65% to ~36% equity. But it hit a **structural
ceiling**: the narrowing reuses the five `RangeWidth` buckets, which are all _preflop opening
ranges with no board awareness_. The tightest bucket (`ultraTight` = AA-JJ / AK) still contains
AK-high, which a beaten single pair _beats_ on a low coordinated board — so on the seed-28 line
bottom pair (Kc 3d on 5d 3s 7s 6h 8h) still reads ~36% and grades `Good`, even though the
villain who barreled three streets is, in truth, polarised to made hands plus busted bluffs.

A villain firing multiple streets / a big bet does not hold a _preflop_ opening range; they hold
a _made-hand-heavy, board-connected_ range (sets, two pair, straights/flushes the texture allows,
strong overpairs) plus some air. Reading the hero against that polarised, texture-aware range is
what would let the coach correctly fold a clearly-beaten hand on a barreled line — the residual
gap [[0052-coach-narrow-range-on-action]] documents.

## Acceptance criteria

- [ ] On a barreled line the coach reads the hero against a **board-aware / polarised** villain
      range (made hands the texture supports + a bluff fraction), not a fixed preflop bucket.
- [ ] The seed-28 turn/river spots (and similar barreled-low-board calldowns) grade a beaten
      single pair as a `leak` / EV-negative continue, not `Good`.
- [ ] Stays deterministic (seeded) and pure (`@holdem/odds` / `@holdem/bots`), no I/O.
- [ ] A `pnpm sim --seeds=1-60 --seats=2 --json` ground-truth sweep shows the misleading share
      fall further below the 11/180 [[0052-coach-narrow-range-on-action]] left it, without
      inflating false over-folds (track both directions).
- [ ] `pnpm verify` green; tests cover a board-aware read on a wet vs dry texture.

## Notes

Follow-up to [[0052-coach-narrow-range-on-action]] (filed during its code review). This is the
"board-aware/polarised range" that 0052 deliberately scoped out — it needs new range machinery
(texture-conditioned combos and/or a bluff-fraction model) rather than the existing width
buckets, so it is its own ticket. Likely overlaps the bots' weak pillar (the shared static
range, per the standing project view) — decide whether a board-aware read belongs in
`@holdem/bots` (shared, would also sharpen bots) or stays coach-only as 0052's narrowing did.
Some of the richer "villain's range here is polarised" narration may instead belong to the
optional LLM layer ([[0011-llm-coaching]]); scope the deterministic core vs the narration when
pulled. Measurement instrument: the `misleads` flag in the `pnpm sim` harness
([[0030-cli-headless-harness]]).
