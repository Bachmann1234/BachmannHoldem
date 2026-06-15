# Bachmann Hold'em

A personal Texas Hold'em **training** app — play against computer opponents and get
coaching on odds and betting strategy, with the goal of actually getting better at the game.

## Stack

- **TypeScript**, client-only — no backend. Two frontends share the pure poker packages: an
  **Ink (React-for-the-terminal) TUI** (`pnpm play`) and the installable **React PWA** (`pnpm
play:pwa`) — play vs bots with an on-demand coach. The PWA also has a **Learn the fundamentals**
  primer (a short, retrieval-checked concept course graded by the same coach math). Both run offline.
- **React** for both shells, **Vite** + `vite-plugin-pwa` for the PWA build + service worker.
- **pnpm** workspace monorepo, **Vitest** for tests.
- Equity simulations run in a **Web Worker** to keep the UI smooth.
- Deployed as static files to free static hosting (**Cloudflare Pages** — see [Deploy](#deploy-pwa)).

## Architecture

The design principle is that the **poker brain is the asset and the UI is a swappable shell.**
Everything except the app is framework-agnostic pure TypeScript that tests on Node in
milliseconds (no browser needed).

```
packages/engine      cards, 7-card hand evaluator, game state machine        (pure TS)
packages/odds        equity simulation (Web Worker), pot odds, EV            (pure TS)
packages/bots        heuristic opponents (range + pot-odds driven)           (pure TS)
packages/coach       deterministic coaching verdicts (good / leak)           (pure TS)
packages/curriculum  lesson engine (spot → ask → grade → explain) + primer   (pure TS)
packages/format      action-input grammar + coach value formatters           (pure TS)
packages/session     shared MVU model + reducer (session state machine)      (pure TS)
apps/tui             Ink (React-for-the-terminal) play client — the play UI   (Node)
apps/cli             headless scriptable engine harness — deterministic smoke-test  (Node)
apps/pwa             React PWA — Android/web shell; Play + Learn the fundamentals
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
pnpm play:pwa      # run the React PWA locally (Vite dev server) — the installable web client
pnpm sim           # headless harness: play one scripted hand and print a deterministic transcript
```

`pnpm play` launches the full-screen Ink TUI (`apps/tui`) — the interactive play experience.
`pnpm sim` runs the slim non-interactive `apps/cli` harness: it plays hands against the bots from a
seed and scripted lines, printing either a plain, greppable transcript (table state, every action,
the coach verdict + a ground-truth check per hero decision, the result) or a machine-readable NDJSON
stream, then exiting. It is a deterministic smoke-test **and coach-measurement** driver — same args ⇒
identical output — not a play UI:

```bash
pnpm sim -- --seed=1 --seats=6 --hero=c,k,k,k
#   --seed=<int>            seeds the deck shuffle + the bots (default 1)
#   --seeds=<a-b|a,b,c>     batch: play many hands and print a sweep summary (overrides --seed)
#   --seats=<2..6>          hero (seat 0) plus N-1 bots (default 6)
#   --button=<seat>         dealer-button seat; moving it puts the hero in any position (default 0)
#   --hero=<list>           comma/space-separated actions; when exhausted the hero takes the
#                           cheapest legal continue, so a bare `pnpm sim` is a zero-config run
#   --villain=<seat>:<list> script one opponent's line (repeatable), e.g. --villain=1:r6 — the only
#                           way to make the hero face a preflop raise/3-bet
#   --json                  emit NDJSON (one hand record per line + a summary) instead of transcript
```

Every postflop hero decision is also checked against a **ground truth** — the hero's exact equity vs
the villains' _actual_ cards (the omniscient read the coach deliberately lacks). When the coach's
assumed-range advice diverges from it, the transcript prints a `⚠ Coach diverges from ground truth`
warning and the JSON marks the decision `"misleads": true`, so a `--seeds` sweep quantifies exactly
where (and how often) the coach would steer a learner wrong. Example: count misleading spots —

```bash
pnpm sim -- --seeds=1-50 --seats=2 --json | grep -c '"misleads": *true'
```

`pnpm verify` is exactly what the pre-push hook and CI run, so a clean `verify` means a green push.

## Deploy (PWA)

The PWA (`apps/pwa`) deploys to **Cloudflare Pages** as static files over HTTPS, served at the root
of **https://bachmann-holdem.pages.dev** (so Vite `base` is `/` and the service worker controls the
whole origin). HTTPS is required for the service worker + the "Add to Home screen" install prompt.

Release is automated by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): on every push
to `main` it re-runs `pnpm verify` (only a green tree ships), builds `apps/pwa`, and publishes
`apps/pwa/dist` with `wrangler pages deploy`. `pnpm --filter @holdem/pwa build` reproduces the exact
artifact locally.

One-time setup (owner action):

1. Create a Cloudflare Pages project named **`bachmann-holdem`** (Direct Upload / Wrangler).
2. Add two repo secrets (Settings → Secrets and variables → Actions): **`CLOUDFLARE_API_TOKEN`** (a
   token with the _Cloudflare Pages: Edit_ permission) and **`CLOUDFLARE_ACCOUNT_ID`**.
3. Push to `main` (or run the workflow via _workflow_dispatch_). After the first deploy, confirm
   installability on Android from the live URL: open it in Chrome → "Add to Home screen", then load
   it once offline to verify the precached shell works.

## Roadmap

See [docs/ROADMAP.md](docs/ROADMAP.md) for the milestone plan.
