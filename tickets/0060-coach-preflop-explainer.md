---
id: 0060
title: Beginner-readable preflop explainer — say WHY the chart ruled, deterministically
type: feature
status: todo
milestone:
priority: medium
created: 2026-06-15
---

## Context

A beginner can't tell _why_ the preflop coach ruled the way it did. Postflop has a deterministic
"why" line ([[0049-coach-why-line]] — `explainDecision`) that walks through equity vs. the price;
**preflop has no equivalent** — it shows only the terse one-line tier/advice rationale. So a learner
sees a confident verdict with no teachable reasoning behind it.

Concrete (a real captured ruling, fed through `pnpm sim --spot`): folded around to the hero on the
button with 5♦4♠, the coach said _"A wide steal spot — … open this profitably and take it down"_ and
graded the **fold a Leak** — with no explanation a beginner could follow ("why is 5-4 a profitable
open?"). The grade's reasoning is fully known to the code: the just-shipped decision trace carries
`{ position: 'late', mode: 'open', stealSpot: true, band: 'unraised', facingRaise: false, raiseBb }`,
and the tier is known. Everything needed to explain the ruling in plain language is already computed
— it just isn't narrated.

**This does not need an LLM.** Per [LEARNING-APPROACH.md] (deterministic math we own; the LLM only
narrates) the explanation is a templated, principle-first rendering of facts the coach already has.
A natural-language, _conversational_ layer (open follow-up questions, varied phrasing, non-enumerable
nuance) is the separate, optional LLM layer ([[0011-llm-coaching]]) — explicitly **out of scope** here.

## Acceptance criteria

- [ ] A pure `explainPreflop(verdict)` (the preflop counterpart to `explainDecision`), living with
      the shared formatters (`@holdem/format`), that turns a `PreflopVerdict` + its `trace` into a
      short, beginner-readable explanation following: **situation → principle → this hand → nuance**.
      Example for the spot above: _"It folded around to you on the button, so only the blinds are
      left behind you. From there you can open a wide range — you act last and the blinds fold
      often, so the position and the steal are the profit, not the cards. 5♦4♠ is weak but good
      enough to open here."_
- [ ] Covers every preflop `trace.mode` / `band`: an open (incl. the steal promotion), a big-blind
      defend vs a small raise (BUG-0007), a cold-call, the big-blind option (free check), and the
      facing-raise bands (small / large / 3-bet) — each with the principle that drives it. No false
      universals (consistent with [[0056-coach-rationale-not-absolute]]); the wording follows the
      advice actually given.
- [ ] Surfaced in the PWA coach drawer (preflop body) and the CLI sim, the way `explainDecision` is
      for postflop. Cross-links to the Foundations primer concept where natural ([[0042-foundations-primer]] /
      [[0043-coach-concept-tag]]).
- [ ] Deterministic and pure (string rendering off the verdict/trace — no Monte-Carlo, no I/O, no
      LLM). Tests assert the explanation for several position/action permutations and that it never
      contradicts the verdict.
- [ ] `pnpm verify` green.

## Notes

The data dependency already shipped: the decision trace (`PreflopTrace` on `PreflopVerdict`) is the
input this reads, and `serializeSpot`/`pnpm sim --spot` make any ruling reproducible to develop
against. Mirror `explainDecision`'s shape and house style; it likely belongs next to it in
`packages/format/src/coachValues.ts`.

**Pair with the steal-fold over-prescription.** A clearer explanation of an over-confident grade just
mis-teaches more convincingly. The same steal promotion ([[0054-coach-preflop-position-all-tiers]])
that opens 54o on the button also grades **folding** it a `Leak` — but the bottom of a steal range is
_optional_ (opening is fine, folding is fine), not mandatory. Decide as part of this work whether to
also make steal-range opens optional (fold → `breakEven`, the unused-preflop verdict state, not
`leak`) so the explainer can honestly say "opening is good, folding is fine — here's why" rather than
narrating a false mistake. (Sibling of the already-fixed [[BUG-0007-coach-over-folds-bb-defense]],
mirrored: BUG-0007 was over-_folding_ a defend; this is over-_punishing a fold_ of a marginal steal.)
If preferred, split that grade tweak into its own bug ticket and land it first.
