---
id: BUG-0009
title: Coach narrates a value bet into an unbet pot as "taking the free card"
type: bug
status: fixed
severity: medium
milestone: M4
created: 2026-06-16
---

## Summary

Betting into an unbet pot (`toCall === 0`) is graded **Good** but the ruling copy describes a check
the hero never made — "There's no price to call, so taking the free card is automatic — you keep your
52.9% share for nothing." The hero put chips in; they did not take a free card. The metric cards
inherit the same blind spot: **POT ODDS** shows "free check" and **POT EQUITY** reports
`equity × pot` of the pre-bet pot, ignoring the wager entirely.

## Steps to reproduce

1. Reach a postflop spot where it checks to you (no bet to call) and you have a strong hand.
2. **Bet** (not check) into the unbet pot.
3. Open the decision review drawer.

## Expected

The verdict stays **Good** (betting a favorite for value is correct), but the explanation describes a
_bet for value_ — "no one had bet, so betting your X% equity puts chips in as a favorite" — not a free
check. The metric cards should not claim "free check" when the hero bet.

## Actual

The drawer reads "Good — your action agreed with the math" with the body "There's no price to call, so
taking the free card is automatic — you keep your 52.9% share for nothing", **POT ODDS = free check**,
and **POT EQUITY = +106.8** (= 52.9% × the 202 pot, ignoring the 96 the hero bet).

## Notes

- **Cause:** `DecisionVerdict` (`@holdem/coach`, `verdict.ts`) records _whether_ the hero continued
  (`heroContinued`) but **not how** — there's no bet-vs-check-vs-call signal beyond `missedValueBet`,
  which only fires on a literal check. `explainDecision` (`@holdem/format`, `coachValues.ts:68`)
  branches purely on `potOddsThreshold === 0`, so a bet and a check into an unbet pot render the same
  "free card" sentence. `coachDecision`'s unbet-pot branch grades a bet exactly like a check (a
  continue) by design — fold-vs-continue only — but the narration was written assuming the only
  unbet-pot action is a check.
- **Fix (done):** added a required `heroBet` flag to `DecisionVerdict`, set in `coachDecision`'s unbet
  branch when the action is a `bet`/`raise` (the mirror of `missedValueBet`, which fires on a _check_
  while ahead). `explainDecision` gained a third unbet-pot sub-case that describes the value bet
  ("…betting puts chips in as the favorite. A sound value bet.") instead of the free-card line, so all
  clients (PWA, TUI, CLI, lessons) get the corrected copy. The PWA pot-odds card sub-label now reads
  "you bet" rather than "free check" when `heroBet`. The EV card already relabels to "Pot equity" for a
  nothing-to-call spot (ticket 0055 `evMetric`), which is the honest label for the pre-bet pot share, so
  that value was left as-is. Covered by new tests in `verdict.test.ts`, `coachValues.test.ts`, and
  `CoachDrawer.test.tsx`.
- **Out of scope:** still no bet-_sizing_ grade (deliberate, per ticket 0055 / `verdict.ts` module
  doc). This only corrects how an unbet-pot bet is _described_, not whether 96 was the right size.
- Related: [[BUG-0003-preflop-free-check-graded-as-leak]] (the preflop analogue — narration/grade
  conflated a free check with a chips-in action), ticket 0055 (the `missedValueBet` over-passivity
  flag this sits next to).
