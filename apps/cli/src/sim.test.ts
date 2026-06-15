/**
 * Integration test for the `--spot` re-grade flag: a captured-spot blob (a `serializeSpot` payload)
 * run through `pnpm sim --spot='<json>'` reproduces the coach block for that exact spot. We drive the
 * real harness end-to-end (parseArgs → main → regradeSpot) via `tsx`, since `main` is not exported —
 * the point is that the wired CLI re-grades a pasted blob, not that an internal function does.
 *
 * The coach itself is unit-tested in `@holdem/coach` (including the serialize→parse→re-grade
 * round-trip); here we only assert the flag is wired: a valid blob prints the `── Coach ──` block,
 * and a malformed one prints a single clear error line rather than crashing.
 */

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import { parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import { serializeSpot, coachDecision } from '@holdem/coach'

const run = promisify(execFile)
const SIM = fileURLToPath(new URL('./sim.ts', import.meta.url))

/** Run `tsx sim.ts <args>` and return stdout. */
async function sim(args: string[]): Promise<string> {
  const { stdout } = await run('npx', ['tsx', SIM, ...args], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
  })
  return stdout
}

/** A controlled postflop spot: AhKh on a flush board, facing a river bet of 10 into 30. */
function postflopSpot(): { ctx: DecisionContext; action: Action } {
  const [a, b] = parseCards('Ah Kh')
  const ctx: DecisionContext = {
    seat: 0,
    holeCards: [a!, b!] as [Card, Card],
    board: parseCards('Qh Jh 2c 5d 9s'),
    street: 'river',
    legalActions: { fold: true, check: false, call: { amount: 10 }, bet: null, raise: null },
    pot: 30,
    currentBet: 10,
    toCall: 10,
    stack: 190,
    committed: 0,
    smallBlind: 1,
    bigBlind: 2,
    buttonIndex: 0,
    isButton: true,
    numPlayers: 2,
    numActive: 2,
    opponents: [
      { seat: 1, stack: 180, committed: 10, totalCommitted: 20, status: 'active', isButton: false },
    ],
  }
  return { ctx, action: { type: 'call' } }
}

describe('pnpm sim --spot', () => {
  it('re-grades a captured spot blob and prints the coach block', async () => {
    const { ctx, action } = postflopSpot()
    const blob = serializeSpot(ctx, action, coachDecision(ctx, action))
    const out = await sim([`--spot=${blob}`])
    expect(out).toContain('Re-grading captured spot')
    expect(out).toContain('── Coach')
    // The trace line the spot carried is reproduced (a barreled river read).
    expect(out).toContain('Read:')
  }, 60_000)

  it('prints a single clear error line on a malformed blob (does not crash)', async () => {
    const out = await sim(['--spot=not json'])
    expect(out).toContain('Could not re-grade --spot')
  }, 60_000)
})
