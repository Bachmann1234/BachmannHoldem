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

/**
 * Pot label for the multi-pot breakdown (ticket 0090 parity). The engine emits `hand.pots`
 * main-first, so index 0 is always the main pot; a lone side pot is "Side", and when several layer
 * we abbreviate to "S1", "S2", … to keep the single board line narrow. The terminal counterpart of
 * the PWA's `podLabel`.
 */
function podLabel(index: number, potCount: number): string {
  if (index === 0) return 'Main'
  if (potCount === 2) return 'Side'
  return `S${index}`
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
        {/* Side-pot parity: with a split pot, show a compact labelled breakdown (Main 60  Side 60)
            reading each `pot.amount` straight off `hand.pots`; otherwise the unchanged total. */}
        {hand.pots.length > 1
          ? hand.pots.map((pot, i) => (
              <Text key={i}>
                {'  '}
                {podLabel(i, hand.pots.length)} {pot.amount}
              </Text>
            ))
          : `  Pot: ${potTotal(hand)}`}
      </Text>
    </Box>
  )
}
