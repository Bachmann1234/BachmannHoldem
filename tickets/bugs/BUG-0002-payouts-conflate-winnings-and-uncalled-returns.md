---
id: BUG-0002
title: payouts conflate pot winnings with uncalled-bet returns, so UIs mis-detect winners
type: bug
status: open
severity: low
milestone: M4
created: 2026-06-14
---

## Summary

`HandState.payouts` records, per seat, _winnings + any returned uncalled bet_ in one number (see
`state.ts` `finalize`/`distribute`), and `HandState.pots[*]` exposes only `amount` + `eligibleSeats`,
not the actual winners. So a presentation layer that infers "who won" from `payouts[seat] > 0`
counts a player who merely had an uncalled bet returned as a winner — producing a false "Split pot"
banner and a wrong winning-card highlight in the all-in-with-uncalled-overbet showdown case.

## Steps to reproduce

1. Heads-up (or multiway) showdown where the hero shoves all-in for more than any opponent can call.
2. A short stack calls for less; the uncalled excess is returned to the hero.
3. The short stack wins the pot at showdown (hero loses).
4. `payouts = { shortStack: potAmount, hero: returnedExcess }` — both `> 0`.

## Expected

The result banner reads "Seat N wins · <pot>" and only the actual winner's cards are ringed.

## Actual

Both UIs derive winners as `players.filter(p => payouts[p.seat] > 0)`, so `winners.length === 2` →
the banner renders **"Split pot"** and the hero's (losing) cards are also highlighted green; the
displayed amount adds the unrelated uncalled return.

## Notes

- **Affected packages (both share the pattern):** `apps/pwa/src/components/{Center,Table}.tsx`
  (ResultBanner / winning-seat ring, ticket [[0034-pwa-table-view]]) and `apps/tui/src/components/Result.tsx`.
- **Suspected cause / right fix:** the engine should expose the truth so neither UI re-derives poker
  math. Add per-pot winners (e.g. `Pot.winningSeats`, or a `HandState.winners` set), or separate
  winnings from uncalled returns in the payout record. Then both UIs read winners directly. Rules
  live in `@holdem/engine` — do NOT re-implement winner selection in the view layer.
- **Severity low:** requires the specific all-in/uncalled-overbet geometry at a showdown; the common
  showdown path renders correctly. Pre-existing in the TUI; surfaced (not introduced) by 0034.
- Surface to the milestone review ([[0008-pwa-app-shell]]) for scheduling against the engine.
