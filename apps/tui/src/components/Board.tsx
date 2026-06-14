/**
 * The board area: street header, community cards, and the pot total (ticket 0026).
 *
 * Purely presentational: it reads the {@link HandState}'s street, board, and — via the engine's
 * pure {@link potTotal} — the pot, and lays them out. The board cards are coloured by suit (each
 * a {@link Card}); before the flop, when no community cards are out, a dash stands in, exactly as
 * `apps/cli/src/table.ts` `renderState` renders it.
 *
 * No game logic: the only engine call is the read-only `potTotal`. The street label is a trivial
 * capitalisation of `hand.street`.
 */

import { Box, Text } from 'ink'
import { potTotal, type HandState } from '@holdem/engine'
import { Card } from './Card.js'

/** Props for {@link Board}: the hand to read the street/board/pot from. */
export interface BoardProps {
  readonly hand: HandState
}

/** Human-readable street label, e.g. `preflop` -> `Preflop`. */
export function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1)
}

/** Render the street header, the (coloured) board cards or a pre-flop dash, and the pot total. */
export function Board({ hand }: BoardProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>── {streetLabel(hand.street)} ──</Text>
      <Text>
        Board:{' '}
        {hand.board.length === 0
          ? '—'
          : hand.board.map((card, i) => (
              <Text key={card}>
                {i > 0 ? ' ' : ''}
                <Card card={card} />
              </Text>
            ))}
        {'  '}Pot: {potTotal(hand)}
      </Text>
    </Box>
  )
}
