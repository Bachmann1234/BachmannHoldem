---
id: 0059
title: Re-validate the coach's tuning knobs against a wider / multiway sweep
type: task
status: done
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

- [x] Run a wider ground-truth sweep — larger seed range (`--seeds=1-200`) and across seat
      counts / positions (`--seats`, `--button`) including multiway — and record the `misleads`
      / verdict distribution.
- [x] Confirm the current knob values still hold up (the misleading share stays low and the
      over-call vs over-fold balance is sane), or propose tuned values with the sweep evidence.
- [x] Capture the wider baseline numbers in this ticket so future tuning has a reference broader
      than the heads-up 60-seed figure.
- [x] No code change required unless the sweep shows a knob is off — `BLUFF_FRACTION` was off for
      multiway and was retuned `0.25 → 0.20`; `pnpm verify` stays green.

## Resolution

Ran a wide `--seeds=1-200` ground-truth sweep across seat counts and hero positions (heads-up,
3-handed, 6-max; button moved to put the hero on the button, in the blinds, and in middle
position). The misleads-measurable postflop knobs were re-validated against it; the preflop chart
knobs (`LARGE_RAISE_MIN_BB`, `THREE_BET_MIN_BB`, `EARLY_SEATS`, `STEAL_OPEN_RANGE`) and the
additive `VALUE_BET_THRESHOLD` nudge are **not** ground-truth-measurable by `misleads` (which only
checks the postflop continue decision against villains' real cards — there is no preflop equity
oracle), so for those the verdict distribution is only sanity-checked, and it stays sane.

**One knob was off: `BLUFF_FRACTION`.** It had been tuned (ticket 0057) only on the narrow 60-seed
heads-up instrument, where `0.25` was optimal. The wider/multiway sweep showed `0.25` over-rates
continues away from heads-up — the calling-station direction this layer exists to fight. Evidence
(misleads, with over-Continue / over-Fold split), 200-seed:

| BLUFF | HU btn0    | 6-max btn0 | 6-max btn2 | agg total | over-cont : over-fold |
| ----- | ---------- | ---------- | ---------- | --------- | --------------------- |
| 0.25  | 38 (27/11) | 45 (32/13) | 57 (43/14) | 140       | 102 : 38 (2.7 : 1)    |
| 0.20  | 38 (23/15) | 39 (23/16) | 48 (30/18) | 125       | 76 : 49 (1.55 : 1)    |
| 0.15  | 37 (18/19) | 40 (20/20) | 43 (23/20) | 120       | 61 : 59 (1.03 : 1)    |

Chose **`0.20`**: it captures most of the gain (worst-case 6-max share 9.1% → 7.7%) and roughly
halves the over-continue lean without tipping any sampled config into an over-fold lean (which 0.15
risks on the dry/heads-up spots), and it is a measured step from the established value rather than
the noise-level minimum. Cost: the 60-seed heads-up instrument ticks 10 → 11/180 (over-fold 2 → 3,
still at the pre-0057 baseline) — the expected trade for the multiway improvement, and exactly why
this ticket exists (the 60-seed figure was too narrow).

`LARGE_BET_POT_FRACTION` was **insensitive** across `0.5 / 0.6 / 0.7` (identical misleads on every
config — the bots' bet sizes don't land in that band in a way that reclassifies barreled spots, and
most barrels are reached via the later-street rule), so `0.6` is confirmed.

### Wider baseline (recorded reference — `--seeds=1-200`, `BLUFF_FRACTION=0.20`)

| seats   | button (hero) | misleads / priced | rate     | over-cont / over-fold  |
| ------- | ------------- | ----------------- | -------- | ---------------------- |
| 2       | 0 (BTN/SB)    | 38 / 600          | 6.3%     | 23 / 15                |
| 2       | 1 (BB)        | 2 / 53            | 3.8%     | 2 / 0                  |
| 3       | 0 (BTN)       | 41 / 600          | 6.8%     | 31 / 10                |
| 3       | 1 (SB)        | 5 / 73            | 6.8%     | 5 / 0                  |
| 3       | 2 (BB)        | 45 / 767          | 5.9%     | 28 / 17                |
| 6       | 0 (BTN)       | 39 / 596          | 6.5%     | 23 / 16                |
| 6       | 2 (MP)        | 48 / 627          | 7.7%     | 30 / 18                |
| 6       | 4 (CO)        | 11 / 167          | 6.6%     | 9 / 2                  |
| **all** | —             | **229 / 3483**    | **6.6%** | **151 / 78 (1.9 : 1)** |

The misleading share is low and stable across table sizes/positions (5.9–7.7% on the large
samples), down from **7.2%** at the old `0.25`. Future tuning should use this 200-seed multiway
reference rather than the heads-up 60-seed figure.

## Notes

Follow-up from the [[0051-coach-fidelity-epic]] milestone review. Pairs naturally with
[[0057-coach-board-aware-range]] — both are about the assumed-range fidelity the milestone began,
and a board-aware range would shift these numbers, so consider sequencing this alongside or after 0057. Measurement instrument: the existing `pnpm sim --seeds=<range> --json` harness
([[0030-cli-headless-harness]]).
