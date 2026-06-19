# Roadmap

The **board** ([`../tickets/`](../tickets/)) is the source of truth for what's actionable and its
status — every milestone, including the not-yet-started ones, lives there as tickets (`0002`–`0004`
for the active M0; epics `0005`–`0012` for M1 onward). This document is the **narrative map**: the
locked decisions, the order, and the principles behind them. It deliberately does **not** list
tickets or track status — that would only drift from the board.

> Decisions locked: TypeScript PWA · client-only (no backend) · React · pnpm + Vite +
> Vitest · free static hosting · equity sims in a Web Worker. Coaching starts practical
> (equity / pot odds / EV) with clean interfaces so a GTO solver can slot in later. The core
> loop is "play vs bots" as the spine, with drills and hand-analysis layered on over time.

## The arc, and why it's ordered this way

Milestones are sequenced by value-per-effort and dependency. The hard, risky, correctness-critical
work is front-loaded and validated as pure-TS packages with a Node CLI/test loop, long before any
UI exists — so the foundation is trustworthy before anything is built on top of it.

- **M0 — Core engine.** Cards, hand evaluation, and the rules state machine. Everything else
  trusts this, so it comes first and gets tested hardest.
- **M1 — Odds & equity.** The math layer (equity, pot odds, EV). Built on M0; powers both the
  coach and the bots, so it precedes both.
- **M2 — Heuristic opponents.** Someone to play against. Needs the equity engine to make
  pot-odds-aware decisions; ships behind an `Opponent` seam so a smarter bot can replace it later.
- **M3 — Coaching engine.** The actual point of the app — and still no AI. Turns the deterministic
  math into per-decision feedback. Needs M1.
- **M3.5 — Ink TUI play client.** The first interactive UI: a full-screen terminal client (Ink —
  React for the terminal) over the already-tested packages, becoming the play experience while the
  readline CLI is slimmed to a headless harness. Seats a realistic table (default 6-max, down to
  heads-up) rather than the CLI's heads-up-only loop, which also pulls the coach's equity read into
  being multiway-aware. Ink is React and so is the M4 PWA, so this is a
  low-risk dry run of M4 in the _same paradigm_: the hooks/reducer logic and the play/coach loop
  carry over (only the terminal-vs-DOM render layer differs). No engine porting; the UI just
  consumes M0–M3.
- **M4 — PWA app shell.** The first "real" version: an installable Android PWA built on the
  already-tested packages. No engine porting — the UI just consumes what M0–M3 produced.
- **M4.5 — Foundations primer.** The explicit-instruction layer: a short "how to think about a
  hand" primer that teaches the mental models the coach already assumes (equity, pot odds,
  equity-vs-price, EV, position, ranges) — each taught by a retrieval check, not prose. The coach
  scores decisions but assumes you hold the framework; M4.5 builds the framework. It precedes M5
  because drilling a skill you have no concept for is just faster confusion — the concepts are the
  dependency the drills rest on, the same way the math (M1) preceded the coach (M3). Its epic is
  [`0042`](../tickets/0042-foundations-primer.md).
- **M4.6 — Foundations primer v2.** M4.5 shipped six crisp, coach-true lessons, but a beginner-
  pedagogy review found it teaches how to _evaluate a continue decision_ before teaching most of
  what _generates_ those decisions: it has no lesson on facing a preflop raise (the most common real
  decision), no bet-sizing lesson, no board-texture lesson (a documented scope gap in 0042/0045),
  and no draws/implied-odds lesson — the last of which leaves the flagship continue rule subtly
  wrong. M4.6 closes those four load-bearing gaps and reorders the primer so preflop foundations
  (ranges, position) precede postflop evaluation. It extends M4.5's mission rather than starting a
  track, and like M4.5 it precedes the deeper drills it gives the learner something to drill. Its
  epic is [`0070`](../tickets/0070-foundations-primer-v2.md).
- **M5 — Drills & quizzes.** The highest-efficiency learning loop, reusing the M3 coach for
  verdicts. Comes after there's a UI to host it and the M4.5 framework to drill against.
- **M5.5 — Drills v2.** M5 shipped excellent plumbing (every spot graded by the live coach, genuine
  interleaving) but a starter set of activities: three themes, binary Call/Fold spots, flop-only
  boards, and — the biggest gap — the app teaches the math but never makes the player _retrieve it
  as a number_. M5.5 is a depth pass: calculation/estimation drills, board-reading and turn/river
  spots, richer feedback that shows the math, and the retention lever M5 deferred — spaced
  repetition of missed spots, plus per-concept mastery and adaptive difficulty. The spaced-repetition
  piece was originally going to lean on M6 persistence, but the IndexedDB store pattern already
  existed, so it was built here as the shared durable store M6 stats will consume. Its epic is
  [`0076`](../tickets/0076-drills-v2.md).
