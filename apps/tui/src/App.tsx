/**
 * The root Ink component (tickets 0025 / 0026).
 *
 * Purely presentational — it takes the {@link Model} (and a {@link Dispatch} for later tickets to
 * wire input through) and *reads* it to render the rich, coloured N-seat {@link Table}: the street
 * header, board, pot, every seat (with marks and the hero's hole cards), and — once the hand
 * completes — the showdown / result. There is **zero** game logic here: all rules live in
 * `@holdem/engine`, the model is advanced only by the pure reducer, and `dispatch` stays unused
 * until the action-input ticket (0027).
 *
 * Everything is derived generically from `hand.players`, so a heads-up table and a 6-max table
 * render through the same component with no special-casing.
 */

import { Box, Text } from 'ink'
import type { Model } from './model.js'
import type { Dispatch } from './reducer.js'
import { Table } from './components/Table.js'

/** Props for {@link App}: the model to render and the dispatch the loop will use later. */
export interface AppProps {
  readonly model: Model
  /** Accepted now so the input-driven tickets (0027+) can wire the loop without a signature change. */
  readonly dispatch: Dispatch
}

/** The root view: the live table for the current model. */
export function App({ model }: AppProps): React.JSX.Element {
  const { hand, heroSeat } = model
  return (
    <Box flexDirection="column">
      <Text bold>Bachmann Hold'em — TUI</Text>
      <Box marginTop={1}>
        <Table hand={hand} heroSeat={heroSeat} />
      </Box>
    </Box>
  )
}
