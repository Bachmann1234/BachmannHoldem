---
id: 0090
title: Show side pots distinctly on the felt during play
type: feature
status: done
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
[[0091-pwa-side-pot-showdown-attribution]]; this ticket is the pot-breakdown display.

**Engine reality (discovered during build).** `collectPots()` runs only inside `finalize()`, so
`hand.pots` is empty for the whole of live betting and is populated only once the hand reaches
`complete`. Today the all-in runout also settles in one synchronous jump, so there is no
pre-showdown moment at which a multi-pot hand exists. The tray this ticket adds therefore renders on
the **settled hand** (alongside the result banner), not mid-runout. It goes genuinely _live_ once the
watchable runout in [[0093-pwa-watchable-allin-runout]] lands: that ticket renders the **terminal**
`HandState` (pots already populated) while withholding board cards + banner on timers, so the tray
reads `hand.pots` and shows the split _during_ the runout with no engine change — captured as a
dependency note on 0093. This ticket ships the breakdown on the surface where the data exists now.

## Acceptance criteria

- [x] When `hand.pots.length > 1`, the `.pot` region in `apps/pwa/src/components/Center.tsx` renders
      one labelled pod per pot — a main pot and side pot(s) (`Main` / `Side`, abbreviating to
      `S1` / `S2` when there are multiple side pots) — instead of a single summed figure. Per the
      design pass these sit on a single **horizontal** tray (not stacked rows), which keeps the block
      height-flat — the resolution of this ticket's own "keep each row compact" caution below.
- [x] When there is a single pot (the overwhelmingly common case) the display is **unchanged** from
      today: one `Pot` label + `potTotal(hand)` figure, same markup/`data-testid="pot"`, so no
      visual regression on ordinary hands.
- [x] Pod amounts read from the engine's `hand.pots` directly (each `pot.amount`); do not re-derive
      amounts in the component. The pods sum to the **contested** chips — i.e. `potTotal(hand)` minus
      any returned uncalled bet, which `collectPots()` peels out of the pots (the BUG-0002 guarantee).
      This matches the `ResultBanner`'s amount convention; it deliberately differs from the single-pot
      `.pot` figure (raw `potTotal`) when an over-shove was returned.
- [x] Ordering is stable and intuitive: main pot (the broadest-eligibility / first layer) first,
      side pots after in the order the engine produced them.
- [x] `Center.test.tsx` covers the multi-pot render (2+ pots show distinct labelled pods reading each
      `pot.amount`), the multi-side abbreviation (`S1`/`S2`), an over-shove that returns an uncalled
      bet (pods show contested chips, below `potTotal`), and the single-pot unchanged figure.
- [x] `pnpm verify` green.

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
