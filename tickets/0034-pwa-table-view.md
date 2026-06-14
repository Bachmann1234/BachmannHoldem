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

This is the first **design-sensitive** ticket. The visual direction is **confirmed and captured** in
`docs/design/m4-pwa/` — recreate it faithfully: `styles.css` is the source of truth for palette /
type / layout; `app.jsx` holds the seat-layout geometry; `DESIGN-NOTES.md` distils the locked
decisions. **Direction: Playful, green accent `#3ddc84`, dark-first, four-color deck, classic cards,
2–6-max oval table.** Ignore the prototype's throwaway poker engine — render from our `Model`.

## Acceptance criteria

- [ ] A `Table` component tree renders the full table from a `Model`/`HandState`: board cards, pot,
      per-seat stack + status marks, the hero's hole cards, the active seat highlighted, street
      header. Generic over N seats (heads-up through 6-max), no per-size special-casing.
- [ ] A `Card` component renders rank+suit with the **four-color deck** (♠ black, ♥ red, ♦ blue,
      ♣ green) in the **classic** style (corner index + center pip + rotated bottom-right index);
      face-down backs, folded/muck, and all-in seats are visually distinct. Matches `styles.css`.
- [ ] Seats positioned around the oval felt using the `SEAT_LAYOUTS[count]` `%`-coordinate tables
      from `app.jsx` (2–6 seats), with BTN/SB/BB position tags, the acting-seat ring, wager chips,
      and the pot/board in the centre — all derived from the `Model`/`HandState`.
- [ ] Mobile-first and responsive (portrait phone is the primary target); installable-PWA viewport
      (safe-area insets, no horizontal scroll).
- [ ] Component-tested (the PWA's test tooling — React Testing Library / jsdom, wired here if not
      already) for the rendering invariants; `pnpm verify` green.

## Notes

Presentational only — it takes the model + dispatch but contains no reducer/effects (those land in
[[0035-pwa-play-loop]]). Mirror how the TUI factored `Table`/`Seat`/`Card`/`Result` so the two
shells stay structurally parallel. Reuse `@holdem/format` for any shared card/value formatting rather
than re-deriving it. **Build to `docs/design/m4-pwa/`** (Playful direction); the prototype's
`engine.js`/betting logic is NOT used — all state comes from our `Model`. Our session is bust=out at
1/2 blinds & 200 stacks (not the prototype's auto-rebuy / 5-10 / 1000); see `DESIGN-NOTES.md`.
Depends on [[0033-pwa-scaffold]].
