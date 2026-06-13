/**
 * The async equity client facade (ticket 0016).
 *
 * The UI just awaits a promise; *where* the computation runs is this file's concern:
 *
 * - **In a browser** (a `Worker` constructor exists), it offloads the request to the
 *   equity Web Worker ({@link file equityWorker.ts}) and resolves when the matching
 *   response arrives — so a multi-second exact enumeration never blocks the main thread.
 * - **In Node** (no `Worker`/DOM — the headless test runner, a CLI), it runs the same
 *   computation **inline** on the calling thread. Inline (rather than `worker_threads`) is
 *   the right call for M1: it needs no Node-only import at module top level, keeps the
 *   facade synchronous-at-heart, and — crucially — runs the *same* {@link runEquityRequest}
 *   kernel, so the Node path returns results identical to both the worker and the
 *   synchronous core.
 *
 * Environment detection is by **runtime feature-detection** (`typeof Worker`), never a
 * static import of a Node- or DOM-only module — so this file pulls no browser/worker types
 * into the pure equity core's public API. Its public types are exactly the plain protocol
 * records ({@link EquityComputation}, {@link EquityResult}); nothing DOM-shaped escapes.
 */

import {
  runEquityRequest,
  type EquityComputation,
  type EquityResult,
  type EquityRequestMessage,
  type EquityResponseMessage,
} from './equityProtocol.js'

/**
 * The minimal slice of the `Worker` interface this facade depends on, declared locally so
 * the DOM `Worker` lib type never enters the core. We post a request, listen for one
 * `message` and one `error`, and `terminate()` when done.
 */
interface MinimalWorker {
  postMessage(message: unknown): void
  terminate(): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'error', listener: (event: { message?: string }) => void): void
}

/**
 * How the facade obtains a {@link MinimalWorker}. Injected (rather than hard-coding a
 * `new Worker(new URL('./equityWorker.js', import.meta.url))`) because the exact spelling
 * of worker construction is bundler-specific (Vite, etc.); the consuming PWA app supplies
 * a factory wired to its build, while Node passes none and takes the inline path. Also lets
 * a test inject a fake worker to exercise the offload path deterministically.
 */
export type WorkerFactory = () => MinimalWorker

/**
 * Options for {@link equityAsync}.
 *
 * - `workerFactory` — when provided, the request is offloaded to a freshly-created worker
 *   from this factory. When omitted, the facade auto-detects: it stays inline (it does not
 *   guess how to construct the app's bundled worker). This keeps the default headless-safe.
 */
export interface EquityAsyncOptions {
  readonly workerFactory?: WorkerFactory
}

/** Monotonic id source so concurrent requests to one worker can be correlated by `id`. */
let nextId = 0

/**
 * Resolve an {@link EquityComputation} to per-seat {@link EquityResult}, off the main
 * thread when a worker is available and inline otherwise. Always returns a `Promise`:
 *
 * - With a `workerFactory` (browser/PWA, or a test fake): post an
 *   {@link EquityRequestMessage}, await the correlated {@link EquityResponseMessage},
 *   resolve on `ok: true`, reject (with a re-wrapped {@link Error}) on `ok: false` or a
 *   worker `error` event, then terminate the worker.
 * - Without one (Node/tests): run {@link runEquityRequest} inline, wrapped so a thrown
 *   validation error becomes a rejected promise — the same failure shape as the worker
 *   path, so callers handle errors identically regardless of environment.
 */
export function equityAsync(
  computation: EquityComputation,
  options: EquityAsyncOptions = {},
): Promise<EquityResult> {
  const factory = options.workerFactory
  if (factory) {
    return runOnWorker(computation, factory)
  }
  // Inline path: compute on this thread, but keep the async contract (and turn a thrown
  // validation error into a rejection rather than a synchronous throw).
  return new Promise<EquityResult>((resolve) => {
    resolve(runEquityRequest(computation))
  })
}

/** Offload one computation to a freshly-created worker and resolve its response. */
function runOnWorker(
  computation: EquityComputation,
  factory: WorkerFactory,
): Promise<EquityResult> {
  return new Promise<EquityResult>((resolve, reject) => {
    const worker = factory()
    const id = nextId++

    worker.addEventListener('message', (event) => {
      const response = event.data as EquityResponseMessage
      // Ignore any stray message that is not our correlated response.
      if (response.id !== id) return
      worker.terminate()
      if (response.ok) {
        resolve(response.result)
      } else {
        reject(new Error(response.error))
      }
    })

    worker.addEventListener('error', (event) => {
      worker.terminate()
      reject(new Error(event.message ?? 'equity worker error'))
    })

    const message: EquityRequestMessage = { id, computation }
    worker.postMessage(message)
  })
}
