/**
 * The whole poker table, composed for an N-seat layout (ticket 0026).
 *
 * Purely presentational: it lays out the {@link Board} (street header, board, pot) above the list
 * of {@link Seat}s — one per `hand.players`, so a heads-up table and a 6-max table render through
 * the same code with no two-player assumption. When the hand is complete it appends the
 * {@link Result} (showdown hands + payouts).
 *
 * The reveal decision is computed *once* here via the engine's pure {@link isComplete} and passed
 * down to every {@link Seat}, so the components below stay pure functions of their props and the
 * "hide opponents until showdown" rule is enforced in exactly one place.
 *
 * No game logic: the only engine call is the read-only `isComplete`.
 */

import { Box } from 'ink'
import { isComplete, type HandState } from '@holdem/engine'
import { Board } from './Board.js'
import { Seat } from './Seat.js'
import { Result } from './Result.js'

/** Props for {@link Table}: the hand to render and which seat the human occupies. */
export interface TableProps {
  readonly hand: HandState
  readonly heroSeat: number
}

/** Render the board, every seat (laid out vertically), and the result once the hand completes. */
export function Table({ hand, heroSeat }: TableProps): React.JSX.Element {
  const complete = isComplete(hand)
  return (
    <Box flexDirection="column">
      <Board hand={hand} />
      <Box flexDirection="column" marginTop={1}>
        {hand.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            heroSeat={heroSeat}
            buttonIndex={hand.buttonIndex}
            toAct={hand.toAct}
            isComplete={complete}
          />
        ))}
      </Box>
      {complete ? (
        <Box marginTop={1}>
          <Result hand={hand} heroSeat={heroSeat} />
        </Box>
      ) : null}
    </Box>
  )
}
