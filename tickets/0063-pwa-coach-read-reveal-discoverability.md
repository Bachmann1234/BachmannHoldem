---
id: 0063
title: Tune the coach table-read reveal — timing and toggle discoverability
type: task
status: done
milestone: M4
priority: low
created: 2026-06-15
---

## Context

The opt-in "Reveal opponent reads" disclosure shipped in
[[0061-pwa-anonymized-opponents-and-table-read]] with two rough edges worth a deliberate pass:

1. **Reveal timing.** The read is available whenever the coach is open, including _before_ the hero
   acts — closer to a pre-decision cheat-sheet than the intended "you read first, the coach confirms"
   framing. Options floated: gate it to post-decision/post-hand, or earn it after seeing an opponent
   at a showdown. Left always-available for now (it's behind a tap).
2. **Toggle discoverability.** On a tall postflop verdict, the reveal toggle can itself sit below the
   fold (the drawer is a bottom sheet capped at `max-height: 80%`, scrollable), so the hero may not
   notice the read exists. Could move the toggle directly under the verdict headline instead of the
   bottom of the sheet.

## Acceptance criteria

- [x] Decide and implement the reveal-timing policy (always / post-decision / earned-at-showdown).
      **Decision: keep it always-available.** A deliberate product call (2026-06-16) — the read stays
      behind a tap and collapsed by default, so it's an offer, not a forced cheat-sheet; gating it
      added friction without a clear pedagogy win. Discoverability (below) carries the weight instead.
- [x] The toggle is discoverable without scrolling on a tall postflop verdict (or is clearly the
      intended last item). Moved the reveal toggle out of the bottom of the sheet to directly under
      the verdict headline (above the metrics), so it's in view the moment the drawer opens.
- [x] Reveal still auto-scrolls the read into view; collapsed-by-default + re-collapse-per-open kept.

## Notes

Small UX polish, `apps/pwa` only (`CoachDrawer.tsx` + styles). Lower priority than the math work in
[[0062-coach-archetype-aware-verdict]].
