---
id: 0090
title: Show side pots distinctly on the felt during play
type: feature
status: todo
milestone: M4
priority: medium
created: 2026-06-18
---

## Context

The engine fully models side pots — `HandState.pots` is an array of `Pot { amount, eligibleSeats,
winningSeats }`, built by `collectPots()` layer-by-commitment when players go all-in for different
amounts (`packages/engine/src/state.ts`). But the felt never shows that structure: the `.pot` region
in `Center.tsx` renders a single `potTotal(hand)` figure (the sum of every pot), so a multi-way
all-in just reads as one big number.

That hides exactly the mechanic players find confusing. In a 3-way all-in at stacks 20/50/100 there's
a 60 main pot (all three eligible) and a 60 side pot (only the two who reached 50) — but the short
stack can't see that they're only contesting the main pot. Surfacing the split is the point: it makes
"what am I actually playing for" legible at the moment it matters. The data's all there; this is a
presentation gap. Showdown attribution (who _won_ each pot) is the sibling ticket
[[0091-pwa-side-pot-showdown-attribution]]; this ticket is the live, pre-showdown display.

## Acceptance criteria

- [ ] When `hand.pots.length > 1`, the `.pot` region in `apps/pwa/src/components/Center.tsx` renders
      one row per pot — a labelled main pot and labelled side pot(s) (e.g. `Main 60` / `Side 60`,
      and `Side 1` / `Side 2` when there are multiple) — instead of a single summed figure.
- [ ] When there is a single pot (the overwhelmingly common case) the display is **unchanged** from
      today: one `Pot` label + `potTotal(hand)` figure, same markup/`data-testid="pot"`, so no
      visual regression on ordinary hands.
- [ ] Pot rows read from the engine's `hand.pots` directly (each `pot.amount`); do not re-derive
      amounts in the component. Total across rows must equal `potTotal(hand)`.
- [ ] Ordering is stable and intuitive: main pot (the broadest-eligibility / first layer) on top,
      side pots below in the order the engine produced them.
- [ ] A `Center.test.tsx` case covers the multi-pot render (a hand with 2+ pots shows distinct
      labelled rows summing to the total) and the single-pot case still renders the unchanged figure.
- [ ] `pnpm verify` green.

## Notes

**Surface, don't compute.** All the splitting already happened in `collectPots()`; the component just
reads `hand.pots`. If a label needs naming logic ("Main" vs "Side N"), keep it a thin presentational
helper in the component — no engine changes.

**Layout caution.** The `.center` block is height-sensitive on small phones — see the `completeRise`
comment in `Center.tsx` about the showdown banner already clipping bottom seats at ~320px. Stacked
pot rows add height _during_ play (before the banner exists), so keep each row compact. The visual
treatment for stacked pots is part of the design pass feeding
[[0091-pwa-side-pot-showdown-attribution]]; coordinate with that so the live display and the
showdown attribution share one visual language rather than diverging.

**Scope is PWA only.** The TUI (`Board.tsx`) and CLI (`table.ts`) also show only `potTotal` and are
intentionally left as-is here; PWA is the primary surface. File a parity ticket later if wanted.