- **M6 — Stats & leak detection.** Where a trainer beats just playing online — longitudinal
  feedback built on stored hand history. The last milestone of the _learning_ arc.
- **M7 — Responsive felt & landscape play.** The first milestone that's purely about the shell, not
  the poker brain: make the table felt orientation- and size-agnostic and add a real landscape
  layout. The felt was built portrait-only — seats are positioned in percentages while cards/pills
  are fixed pixels, so a shorter (landscape) felt collides them; the `orientation: portrait` manifest
  lock masks this rather than solving it. The locked approach is **fix sizing before arrangement**:
  first make the whole felt scale as one unit so percentage coordinates hold at any size (which also
  lets the accreted portrait pixel-hacks — `WAGER_DROP_PX`, the `completeRise` lift special-casing —
  be deleted), _then_ add a landscape seat arrangement on top, which becomes a clean second coordinate
  table instead of a second set of fragile per-size patches. A discretionary UI investment off the
  learning arc; it reclaims the M7 number freed when LLM coaching was deprioritized to a deferred
  idea (below). Its epic is [`0095`](../tickets/0095-responsive-felt-and-landscape.md).

### Deferred — ideas, not committed

Parked as maybe-someday ideas, deliberately off the committed arc. They only get pulled if they
clearly earn their cost; until then they're not planned work.

- **LLM coaching (formerly the M7 slot; that number is now M7 — Responsive felt, above).**
  Natural-language narration on top of the trustworthy math — the LLM would
  _explain_ the deterministic numbers, never compute them. **Deprioritized:** it's pure polish and the
  only thing in the whole app that would need a network boundary (a serverless key-proxy), and that
  cost isn't worth it just for narration — the deterministic math coach already stands on its own.
  Parked as an idea ([`0011`](../tickets/0011-llm-coaching.md)).
- **GTO solver.** Solver-driven play, swapped in behind the M2 `Opponent` seam. Research-grade effort,
  and everything else should be solid first ([`0012`](../tickets/0012-gto-solver.md)).

(The half-steps **M3.5**, **M4.5**, **M4.6**, and **M5.5** are numbered that way deliberately: each
slots a step into the arc without renumbering the rest. M3.5 puts a terminal UI between the coach and
the PWA (epic [`0024`](../tickets/0024-tui-ink-client.md)); M4.5 puts a concept primer between the
PWA shell and the drills that depend on it (epic [`0042`](../tickets/0042-foundations-primer.md)).
M4.6 ([`0070`](../tickets/0070-foundations-primer-v2.md)) and M5.5
([`0076`](../tickets/0076-drills-v2.md)) are depth passes that deepen M4.5 and M5 after a pedagogy
review, slotted next to the steps they extend.)

## The three ways to get better

Your "all three eventually" maps onto the arc rather than being separate tracks:

- **Play vs bots** — the spine. M2 (opponents) + the table UI (M3.5 terminal, then M4 PWA).
- **Drills & quizzes** — fastest reps. M5, reusing the M3 coach for verdicts; deepened in M5.5
  (calculation reps, board reading, spaced repetition, per-concept mastery).
- **Analyze my hands** — M6, built on the stored hand history.

## Guiding principles

- **The poker brain is the asset; the UI is a swappable shell.** Engine/odds/bots/coach are pure
  TS with no UI or network deps.
- **Determinism for correctness, LLM only for narration.** Every verdict is math we own; an LLM layer
  would only explain it and stay optional / offline-degradable — which is exactly why it's a deferred
  idea, not a committed milestone (a network boundary isn't worth it just for narration).
- **Front-load the hard, high-value work.** Correctness-critical code ships and is tested before
  any pixels exist.

## Process: when to run a milestone review

The `milestone-review` skill is a whole-repo audit (code smells, doc drift, dependency issues,
security, test gaps, convention violations) that files its findings back onto the board as
tickets. Anchor it to **milestone boundaries, not a ticket count** — it's a heavier, fan-out
audit, so running it every few tickets just re-flags the same drift:

- **Small milestones (M0–M3, ~1–4 tickets each):** run it once, when the milestone's last ticket
  flips to `done`.
- **Large milestones (M4 onward — UI-heavy, and they decompose into many tickets):** add one
  mid-milestone checkpoint (~6 tickets in, or whenever drift is visible). Don't let a big
  milestone run to the end before its first review.

First run: at **M0 completion**, once the CLI runner (`0004`) lands.
