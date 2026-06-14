---
id: BUG-0001
title: Coach folds strong starting hands preflop by misapplying pot-odds math
type: bug
status: fixed # open | in-progress | fixed | wontfix
severity: high # high | medium | low
milestone: M3.5 # found in the TUI play loop
created: 2026-06-13
fixed: 2026-06-14
---

## Resolution (2026-06-14)

Preflop is now graded off the starting-hand chart, not the pot-odds math. Added
`gradePreflop(ctx, action)` to `@holdem/coach` (`preflop.ts`): it classifies the holding
({@link classifyStartingHand}), takes the chart's position-aware open/fold advice for the spot,
and grades the hero `good` when their action agreed and `leak` when it did not — carrying **no**
equity/EV fields, so there is nothing to contradict the chart. `coachDecision` (postflop) is
untouched. The reducer (`coachHero`) and the CLI harness now route preflop → `gradePreflop`,
everything else → `coachDecision`; `CoachResult` grew a `'preflop'` kind alongside `'verdict'`.

Verified end-to-end via `pnpm --filter @holdem/cli sim`: KQs on the button (seed 21) now grades
**"Strong value hand — open and bet for value." → Good** (was the reported leak); JQo on the button
(seed 11, marginal in late position) → Good; trash → Leak. The preflop block no longer renders the
`Equity … vs pot odds … / EV-correct: fold` lines.

**Design questions, resolved:**

- **Suppress the equity/pot-odds numbers preflop** (not just stop them driving the verdict) — the
  preflop block shows only the chart rationale + the good/leak headline. Showing the pot-odds math
  preflop is inherently confusing because the whole point is that pot-odds is the wrong preflop lens.
- **Marginal position handling:** late position = on the button or the cutoff
  (`buttonIndex - 1 mod numPlayers`, a pure seat-geometry test; heads-up both seats count as late).
  Marginal opens in late position and folds elsewhere; all other played tiers open regardless.
- **Facing a raise (first cut):** "play the tier" is treated as continue-vs-fold against whatever
  the hero faces, so a charted hand may continue facing a raise. Tightening ranges vs. a raise/3-bet
  (flatting vs. 3-betting) is a deliberate follow-up, not part of this fix.
- The related UI wart (labelling the held verdict with the street it was made on) remains a separate
  follow-up, as noted below.

Touched: `@holdem/coach` (`preflop.ts` + tests), `@holdem/session` (`model.ts`/`reducer.ts`),
`apps/tui` `CoachPanel.tsx`, `apps/cli` `table.ts`/`sim.ts`, and `apps/pwa` `CoachDrawer.tsx`/
`CoachFab.tsx` (the PWA, added in M4, had the same bug and is fixed too).

---

## Summary

Preflop, the coach grades the hero's decision with the postflop **equity-vs-pot-odds** rule
({@link coachDecision} in `@holdem/coach`) regardless of street. On any priced preflop spot it
takes the hand's raw go-to-showdown equity against the assumed opponent range, compares it to the
pot-odds threshold, and stamps **"fold"** — so it recommends folding hands the starting-hand chart
itself classifies as clear opens (AJs, KQs, even premiums into a multiway field). That's actively
wrong advice for a teaching tool, and it directly contradicts the chart rationale shown one line
above it.

## Steps to reproduce

1. `pnpm play`, deal hands until the hero is on the button with **AJs** and it folds around to them
   (unraised pot: blinds 1/2, pot 3, hero owes the big blind = 2).
2. Watch the Coach panel grade the preflop decision.

## Expected

AJs folded to you on the button is a **raise/open**, not a fold. The chart line
(_"Strong value hand — open and bet for value"_) is the correct read, so entering the pot should
grade as **good** (a leak would be _folding_ it).

## Actual

The coach reports, for the unraised-button AJs spot:

```
Starting hand: Strong value hand — open and bet for value.
Equity 27.6%  vs pot odds 40.0%  EV(call) -0.6
EV-correct: fold
Leak — the math pointed the other way.   (red)
```

The pot-odds math (27.6% equity < 40% threshold → EV(call) −0.6 → fold) overrides the chart and
flags a textbook open as a leak. The two lines openly contradict each other.

## Notes

**Root cause.** `coachDecision` ([[0021-coach-decision-verdict]]) is a _postflop_ lens — raw all-in
equity vs flat pot odds. The reducer (`coachHero`, `packages/session/src/reducer.ts`) calls it on
**every** street and only _additionally_ attaches the chart classification preflop; it never lets the
chart drive the verdict. Pot-odds-vs-equity is the wrong model preflop because it ignores the three
things that make a hand like AJs a clear button open:

- **position** (you act last every street),
- **fold equity** (you can raise and take it down rather than peel to showdown),
- **initiative / implied odds** (flopping top pair or a draw pays off).

The multiway equity read ([[0031-coach-multiway-equity]]) makes it worse the more opponents are live:
strong hands get dragged below threshold and flagged as folds.

**Proposed fix.** Preflop, grade off the starting-hand chart ([[0022-coach-preflop-chart]]), **not**
the pot-odds math:

- Derive the preflop good/leak/break-even classification from the {@link PreflopTier}'s open/fold
  guidance, not from `equity` vs `potOddsThreshold`.
- A tier the chart says to play (premium / strong / playable; marginal in late position) → entering
  the pot is **good** and folding it is the leak. A `trash` tier → folding is **good**.
- Stop rendering the self-contradicting "open and bet for value" + "EV-correct: fold" pairing.

**Open design questions (decide during implementation):**

- Postflop is unchanged — keep `coachDecision` exactly as-is there. Only the _preflop_ branch changes.
- Do we still surface the equity/pot-odds numbers preflop as context, or suppress them so only the
  chart verdict shows? (Showing them is fine _if_ they no longer drive the good/leak call.)
- Position handling for the `marginal` tier (open late, fold early) — the chart rationale already
  encodes the principle, but the verdict needs the hero's seat/position to grade it.
- Facing a real **raise/3-bet** preflop (not just the unraised blind): the chart is an _opening_
  chart. A first cut can treat "play the tier" as continue-vs-fold; tightening vs a raise (e.g.
  flatting/3-betting ranges) can be a follow-up rather than blocking this fix.

**Related UI wart (separate, smaller).** The Coach panel keeps showing the preflop verdict while the
flop is dealt (it holds the last hero decision until the next one), with no street label — so a
preflop grade reads as if it's about the current board. Worth a follow-up: label the grade with the
street it was made on. Tracked here for context; not required to close this bug.

Affected packages: `@holdem/coach` (`verdict.ts`), `@holdem/session` (`reducer.ts` `coachHero`),
render in `apps/tui` `CoachPanel.tsx` and `apps/cli` `table.ts`.
