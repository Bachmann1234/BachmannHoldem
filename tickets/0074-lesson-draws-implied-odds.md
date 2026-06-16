---
id: 0074
title: 'Lesson: draws & implied odds — why you can call a little light'
type: feature
status: done
milestone: M4.6
priority: high
created: 2026-06-16
---

## Context

The flagship continue rule ("fold when your equity does not beat the price") is taught as absolute,
but for **draws** it is wrong without implied odds: because you win future bets when you hit, draws
are routinely a profitable continue at immediate odds _worse_ than the rule implies — and the equity
lesson's headline example _is_ a flush draw. A beginner who takes the rule literally will fold
profitable draws (beginner-pedagogy review, 2026-06-16). This lesson is the durable fix for
[[BUG-0010-continue-rule-lesson-omits-implied-odds]]; the bug's one-sentence caveat is the stopgap,
this lesson is the real teaching.

## Acceptance criteria

- [x] A new `FOUNDATIONS` lesson on draws and implied odds: why future winnings let you continue a
      draw below the raw equity-vs-price threshold, and the limits (stack depth, how clean your outs
      are, reverse implied odds when you make a second-best hand) — tagged with its `Concept`
      ([[0043-coach-concept-tag]]). _(`foundations-draws`, concept `equity-vs-price` — locked reuse.)_
- [x] ~30-second beginner-pitched explanation that explicitly reconciles with the continue rule
      ("the rule still holds for made hands; draws are the exception, and here's why").
- [x] At least one retrieval-check spot. Where the coach can rule the draw continue, grade through
      the engine; where implied odds depend on future streets the coach doesn't model, use a
      minimal clearly-flagged declarative check per [[0045-foundations-primer-content]] — documented,
      never contradicting the coach. _(Two spots on the SAME flush draw: a `CoachSpot` at a 20% price
      (immediate equity ~37% > price → coach blesses the call) and the `DeclarativeSpot` carve-out at
      a ~43% price (immediate equity ~40% < price → coach would rule it a leak, but implied odds flip
      it). The app's first declarative spot — needed a `SpotPlayer`/`ResultSheet` fix to render its
      authored explanation. A guard test pins that the coach really rules spot B a leak.)_
- [x] Test + purity per the [[0045-foundations-primer-content]] bar. _(The blanket "no declarative
      carve-out" test relaxed to "declarative spots are the flagged, well-formed exception".)_
- [x] The continue-rule lesson links forward to this one (closes [[BUG-0010-continue-rule-lesson-omits-implied-odds]]).

## Notes

Part of [[0070-foundations-primer-v2]]; depends on [[0044-curriculum-engine]]. Sequence this
immediately after the continue-rule lesson so the caveat lands while the rule is fresh. This is the
correctness keystone of the epic — prioritize it alongside the [[BUG-0010-continue-rule-lesson-omits-implied-odds]]
stopgap.
