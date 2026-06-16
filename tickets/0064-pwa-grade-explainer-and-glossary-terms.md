---
id: 0064
title: Explain a hand's chart grade in plain English, with inline glossary terms
type: feature
status: done
milestone:
priority: medium
created: 2026-06-15
---

## Context

The starting-hand chart ([[0050-starting-hand-chart-view]]) shows _which_ tier a hand lands in
(colour + tap-to-decode caption), but never _why_. A learner sees `A9s` graded **Playable** and
`K9s` graded **Trash** — same shape (suited, one-gapper, a nine) — with nothing to explain the gap.
The motivating quote: _"I find myself confused why an A9s is playable while a K9s is trash."_

The reasons are fully derivable from the two cards — no equity sim, consistent with the chart's
deterministic "teaching artifact" design (`preflop.ts` header: "this is a chart lookup, not an
equity sim"). The differentiator is the **nut-flush / domination** axis: the ace makes the best
possible flush and a strong high card; a king-high flush is second-best (loses to ace-high) and a
paired king is out-kicked by better kings. That contrast _is_ the lesson.

Today's rationale is **tier-level** strength text (`TIER_RATIONALE`, `openFoldRationale` in
`packages/coach/src/rationale.ts`) — "Playable — flops well in position", "Trash — the long
unconnected tail". It can't tell A9s from K9s. We want a **hand-level**, **layman** explanation of a
grade, surfaced in the chart, and — because this is a learning app — we want the real poker terms it
leans on (nuts, kicker, dominated, set, suited connector) to be **one tap from their definition**.

This is the preflop chart's structural counterpart to [[0060-coach-preflop-explainer]] (which
explains the position/action _ruling_); this explains the _hand's properties_. Deterministic,
no LLM (per [LEARNING-APPROACH.md]: the math is ours; an LLM would only ever narrate later).

## Acceptance criteria

- [ ] A pure `explainGrade(label)` in `@holdem/coach` that turns a hand-class label (`"A9s"`,
      `"K9s"`, `"AA"`, `"JTo"`, …) into a short, **plain-English** explanation of why the hand has
      the strength it does, derived from structural features of the two cards (is-pair, suited,
      gap/connectedness, both-broadway, **contains-ace / nut-flush potential**, kicker domination).
      Returns **structured segments** (plain text + optional `{ text, term }` references) rather than
      a flat string, so the prose can name a real term and have it rendered as a tappable link while
      the logic stays pure and testable. Lives next to `describeHandClass` / `TIER_RATIONALE`.
- [ ] The wording is **layman-first** and bridges to the term: e.g. A9s → _"the ace means any flush
      you make is the best possible — nobody can out-flush you (the **nuts**) — and the ace is a
      strong card on its own"_; K9s → _"same shape as a suited ace but a step down: a king-high flush
      loses to an ace-high one, and pairing the king your nine gets **out-kicked** by better kings —
      it tends to lose chips, not make them."_ **No false universals** (consistent with
      [[0056-coach-rationale-not-absolute]]): K9s "tends to lose chips", never "always loses".
- [ ] A single shared **term registry** (`GLOSSARY_TERMS`, keyed by stable ids — `nuts`, `kicker`,
      `dominated`, `set`, `suited-connector`, …) is the one source of truth for these definitions.
      Both the inline term links and the glossary overlay's new section read from it, so a term can
      never carry two definitions that drift (same discipline as `describeHandClass` feeding the
      glossary today).
- [ ] A small `<GlossaryText>` renderer maps the explainer's segments to text + tappable term spans
      (styled so the learner can see a term is defined). Reusable by any future explanation text.
- [ ] **Tap a term → the glossary overlay opens scrolled to and highlighting that entry** (the chosen
      UX). `GlossaryOverlay` gains an optional `focusTerm` prop; `ChartOverlay` can request it. A
      plain CSS `title` tooltip is **not** acceptable — this is a touch PWA and hover never fires on
      a phone (the reason the tap-to-decode caption exists at all).
- [ ] The chart's decode caption (`ChartOverlay.tsx`) renders the explanation through `<GlossaryText>`
      under the existing name + tier line, inside the current `aria-live` region.
- [ ] A new **"Hand strength"** section in `GlossaryOverlay`, built from `GLOSSARY_TERMS` (nuts,
      kicker, dominated, set, suited connector). **Fix the `Trash` entry** (`GlossaryOverlay.tsx:58`)
      that still says _"makes no money over time"_ — the exact false-universal the coach package
      scrubbed (a K7o steal does make money); hedge it to match.
- [ ] Tests pin the canonical contrasts (A9s vs K9s, AA, 22, a suited connector, an offsuit
      broadway, offsuit junk) — both the explanation content and which terms each surfaces — so the
      wording can't silently drift. `pnpm verify` green.

## Notes

**Layered to keep the seams clean.** Pure logic + vocabulary (`explainGrade`, `GLOSSARY_TERMS`)
produce serialisable data; the PWA (`<GlossaryText>`, the overlays) renders and wires interaction —
same split the codebase already uses (`describeHandClass` is pure; `ChartOverlay` is presentational).
The term ids are stable string keys, so coach can reference a term without owning its on-screen copy.

**Absolute first, comparative later.** Ship the hand's own-properties explanation; the explicit
comparative phrasing ("unlike A9s, the K can't make the nut flush") and surfacing `explainGrade` in
the coach drawer's preflop verdict (alongside [[0060-coach-preflop-explainer]]) are easy follow-ups,
out of scope here.

**Decision captured:** tooltip interaction = open the existing glossary at the term (reuses the
accessible modal, lowest risk, bridges the learner to the full glossary) rather than an inline
popover. If an inline popover is wanted later it can reuse the same `GLOSSARY_TERMS` registry.
