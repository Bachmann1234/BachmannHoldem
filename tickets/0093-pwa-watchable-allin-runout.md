---
id: 0093
title: Play out the all-in runout street by street so it's watchable
type: feature
status: todo
milestone: M4
priority: medium
created: 2026-06-18
---

## Context

When betting closes with players all-in, the hand jumps straight to the finished state — the board
snaps from (say) the flop to all five cards plus the settled result in a single frame. Cause: the
engine is pure and synchronous by design. `settle()` (`packages/engine/src/state.ts`) runs an
unbounded loop — `bettingClosed → advanceStreet (deal) → still closed → advanceStreet → … →
finalize('showdown')` — so one `applyAction()` deals every remaining street and finalizes at once. The
PWA (`Table.tsx` / `Center.tsx`) just renders whatever `HandState` it's handed; there's no staged
reveal. The only timing anywhere in the app is the 500ms bot-move delay (`App.tsx`, `botDelayMs`).

The result is the most exciting moment in poker — the all-in runout — is the one you can't watch. This
ticket makes it play out: deal the remaining streets one at a time with a beat between each, then flip
opponent cards and show the result. It sequences directly into the side-pot work — the pot-split
reveal from [[0090-pwa-multi-pot-display]] and the per-pot attribution from
[[0091-pwa-side-pot-showdown-attribution]] should land as the final beats of this same runout
choreography (river → pot splits → winners attributed), so design them as one motion sequence.

## Acceptance criteria

- [ ] When a hand completes via an all-in runout (betting closed with 2+ live players, more than one
      board card revealed in the completing transition), the PWA reveals the remaining streets
      **progressively** — flop, then turn, then river, each held for a readable beat — before flipping
      opponents' cards and showing the result banner. Reuses the existing `setTimeout`+dispatch pacing
      pattern (the bot-delay shape in `App.tsx`), not a new mechanism.
- [ ] The engine stays **pure and unchanged** — `settle()` still computes the full terminal state in
      one step. This is a presentation-layer reveal over an already-known board (flop = `board[0..2]`,
      turn = `board[3]`, river = `board[4]`); the UI withholds rendering of streets the player hasn't
      "seen" yet and reveals them on timers. No pause-mode threaded through the state machine.
- [ ] Only the all-in case is paced. A normal river showdown (board already revealed street by street
      through live betting) is **not** delayed beyond today — and a hand that ends on a fold doesn't
      run out the board at all. Distinguish "this completion dealt multiple new streets" from "the
      board was already current."
- [ ] The reveal cannot be left mid-runout: starting a new hand, leaving the table, or any hand-over
      action cancels pending reveal timers cleanly (mirror the `cancelled` guard in the bot effect) —
      no stuck board, no timer firing into a torn-down hand.
- [ ] Reveal cadence is a single named constant (sibling to `DEFAULT_BOT_DELAY_MS`) so it's tunable
      and testable; tests assert the staged sequence (board cards appear over successive ticks, result
      banner appears last) using fake timers, and that the fold / normal-showdown paths are unpaced.
- [ ] `pnpm verify` green.

## Notes

**Where the staging lives.** This is App/Session-layer presentation, not engine work. The model holds
the previous hand across renders; when a single completing dispatch advances the board by more than one
card, that's the all-in runout — capture enough at that moment (e.g. the board length before vs. after,
or a small "runout from street X" flag derived in the session layer) to drive the reveal. Keep the
engine's terminal `HandState` as the source of truth; the UI only controls _when_ each already-dealt
card becomes visible.

**Makes 0090's tray genuinely live (no engine change).** [[0090-pwa-multi-pot-display]] shipped the
multi-pot tray, but because `collectPots()` runs only in `finalize()`, `hand.pots` exists only on the
terminal state — so today the tray appears on the already-settled hand, not mid-runout. This ticket's
banner-withheld reveal phase is exactly the pre-showdown window that tray was meant for: since the
runout renders the **terminal** `HandState` (pots populated) while gating board + banner visibility,
the tray reads `hand.pots` and shows the main/side split _during_ the runout for free. Acceptance: keep
the multi-pot tray visible through the reveal phase (banner still withheld until the end) — no early
pot computation, no engine change, consistent with the purity constraint above.

**One choreography, not three animations.** The street reveal here, the pot split in
[[0090-pwa-multi-pot-display]], and the attribution in [[0091-pwa-side-pot-showdown-attribution]] are
beats of the same showdown sequence. The `frontend-design` pass / mockups feeding those tickets should
cover the full timeline — street-by-street reveal → pot divides into main/side → winners attributed —
so the beats share timing and feel, rather than being designed in isolation.

**Don't regress the common case.** Most hands reach showdown through normal betting with the board
already current, or end on a fold. Those must feel exactly as they do now; the pacing applies only when
there are unrevealed streets to run out.
