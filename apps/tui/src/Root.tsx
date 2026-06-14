/**
 * The live, interactive root of the TUI (tickets 0027 / 0029): it holds the MVU model and drives a
 * full **multiway session** — a table-setup screen, then multiple hands at a default 6-max table
 * where stacks carry, the button rotates, busted players drop out, and the session ends with a
 * summary and a clean exit.
 *
 * MVU discipline: the model lives in `useReducer(reducer, …)` and the *only* way it changes is a
 * dispatched {@link Msg}. The reducer is pure — it owns the whole session/setup state machine — so
 * the two non-pure concerns it must not hold live here in the shell, the way a terminal play loop
 * keeps them out of the pure core:
 *
 * - **The deck shuffle.** The engine is deterministic and never shuffles. So when a hand needs to be
 *   dealt (after setup, and on play-again) the shell shuffles a fresh deck (Fisher–Yates with
 *   `Math.random`, via {@link shuffledDeck}) and dispatches `{ type: 'start-hand', deck }`; the
 *   reducer builds the compacted stacks + rotated button and calls `createHand`. Tests inject a
 *   queue of fixed `decks` for determinism.
 * - **The bots' decisions.** Each opponent carries a PRNG, so one {@link Opponent} instance is
 *   created per stable player id (in a `useRef`, once the session starts) and reused every hand. A
 *   `useEffect` watches the live hand and, whenever it is a bot's turn, routes the acting engine
 *   seat → its stable player (via `model.seatToId`) → that player's persistent bot, and dispatches
 *   the decision. Several bots act between the hero's turns, driven entirely off `hand.toAct`.
 *
 * Input is phase-gated: a setup `useInput` (active only in `'setup'`) edits the selection and starts
 * the first hand; the {@link ActionBar}'s `useInput` is active only on the hero's turn while playing;
 * a play-again / quit `useInput` is active in `'hand-over'`; and a quit key is live throughout. All
 * gating respects raw-mode support so a piped (non-TTY) run never tries to enter raw mode.
 *
 * Exit: `q` quits to the summary (or out of it); once `'game-over'` the app self-exits cleanly so the
 * process never hangs after the session.
 */

import { useEffect, useReducer, useRef, useState } from 'react'
import { Box, Text, useApp, useInput, useStdin } from 'ink'
import { isComplete, legalActions, type Action, type Card, type LegalActions } from '@holdem/engine'
import {
  decisionContext,
  heuristicOpponent,
  LOOSE_AGGRESSIVE,
  LOOSE_PASSIVE,
  TIGHT_AGGRESSIVE,
  TIGHT_PASSIVE,
  type Opponent,
  type Personality,
} from '@holdem/bots'
import {
  reducer,
  createInitialModel,
  shuffledDeck,
  MAX_SEATS,
  MIN_SEATS,
  type BotKind,
  type InitialModelOptions,
  type SessionPlayer,
} from '@holdem/session'
import { App } from './App.js'
import { ActionBar } from './components/ActionBar.js'
import { SetupScreen } from './components/SetupScreen.js'
import { Summary } from './components/Summary.js'

/** The `@holdem/bots` personality each setup preset maps to. */
const PERSONALITY_BY_KIND: Readonly<Record<BotKind, Personality>> = {
  tag: TIGHT_AGGRESSIVE,
  lag: LOOSE_AGGRESSIVE,
  rock: TIGHT_PASSIVE,
  station: LOOSE_PASSIVE,
}

/** Build the per-player bot instance for an opponent — its own randomised PRNG seed per session. */
function defaultMakeBot(player: SessionPlayer): Opponent {
  const personality = PERSONALITY_BY_KIND[player.botKind ?? 'tag']
  return heuristicOpponent(personality, Math.floor(Math.random() * 0x100000000))
}

/** Props for {@link Root}. */
export interface RootProps {
  /** Initial setup selection (seats, opponent presets) — tests pin these for determinism. */
  readonly initial?: InitialModelOptions
  /**
   * A queue of pre-shuffled decks, consumed one per hand. When exhausted (or absent) the shell
   * shuffles a fresh deck. Tests pass fixed decks so the whole session is reproducible.
   */
  readonly decks?: readonly (readonly Card[])[]
  /**
   * Factory for an opponent's bot instance, keyed off the stable {@link SessionPlayer}. Tests inject
   * fixed-seed bots here; defaults to a `@holdem/bots` heuristic bot for the seat's chosen preset.
   */
  readonly makeBot?: (player: SessionPlayer) => Opponent
}

