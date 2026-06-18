---
id: BUG-0012
title: a hand decided at deal time (short blind all-in) freezes the table on "Waiting…"
type: bug
status: fixed
severity: high
milestone: M6
created: 2026-06-18
---

## Summary

When a hand is fully decided the instant it is dealt — a stack shorter than the blind is posted
all-in and that closes the action with no one left to act — the engine runs the board straight to a
showdown inside `dealHand`'s `settle()`, so the hand arrives already `complete` with a `null` actor.
But the reducer's `start-hand` case unconditionally entered `phase: 'playing'`, leaving the model
parked in `'playing'` over a finished board that no one can act on. The shell can never advance such a
model (no actor → no `apply-action` ever fires), so the table freezes permanently on "Waiting…".

Escalating-blind tournament mode (the new default, commit `49e41fc`) makes this reachable in ordinary
play: stacks eventually fall below the blind, and heads-up that forces the all-in-at-deal geometry.

## Steps to reproduce

1. Heads-up, escalating-blind tournament mode; play until a player's stack is below the big blind
   (e.g. LVL 7 100/200 with the villain on ~84 chips, as in the reported screenshot).
2. Deal the next hand. The short stack is the small blind (heads-up, the button is the SB) and posts
   its whole stack all-in for the blind; the other player has nothing to act against.
3. The engine runs the board out to showdown during the deal.

## Expected

The completed hand shows its result and the action bar offers the play-again CTA ("Deal next hand →"),
or — if the all-in busted a player to a single survivor — the final-hand review (`'session-over'`,
"View summary →"), exactly as a hand that completes via an action does.

## Actual

The result banner renders ("Rae wins · Pair of Jacks", from `Table`'s `isComplete(hand)` check), but
the action bar sits on a disabled "Waiting…" forever: `phase` is still `'playing'` while the hand is
`complete`, so `handOver`/`sessionOver` are both false and it is no one's turn. The game is frozen
with no way to advance.

## Notes

- **Affected package:** `@holdem/session` — `reducer.ts` `startHand`. The Table/ActionBar render was
  correct; ActionBar's "Waiting…" branch is gated on `phase`, while the winner banner is gated on the
  engine's `isComplete` — the two only disagree in this never-settled state.
- **Root cause:** `startHand` assumed a freshly dealt hand always needs at least one action before it
  can complete. `applyHeroOrBotAction` already handled completion (settle stacks → `'session-over'` /
  `'hand-over'`); the deal path did not.

## Resolution

`startHand` now routes both deal branches through a new `settleIfDealtComplete(dealt)` helper that
mirrors `applyHeroOrBotAction`'s completion arm: if the just-dealt `hand` is already `complete`, it
settles the per-seat stacks back to the stable players and steps to `'session-over'` (a bust left one
survivor) or `'hand-over'` (offer play-again) instead of `'playing'`. The coach grade stays the fresh
`'none'` the deal set (no hero decision happened). Regression coverage in `reducer.test.ts`: a
heads-up short-blind deal that completes at deal time lands in `'hand-over'` (both survive) or
`'session-over'` (the short stack busts), never `'playing'`.
