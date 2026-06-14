/**
 * The live, interactive root of the PWA (ticket 0035) — the DOM analog of the Ink TUI's `Root`. It
 * holds the MVU model and drives a full **multiway session**: a touch table-setup screen, then
 * multiple hands at a 2–6-max table where stacks carry, the button rotates, busted players drop out,
 * and the session ends with a summary.
 *
 * MVU discipline (identical to `Root`): the model lives in `useReducer(reducer, …)` and the *only*
 * way it changes is a dispatched {@link Msg}; the reducer is pure and owns the whole session/setup
 * state machine. The two non-pure concerns it must not hold live here in the shell:
 *
 * - **The deck shuffle.** When a hand needs dealing (after setup, on play-again) the shell pulls a
 *   deck — an injected one (tests) from {@link deckQueueRef}, else a fresh {@link shuffledDeck} — and
 *   dispatches `{ type: 'start-hand', deck }`. The reducer builds the seating + button and deals.
 * - **The bots' decisions.** One {@link Opponent} is created per stable player id (in {@link botsRef},
 *   once the session starts) and reused every hand. A `useEffect` watches the live hand and, whenever
 *   it is a bot's turn, routes the acting engine seat → its stable player id (via `seatToId`) → that
 *   player's persistent bot, and dispatches the decision. Several bots act between the hero's turns.
 *
 * Input is phase-gated by *rendering*: `'setup'` → {@link SetupScreen}; `'playing'`/`'hand-over'` →
 * {@link Table} + {@link ActionBar} (active only on the hero's turn) + the between-hands CTA;
 * `'game-over'` → {@link Summary}. "New table" remounts a fresh session via a key bump.
 *
 * The bot "thinking" delay is injectable (`botDelayMs`, default {@link DEFAULT_BOT_DELAY_MS}) so
 * tests pass `0` and never depend on the wall clock.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
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
  createInitialModel,
  reducer,
  shuffledDeck,
  type BotKind,
  type InitialModelOptions,
  type Model,
  type SessionPlayer,
} from '@holdem/session'
import { ActionBar } from './components/ActionBar.js'
import { CoachDrawer } from './components/CoachDrawer.js'
import { CoachFab } from './components/CoachFab.js'
import { SetupScreen } from './components/SetupScreen.js'
import { Summary } from './components/Summary.js'
import { Table } from './components/Table.js'
import './styles.css'

/** Default bot "thinking" delay (ms) before a bot's action dispatches — for feel. Tests pass `0`. */
export const DEFAULT_BOT_DELAY_MS = 500

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

/** Props for {@link App}. */
export interface AppProps {
  /** Initial setup selection (seats, opponent presets) — tests pin these for determinism. */
  readonly initial?: InitialModelOptions
  /**
   * A queue of pre-shuffled decks, consumed one per hand. When exhausted (or absent) the shell
   * shuffles a fresh deck. Tests pass fixed decks so the whole session is reproducible.
   */
  readonly decks?: readonly (readonly Card[])[]
  /**
   * Factory for an opponent's bot instance, keyed off the stable {@link SessionPlayer}. Tests inject
   * fixed-seed bots; defaults to a `@holdem/bots` heuristic bot for the seat's chosen preset.
   */
  readonly makeBot?: (player: SessionPlayer) => Opponent
  /** Bot "thinking" delay (ms). Defaults to {@link DEFAULT_BOT_DELAY_MS}; tests pass `0`. */
  readonly botDelayMs?: number
}

/**
 * The interactive app. A `sessionKey` keys the inner {@link Session} so "New table" remounts a
 * brand-new session (fresh reducer state + fresh bot/deck refs) without any reset plumbing.
 */
export function App(props: AppProps): React.JSX.Element {
  const [sessionKey, setSessionKey] = useState(0)
  return (
    <div className="room" data-dir="playful" data-deck="four">
      <Session key={sessionKey} {...props} onNewTable={() => setSessionKey((k) => k + 1)} />
    </div>
  )
}

/** Resolve an engine seat to its session display label via `seatToId` → `players`. */
function seatLabelFor(model: Model, seat: number): string {
  const id = model.seatToId[seat]
  const player = id === undefined ? undefined : model.players.find((p) => p.id === id)
  return player?.label ?? `Seat ${seat}`
}

interface SessionProps extends AppProps {
  /** Start a brand-new session (the parent bumps the remount key). */
  readonly onNewTable: () => void
}

