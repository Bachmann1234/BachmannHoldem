---
id: 0085
title: Tournament mode — escalate blinds over time
type: feature
status: done
milestone: stretch
priority: low
created: 2026-06-16
---

## Context

Follow-up to the fixed-blinds picker ([[0084-blinds-picker-setup]]). A tournament option where the
blind level **steps up on a schedule** (every N hands / "levels") so a session naturally
accelerates toward an end, the way real tournaments do. Deferred out of the 0084 batch because the
engine currently freezes one fixed blind level into every hand, so escalation needs new level state
and a schedule — more than the "smallish" picker.

## Acceptance criteria

- [x] A setup option to choose Cash (fixed, today's behaviour) vs Tournament (escalating).
- [x] In tournament mode, blinds advance through a level schedule (every N hands) — the
      reducer derives the current level deterministically from the hand number it already bumps
      (pure, testable) and freezes the result into each hand.
- [x] The table surfaces the current level / blinds and a hint about when the next level hits.
- [x] Cash mode is completely unaffected; the fixed-blinds picker (0084) still works.
- [x] Pure-package tests cover level advancement and the schedule boundaries.
- [x] `pnpm verify` green.

## Notes

Builds directly on 0084's `set-blinds` plumbing — instead of one frozen `{ sb, bb }`, the session
carries a level index that the reducer bumps as hands complete, re-deriving the blinds passed to
`dealHand` each hand. Design the schedule (level durations, how steep) and the table indicator when
this is pulled. Not part of the current batch — filed for later.

## Implementation

> **Update 2026-06-16:** the cash blind picker ([[0084-blinds-picker-setup]]) was reverted, so the
> hero-chosen _starting rung_ is gone — tournament mode now always starts from the bottom rung
> (`DEFAULT_BLIND_LEVEL`, `1/2`). The escalation engine itself is unchanged; `sessionBlinds` and
> `App.tsx` just pass `DEFAULT_BLIND_LEVEL` as the start. This feature stays `done`.

Built on 0084's `set-blinds` plumbing. The cash picker's `BLIND_PRESETS` became the bottom three
rungs of a longer `BLIND_LADDER`; tournament mode starts on the hero's chosen rung and climbs one
rung every `TOURNAMENT_LEVEL_LENGTH` (4) hands, topping out at the ladder's ceiling.

One divergence from the note's framing: rather than carry a mutable level **index** the reducer
"bumps", the level is **derived** from `handNumber` (which the reducer already increments each hand)
via the pure `tournamentLevel(start, handNumber)` / `sessionBlinds(setup, handNumber)`. Deriving
avoids a second piece of state that could desync from the hand count, and is just as deterministic
and testable. `startHand` calls `sessionBlinds` for both the first hand and play-again hands, so
`dealHand` freezes the escalated level into each hand exactly as cash mode freezes the fixed one.

Touch points: `packages/session/src/model.ts` (`BLIND_LADDER`, `SessionMode`/`DEFAULT_MODE`,
`TOURNAMENT_LEVEL_LENGTH`, `LevelStatus`, `tournamentLevel`, `sessionBlinds`, `SetupState.mode`),
`reducer.ts` (`set-mode` message + handler; `startHand` derives blinds via `sessionBlinds`),
`apps/pwa/src/components/SetupScreen.tsx` (Cash/Tournament format toggle + tournament-aware blinds
hint), `Table.tsx` + `App.tsx` (top-bar level chip, shown only in tournament mode), `styles.css`
(`.level-chip` accent). PWA-only, mirroring 0084 (the TUI setup screen has no blinds controls).
