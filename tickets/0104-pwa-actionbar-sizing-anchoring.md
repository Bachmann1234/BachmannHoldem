---
id: 0104
title: Anchor the bet slider with the recommended band & purpose-labelled pegs
type: feature
status: todo
milestone: M8
priority: medium
created: 2026-06-19
---

## Context

The in-the-moment UI for [[0100-coach-betting-sizing-guidance]] — and the part that makes sizing
actually _learnable_. The ActionBar bet control is a slider over `[min, max]` with `min`/`½`/`pot`/
`all-in` pegs (`ActionBar.tsx`), but a beginner has no anchor on a continuous 4→200 range, so
decide-then-review alone is slow for sizing. Add **reference** (not an answer): show the recommended
band on the slider and give the pegs their purpose — the same category of aid as the starting-hand
chart and glossary, consulted before acting, never deciding for the player.

## Acceptance criteria

- [ ] The recommended band from `recommendedSizing(ctx)` ([[0101-coach-sizing-intent-and-bands]],
      computed **before** the hero acts — it depends only on the spot) is shown on the slider track
      (e.g. a shaded region) with a short intent label ("value · ½–¾ pot").
- [ ] The `min`/`½`/`pot`/`all-in` pegs carry their meaning (purpose and/or the pot-odds price they
      lay), in the primer's peg vocabulary, so the buttons teach rather than just set a number.
- [ ] It is strictly **reference**: the slider still seeds where it does today and the hero freely
      chooses; nothing auto-snaps to the band. The anchoring appears only when choosing a bet/raise
      size (not on fold/call/check).
- [ ] Honest about uncertainty: a size-agnostic spot shows a wide/neutral band or no band rather than
      a misleadingly precise one.
- [ ] Works within the M7 responsive felt / action-bar layout (don't reintroduce overlap or clip the
      controls); degrades cleanly on the narrowest phone.
- [ ] Component tests: band renders for a bet/raise spot, absent for fold/call/check, and never mutates
      the hero's selected size.
- [ ] `pnpm verify` green.

## Notes

Depends on [[0101-coach-sizing-intent-and-bands]] (for `recommendedSizing`). The band is computed
**pre-action** — this is the deliberate split called out in 0101: recommendation is spot-only and
usable before the hero acts; grading is action-aware and lives on the verdict.

**Scope guard — reference, not answer.** The active pre-commit nudge ("size down, this folds out
worse") is deferred / opt-in per the epic. This ticket stays passive: it shows the map, the player
still drives. Keep the band copy consistent with the review drawer
([[0103-pwa-coach-drawer-sizing-review]]).

A `frontend-design` pass on how the band reads on the slider (shading vs ticks, label placement,
colour vs the existing accent) would feed this.
