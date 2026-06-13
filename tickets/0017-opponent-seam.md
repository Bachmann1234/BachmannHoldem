---
id: 0017
title: Opponent seam + bots package scaffold + reference opponents
type: feature
status: done
milestone: M2
priority: high
created: 2026-06-13
---

## Context

The first slice of the heuristic-opponents epic ([[0006-heuristic-opponents]]) and the most
important deliverable of the whole milestone: the **`Opponent` interface**. This is the stable seam
a smarter bot — ultimately the GTO solver ([[0012-gto-solver]]) — drops into later without the
caller (CLI now, PWA table in [[0008-pwa-app-shell]]) changing. Get this shape right and the bot
internals behind it can evolve freely.

Today the only "bot" is `alwaysCallBot` in `apps/cli` (it takes a bare `LegalActions` and returns
an `Action`). That is too thin to be the seam: a real bot needs to _see_ the spot (its own cards,
the board, the pot, the betting) to reason about it, but must **not** see the opponent's hole cards
— poker is imperfect-information. This ticket defines the view a bot is allowed to see and the
interface it implements, then proves the seam with a couple of trivial reference bots and a driver
that plays an `Opponent` against the engine's `HandState`.

## Acceptance criteria

- [x] New pure-TS package `packages/bots` (`@holdem/bots`), mirroring the engine/odds conventions:
      `package.json`/`tsconfig.json` shape (`main`/`types` → `src/index.ts`, `tsc -b`,
      `workspace:*` deps), `.js` import specifiers, co-located `*.test.ts`, heavy doc comments, and
      **no UI/DOM/Node/network deps**. Depends on `@holdem/engine` (and `@holdem/odds` as later
      tickets need it). Add it to `pnpm-workspace.yaml`'s coverage if needed, the root `tsconfig.json`
      references, and the vitest coverage `include` list so the package is gated like engine/odds.
- [x] A `DecisionContext` (name your call) — the **imperfect-information view** a bot decides from,
      derived from a `HandState` + the acting seat. It exposes the acting bot's own `holeCards`, the
      `board`, `legalActions(state)`, the pot, `currentBet`/amount-to-call, the bot's stack, blinds,
      street, seat counts/positions — **but never another player's hole cards**. Provide a builder
      (e.g. `decisionContext(state, seat)`) that constructs it from engine state.
- [x] An `Opponent` interface: a bot is something that, given a `DecisionContext`, returns a legal
      `Action`. Make the seam **async-friendly** so a future solver/worker-backed bot fits without a
      breaking change — recommended return type `Action | Promise<Action>` (or `Promise<Action>`);
      pick one, document why. Optionally a `name`/`describe()` for display.
- [x] At least two trivial reference `Opponent`s proving the seam end-to-end (e.g. an always-check/call
      bot ported from `alwaysCallBot`, and an always-fold or seeded-random bot). Every action they
      return must be legal per `legalActions`.
- [x] A small driver helper that runs an `Opponent` to pick the action for whoever is `toAct` and
      `applyAction`s it — enough to play a bot-vs-bot hand to completion in a test (proves the view + interface + engine compose).
- [x] Unit tests: context-builder hides opponent cards and reports the right call amount/legal set;
      reference bots only ever return legal actions; a full bot-vs-bot hand runs to `complete`.

## Notes

Depends on [[0003-game-state-machine]] (`HandState`, `legalActions`, `applyAction`) and
[[0005-odds-equity-engine]] for later tickets. **Do not** wire this into `apps/cli` or any UI in this
ticket — keep `packages/bots` pure; integration into the play experience is a later/M4 concern. The
perception layer ([[0018-bot-hand-reading]]), personality matrix ([[0019-bot-personality]]), and the
real heuristic policy ([[0020-heuristic-opponent]]) all build on the types defined here, so name them
with that in mind.

Hold the [LEARNING-APPROACH.md](../docs/LEARNING-APPROACH.md) balance: this seam serves both the
coach (a decision-point generator) and a genuinely fun play experience — don't design it as a
drill-only hook.
