---
id: 0034
title: PWA poker-table view (DOM, mobile-first)
type: feature
status: todo
milestone: M4
priority: high
created: 2026-06-13
---

## Context

The visual heart of the PWA: a mobile-first poker table rendered from the shared `Model`
([[0032-session-core-package]]) — the DOM analog of the TUI's `App`/`Table`/`Seat`/`Card` components
([[0026-tui-table-view]]). Presentational only: it _reads_ the model and renders the street header,
the board, the pot, every seat (stack, marks for button/blinds/folded/all-in, the acting seat, the
hero's hole cards), and — once the hand completes — the showdown/result. **Zero game logic** — all
rules live in `@holdem/engine`; the view derives everything from `hand.players` generically so a
heads-up and a 6-max table render through the same components.

This is the first **design-sensitive** ticket — it must follow the approved visual direction (see
[[0008-pwa-app-shell]] design handoff). Do not start until the design direction is confirmed.

## Acceptance criteria

- [ ] A `Table` component tree renders the full table from a `Model`/`HandState`: board cards, pot,
      per-seat stack + status marks, the hero's hole cards, the active seat highlighted, street
      header. Generic over N seats (heads-up through 6-max), no per-size special-casing.
- [ ] A `Card` component renders rank+suit with suit colour; a folded/empty seat and an all-in seat
      are visually distinct. Matches the approved design's layout, palette, and typography.
- [ ] Mobile-first and responsive (portrait phone is the primary target); installable-PWA viewport
      (safe-area insets, no horizontal scroll).
- [ ] Component-tested (the PWA's test tooling — React Testing Library / jsdom, wired here if not
      already) for the rendering invariants; `pnpm verify` green.

## Notes

Presentational only — it takes the model + dispatch but contains no reducer/effects (those land in
[[0035-pwa-play-loop]]). Mirror how the TUI factored `Table`/`Seat`/`Card`/`Result` so the two
shells stay structurally parallel. Reuse `@holdem/format` for any shared card/value formatting rather
than re-deriving it. **Design-gated**: build to the approved direction from the
[[0008-pwa-app-shell]] handoff. Depends on [[0033-pwa-scaffold]].
