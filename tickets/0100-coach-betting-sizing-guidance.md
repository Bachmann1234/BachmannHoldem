---
id: 0100
title: Coach betting & sizing guidance
type: epic
status: in-progress
milestone: M8
priority: medium
created: 2026-06-19
---

## Context

The coach grades the **continue decision** — fold vs call/check, from equity-vs-pot-odds — and
deliberately does **not** grade bet/raise _size_. The verdict module says why: "correct sizing needs
fold-equity assumptions (`evOfBet`'s `villainCallProbability`) we do not own deterministically. Sizing
is left to a later ticket / the optional LLM narration." So a hero who open-shoves 100bb with ATo gets
a green "exactly right" — the coach approved the _hand_, blind to the _size_ (exploratory-testing
finding, 2026-06-19). This milestone closes that gap.

**The honest core: grade purpose, not optimality.** The truly _optimal_ size is a solver output, and
the GTO solver is explicitly deferred (so is the LLM) — faking a GTO number would violate the
determinism-for-correctness principle (ROADMAP / LEARNING-APPROACH.md). But beginners almost never
lose money sizing 0.62-pot when optimal was 0.55; they lose it by shoving 100bb to win 3, min-betting
the nuts, or 3-bet-to-2.1x. Those are **purpose errors**, and purpose is deterministically checkable
without a solver. So the coach won't say "the GTO size is 2.3bb"; it will say whether your size makes
sense **for the job the bet is doing** — which is where nearly all the sizing-learning value lives.

**The mechanism** (a deterministic pass alongside the equity read `coachDecision` already runs):

1. _Classify intent_ from signals the coach already has — the equity read (ahead → value; behind →
   bluff; marginal + vulnerable board → protection/thin value), `toCall` and the line (open / 3-bet /
   c-bet / overcall), street, position.
2. _Derive a recommended **band**, not a number_, from the rules of thumb the Foundations bet-sizing
   lesson ([[0072-lesson-bet-sizing]]) already teaches, in the **same** pot-odds peg vocabulary the
   learner saw there (¼≈17%, ⅓≈20%, ½≈25%, ¾≈30%, pot≈33%): opens ≈2–2.5bb (+~1bb/limper), 3-bets
   ≈3x IP / 4x OOP, value ≈½–¾ pot, bluffs sized as the value bets on that line (reuse
   `polarizedBarrelRange`), protection sized to charge the board's draws.
3. _Grade the hero's size against the band and explain_ — in-band → "good, here's the purpose"; out of
   band → a _why_ ("you risked 200 to win 3"; "a min-bet lays 5:1, charging nothing"), not a number.

**Does the UI change? Yes — split by reference-vs-answer.** The decide-then-review model is right for
the discrete continue decision but weak for a continuous, unfamiliar slider. Two surfaces:

- _Review drawer (post-decision)_ — the sizing verdict + risk/reward line. Required, on-model, cheap.
- _ActionBar anchoring (pre-decision, passive)_ — the recommended **band** shaded on the slider and the
  `min`/`½`/`pot`/`all-in` pegs labelled by **purpose**. This is **reference, not answer** — the same
  category as the starting-hand chart / glossary the learner consults before acting. A continuous
  control earns this anchoring in a way the discrete buttons never did.
- _Active pre-commit nudge_ ("size down — this folds out worse") — **deferred / opt-in "assist mode"**,
  because it crosses from reference into answering and undercuts decide-then-review.

This is back on the learning side (the coach), building on M3 (the coach) and M4.6 (the bet-sizing
lesson). The deterministic-then-narration line holds: every band and grade is math we own; an LLM
would only ever _explain_ it.

## Acceptance criteria

- [ ] The coach produces a deterministic, seeded, testable sizing read for every bet/raise spot:
      classified intent, a recommended size band, and a grade (good / too-big / too-small) with a
      plain-language _why_ — surfaced through the existing `explainDecision` path.
- [ ] The egregious cases are caught with risk/reward arithmetic that needs **no** fold-equity
      assumption (the over-shove, the absurd min-bet) — this alone flips the ATo-shove green check to a
      sizing leak.
- [ ] The recommendation uses the **same peg vocabulary** as [[0072-lesson-bet-sizing]]; it is a band,
      never a single "optimal" number, and never claims solver authority.
- [ ] Review-drawer surface: the sizing verdict reads cleanly alongside the existing equity/pot-odds
      review.
- [ ] ActionBar surface: the recommended band is anchored on the slider and the pegs carry their
      purpose, as reference (it never auto-selects a size for the hero).
- [ ] No regression to the continue-decision verdict, the bots, or the shared assumed-range read.
- [ ] `pnpm verify` green.

## Notes

Decomposes into, in dependency order:

- [[0101-coach-sizing-intent-and-bands]] — the deterministic core: spot/intent classification +
  recommended bands. **The part most likely to be wrong; heaviest tests.** Its spot classification
  (open / 3-bet / c-bet / overcall) also fixes the related finding that the coach narrates a BTN
  _overcall_ of a limped pot with RFI/steal reasoning.
- [[0102-coach-sizing-verdict-and-explain]] — `DecisionVerdict` sizing field + `explainDecision`
  rendering; the risk/reward sanity guardrail (the cheap tier-1 win) lands here.
- [[0103-pwa-coach-drawer-sizing-review]] — the review-drawer surface.
- [[0104-pwa-actionbar-sizing-anchoring]] — the in-the-moment band + purpose-labelled pegs.
- [[0105-drills-sizing-theme]] — a "pick the size" drill theme, reusing the band logic (lower
  priority; the band grader is the drill grader).

**Deferred, noted not built:** the active pre-commit nudge / "coach assist" mode, and any
`evOfBet`-driven EV-of-size illustration under explicitly-labelled assumptions — both border on
answering / solver territory. Capture them as follow-ups if the band guidance proves it wants more.

**Run a `milestone-review`** at completion (and a mid-milestone checkpoint if it runs long), per the
ROADMAP process note.
