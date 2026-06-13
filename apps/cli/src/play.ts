/**
 * `pnpm play` — a thin terminal harness to play heads-up hands against the M2 heuristic
 * bot (ticket 0004, wired to `@holdem/bots`). It drives the real {@link createHand} engine
 * with no UI, so it doubles as the fast feedback loop for the bots and coach.
 *
 * You are the hero (seat 0); the bot is seat 1. Stacks carry between hands and the button
 * alternates; the session ends when you quit or someone busts. The engine never shuffles
 * (it is deterministic), so the shuffle lives here.
 */

import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
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
import {
  decisionContext,
  heuristicOpponent,
  TIGHT_AGGRESSIVE,
  type DecisionContext,
} from '@holdem/bots'
import { coachDecision, classifyStartingHand } from '@holdem/coach'
import {
  parseAction,
  renderState,
  renderResult,
  renderLegal,
  renderCoachFeedback,
} from './table.js'

const HERO = 0
const BOT = 1
const SMALL_BLIND = 1
const BIG_BLIND = 2
const STARTING_STACK = 200

// One tight-aggressive opponent for the whole session. Its PRNG carries across hands, so
// the aggression mix stays varied rather than replaying an identical line every hand; the
// seed is randomised per session so two sittings differ. (Determinism lives in the tests,
// not the play harness — the deck is already shuffled with Math.random here.)
const bot = heuristicOpponent(TIGHT_AGGRESSIVE, Math.floor(Math.random() * 0x100000000))

/** Fisher–Yates shuffle of a fresh deck (Math.random is fine for a play harness). */
function shuffledDeck(): Card[] {
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/**
 * A backpressure-free line reader: it buffers every `line` event so no input is ever
 * dropped between prompts (readline's bare `question` loses lines that arrive while no
 * listener is attached — which corrupts pasted or typed-ahead input). `next()` resolves
 * with the next line, or `null` once the stream is closed.
 */
class LineReader {
  private readonly rl = createInterface({ input: stdin })
  private readonly buffer: string[] = []
  private readonly waiters: Array<(line: string | null) => void> = []
  private closed = false

  constructor() {
    this.rl.on('line', (line) => {
      const waiter = this.waiters.shift()
      if (waiter) waiter(line)
      else this.buffer.push(line)
    })
    this.rl.on('close', () => {
      this.closed = true
      for (const waiter of this.waiters.splice(0)) waiter(null)
    })
  }

  next(): Promise<string | null> {
    if (this.buffer.length > 0) return Promise.resolve(this.buffer.shift()!)
    if (this.closed) return Promise.resolve(null)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  close(): void {
    this.rl.close()
  }
}

const reader = new LineReader()

/** Print a prompt and read one line, or `null` at end of input. */
async function prompt(text: string): Promise<string | null> {
  stdout.write(text)
  return reader.next()
}

/**
 * Prompt the hero until they enter a legal action. Returns the chosen {@link Action} (not
 * the next state) so the caller can both coach the decision and apply it; `null` if input
 * ends (the caller treats that as quitting).
 */
async function askHero(state: HandState): Promise<Action | null> {
  const legal = legalActions(state)
  for (;;) {
    const line = await prompt(`\n${renderLegal(legal)}\n> `)
    if (line === null) return null
    const parsed = parseAction(line, legal)
    if (parsed.ok) return parsed.action
    console.log(parsed.error)
  }
}

/**
 * Coach the hero's decision and print the verdict. Builds nothing of its own beyond reading
 * the spot: the `ctx` was captured while it was still the hero's turn (so `decisionContext`
 * accepted it), and the verdict math lives entirely in `@holdem/coach`. Preflop we also hand
 * the coach the starting-hand chart classification.
 *
 * Coaching is strictly *advisory*, so it must never break the game: any throw from the coach
 * (a malformed spot the verdict math rejects) is caught and degraded to a one-line notice
 * rather than crashing the hand mid-loop. The play continues either way.
 */
function coachHero(ctx: DecisionContext, action: Action): void {
  try {
    const verdict = coachDecision(ctx, action)
    const preflop = ctx.street === 'preflop' ? classifyStartingHand(ctx.holeCards) : undefined
    console.log(renderCoachFeedback(verdict, preflop))
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.log(`\n(Coaching unavailable for this spot — ${reason})`)
  }
}

/**
 * Play one hand to completion. Returns the post-hand stacks `[hero, bot]`, or `null` if
 * input ended mid-hand.
 */
async function playHand(
  stacks: [number, number],
  buttonIndex: number,
): Promise<[number, number] | null> {
  let state = createHand({
    stacks,
    buttonIndex,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck: shuffledDeck(),
  })

  while (!isComplete(state)) {
    console.log(renderState(state, HERO))
    if (state.toAct === HERO) {
      // Capture the coach's view of the spot while it is still the hero's turn —
      // `decisionContext` throws once the action is applied and the turn moves on.
      const ctx = decisionContext(state, HERO)
      const action = await askHero(state)
      if (action === null) return null
      state = applyAction(state, action)
      coachHero(ctx, action)
    } else {
      const action = await Promise.resolve(bot.decide(decisionContext(state, BOT)))
      const detail = 'amount' in action ? ` ${action.amount}` : ''
      console.log(`\nBot ${action.type}s${detail}.`)
      state = applyAction(state, action)
    }
  }

  console.log(renderState(state, HERO))
  console.log(renderResult(state, HERO))
  return [state.players[HERO]!.stack, state.players[BOT]!.stack]
}

async function main(): Promise<void> {
  console.log(`Bachmann Hold'em — terminal harness. You vs. ${bot.name ?? 'a bot'}.`)
  console.log(`Blinds ${SMALL_BLIND}/${BIG_BLIND}, starting stacks ${STARTING_STACK}.\n`)

  let stacks: [number, number] = [STARTING_STACK, STARTING_STACK]
  let button = HERO

  while (stacks[HERO] > 0 && stacks[BOT] > 0) {
    const result = await playHand(stacks, button)
    if (result === null) break // input ended mid-hand
    stacks = result
    console.log(`\nStacks — You: ${stacks[HERO]}, Bot: ${stacks[BOT]}`)
    button = button === HERO ? BOT : HERO

    if (stacks[HERO] === 0 || stacks[BOT] === 0) break
    const again = await prompt('\nPlay another hand? (Y/n) ')
    if (again === null || again.trim().toLowerCase().startsWith('n')) break
  }

  if (stacks[HERO] === 0) console.log('\nYou busted. The bot wins.')
  else if (stacks[BOT] === 0) console.log('\nYou stacked the bot. Nice.')
  console.log('\nThanks for playing.')
  reader.close()
}

void main()
