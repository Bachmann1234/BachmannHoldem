/**
 * The typed message protocol + shared compute core for off-thread equity (ticket 0016).
 *
 * Equity sims must never block the UI, so the PWA runs them in a Web Worker. The worker
 * boundary is a {@link postMessage} channel, which serialises with the structured-clone
 * algorithm — so every message here is deliberately **plain, JSON-friendly data**:
 * branded {@link Card}s are just numbers, requests are the same plain records the
 * synchronous engine already takes ({@link EquityRequest}, {@link MonteCarloRequest}),
 * and results are arrays of {@link HandEquity} (plain `{win, tie, equity}` objects). No
 * functions, no class instances, nothing that cannot survive a structured clone.
 *
 * The heart of this file is {@link runEquityRequest}: a **pure, environment-agnostic**
 * dispatcher that maps a request message to its result by calling the existing
 * {@link exactEquity} / {@link monteCarloEquity} cores. It references no worker, DOM, or
 * Node globals. Because both the worker entry ({@link file equityWorker.ts}) and the Node
 * inline fallback ({@link equityAsync}) compute through this *same* function, the
 * async/worker path is guaranteed to return byte-identical results to the synchronous
 * core — which is exactly the parity the acceptance criteria pin.
 *
 * Keeping this core free of any worker/DOM types is the whole point: the worker boundary
 * stays at the edge ({@link file equityWorker.ts} is the only file that touches `self`),
 * and the pure equity engine never grows a browser dependency.
 */

import { exactEquity, type EquityRequest, type HandEquity } from './equity.js'
import { monteCarloEquity, type MonteCarloRequest } from './monteCarlo.js'

/**
 * Which equity computation a request asks for. A discriminated union on `kind` so the
 * dispatcher (and TypeScript) can narrow to the exact params each computation needs:
 *
 * - `'exact'` — enumerate every board completion ({@link exactEquity}); params are an
 *   {@link EquityRequest} (fully-known hands + partial board).
 * - `'monteCarlo'` — sample showdowns ({@link monteCarloEquity}); params are a
 *   {@link MonteCarloRequest} (seats may be ranges, plus iterations + seed).
 *
 * Both variants carry only plain, structured-clone-safe data, so an `EquityRequest`
 * round-trips through `postMessage` unchanged.
 */
export type EquityComputation =
  | { readonly kind: 'exact'; readonly request: EquityRequest }
  | { readonly kind: 'monteCarlo'; readonly request: MonteCarloRequest }

/**
 * The result of running an {@link EquityComputation}: per-seat {@link HandEquity}, in
 * seat order. The same shape the synchronous cores return, so callers swap freely between
 * the sync and async paths.
 */
export type EquityResult = HandEquity[]

/**
 * A message posted **to** the worker: a correlation `id` (so a client can match this
 * request to its eventual response when several are in flight) and the
 * {@link EquityComputation} to run. Plain data only — safe to structured-clone.
 */
export interface EquityRequestMessage {
  readonly id: number
  readonly computation: EquityComputation
}

/**
 * A message posted **back** from the worker, correlated by `id`. A discriminated union on
 * `ok`:
 *
 * - success — `ok: true` with the {@link EquityResult}.
 * - failure — `ok: false` with a plain `error` string. Errors are flattened to their
 *   message text because `Error` instances do not structured-clone faithfully across the
 *   worker boundary (the prototype/stack are lost); the client re-wraps the message in a
 *   fresh {@link Error} so callers still get a real rejection to `catch`.
 */
export type EquityResponseMessage =
  | { readonly id: number; readonly ok: true; readonly result: EquityResult }
  | { readonly id: number; readonly ok: false; readonly error: string }

/**
 * The shared compute core: run one {@link EquityComputation} synchronously and return its
 * {@link EquityResult}. Pure and environment-agnostic — it dispatches on `kind` to the
 * existing {@link exactEquity} / {@link monteCarloEquity} engines and touches no worker,
 * DOM, or Node global. Any malformed request throws exactly what those cores throw (e.g.
 * an illegal board size), which the worker/facade turns into a rejected promise.
 *
 * This is the single function both the worker entry and the Node inline fallback call, so
 * the two paths are guaranteed to produce identical results for identical input.
 */
export function runEquityRequest(computation: EquityComputation): EquityResult {
  switch (computation.kind) {
    case 'exact':
      return exactEquity(computation.request)
    case 'monteCarlo':
      return monteCarloEquity(computation.request)
  }
}

/**
 * Handle one {@link EquityRequestMessage} and produce its {@link EquityResponseMessage},
 * never throwing: a thrown error from {@link runEquityRequest} is caught and flattened to
 * an `{ ok: false, error }` response carrying the same `id`. This is the pure kernel of
 * the worker's `onmessage` handler — exported so tests can exercise the exact
 * request→response mapping without spinning up a real Worker.
 */
export function handleEquityMessage(message: EquityRequestMessage): EquityResponseMessage {
  try {
    return { id: message.id, ok: true, result: runEquityRequest(message.computation) }
  } catch (err) {
    return {
      id: message.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