/**
 * The interactive app: the full multiway session over the MVU loop. Renders the current phase and
 * supplies the shell's RNG (deck shuffle) and bot instances; every state transition is the reducer.
 */
export function Root({ initial, decks, makeBot = defaultMakeBot }: RootProps): React.JSX.Element {
  const { exit } = useApp()
  // Ink's `useInput` requires raw mode, which only a TTY stdin supports. When stdin is a pipe (a
  // scripted/non-interactive run), registering an active input handler throws — so we gate every
  // `useInput` on this flag. Coerce to a strict boolean: Ink derives it from `stdin.isTTY`, which is
  // `undefined` (not `false`) for a pipe, and only short-circuits on a literal `false`.
  const inputSupported = useStdin().isRawModeSupported === true
  const [model, dispatch] = useReducer(reducer, initial, createInitialModel)

  // The bot instances live in a ref (shell machinery the render never reads), keyed by stable player
  // id and created ONCE per session — each carries its own PRNG and is reused every hand.
  const botsRef = useRef<Map<number, Opponent>>(new Map())
  // A queue of injected decks (tests); we pop from the front, falling back to a fresh shuffle.
  const deckQueueRef = useRef<(readonly Card[])[]>(decks ? [...decks] : [])

  // The setup-screen cursor (which control row is focused) is transient view state — it never
  // affects poker logic, so it stays component-local rather than in the reducer.
  const [cursor, setCursor] = useState(0)

  const { phase, hand, heroSeat, seatToId, players } = model
  const handComplete = hand !== null && isComplete(hand)
  const isHeroTurn =
    phase === 'playing' && hand !== null && !handComplete && hand.toAct === heroSeat

  /** Pull the next deck (an injected one if queued, else a fresh shuffle) and start a hand. */
  const beginHand = (): void => {
    const deck = deckQueueRef.current.shift() ?? shuffledDeck()
    dispatch({ type: 'start-hand', deck })
  }

  // Lazily create a bot for each opponent player the first time we see the session players, and
  // keep the same instances for the whole session (the ref persists across renders).
  for (const player of players) {
    if (!player.isHero && !botsRef.current.has(player.id)) {
      botsRef.current.set(player.id, makeBot(player))
    }
  }

  // --- Setup-screen input (active only while choosing the table) -------------------------------
  // ↑/↓ move the cursor; ←/→ edit the focused row (seat count or an opponent's preset); Enter starts
  // the first hand; q quits. Plain-letter fallbacks (j/k, h/l) keep it drivable over a pipe in tests.
  useInput(
    (input, key) => {
      if (input === 'q') {
        dispatch({ type: 'quit' })
        return
      }
      if (key.return) {
        beginHand()
        return
      }
      const rows = model.setup.opponents.length + 1 // seat-count row + one per opponent
      if (key.upArrow || input === 'k') setCursor((c) => (c - 1 + rows) % rows)
      else if (key.downArrow || input === 'j') setCursor((c) => (c + 1) % rows)
      else if (key.leftArrow || input === 'h') editRow(-1)
      else if (key.rightArrow || input === 'l') editRow(1)
    },
    { isActive: inputSupported && phase === 'setup' },
  )

  /** Apply a left/right edit to the focused setup row: the seat count (row 0) or an opponent preset. */
  function editRow(direction: 1 | -1): void {
    if (cursor === 0) {
      const next = model.setup.seats + direction
      if (next >= MIN_SEATS && next <= MAX_SEATS) dispatch({ type: 'set-seats', seats: next })
      // Keep the cursor in range if shrinking the table dropped the focused opponent row.
      setCursor((c) => Math.min(c, next))
    } else {
      dispatch({ type: 'cycle-opponent', opponentIndex: cursor - 1, direction })
    }
  }

  // --- Quit (live throughout play / hand-over / game-over) -------------------------------------
  // Quitting mid-session goes to the summary; quitting the summary exits. A single handler, gated so
  // it never double-fires with the setup handler.
  useInput(
    (input) => {
      if (input !== 'q') return
      if (phase === 'game-over') exit()
      else dispatch({ type: 'quit' })
    },
    { isActive: inputSupported && phase !== 'setup' },
  )

  // --- Play-again (active only between hands) --------------------------------------------------
  useInput(
    (input) => {
      // y / Enter deals the next hand; n quits to the summary (q is handled above).
      if (input === 'y') beginHand()
      else if (input === 'n') dispatch({ type: 'quit' })
    },
    { isActive: inputSupported && phase === 'hand-over' },
  )

  // Enter during 'hand-over' also plays again (separate hook: `useInput` gives `key` here).
  useInput(
    (_input, key) => {
      if (key.return) beginHand()
    },
    { isActive: inputSupported && phase === 'hand-over' },
  )

  // --- Bot turns (one bot action per model state) ----------------------------------------------
  // The effect runs after each render and applies exactly one action when it is a bot's turn: route
  // the acting engine seat → its stable player id (via `seatToId`) → that player's persistent bot.
  // Dispatching produces a new `hand`, so the effect re-runs for the next actor — several bots act
  // between the hero's decisions, with no hero/bot alternation baked in.
  useEffect(() => {
    if (phase !== 'playing' || hand === null || handComplete || isHeroTurn) return
    const seat = hand.toAct
    if (seat === null) return
    const playerId = seatToId[seat]
    if (playerId === undefined) return
    const bot = botsRef.current.get(playerId)
    if (bot === undefined) return

    let cancelled = false
    // `decide` may be sync or async (the Opponent seam); normalise with Promise.resolve so a
    // synchronous heuristic still dispatches in a microtask, after this render has committed.
    Promise.resolve(bot.decide(decisionContext(hand, seat))).then((action: Action) => {
      if (cancelled) return
      // Defensive: bots return legal actions by design, but never feed the engine an illegal move.
      const legal = legalActions(hand)
      if (!actionIsLegal(action, legal)) return
      dispatch({ type: 'apply-action', action })
    })
    return () => {
      cancelled = true
    }
  }, [phase, hand, handComplete, isHeroTurn, seatToId])

  // Self-exit once the session is over so the process never hangs after the summary renders. The
  // summary frame has already committed by the time this effect runs, so the player sees it first.
  useEffect(() => {
    if (phase === 'game-over') exit()
  }, [phase, exit])

  const onAction = (action: Action): void => dispatch({ type: 'apply-action', action })

  // --- Render the current phase ----------------------------------------------------------------
  if (phase === 'setup') {
    return <SetupScreen setup={model.setup} cursor={cursor} />
  }

  if (phase === 'game-over') {
    return <Summary players={players} handNumber={model.handNumber} />
  }

  // 'playing' / 'hand-over': the live table, the action bar (hero's turn), and the between-hands
  // affordance.
  return (
    <Box flexDirection="column">
      <App model={model} dispatch={dispatch} />
      <Box marginTop={1}>
        <ActionBar
          legal={isHeroTurn && hand !== null ? legalActions(hand) : null}
          isHeroTurn={isHeroTurn}
          inputSupported={inputSupported}
          onAction={onAction}
        />
      </Box>
      {phase === 'hand-over' ? (
        <Box marginTop={1}>
          <Text>Play another hand? (Y/n) </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    </Box>
  )
}

/**
 * Is `action` one of the moves `legal` permits right now? A last-ditch guard so the shell never
 * dispatches an action the engine would throw on (the hero's path already validates via
 * `parseAction`; this covers the defensive bot path). Mirrors the engine's `LegalActions` shape.
 */
function actionIsLegal(action: Action, legal: LegalActions): boolean {
  switch (action.type) {
    case 'fold':
      return legal.fold
    case 'check':
      return legal.check
    case 'call':
      return legal.call !== null
    case 'bet':
      return legal.bet !== null && action.amount >= legal.bet.min && action.amount <= legal.bet.max
    case 'raise':
      return (
        legal.raise !== null && action.amount >= legal.raise.min && action.amount <= legal.raise.max
      )
  }
}
