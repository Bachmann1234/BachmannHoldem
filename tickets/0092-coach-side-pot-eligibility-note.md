---
id: 0092
title: Coach note explaining side-pot eligibility on a short all-in
type: feature
status: todo
milestone: M4
priority: low
created: 2026-06-18
---

## Context

Surfacing side pots on the felt ([[0090-pwa-multi-pot-display]],
[[0091-pwa-side-pot-showdown-attribution]]) makes the _structure_ visible, but not the _reasoning_.
The actual learning payoff is teaching a player **why** a short all-in only contests the main pot: when
you're all-in for less than others have committed, you can win only the chips matched up to your
commitment — everything above that is a side pot you're not eligible for, no matter how strong your
hand. That's the single most confusing side-pot fact, and it's exactly the math-coaching the app
exists to deliver.

This ticket adds a coach note for that moment, consistent with how the coaching engine
([[0007-coaching-engine]], `packages/coach`) already explains decisions. It's the optional, deferrable
piece of the side-pot work — the felt display tickets stand on their own; this turns the visible split
into a taught concept.

## Acceptance criteria

- [ ] When the hero is all-in for less than at least one other live contributor (i.e. the hero is
      eligible only for a subset of `hand.pots`), the coach surfaces a short note explaining that the
      hero can win only the main pot (up to their commitment) and that the chips above it form a side
      pot they're not eligible for — naming the amount they're actually playing for.
- [ ] The eligibility logic reads from the engine (`pot.eligibleSeats` / the hero's `totalCommitted`
      vs others') — no re-implementation of the side-pot split in the coach layer.
- [ ] The note fires only when a side pot the hero is excluded from actually exists; an even all-in
      (everyone eligible for one pot) produces no note. No false positives on ordinary single-pot
      all-ins.
- [ ] Copy matches the coaching engine's existing voice/format and routes through the same
      surfacing path as other per-decision coach notes (not a bespoke UI). Reuses the glossary /
      jargon affordance for "side pot" / "main pot" if those terms aren't already glossed.
- [ ] Tests in `packages/coach` cover: the note fires for a hero short all-in with a real side pot,
      does not fire for an even all-in, and names the correct main-pot amount. `pnpm verify` green.

## Notes

**Optional / deferrable.** [[0090-pwa-multi-pot-display]] and
[[0091-pwa-side-pot-showdown-attribution]] are the committed display work; this coaching note is the
"nice payoff" that can ship in a later pass without blocking them. Sequenced last for that reason.

**Where it lives.** This is coach-engine logic (`packages/coach`), not PWA component code — the PWA
already renders coach notes; this produces one more note from the engine-derived eligibility. Keep the
trigger in the coach package so the TUI/CLI could surface it too if they later render coach output.

**Pedagogy, not mechanics.** The mechanics are done in the engine; the value here is the _explanation_
at the right moment. Keep it to one tight, concrete sentence ("You're all-in for 20 — you can win the
60 main pot; the 60 side pot is between Mia and Jo"), not a lecture.
