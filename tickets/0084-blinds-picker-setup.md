---
id: 0084
title: Let the hero pick the blind level on the setup screen
type: feature
status: done
milestone: M4
priority: medium
created: 2026-06-16
---

## Context

Blinds are hardcoded (`SMALL_BLIND = 1`, `BIG_BLIND = 2` in `packages/session/src/model.ts`) and
the setup screen only prints them read-only inside the Stack hint ("blinds 1/2"). The hero can
choose stack **depth** but not the blind level. Add a blinds picker that mirrors the existing stack
picker — a small set of one-tap presets — chosen once and **fixed for the whole session** (no
escalation; that's the follow-up [[0085-tournament-blind-escalation]]).

## Acceptance criteria

- [ ] A blinds picker on the setup screen (sibling of the stack picker) offering a few fixed
      presets, e.g. `1/2`, `2/5`, `5/10`, with the current selection shown as `active` /
      `aria-pressed`, and a sensible default (`1/2`, today's behaviour).
- [ ] The chosen blinds are stored on `SetupState`, edited via a new reducer `Msg` (e.g.
      `set-blinds`), frozen into the session at `start-hand`, and used by `dealHand` /
      `createHand` instead of the `SMALL_BLIND` / `BIG_BLIND` constants. No-op outside `'setup'`,
      same as the other setup edits.
- [ ] **Stack depth stays expressed in big blinds relative to the chosen blinds.** Today
      `stackForDepthBb(bb) = bb * BIG_BLIND`; after this change "100bb deep" must mean
      `100 × chosenBigBlind` chips, so the depth presets and the `{depth}bb deep` hint stay correct
      when the hero changes blinds. Check `depthBbForStack` too.
- [ ] Any place that displays the blinds (the Stack hint, and anywhere the table/center shows
      "blinds x/y") reflects the chosen level, not the constant.
- [ ] Older `SetupState` literals / the inert curriculum still type-check and fall back to the
      default level (keep the field optional like `startingStack`, with a constant default).
- [ ] Pure-package tests in `packages/session` cover: the reducer edit, the default, the
      freeze-into-hand, and the depth↔chips conversion against a non-default blind level. A
      `SetupScreen` test covers selecting a preset.
- [ ] `pnpm verify` green.

## Notes

Touch points: `packages/session/src/model.ts` (blind constants → a `BLIND_PRESETS` list +
default; `SetupState`; `createInitialModel`; `dealHand`'s `createHand({ smallBlind, bigBlind })`;
`stackForDepthBb` / `depthBbForStack` now need the chosen big blind), `reducer.ts` (new
`set-blinds` case, mirror `setStack`), `apps/pwa/src/components/SetupScreen.tsx` (new picker, mirror
the `STACK_DEPTH_PRESETS_BB` `.sizes` group; it already imports `SMALL_BLIND`/`BIG_BLIND` for the
hint). Mirror the existing stack-picker plumbing end to end rather than inventing a new shape.

Keep blinds as a single chosen level (an `{ sb, bb }` pair or an index into the presets) — do **not**
build any time/hand-based escalation here. Watch the coupling between blinds and the bb-denominated
stack depth: that's the one subtle part. Coordinate-free with the quit-modal (0082) and summary-gap
(0083) tickets — they touch different files.
