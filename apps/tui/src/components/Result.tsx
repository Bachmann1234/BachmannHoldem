/**
 * The showdown / result view for a completed hand (ticket 0026).
 *
 * Purely presentational: it mirrors `apps/cli/src/table.ts` `renderResult`. When the hand reached
 * a showdown it lists every non-folded player's hole cards (coloured by suit) and the
 * {@link describeHand} description of their evaluated {@link HandState.showdownHands} value; when
 * everyone else folded it says so. Then it shows the payouts — each seat that collected chips and
 * how many, read straight from {@link HandState.payouts}.
 *
 * No game logic: the only engine call is the read-only `describeHand`. The hand is assumed
 * complete (the caller renders this only when {@link isComplete} is true).
 */

import { Box, Text } from 'ink'
import { describeHand, type HandState } from '@holdem/engine'
import { CardPair } from './Card.js'
import { seatName } from './Seat.js'

/** Props for {@link Result}: the completed hand and the hero seat (for the `You`/`Seat N` label). */
export interface ResultProps {
  readonly hand: HandState
  readonly heroSeat: number
}

/** Render the showdown hands (or fold note) and the payouts for a completed hand. */
export function Result({ hand, heroSeat }: ResultProps): React.JSX.Element {
  const contenders = hand.players.filter((p) => p.status !== 'folded')
  const winners = hand.players.filter((p) => (hand.payouts[p.seat] ?? 0) > 0)
  return (
    <Box flexDirection="column">
      <Text bold>── Result ──</Text>
      {hand.endReason === 'showdown' ? (
        contenders.map((p) => {
          const hv = hand.showdownHands[p.seat]
          return (
            <Box key={p.seat}>
              <Box width={8}>
                <Text>{seatName(p.seat, heroSeat)}:</Text>
              </Box>
              <Text>
                <CardPair cards={p.holeCards} reveal={true} /> — {hv ? describeHand(hv) : ''}
              </Text>
            </Box>
          )
        })
      ) : (
        <Text>Everyone else folded.</Text>
      )}
      {winners.map((p) => (
        <Text key={p.seat}>
          {seatName(p.seat, heroSeat)} collect {hand.payouts[p.seat]}
        </Text>
      ))}
    </Box>
  )
}
