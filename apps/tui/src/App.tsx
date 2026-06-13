/**
 * The root Ink component (ticket 0025): a minimal, read-only text snapshot of one hand.
 *
 * It is purely presentational — it takes the {@link Model} (and a {@link Dispatch} for later
 * tickets to wire input through) and *reads* it to render the street, board, pot, and every
 * seat's stack. There is **zero** game logic here: all rules live in `@holdem/engine`, and the
 * model is advanced only by the pure reducer. The rich, coloured N-seat table view is ticket
 * 0026; this is the placeholder snapshot that proves the model→view wiring.
 *
 * Everything is derived generically from `hand.players` — the seat list comes from the engine,
 * so a heads-up table and a 6-max table render through the same code with no special-casing.
 */

import { Box, Text } from 'ink'
import { formatCard, potTotal, isComplete, type HandState } from '@holdem/engine'
import type { Model } from './model.js'
import type { Dispatch } from './reducer.js'

/** Props for {@link App}: the model to render and the dispatch the loop will use later. */
export interface AppProps {
  readonly model: Model
  /** Accepted now so the input-driven tickets (0027+) can wire the loop without a signature change. */
  readonly dispatch: Dispatch
}

/** Human-readable street label, e.g. `preflop` -> `Preflop`. */
function streetLabel(hand: HandState): string {
  return hand.street.charAt(0).toUpperCase() + hand.street.slice(1)
}

/** The board as space-separated cards, or a dash before the flop. */
function boardLabel(hand: HandState): string {
  return hand.board.length === 0 ? '—' : hand.board.map(formatCard).join(' ')
}

/** The root view: a static snapshot of the current model. */
export function App({ model }: AppProps): React.JSX.Element {
  const { hand, heroSeat } = model
  return (
    <Box flexDirection="column">
      <Text bold>Bachmann Hold'em — TUI</Text>
      <Text>
        {streetLabel(hand)} · Board {boardLabel(hand)} · Pot {potTotal(hand)}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {hand.players.map((player) => {
          const isHero = player.seat === heroSeat
          const isButton = player.seat === hand.buttonIndex
          const isToAct = player.seat === hand.toAct
          const label = isHero ? 'You' : `Seat ${player.seat}`
          // The hero always sees their own hole cards; opponents' are hidden until showdown
          // (the rich reveal logic is ticket 0026 — here they simply stay face down).
          const cards = isHero ? player.holeCards.map(formatCard).join(' ') : '🂠 🂠'
          return (
            <Text key={player.seat}>
              {isButton ? '(D) ' : '    '}
              {isToAct ? '▶ ' : '  '}
              {label}: {cards} · {player.stack} chips · {player.status}
            </Text>
          )
        })}
      </Box>
      <Text dimColor>{isComplete(hand) ? 'Hand complete.' : 'Hand in progress (read-only).'}</Text>
    </Box>
  )
}
