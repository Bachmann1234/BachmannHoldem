/**
 * The live, interactive root of the TUI (ticket 0027): it holds the MVU model and drives a single
 * hand to completion — the hero acts through the {@link ActionBar}, the bots act on their turns, and
 * the app exits cleanly once the hand finishes (multi-hand sessions are ticket 0029).
 *
 * MVU discipline: the model lives in `useReducer(reducer, …)` and the *only* way the hand changes is
 * `dispatch({ type: 'apply-action', action })`. The two non-pure concerns the reducer must not hold
 * live here in the shell, exactly as `apps/cli/src/play.ts` keeps them:
 *
 * - **Bots carry a PRNG**, so a single {@link Opponent} instance is created once in a `useRef` and
 *   reused for every opponent seat (per-seat personalities are ticket 0029). A `useEffect` watches
 *   the model and, whenever it is *not* the hero's turn and the hand is not complete, asks the bot
 *   to `decide(decisionContext(hand, hand.toAct))` and dispatches the result. Because each dispatch
 *   produces a new `hand`, the effect re-runs and the *next* bot acts — so several bots act in turn
 *   between the hero's decisions, driven entirely off `hand.toAct` with no hero/bot alternation.
 * - **Keystroke parsing** lives in the pure `src/input.ts`, wired through the `ActionBar`.
 *
 * Exit: a `q` keystroke quits immediately, and the app self-exits once the hand completes (via
 * Ink's `useApp().exit()`), so the process never hangs after the result.
 */

import { useEffect, useReducer, useRef } from 'react'
import { Box, Text, useApp, useInput, useStdin } from 'ink'
import { isComplete, legalActions, type Action, type LegalActions } from '@holdem/engine'
import { decisionContext, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { reducer } from './reducer.js'
import { createInitialModel, type InitialModelOptions } from './model.js'
import { App } from './App.js'
import { ActionBar } from './components/ActionBar.js'

/** Props for {@link Root}. */
export interface RootProps {
  /** Initial model options (seats, deck, button) — tests pass a fixed deck for determinism. */
  readonly initial?: InitialModelOptions
  /** A pre-built opponent (tests inject a fixed-seed bot); defaults to a tight-aggressive bot. */
  readonly opponent?: Opponent
}

/**
 * Build the default session opponent: one tight-aggressive heuristic bot whose PRNG carries across
 * the hand. The seed is randomised per session (determinism that matters lives in tests, which pass
 * their own seeded `opponent`), mirroring `apps/cli/src/play.ts`.
 */
function defaultOpponent(): Opponent {
  return heuristicOpponent(TIGHT_AGGRESSIVE, Math.floor(Math.random() * 0x100000000))
}

/** The interactive app: a single playable hand over the MVU loop. */
export function Root({ initial, opponent }: RootProps): React.JSX.Element {
  const { exit } = useApp()
  // Ink's `useInput` requires raw mode, which only a TTY stdin supports. When stdin is a pipe (a
  // scripted/non-interactive run), registering an active input handler throws — so we gate every
  // `useInput` on this flag and degrade to a non-interactive watcher (the bots still play the hand
  // out and the app still exits). `ink-testing-library` reports raw mode as supported.
  // Coerce to a strict boolean: at runtime Ink derives this from `stdin.isTTY`, which is `undefined`
  // (not `false`) for a pipe — and Ink's `useInput` only short-circuits on a literal `false`, so an
  // `undefined` here would still try (and fail) to enter raw mode.
  const inputSupported = useStdin().isRawModeSupported === true
  const [model, dispatch] = useReducer(reducer, initial, createInitialModel)

  // The bot instance is created once (it carries a PRNG) and reused for every opponent seat. A ref,
  // not state, because it is shell machinery the render never reads — only the effect calls it.
  const botRef = useRef<Opponent>(opponent ?? defaultOpponent())

  const { hand, heroSeat } = model
  const handComplete = isComplete(hand)
  const isHeroTurn = !handComplete && hand.toAct === heroSeat

  // Quit key, active while raw mode is available and the hand is still live so the hero can bail at
  // any point. It goes INACTIVE the moment the hand completes: that lets Ink release raw mode and
  // unreference stdin, so the auto-exit below actually drains the event loop instead of the lingering
  // raw-mode listener keeping the process alive on a real TTY.
  useInput(
    (input) => {
      if (input === 'q') exit()
    },
    { isActive: inputSupported && !handComplete },
  )

  // Drive the bot turns. One bot action per model state: the effect runs after each render, and it
  // applies exactly one action when (and only when) it is a bot's turn. Dispatching produces a new
  // `hand`, so the effect re-runs for the *next* actor — no loop, no double-apply (the guard is the
  // current `hand` identity, which changes on every applied action).
  useEffect(() => {
    if (handComplete || isHeroTurn) return
    const seat = hand.toAct
    if (seat === null) return

    let cancelled = false
    // `decide` may be sync or async (the Opponent seam); normalise with Promise.resolve so a
    // synchronous heuristic still dispatches in a microtask, after this render has committed.
    Promise.resolve(botRef.current.decide(decisionContext(hand, seat))).then((action: Action) => {
      if (cancelled) return
      // Defensive: bots return legal actions by design, but never feed the engine an illegal move.
      // If a bot somehow produced one, skip it rather than crashing the hand.
      const legal = legalActions(hand)
      if (!actionIsLegal(action, legal)) return
      dispatch({ type: 'apply-action', action })
    })
    return () => {
      cancelled = true
    }
  }, [hand, handComplete, isHeroTurn])

  // Self-exit once the single hand is over (multi-hand session is ticket 0029). The result frame
  // has already rendered by the time this effect runs, so the player sees the outcome before exit.
  useEffect(() => {
    if (handComplete) exit()
  }, [handComplete, exit])

  const onAction = (action: Action): void => dispatch({ type: 'apply-action', action })

  return (
    <Box flexDirection="column">
      <App model={model} dispatch={dispatch} />
      <Box marginTop={1}>
        <ActionBar
          legal={isHeroTurn ? legalActions(hand) : null}
          isHeroTurn={isHeroTurn}
          inputSupported={inputSupported}
          onAction={onAction}
        />
      </Box>
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
