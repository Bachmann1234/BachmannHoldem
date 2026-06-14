# Bachmann Hold'em

A personal Texas Hold'em **training** app — play against computer opponents and get
coaching on odds and betting strategy, with the goal of actually getting better at the game.

## Stack

- **TypeScript PWA**, client-only — no backend. Runs offline after first load.
- **React** for the app shell, **Vite** + `vite-plugin-pwa` for build + service worker.
- **pnpm** workspace monorepo, **Vitest** for tests.
- Equity simulations run in a **Web Worker** to keep the UI smooth.
- Deployed as static files to free static hosting (GitHub Pages / Cloudflare Pages / etc.).

## Architecture

The design principle is that the **poker brain is the asset and the UI is a swappable shell.**
Everything except the app is framework-agnostic pure TypeScript that tests on Node in
milliseconds (no browser needed).

```
packages/engine   cards, 7-card hand evaluator, game state machine   (pure TS)
packages/odds     equity simulation (Web Worker), pot odds, EV        (pure TS)
packages/bots     heuristic opponents (range + pot-odds driven)       (pure TS)
packages/coach    deterministic coaching verdicts (good / leak)       (pure TS)   <- you are here
apps/tui          Ink (React-for-the-terminal) play client — the play UI   (Node)
apps/cli          headless scriptable engine harness — deterministic smoke-test  (Node)
apps/pwa          React PWA — the only Android/web-aware module
```

Why this layering: the hard, high-value work (rules correctness + equity math) is fully
independent of what the app looks like. We build and validate it as plain TS packages with a
CLI/test loop _before_ any UI exists. An LLM coaching layer is optional late polish that only
**narrates** the deterministic numbers — it never does the math.

## Development

```bash
pnpm install
pnpm verify        # the gate: format check + lint + typecheck + tests (run before pushing)
pnpm test          # run all package tests
pnpm test:watch    # watch mode
pnpm typecheck     # tsc project references build
pnpm lint          # eslint
pnpm format        # prettier --write
pnpm play          # launch the Ink TUI: play a table vs. the bots, with a live coach panel
pnpm sim           # headless harness: play one scripted hand and print a deterministic transcript
```

`pnpm play` launches the full-screen Ink TUI (`apps/tui`) — the interactive play experience.
`pnpm sim` runs the slim non-interactive `apps/cli` harness: it plays a single hand against the
bots from a seed and a scripted list of hero actions, printing a plain, greppable transcript (table
state, every action, the coach verdict per hero decision, the result) and then exiting. It is a
deterministic smoke-test driver — same args ⇒ identical transcript — not a play UI:

```bash
pnpm sim -- --seed=1 --seats=6 --hero=c,k,k,k
#   --seed=<int>    seeds the deck shuffle + the bots (default 1)
#   --seats=<2..6>  hero (seat 0) plus N-1 bots (default 6)
#   --hero=<list>   comma/space-separated actions in the input grammar; when exhausted the hero
#                   takes the cheapest legal continue, so a bare `pnpm sim` is a zero-config run
```

`pnpm verify` is exactly what the pre-push hook and CI run, so a clean `verify` means a green push.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the milestone plan.
