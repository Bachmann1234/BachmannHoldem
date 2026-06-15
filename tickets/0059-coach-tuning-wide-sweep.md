---
id: 0059
title: Re-validate the coach's tuning knobs against a wider / multiway sweep
type: task
status: todo
milestone:
priority: low
created: 2026-06-15
---

## Context

The coach-fidelity milestone ([[0051-coach-fidelity-epic]]) introduced several empirically-tuned
knobs — `LARGE_BET_POT_FRACTION` (0.6), `VALUE_BET_THRESHOLD` (0.6), `LARGE_RAISE_MIN_BB` (5),
`THREE_BET_MIN_BB` (9), `EARLY_SEATS` (2), and the `STEAL_OPEN_RANGE` contents. They were chosen
against a relatively narrow instrument: a 60-seed **heads-up** ground-truth sweep
(`pnpm sim --seeds=1-60 --seats=2 --json`, the `misleads` flag). The milestone-review
(2026-06-15) flagged as LOW that these should be re-validated over a wider and multiway sample
before they are treated as settled.

## Acceptance criteria

- [ ] Run a wider ground-truth sweep — larger seed range (e.g. `--seeds=1-200`) and across seat
      counts / positions (`--seats`, `--button`) including multiway — and record the `misleads`
      / verdict distribution.
- [ ] Confirm the current knob values still hold up (the misleading share stays low and the
      over-call vs over-fold balance is sane), or propose tuned values with the sweep evidence.
- [ ] Capture the wider baseline numbers in this ticket so future tuning has a reference broader
      than the heads-up 60-seed figure.
- [ ] No code change required unless the sweep shows a knob is off — if so, adjust the named
      constant(s) and re-run; `pnpm verify` stays green.

## Notes

Follow-up from the [[0051-coach-fidelity-epic]] milestone review. Pairs naturally with
[[0057-coach-board-aware-range]] — both are about the assumed-range fidelity the milestone began,
and a board-aware range would shift these numbers, so consider sequencing this alongside or after 0057. Measurement instrument: the existing `pnpm sim --seeds=<range> --json` harness
([[0030-cli-headless-harness]]).
