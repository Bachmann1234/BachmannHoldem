---
id: 0051
title: Coach fidelity — close the gaps between the coach's grade and sound strategy
type: epic
status: done
milestone:
priority: high
created: 2026-06-14
---

## Context

A structured review of the play coach — an experienced player playing through the new
coach-measurement harness ([[0030-cli-headless-harness]], extended with `--button` /
`--villain` / `--json` / a ground-truth equity check) plus a read of the coach source —
found that the coach is **mathematically correct within its scope but answers a narrower
question than it appears to**, and in a few spots gives confidently-stated advice that is
wrong for a strong player and would mis-teach a beginner.

The coach's core promise (LEARNING-APPROACH.md) is to grade the _decision, not the result_
against the math we own. It does that faithfully for the fold-vs-continue call it scopes.
The gaps are where the assumed model diverges from reality:

- **Postflop:** the equity read uses a _static_ assumed range that never narrows on the
  betting line, so it over-rates the hero's hand exactly when a villain keeps betting →
  it rewards calling stations. Quantified via a ground-truth sweep (hero equity vs
  villains' _actual_ cards): ~7–8% of priced postflop decisions are "misleading," skewed
  6–11× toward over-calling.
- **Preflop:** grading is **raise/3-bet-blind** (an opening chart applied to spots where
  the hero is _calling_ a raise), and **position-awareness covers only the `marginal`
  tier** — so it over-opens speculative hands from early position and over-folds correct
  steals on the button / in the blinds / heads-up.
- **Cross-cutting:** the coach grades _only_ fold-vs-continue — it never coaches value
  betting, aggression, or sizing — and some chart rationale strings are stated as
  absolutes that are position/format-dependent and sometimes false.

This epic groups the fixes. The evidence and the measurement instrument already exist
(the `pnpm sim` harness), so each child ticket can be validated by re-running a sweep and
showing the divergence shrink.

## Acceptance criteria

- [x] [[0052-coach-narrow-range-on-action]] — postflop equity narrows on the betting line.
- [x] [[0053-coach-preflop-raise-aware]] — preflop grading distinguishes opening from
      facing a raise/3-bet.
- [x] [[0054-coach-preflop-position-all-tiers]] — preflop position-awareness extends beyond
      the `marginal` tier (incl. HU / blind-vs-blind widening).
- [x] [[0055-coach-value-aggression]] — the coach flags missed value / over-passivity, not
      just fold-vs-continue.
- [x] [[0056-coach-rationale-not-absolute]] — chart rationale wording is tied to the
      position/action-adjusted advice, not a fixed tier label.
- [x] After the children land, a `pnpm sim --seeds` ground-truth sweep shows materially
      fewer "misleading" postflop spots, and the preflop facing-raise / OOP spots grade the
      way a winning player would. **Result:** heads-up `--seeds=1-60 --seats=2` misleads
      14/180 → 11/180, and verdicts shifted toward sound play (good 161 → 173, leak 77 → 67).
      Preflop: the loose OOP cold-calls (seed 39/49/32) now grade `Leak`; the HU-button K7o
      steal grades `Good`; EP speculative opens fold; value-hand checks flag a missed value bet.

## Resolution

All five children landed on `feat/coach-fidelity` (commits 0052→0056). The single
highest-leverage fix — narrowing the assumed range on the betting line — cut the heads-up
"misleading" postflop share by ~21% (14→11/180); its remaining ceiling (a board-unaware range
can't fold a beaten single pair on a low board) is filed as [[0057-coach-board-aware-range]].
The preflop trio (raise-awareness, position-awareness incl. HU, rationale wording) makes the
chart grade context-aware rather than as a fixed opening chart, and 0055 adds the first
aggression signal (a deterministic missed-value-bet flag) plus the `EV(call)`→`Pot equity`
relabel. New follow-up filed: [[0057-coach-board-aware-range]].

## Notes

The weak pillar here is the **assumed range** the coach (and the bots) reason against —
the same static prior drives both ([[0021-coach-decision-verdict]] aliases
`COACH_ASSUMED_RANGE` to the bots' `DEFAULT_RANGE_WIDTH`). Narrowing it on the betting line
([[0052-coach-narrow-range-on-action]]) is the highest-leverage fix and also tightens the
bots. Sizing/value grading ([[0055-coach-value-aggression]]) was deliberately deferred at
[[0021-coach-decision-verdict]] (needs fold-equity assumptions); some of it may land as the
optional LLM layer ([[0011-llm-coaching]]) rather than deterministic math — scope that when
pulled. Measurement instrument: `pnpm sim --seeds=<range> --json` + the `misleads` flag.