/** One session over the MVU loop — the part `Root` is the direct analog of. */
function Session({
  initial,
  decks,
  makeBot = defaultMakeBot,
  botDelayMs = DEFAULT_BOT_DELAY_MS,
  onNewTable,
}: SessionProps): React.JSX.Element {
  const [model, dispatch] = useReducer(reducer, initial, createInitialModel)

  // The coach drawer's open/closed state is pure UI — component-local, never in the reducer model.
  // Stable handlers so the drawer's focus-management effect only re-runs on an actual open/close.
  const [coachOpen, setCoachOpen] = useState(false)
  const openCoach = useCallback(() => setCoachOpen(true), [])
  const closeCoach = useCallback(() => setCoachOpen(false), [])

  // Close the drawer when a fresh hand is dealt: the reducer resets `coach` to `'none'` at
  // `start-hand`, so a left-open sheet would otherwise flip from the graded verdict to the empty
  // placeholder mid-view. Closing it keeps the review tied to the hand it graded.
  useEffect(() => {
    if (model.coach.kind === 'none') setCoachOpen(false)
  }, [model.coach])

  // The bot instances live in a ref (shell machinery the render never reads), keyed by stable player
  // id and created ONCE per session — each carries its own PRNG and is reused every hand.
  const botsRef = useRef<Map<number, Opponent>>(new Map())
  // A queue of injected decks (tests); we pop from the front, falling back to a fresh shuffle.
  const deckQueueRef = useRef<(readonly Card[])[]>(decks ? [...decks] : [])

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

  // --- Bot turns (one bot action per model state) ----------------------------------------------
  // The effect applies exactly one action when it is a bot's turn: route the acting engine seat →
  // its stable player id (via `seatToId`) → that player's persistent bot. Dispatching produces a new
  // `hand`, so the effect re-runs for the next actor — several bots act between the hero's decisions.
  // Cancel-safe under React 19 StrictMode (the `cancelled` flag + cleanup); the dispatch is delayed
  // by `botDelayMs` for "thinking" feel (tests pass 0).
  useEffect(() => {
    if (phase !== 'playing' || hand === null || handComplete || isHeroTurn) return
    const seat = hand.toAct
    if (seat === null) return
    const playerId = seatToId[seat]
    if (playerId === undefined) return
    const bot = botsRef.current.get(playerId)
    if (bot === undefined) return

    let cancelled = false
    const timer = setTimeout(() => {
      // `decide` may be sync or async (the Opponent seam); normalise with Promise.resolve.
      Promise.resolve(bot.decide(decisionContext(hand, seat))).then((action: Action) => {
        if (cancelled) return
        // Defensive: bots return legal actions by design, but never feed the engine an illegal move.
        const legal = legalActions(hand)
        if (!actionIsLegal(action, legal)) return
        dispatch({ type: 'apply-action', action })
      })
    }, botDelayMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [phase, hand, handComplete, isHeroTurn, seatToId, botDelayMs])

  const onAction = (action: Action): void => dispatch({ type: 'apply-action', action })

  // --- Render the current phase ----------------------------------------------------------------
  if (phase === 'setup') {
    return <SetupScreen setup={model.setup} dispatch={dispatch} onStart={beginHand} />
  }

  if (phase === 'game-over') {
    return <Summary players={players} handNumber={model.handNumber} onNewTable={onNewTable} />
  }

  // 'playing' / 'hand-over': the live table, the action bar, and the between-hands affordance. The
  // `Table` (0034) renders its own `.app` shell (topbar + felt); the `ActionBar` is its sibling
  // footer inside the same shell, so they share one flex column via the `.app-stack` wrapper (which
  // makes the nested `.app` flow inline rather than claim its own 100dvh).
  const legal: LegalActions | null = isHeroTurn && hand !== null ? legalActions(hand) : null
  return (
    <div className="app-stack">
      {hand !== null ? (
        <Table
          hand={hand}
          heroSeat={heroSeat}
          handNumber={model.handNumber}
          seatLabel={(seat) => seatLabelFor(model, seat)}
          overlay={<CoachFab coach={model.coach} onOpen={openCoach} />}
        />
      ) : null}
      {hand !== null ? (
        <ActionBar
          hand={hand}
          legal={legal}
          heroSeat={heroSeat}
          isHeroTurn={isHeroTurn}
          handOver={phase === 'hand-over'}
          onAction={onAction}
          onNext={beginHand}
          onQuit={() => dispatch({ type: 'quit' })}
        />
      ) : null}
      <CoachDrawer coach={model.coach} open={coachOpen} onClose={closeCoach} />
    </div>
  )
}

/**
 * Is `action` one of the moves `legal` permits right now? A last-ditch guard so the shell never
 * dispatches an action the engine would throw on (the hero's controls only offer legal moves; this
 * covers the defensive bot path). Mirrors the engine's `LegalActions` shape.
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
