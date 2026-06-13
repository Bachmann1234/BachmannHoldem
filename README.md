# Bachmann Hold'em

A personal Texas Hold'em **training** app — play against computer opponents and get
coaching on odds and betting strategy, with the goal of actually getting better at the game.

## Stack

- **TypeScript PWA**, client-only — no backend. Runs offline after first load.
- **SvelteKit** for the app shell, **Vite** + `vite-plugin-pwa` for build + service worker.
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
packages/bots     heuristic opponents (range + pot-odds driven)       (pure TS)   <- you are here
packages/coach    deterministic coaching verdicts (good / leak)       (pure TS)
apps/cli          terminal hand runner — the engine's feedback loop   (Node)
apps/pwa          SvelteKit PWA — the only Android/web-aware module
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
pnpm play          # play a hand in the terminal vs. the heuristic bot
```

`pnpm verify` is exactly what the pre-push hook and CI run, so a clean `verify` means a green push.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the milestone plan.
