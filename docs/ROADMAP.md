# Roadmap

This is the **narrative map** — the milestones, their order, and why. The **executable units of
work** live on the ticket board in [`../tickets/`](../tickets/); each milestone links to its
ticket(s). When the two disagree, the tickets win (they're the source of truth).

Milestones are ordered by value-per-effort and dependency. Each is independently useful. The
hard, risky work (engine correctness + equity math) is front-loaded and validated as pure-TS
packages with a Node CLI/test loop, long before any UI exists.

> Decisions locked: TypeScript PWA · client-only (no backend) · SvelteKit · pnpm + Vite +
> Vitest · free static hosting · equity sims in a Web Worker. Coaching starts practical
> (equity / pot odds / EV) with clean interfaces so a GTO solver can slot in later. The core
> loop is "play vs bots" as the spine, with drills and hand-analysis layered on over time.

| Milestone   | Theme                                 | Done when                                       | Tickets                                                                                                                                                                        |
| ----------- | ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0**      | Core engine (`packages/engine`)       | Play a full, rules-correct hand in the terminal | [0001](../tickets/0001-card-primitives.md) · [0002](../tickets/0002-hand-evaluator.md) · [0003](../tickets/0003-game-state-machine.md) · [0004](../tickets/0004-cli-runner.md) |
| **M1**      | Odds & equity (`packages/odds`)       | `equity()` returns a win% — the test oracle     | [0005](../tickets/0005-odds-equity-engine.md)                                                                                                                                  |
| **M2**      | Heuristic opponents (`packages/bots`) | Play full hands vs configurable bots            | [0006](../tickets/0006-heuristic-opponents.md)                                                                                                                                 |
| **M3**      | Coaching engine (`packages/coach`)    | The CLI is a real, deterministic coach          | [0007](../tickets/0007-coaching-engine.md)                                                                                                                                     |
| **M4**      | PWA app shell (`apps/pwa`)            | Installable Android PWA — first "real" version  | [0008](../tickets/0008-pwa-app-shell.md)                                                                                                                                       |
| **M5**      | Drills & quizzes                      | A fast-rep training mode                        | [0009](../tickets/0009-drills-and-quizzes.md)                                                                                                                                  |
| **M6**      | Stats & leak detection                | Longitudinal feedback on _your_ tendencies      | [0010](../tickets/0010-stats-and-leak-detection.md)                                                                                                                            |
| **M7**      | LLM coaching polish (optional)        | Conversational "why" on top of the math         | [0011](../tickets/0011-llm-coaching.md)                                                                                                                                        |
| **stretch** | GTO solver                            | Solver-driven opponents behind the bot seam     | [0012](../tickets/0012-gto-solver.md)                                                                                                                                          |

## The three ways to get better (your "all three eventually")

These map onto the milestones rather than being separate tracks:

- **Play vs bots** — the spine. M2 (opponents) + M4 (table UI).
- **Drills & quizzes** — fastest reps. M5, reusing the M3 coach for verdicts.
- **Analyze my hands** — M6, built on the stored hand history.

## Guiding principles

- **The poker brain is the asset; the UI is a swappable shell.** Engine/odds/bots/coach are pure
  TS with no UI or network deps.
- **Determinism for correctness, LLM only for narration.** Every verdict is math we own; the LLM
  (M7) just explains it and is always optional / offline-degradable.
- **Front-load the hard, high-value work.** Correctness-critical code ships and is tested before
  any pixels exist.
