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
- **M5 — Drills & quizzes.** The highest-efficiency learning loop, reusing the M3 coach for
  verdicts. Comes after there's a UI to host it.
- **M6 — Stats & leak detection.** Where a trainer beats just playing online — longitudinal
  feedback built on stored hand history.
- **M7 — LLM coaching (optional).** Natural-language narration on top of the trustworthy math.
  Last because it's polish and the only thing needing a network boundary.
- **stretch — GTO.** Solver-driven play, swapped in behind the M2 `Opponent` seam. Deliberately
  last: research-grade effort, and everything else should be solid first.

(The half-step **M3.5** is numbered that way deliberately: it slots a terminal UI between the coach
and the PWA without renumbering the rest of the arc. Its epic is
[`0024`](../tickets/0024-tui-ink-client.md).)

## The three ways to get better

Your "all three eventually" maps onto the arc rather than being separate tracks:

- **Play vs bots** — the spine. M2 (opponents) + the table UI (M3.5 terminal, then M4 PWA).
- **Drills & quizzes** — fastest reps. M5, reusing the M3 coach for verdicts.
- **Analyze my hands** — M6, built on the stored hand history.

## Guiding principles

- **The poker brain is the asset; the UI is a swappable shell.** Engine/odds/bots/coach are pure
  TS with no UI or network deps.
- **Determinism for correctness, LLM only for narration.** Every verdict is math we own; the LLM
  (M7) just explains it and is always optional / offline-degradable.
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
