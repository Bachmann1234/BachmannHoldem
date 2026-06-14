/**
 * `pnpm sim` — the headless, scriptable engine harness (ticket 0030). With the Ink TUI now the
 * human play experience (`pnpm play`), this is the demoted `apps/cli`: a thin, **non-interactive**
 * driver that plays one hand against the bots from a seed + a scripted list of hero actions and
 * prints a plain, greppable transcript, then exits. No readline, no prompts — handy for manual
 * engine smoke-tests and for reproducing a specific line deterministically. The real correctness
 * gate stays the `vitest` suite that drives the pure packages directly; this is a convenience
 * driver, so all the poker/coach math lives in the pure packages and this file only wires + prints.
 *
 * Determinism is the whole point: same args ⇒ byte-identical transcript. The deck is shuffled with
 * the seeded {@link mulberry32} PRNG (the engine never shuffles), the bots are seeded from the same
 * seed (one derived seed per opponent seat), and the coach grading is itself deterministic.
 *
 * Usage:
 *
 *     pnpm --filter @holdem/cli sim -- --seed=1 --seats=6 --hero=c,k,k,k
 *
 * Flags (all optional):
 *   --seed=<int>    Seeds the deck shuffle and the bots. Default 1.
 *   --seats=<2..6>  Number of seats: the hero (seat 0) plus N-1 bot opponents. Default 6.
 *   --hero=<list>   Comma/space-separated hero actions in the shared input grammar (e.g.
 *                   `c,b50,k,a`), consumed one per hero turn. When the script runs out, the hero
 *                   defaults to the cheapest legal continue (check, else call, else fold) so the
 *                   hand always completes — making a bare `pnpm sim` a zero-config smoke test.
 */

