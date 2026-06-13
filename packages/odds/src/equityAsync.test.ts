import { describe, expect, it } from 'vitest'
import { exactEquity, parseEquityRequest, type EquityRequest } from './equity.js'
import { monteCarloEquity, fixedSeat, type MonteCarloRequest } from './monteCarlo.js'
import { parseCards } from '@holdem/engine'
import {
  runEquityRequest,
  handleEquityMessage,
  type EquityComputation,
  type EquityRequestMessage,
} from './equityProtocol.js'
import { equityAsync, type WorkerFactory } from './equityAsync.js'
import { installEquityWorker } from './equityWorker.js'

/** A fixed seat from a glued two-card string, e.g. "AhKh". */
function known(cards: string): ReturnType<typeof fixedSeat> {
  const [a, b] = parseCards(`${cards.slice(0, 2)} ${cards.slice(2, 4)}`)
  return fixedSeat([a!, b!])
}

// A small exact spot (flop, fast to enumerate) and a seeded Monte Carlo spot, reused
// across the parity assertions. Neither is the heavyweight preflop enumeration, so the
// suite stays quick.
const exactComputation: EquityComputation = {
  kind: 'exact',
  request: parseEquityRequest(['AhKh', 'QsQd'], '2h 7h 9c'),
}
const monteCarloComputation: EquityComputation = {
  kind: 'monteCarlo',
  request: {
    seats: [known('AhKh'), known('QsQd')],
    board: parseCards('2h 7h 9c'),
    iterations: 5_000,
    seed: 4242,
  } satisfies MonteCarloRequest,
}

describe('runEquityRequest — shared compute core', () => {
  it('dispatches an exact request to exactEquity (identical output)', () => {
    expect(runEquityRequest(exactComputation)).toEqual(
      exactEquity(exactComputation.request as EquityRequest),
    )
  })

  it('dispatches a monteCarlo request to monteCarloEquity (identical, seeded output)', () => {
    expect(runEquityRequest(monteCarloComputation)).toEqual(
      monteCarloEquity(monteCarloComputation.request as MonteCarloRequest),
    )
  })
})

describe('equityAsync — inline (Node) path parity', () => {
  it('returns a Promise', () => {
    const p = equityAsync(exactComputation)
    expect(p).toBeInstanceOf(Promise)
    return p
  })

  it('resolves to exactly what the synchronous exact core returns', async () => {
    const viaAsync = await equityAsync(exactComputation)
    expect(viaAsync).toEqual(exactEquity(exactComputation.request as EquityRequest))
    expect(viaAsync).toEqual(runEquityRequest(exactComputation))
  })

  it('resolves to exactly what the synchronous seeded Monte Carlo core returns', async () => {
    const viaAsync = await equityAsync(monteCarloComputation)
    expect(viaAsync).toEqual(monteCarloEquity(monteCarloComputation.request as MonteCarloRequest))
  })

  it('rejects cleanly when a request is invalid (illegal board size)', async () => {
    const bad: EquityComputation = {
      kind: 'exact',
      request: {
        hands: parseEquityRequest(['AhKh', 'QsQd']).hands,
        board: parseCards('2c 3d'), // 2 cards is not a legal street
      },
    }
    await expect(equityAsync(bad)).rejects.toThrow(/board must have/)
  })
})

describe('handleEquityMessage — pure worker kernel', () => {
  it('maps a request message to an ok response carrying the same id and result', () => {
    const message: EquityRequestMessage = { id: 7, computation: exactComputation }
    const response = handleEquityMessage(message)
    expect(response.id).toBe(7)
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.result).toEqual(runEquityRequest(exactComputation))
    }
  })

  it('flattens a thrown error into a failure response (never throws)', () => {
    const bad: EquityRequestMessage = {
      id: 9,
      computation: {
        kind: 'exact',
        request: { hands: parseEquityRequest(['AhKh', 'QsQd']).hands, board: parseCards('2c 3d') },
      },
    }
    const response = handleEquityMessage(bad)
    expect(response.id).toBe(9)
    expect(response.ok).toBe(false)
    if (!response.ok) {
      expect(response.error).toMatch(/board must have/)
    }
  })
})

/**
 * A synchronous fake of the minimal Worker interface, wired straight to the worker entry's
 * {@link installEquityWorker}. Posting a request synchronously runs the real kernel and
 * delivers the response to registered listeners — letting us exercise the offload code
 * path (`equityAsync` with a `workerFactory`) without a real browser Worker.
 */
function makeFakeWorker(install: (scope: Parameters<typeof installEquityWorker>[0]) => void) {
  const messageListeners: ((event: { data: unknown }) => void)[] = []
  const errorListeners: ((event: { message?: string }) => void)[] = []
  let terminated = false

  // The "worker side" scope the entry installs its handler onto: its postMessage delivers
  // back to the client's message listeners.
  const workerSide = {
    postMessage(message: unknown): void {
      for (const l of messageListeners) l({ data: message })
    },
    addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
      workerHandlers.push(listener)
    },
  }
  const workerHandlers: ((event: { data: unknown }) => void)[] = []
  install(workerSide)

  // The "client side" worker handle equityAsync talks to.
  const worker = {
    postMessage(message: unknown): void {
      // Deliver the request to the worker-side handler(s).
      for (const h of workerHandlers) h({ data: message })
    },
    terminate(): void {
      terminated = true
    },
    addEventListener(type: 'message' | 'error', listener: unknown): void {
      if (type === 'message') messageListeners.push(listener as (event: { data: unknown }) => void)
      else errorListeners.push(listener as (event: { message?: string }) => void)
    },
    get terminated() {
      return terminated
    },
  }
  return worker
}

describe('equityAsync — worker offload path (fake worker)', () => {
  it('offloads through the real worker entry and resolves identically to the sync core', async () => {
    const factory: WorkerFactory = () => makeFakeWorker(installEquityWorker)
    const viaWorker = await equityAsync(exactComputation, { workerFactory: factory })
    expect(viaWorker).toEqual(runEquityRequest(exactComputation))
  })

  it('propagates a worker-side error as a rejection', async () => {
    const bad: EquityComputation = {
      kind: 'exact',
      request: { hands: parseEquityRequest(['AhKh', 'QsQd']).hands, board: parseCards('2c 3d') },
    }
    const factory: WorkerFactory = () => makeFakeWorker(installEquityWorker)
    await expect(equityAsync(bad, { workerFactory: factory })).rejects.toThrow(/board must have/)
  })
})
