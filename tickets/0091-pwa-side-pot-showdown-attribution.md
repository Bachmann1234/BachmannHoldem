---
id: 0091
title: Attribute each side pot to its winner on the showdown banner
type: feature
status: todo
milestone: M4
priority: medium
created: 2026-06-18
---

## Context

At showdown the PWA's `ResultBanner` (`apps/pwa/src/components/Center.tsx`) collapses the whole result
into one winner line plus a single summed total: it reads `handWinners(hand)` for the seat(s) that won
_anything_ and sums every pot (`hand.pots.reduce(...)`) for the amount. So a multi-way all-in where the
hero wins the main pot but an opponent takes the side pot just reads "You win · 150" — the hero never
learns that they didn't scoop, or who took the rest, or why (they were short and only eligible for the
main pot).

The engine already records the truth per pot: `Pot.winningSeats` is the seat(s) each pot was actually
awarded to — distinct from `payouts`, which also counts returned uncalled bets (BUG-0002). This ticket
surfaces that per-pot attribution so the showdown explains a split outcome instead of flattening it.
The live, pre-showdown display of the same pots is [[0090-pwa-multi-pot-display]]; this is its showdown
sibling and the two should share one visual language.

## Acceptance criteria

- [ ] When the completed hand has more than one pot, `ResultBanner` shows **per-pot attribution** —
      for each pot, who won it (`pot.winningSeats` via `seatLabel`) and for how much (`pot.amount`),
      e.g. "You win main · 60" / "Mia wins side · 60". The hand description still appears for showdown
      results.
- [ ] The single-pot case is **unchanged** from today: one winner/"Split pot" line + the
      hand-description-or-folded line + total, same `data-testid="result-banner"`.
- [ ] Winners per pot come from `pot.winningSeats`, **not** from `payouts > 0` and **not** from the
      top-level `handWinners` — a returned uncalled bet must not read as winning a pot (preserve the
      BUG-0002 guarantee). The hero win/lose colour reflects whether the hero won _any_ pot.
- [ ] Split pots within a single side pot (multiple `winningSeats` on one pot) still render correctly
      ("You + Mia split main · 60" or equivalent).
- [ ] Stays within the small-phone height budget — the banner already clips bottom seats at ~320px
      (`completeRise` note in `Center.tsx`); the chosen layout for 2–3 pot lines must not make that
      worse. Follows the visual direction from the design pass (see Notes).
- [ ] `Center.test.tsx` covers: a two-pot hand where hero wins main and loses side renders both
      attributions with correct seats/amounts; the single-pot result is unchanged; a split side pot
      renders both winners. `pnpm verify` green.

## Notes

**Design pass gates this one.** The banner is the height-sensitive surface called out in
`Center.tsx`'s `completeRise` comment ("a fuller fix needs a more compact showdown banner"). Adding
per-pot lines makes a tall element taller, so the _compact_ layout for multi-pot attribution should
come out of a `frontend-design` pass before the build — that's why this is the more involved of the
two display tickets. Do that pass first; it also informs the stacked live display in
[[0090-pwa-multi-pot-display]] so the two stay consistent.

**Read the truth, render the truth.** No engine changes — `pot.winningSeats` / `pot.amount` /
`describeHand(showdownHands[seat])` are all already available. Keep `ResultBanner` presentational.

**The learning payoff** (the "why didn't I scoop" explanation tied to eligibility) is the optional
follow-up [[0092-coach-side-pot-eligibility-note]]; this ticket is purely the result-surface
attribution, not coaching copy.