import { stdout } from 'node:process'
import {
  createHand,
  legalActions,
  applyAction,
  isComplete,
  makeDeck,
  type Action,
  type Card,
  type HandState,
} from '@holdem/engine'
import { mulberry32 } from '@holdem/odds'
import { decisionContext, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { coachDecision, classifyStartingHand } from '@holdem/coach'
import { parseAction, renderState, renderResult, renderCoachFeedback } from './table.js'

const HERO = 0
const SMALL_BLIND = 1
const BIG_BLIND = 2
const STARTING_STACK = 200
const MIN_SEATS = 2
const MAX_SEATS = 6
const DEFAULT_SEATS = 6
const DEFAULT_SEED = 1

/** The parsed command line for one harness run. */
interface Args {
  readonly seed: number
  readonly seats: number
  /** The raw hero-action tokens, parsed against the live legal actions one per hero turn. */
  readonly heroScript: readonly string[]
}

/**
 * Parse `process.argv` (everything after the script name) into {@link Args}. Tiny and
 * dependency-free: `--seed=`, `--seats=`, `--hero=` in any order, all optional. An out-of-range
 * `--seats` is clamped to `2..6`; a missing flag takes its documented default.
 */
function parseArgs(argv: readonly string[]): Args {
  let seed = DEFAULT_SEED
  let seats = DEFAULT_SEATS
  let heroScript: string[] = []
  for (const arg of argv) {
    const seedMatch = /^--seed=(-?\d+)$/.exec(arg)
    const seatsMatch = /^--seats=(\d+)$/.exec(arg)
    const heroMatch = /^--hero=(.*)$/.exec(arg)
    if (seedMatch) seed = Number(seedMatch[1])
    else if (seatsMatch) seats = clamp(Number(seatsMatch[1]), MIN_SEATS, MAX_SEATS)
    else if (heroMatch) heroScript = heroMatch[1]!.split(/[,\s]+/).filter(Boolean)
  }
  return { seed, seats, heroScript }
}

/** Clamp `n` into the inclusive `[lo, hi]` range. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * A deterministic Fisher–Yates shuffle of a fresh deck driven by the seeded {@link mulberry32}
 * PRNG — never `Math.random`, so the same seed always yields the same deck (and therefore the same
 * transcript). The engine itself never shuffles, so the shuffle lives here.
 */
function shuffledDeck(seed: number): Card[] {
  const rng = mulberry32(seed)
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/** Print one line to stdout (the whole transcript is plain text, so callers can `grep` it). */
function emit(line: string): void {
  stdout.write(`${line}\n`)
}

/**
 * Coach the hero's decision and print the verdict. The `ctx` must be captured while it is still the
 * hero's turn (so `decisionContext` accepts it). Coaching is strictly *advisory*: any throw from the
 * coach (a malformed spot the verdict math rejects) is caught and degraded to a one-line notice
 * rather than crashing the run.
 */
function coachHero(state: HandState, action: Action): void {
  try {
    const ctx = decisionContext(state, HERO)
    const verdict = coachDecision(ctx, action)
    const preflop = ctx.street === 'preflop' ? classifyStartingHand(ctx.holeCards) : undefined
    emit(renderCoachFeedback(verdict, preflop))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    emit(`\n(Coaching unavailable for this spot — ${reason})`)
  }
}

/**
 * Pick the hero's action this turn: the next scripted token (parsed against the live legal
 * actions), or — when the script is exhausted or a token is illegal here — the cheapest legal
 * continue (check, else call, else fold), so the hand always completes. Returns the chosen action
 * and the rest of the script.
 */
function heroAction(
  state: HandState,
  script: readonly string[],
): { action: Action; rest: readonly string[] } {
  const legal = legalActions(state)
  const [token, ...rest] = script
  if (token !== undefined) {
    const parsed = parseAction(token, legal)
    if (parsed.ok) return { action: parsed.action, rest }
    // A scripted token that is illegal in this spot is reported, then we fall through to the
    // cheapest legal continue so the run never stalls.
    emit(`  (scripted "${token}" is not legal here — ${parsed.error} taking the default)`)
  }
  // The cheapest legal continue: check if free, else call, else fold.
  const fallback: Action = legal.check
    ? { type: 'check' }
    : legal.call
      ? { type: 'call' }
      : { type: 'fold' }
  return { action: fallback, rest }
}

/** A one-line description of an action for the transcript (`bets 50`, `calls`, `folds`). */
function describeAction(seat: number, action: Action): string {
  const who = seat === HERO ? 'You' : `Bot ${seat}`
  const detail = 'amount' in action ? ` ${action.amount}` : ''
  return `${who} ${action.type}s${detail}.`
}

/**
 * Play one hand to completion, printing the transcript as it goes: the table state each street, each
 * action taken (hero + bots), the coach verdict for each hero decision, and the final result. The
 * hero's scripted actions are consumed one per hero turn, falling back to the cheapest legal
 * continue once exhausted (see {@link heroAction}).
 */
async function playHand(
  seats: number,
  deck: Card[],
  bots: readonly Opponent[],
  heroScript: readonly string[],
): Promise<void> {
  let state = createHand({
    stacks: Array.from({ length: seats }, () => STARTING_STACK),
    buttonIndex: 0,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck,
  })

  let script = heroScript
  while (!isComplete(state)) {
    emit(renderState(state, HERO))
    // Not complete, so someone is to act — `toAct` is a real seat here (`isComplete` guards null).
    const seat = state.toAct!
    if (seat === HERO) {
      const { action, rest } = heroAction(state, script)
      script = rest
      emit(`\n${describeAction(HERO, action)}`)
      // Capture + grade the spot *before* applying — `decisionContext` throws once the turn moves on.
      coachHero(state, action)
      state = applyAction(state, action)
    } else {
      // The `Opponent` seam allows an async `decide`; the heuristic bot is synchronous, but await
      // keeps the harness correct for any bot.
      const action = await Promise.resolve(bots[seat]!.decide(decisionContext(state, seat)))
      emit(`\n${describeAction(seat, action)}`)
      state = applyAction(state, action)
    }
  }

  emit(renderState(state, HERO))
  emit(renderResult(state, HERO))
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  emit(`Bachmann Hold'em — headless harness.`)
  emit(
    `seed=${args.seed}  seats=${args.seats}  hero=[${args.heroScript.join(' ') || '(default-continue)'}]`,
  )
  emit(`Blinds ${SMALL_BLIND}/${BIG_BLIND}, starting stacks ${STARTING_STACK}.`)

  // One bot per seat, each seeded from a seat-derived seed so the table is reproducible yet the
  // seats do not all play an identical line. Seat 0 (the hero) never `decide`s, but seating a bot
  // there keeps the array index-aligned with `state.toAct`.
  const bots: Opponent[] = Array.from({ length: args.seats }, (_unused, seat) =>
    heuristicOpponent(TIGHT_AGGRESSIVE, args.seed + seat),
  )

  await playHand(args.seats, shuffledDeck(args.seed), bots, args.heroScript)
}

void main()
