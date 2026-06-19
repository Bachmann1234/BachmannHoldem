---
id: 0094
title: Cap the showdown attribution banner with a "+N more" tail past 4 pots
type: task
status: todo
milestone: M4
priority: low
created: 2026-06-19
---

## Context

[[0091-pwa-side-pot-showdown-attribution]] shipped the per-pot attribution banner: one `.pot-line`
per pot (tag · winner+hand · amount) in `ResultBanner` (`apps/pwa/src/components/Center.tsx`). It
renders **every** pot unconditionally, and `completeRise` adds a flat `+2` lift for any multi-pot
hand regardless of count.

That's fine for the common 2–3 pot case, but a 6-max table can ladder a single all-in into a main
pot plus **up to 5 side pots** (6 distinct stack sizes → 6 lines). At that height the banner grows
downward into the hero seat on a narrow phone — the exact regression 0091's height budget was meant
to avoid. The design pass (`Showdown Sequence`, §4 height note) called this out explicitly:

> Beyond 3 pots (a maximally-laddered 6-way all-in can make up to 5 side pots): keep one line per
> pot, lead with the hero's pot, and cap the banner — collapse the tail into a `+N more` row past 4
> lines rather than letting it grow into the hero.

0091 deferred this as a rare edge; this ticket closes it.

## Acceptance criteria

- [ ] When the completed hand has more than **4** pots, `ResultBanner` renders at most 4 `.pot-line`
      rows plus a single `+N more` summary row (where N is the number of collapsed pots), instead of
      one row per pot. At ≤ 4 pots the banner is unchanged from 0091.
- [ ] The hero's won pot(s) are **never** collapsed into the tail — lead with / always include any
      pot the hero won, per the design's "lead with the hero's pot". The main pot stays first.
- [ ] `completeRise` (or the banner's layout) keeps the capped banner clear of the bottom wings at
      the common small sizes, consistent with the existing pot-aware lift — the capped height is
      bounded (≤ 5 rows), so tune the lift to it rather than letting it scale unbounded.
- [ ] `Center.test.tsx` covers a hand (or a constructed completed `HandState`) with ≥ 5 pots: only 4
      pot-lines + a `+N more` row render, and a hero-won pot beyond the 4th is still shown.
- [ ] `pnpm verify` green.

## Notes

**Reuse the 0091 surface.** This is presentational only — no engine changes. The pots already come
ordered main-first from `collectPots`; this ticket just bounds how many lines render and guarantees
the hero's pot is among them.

**Test fixture.** A real 6-way 5-side-pot hand is fiddly to drive; a constructed completed
`HandState` literal with a hand-built `pots` array + `showdownHands` is acceptable for the cap test
(0091 established that pattern as a fallback), as long as the hero-pot-priority case is covered.
