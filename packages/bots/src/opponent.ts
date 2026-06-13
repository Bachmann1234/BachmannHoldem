/**
 * The `Opponent` seam and trivial reference bots (ticket 0017).
 *
 * An {@link Opponent} is the stable interface a bot implements: given the
 * imperfect-information {@link DecisionContext} for the seat on turn, it returns a legal
 * {@link Action}. This is the seam a smarter bot — ultimately the GTO solver
 * ([[0012-gto-solver]]) — drops into later without the caller changing; get the shape
 * right here and the bot internals behind it can evolve freely.
 *
 * **Async-friendly by design.** `decide` returns `Action | Promise<Action>`, not a bare
 * `Action`. The reference bots here are synchronous and the trivial cases stay ergonomic
 * (a caller can just `await` the result either way), but the union lets a future bot do
 * asynchronous work — a Web Worker solve, a WASM equity call, a network policy lookup —
 * *without a breaking change* to every call site. We chose the union over a flat
 * `Promise<Action>` so today's synchronous bots and tests need no `async`/`await`
 * ceremony, and over a bare `Action` so tomorrow's solver fits the same type. The driver
 * ({@link applyOpponentAction}) wraps every `decide` in `Promise.resolve`, so both arms
 * are handled uniformly.
 *
 * Everything here is pure: no I/O, no Node/DOM, no global randomness (the seeded bot
 * carries its own PRNG state).
 */

import type { Action } from '@holdem/engine'

import type { DecisionContext } from './context.js'

/**
 * A bot: something that, shown the {@link DecisionContext} for the seat on turn, returns
 * a **legal** action for that seat.
 *
 * Implementations must return an action permitted by `ctx.legalActions`; the driver and
 * the engine both assume this and the engine throws on an illegal action.
 */
export interface Opponent {
  /**
   * A short label for display / debugging (e.g. in the coach or a table UI). Optional so
   * the simplest bots need not name themselves.
   */
  readonly name?: string
  /**
   * Choose an action for the seat on turn. May return synchronously or as a `Promise`
   * (see the module note on the async seam).
   */
  decide(ctx: DecisionContext): Action | Promise<Action>
}

/**
 * The placeholder opponent ported from the CLI's `alwaysCallBot`: it never folds and
 * never raises — it checks when checking is free and otherwise calls. (`legalActions`
 * caps the call amount at the stack, so a call here is an all-in when the bot is short.)
 *
 * Useful as a passive baseline and as a "station" to test value betting against.
 */
export const callingStation: Opponent = {
  name: 'Calling Station',
  decide(ctx: DecisionContext): Action {
    const { legalActions: legal } = ctx
    if (legal.check) return { type: 'check' }
    if (legal.call) return { type: 'call' }
    // Unreachable when a call/check is offered, but stay total: fold is always available.
    return { type: 'fold' }
  },
}

/**
 * The maximally tight opponent: it folds whenever folding is legal, and otherwise checks.
 * (Folding is illegal only when checking is free — i.e. there is nothing to fold to — so
 * this bot checks down those spots rather than committing chips.)
 *
 * Useful as the opposite pole from {@link callingStation}: a bot that surrenders every
 * contested pot, handy for exercising fold-equity and uncontested-pot accounting.
 */
export const rock: Opponent = {
  name: 'Rock',
  decide(ctx: DecisionContext): Action {
    const { legalActions: legal } = ctx
    if (legal.fold) return { type: 'fold' }
    if (legal.check) return { type: 'check' }
    // Unreachable: at least one of fold/check is always legal for the seat on turn.
    if (legal.call) return { type: 'call' }
    return { type: 'fold' }
  },
}

/**
 * A tiny, well-known 32-bit PRNG (mulberry32): one multiply-xor-shift round per call,
 * returning a float in `[0, 1)`. Inlined here (rather than importing `@holdem/odds`) to
 * keep this package's dependency footprint to `@holdem/engine` only — the seeded bot is
 * the sole consumer and needs nothing more.
 *
 * Same seed ⇒ identical sequence, so a {@link randomBot} is fully reproducible in tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A seeded-random opponent that uniformly picks among its **currently legal** simple
 * actions — fold, check, call — choosing the *minimum* legal bet/raise when it lands on
 * an aggressive option. It carries its own {@link mulberry32} state, so two bots seeded
 * alike play identically and a single bot is deterministic across a run; it never touches
 * `Math.random`.
 *
 * This is a behaviour generator for testing the seam (it produces a mix of folds, calls,
 * and raises), not a competent strategy. It always returns a legal action: it only ever
 * picks from the options `ctx.legalActions` reports, and uses each range's legal `min`.
 */
export function randomBot(seed: number, name = 'Random Bot'): Opponent {
  const next = mulberry32(seed)
  return {
    name,
    decide(ctx: DecisionContext): Action {
      const legal = ctx.legalActions
      const choices: Action[] = []
      if (legal.fold) choices.push({ type: 'fold' })
      if (legal.check) choices.push({ type: 'check' })
      if (legal.call) choices.push({ type: 'call' })
      if (legal.bet) choices.push({ type: 'bet', amount: legal.bet.min })
      if (legal.raise) choices.push({ type: 'raise', amount: legal.raise.min })
      // `legalActions` always offers at least one action for the seat on turn.
      const index = Math.floor(next() * choices.length)
      return choices[index]!
    },
  }
}
