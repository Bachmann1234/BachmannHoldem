---
id: 0016
title: Web Worker wrapper for equity sims
type: feature
status: todo
milestone: M1
priority: medium
created: 2026-06-13
---

## Context

Equity sims must never block the UI ([[0005-odds-equity-engine]]), so the PWA runs them in a Web
Worker. Provide the worker entry + an async client with the **same API usable from Node**, so the
engine stays testable headlessly and the UI just awaits a promise.

## Acceptance criteria

- [ ] Worker entry that receives an `EquityRequest` and posts back a `HandEquity[]` result.
- [ ] An async client facade (`equityAsync(req)`) that, in the browser, offloads to the Worker, and
      in Node runs the same computation inline (or via `worker_threads`) so tests pass without a DOM.
- [ ] Identical results between the sync core and the async/worker path (a test asserting parity).
- [ ] No DOM/browser-only types leak into the pure equity core — the worker boundary stays at the edge.

## Notes

Depends on [[0014-monte-carlo-equity]]. Keep the message protocol typed and minimal. This is the one
place in `packages/odds` allowed to reference worker globals; the equity core stays pure.
