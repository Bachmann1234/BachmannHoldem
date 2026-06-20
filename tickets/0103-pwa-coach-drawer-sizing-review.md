---
id: 0103
title: Surface the sizing verdict in the coach drawer
type: feature
status: done
milestone: M8
priority: medium
created: 2026-06-19
---

## Context

The review-side UI for [[0100-coach-betting-sizing-guidance]]. Render the `sizing` verdict from
[[0102-coach-sizing-verdict-and-explain]] in the PWA coach drawer (`CoachDrawer.tsx`), alongside the
existing equity / pot-odds / EV review, on the decide-then-review surface the coach already uses.

## Acceptance criteria

- [x] When a graded decision has a `sizing` read, the coach drawer shows the intent, the recommended
      band (in the primer's pegs), the grade (good / too-big / too-small), and the _why_ — reading
      naturally next to the continue-decision verdict, not bolted on.
- [x] A "right call, wrong size" hand reads clearly as exactly that: the continue verdict and the
      sizing verdict are visually distinct and not conflated into one good/bad badge.
- [x] Fold/call/check decisions (no `sizing`) show no empty sizing section.
- [x] Layout holds in the drawer across seat counts / orientations (respecting the in-flight M7 work)
      and doesn't push the existing metrics off-screen on a small phone.
- [x] Component tests cover the present/absent sizing section and the three grades.
- [x] `pnpm verify` green.

## Notes

Depends on [[0102-coach-sizing-verdict-and-explain]]. Pure presentation over the verdict — no sizing
logic in the component; it renders what `explainDecision` produced.

Pairs with [[0104-pwa-actionbar-sizing-anchoring]]: this is the _after_ (review), that is the _before_
(reference while choosing). Keep their copy consistent so the band a learner saw on the slider is the
same band the review grades against.
