/**
 * The Web Worker entry point for equity sims (ticket 0016).
 *
 * This is the **one** file in `packages/odds` allowed to reference worker globals. When
 * loaded as a dedicated Web Worker it wires up `self.onmessage` to run incoming
 * {@link EquityRequestMessage}s through the shared, pure {@link handleEquityMessage}
 * kernel and post the {@link EquityResponseMessage} back. Because it computes through that
 * same kernel as the Node inline fallback ({@link equityAsync}), the worker returns
 * results identical to the synchronous core.
 *
 * Two deliberate constraints keep the worker boundary at the edge:
 *
 * 1. **Import-safe in Node.** Importing this module must not crash where there is no
 *    worker scope (e.g. the headless test runner, or a bundler analysing the graph). So
 *    the handler is only wired up when a real worker `self` with `addEventListener` is
 *    feature-detected at runtime; otherwise the module is inert.
 * 2. **No worker-global types leak into the core.** The repo's TS config intentionally
 *    omits the `WebWorker` lib (the pure equity core must not depend on DOM/worker
 *    types), so rather than widen `lib` globally we declare *locally, in this file only*
 *    the minimal shape of the worker scope we actually use — a `postMessage` and an
 *    `addEventListener('message', ...)`. That keeps the typed surface tiny and contained.
 */

import { handleEquityMessage, type EquityRequestMessage } from './equityProtocol.js'

/**
 * The minimal slice of the dedicated-worker global scope this file uses. Declared locally
 * (not pulled from the `WebWorker` TS lib) so no worker-global types escape into the pure
 * equity core. `postMessage` sends a response; `addEventListener('message', ...)` receives
 * requests. We only read `event.data`, so that is all we type.
 */
interface MinimalWorkerScope {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

/**
 * Feature-detect a dedicated-worker scope without importing any DOM/Node module. In a Web
 * Worker the global `self` is the worker scope and has `postMessage` + `addEventListener`;
 * in Node's main thread `self` is `undefined`, so this returns `null` and the module stays
 * inert (and import-safe). The `self` reference is typed locally — it never widens the
 * core's globals.
 */
function workerScope(): MinimalWorkerScope | null {
  const maybe = (globalThis as { self?: unknown }).self
  if (
    typeof maybe === 'object' &&
    maybe !== null &&
    typeof (maybe as MinimalWorkerScope).postMessage === 'function' &&
    typeof (maybe as MinimalWorkerScope).addEventListener === 'function'
  ) {
    return maybe as MinimalWorkerScope
  }
  return null
}

/**
 * Wire a worker scope to the equity kernel: on each incoming `message`, run the (assumed
 * well-formed) {@link EquityRequestMessage} through {@link handleEquityMessage} and post
 * the response back. Exported and parameterised so a test can drive it with a fake scope
 * without a real Worker, exercising the receive→compute→post path end to end.
 */
export function installEquityWorker(scope: MinimalWorkerScope): void {
  scope.addEventListener('message', (event) => {
    const message = event.data as EquityRequestMessage
    scope.postMessage(handleEquityMessage(message))
  })
}

// Only wire up the handler when actually running inside a worker. In Node (tests,
// bundler analysis) `workerScope()` is null and importing this module is a no-op.
const scope = workerScope()
if (scope) {
  installEquityWorker(scope)
}
