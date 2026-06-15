---
id: 0061
title: Anonymize opponents on the felt, with a count-based setup and an opt-in coach table read
type: feature
status: done
milestone: M4
priority: medium
created: 2026-06-15
---

## Context

The felt labelled each bot with its archetype (`Seat 3 (Station)`), handing the hero every
opponent's exploitable tendency for free — which undercuts the "learn to read opponents" pedagogy.
This anonymizes the table and moves the read into the coach, where it's taught on demand. Rode along
with the mobile-layout fix [[BUG-0008-pwa-table-crowded-overflow-mobile]] (narrowing the pills was
also what let two opposing seats fit on a phone-width felt).

## Acceptance criteria

- [x] Felt shows unique, neutral, short names (`OPPONENT_NAMES`), shuffled per session
      (`shuffledOpponentNames`), stable within a session; `botKind` retained for behaviour/history/coach.
- [x] Result banner names the winner (`Mia wins`), not `Seat N wins`.
- [x] Setup screen picks _counts_ per archetype (`adjust-mix` rebalances to seats−1), keeps the seats
      stepper, adds a Randomize that rerolls only personalities (`set-opponents` + `randomOpponents`),
      and shows a one-line blurb under each archetype (`BOT_BLURBS`).
- [x] Coach drawer has an opt-in "Reveal opponent reads" disclosure listing the whole table (folded
      players included — a read is a personality, not pot status) with an exploit tip (`BOT_TIPS`,
      `opponentReads`); collapsed by default, re-collapsed per open, auto-scrolls into view on reveal.
- [x] TUI keeps its per-seat `cycle-opponent` editor (the shared reducer supports both models).

## Notes

Shipped in `35b1c1d`. Builds on [[0034-pwa-table-view]] / [[0036-pwa-coach-panel]] /
[[0035-pwa-play-loop]]. Follow-ups split out:
[[0062-coach-archetype-aware-verdict]] (make the verdict _math_ archetype-aware, not just the
narration) and [[0063-pwa-coach-read-reveal-discoverability]] (reveal timing / toggle discoverability).
The setup screen still shows archetype labels + blurbs on purpose — that's where the hero chooses the
spread; only the _felt_ hides the style.
