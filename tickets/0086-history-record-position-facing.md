---
id: 0086
title: Extend hand-history record (schema v2) with button + per-decision facing context
type: feature
status: todo
milestone: M6
priority: high
created: 2026-06-16
---

## Context

The M6 stats epic ([[0010-stats-and-leak-detection]]) must compute the hero's stats **by position**
and **fold-to-3bet**, and the canonical example leak is BB-specific ("you over-fold the big blind").
But the v1 `HandHistoryRecord` (`apps/pwa/src/history/record.ts`) captures only `heroSeat` /
`seatCount` and the hero's `decisions` (street + action) — it stores **neither the dealer button
position** (so the hero's position is unknowable) **nor the betting context the hero faced** (so
fold-to-3bet is uncomputable). VPIP / PFR / aggression-factor are already derivable from v1; these
two are not.

Both missing facts are available on the live engine `HandState` at the moment the hero acts
(`buttonIndex`; `currentBet` − the hero's `committed` = `toCall`), so the fix is to **capture them at
record-assembly time** and bump the schema to v2. This ticket is the data foundation the rest of M6
(stats aggregation [[0087-play-stats-aggregation]], leak detection [[0088-leak-detection]]) builds on.

## Acceptance criteria

- [ ] `HandHistoryRecord` gains an **optional** `buttonIndex?: number` (the dealer button engine seat
      for the hand) — enough, with `heroSeat` + `seatCount`, to derive the hero's position.
- [ ] `HeroDecision` gains an **optional** facing context capturing, for each hero decision, the
      betting the hero faced when they acted: at minimum `toCall` (chips to call = `currentBet` −
      hero `committed`) and the street's faced bet level (`currentBet`). This is the signal
      fold-to-3bet is derived from in [[0087-play-stats-aggregation]].
- [ ] `HAND_HISTORY_SCHEMA_VERSION` bumped to `2`; the new fields are **additive and optional** so
      existing v1 records remain valid (a v1 record simply lacks position / facing data).
- [ ] `assembleRecord` populates `buttonIndex` from the completed hand, and the recording seam in
      `apps/pwa/src/App.tsx` captures the facing context **at the moment of each hero decision**
      (from the live pre-action `hand`, alongside the existing `decisionsRef` push), so the per-street
      facing values are correct.
- [ ] Co-located tests cover: button captured, facing context captured per decision (unraised pot,
      facing an open, facing a 3bet), and a v1 record (no new fields) still parses without error.
- [ ] `pnpm verify` fully green.

## Notes

**Why optional, not required.** The history store (`apps/pwa/src/history/store.ts`) does **not**
filter reads by schema version (unlike the drill store), so old v1 records will still be returned
from `list()`. Making the new fields optional keeps those records valid; the aggregation in
[[0087-play-stats-aggregation]] treats a missing `buttonIndex` / facing as "not countable for the
position / 3bet breakdown" — which also gates those stats naturally on the post-v2 sample. Follow the
record's own doc contract: _"do not repurpose fields — add new optional ones instead, and bump the
schema version."_

**Capture point (the crux).** The facing context must be read from the live `hand` **before** the
hero's action is applied — i.e. in `onAction` in `App.tsx`, exactly where the existing
`decisionsRef.current.push({ street, action })` happens. At that point `hand.currentBet` and the
hero seat's `committed` are precisely what the hero is facing (`toCall = currentBet − committed`,
the same quantity `legalActions`/`decisionContext` compute). **No reducer or bot-effect change is
needed** — keep recording a pure shell concern, like the existing decision buffer. The button is
constant for the hand, so capture it once in `assembleRecord` from `hand.buttonIndex`.

**Fold-to-3bet is derived downstream, not flagged here.** This ticket only _captures faithful facing
data per decision_; [[0087-play-stats-aggregation]] derives "hero open-raised, then faced a re-raise
above their own raise, and folded" from (the hero's own raise `amount`s) + (the faced bet level per
later decision). So the captured field must let a reader compare the faced `currentBet` to the hero's
earlier raise-to amount — capturing the faced `currentBet` (not just `toCall`) is what makes that
unambiguous. Don't try to classify "3bet" in the stored record; store the raw faced numbers.

**Resume/serialisation.** The captured values are plain numbers (structured-clone-safe) — no `Date`,
no class instances, consistent with the rest of the record. The mid-game save/resume path
(`session/store.ts`) snapshots `decisions`; the new per-decision field rides along automatically as
plain data, but verify a resumed hand still records the facing context (the `restored.decisions`
buffer must carry it).

**Don't touch the stats math here** — that's [[0087-play-stats-aggregation]]. This ticket ends at
"the data is captured and round-trips through the store."
