/**
 * `pnpm play` — a thin terminal harness to play heads-up hands against a trivial
 * "always-call" bot (ticket 0004). It drives the real {@link createHand} engine with no
 * UI, so it doubles as the fast feedback loop for the bots and coach built on top later.
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
  type Card,
  type HandState,
} from '@holdem/engine'
import { alwaysCallBot, parseAction, renderState, renderResult, renderLegal } from './table.js'

const HERO = 0
const BOT = 1
const SMALL_BLIND = 1
const BIG_BLIND = 2
const STARTING_STACK = 200

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
 * Prompt the hero until they enter a legal action. Returns `null` if input ends (the
 * caller treats that as quitting).
 */
async function askHero(state: HandState): Promise<HandState | null> {
  const legal = legalActions(state)
  for (;;) {
    const line = await prompt(`\n${renderLegal(legal)}\n> `)
    if (line === null) return null
    const parsed = parseAction(line, legal)
    if (parsed.ok) return applyAction(state, parsed.action)
    console.log(parsed.error)
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
      const next = await askHero(state)
      if (next === null) return null
      state = next
    } else {
      const action = alwaysCallBot(legalActions(state))
      console.log(`\nBot ${action.type}s.`)
      state = applyAction(state, action)
    }
  }

  console.log(renderState(state, HERO))
  console.log(renderResult(state, HERO))
  return [state.players[HERO]!.stack, state.players[BOT]!.stack]
}

async function main(): Promise<void> {
  console.log("Bachmann Hold'em — terminal harness. You vs. an always-call bot.")
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
