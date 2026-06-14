/**
 * One seat at the table (ticket 0026).
 *
 * Purely presentational: given a {@link PlayerState}, the hero seat, and whether the hand is
 * complete, it renders the seat's name (`You` for the hero, else a stable `Seat N` label), its
 * two hole cards, stack, current-street bet, and status marks — the dealer button, folded /
 * all-in, and the to-act arrow. It is a richer rendering of exactly what `apps/cli/src/table.ts`
 * `renderSeat` shows, with no information dropped.
 *
 * **Reveal rule (must match the CLI exactly):** the hero always sees their own cards; every
 * opponent's cards stay face-down (`{@link HiddenCard}`) until the hand is complete. The decision
 * is `seat === heroSeat || isComplete` — the very predicate `renderSeat` uses — so a bug here
 * cannot leak an opponent's hole cards mid-hand. The caller passes `isComplete` (computed once
 * from the engine's {@link isComplete}) so this component stays a pure function of its props.
 *
 * No game logic: it reads {@link PlayerState} fields and renders. All rules live in the engine.
 */

import { Box, Text } from 'ink'
import type { PlayerState } from '@holdem/engine'
import { CardPair } from './Card.js'

/** Props for {@link Seat}. */
export interface SeatProps {
  /** The player to render. */
  readonly player: PlayerState
  /** Seat the human occupies — drives the `You` label and the reveal of hole cards. */
  readonly heroSeat: number
  /** Seat holding the dealer button — drives the `BTN` mark. */
  readonly buttonIndex: number
  /** Seat to act, or `null` — drives the to-act arrow. */
  readonly toAct: number | null
  /** Whether the hand is complete — the *only* thing that reveals opponents' cards. */
  readonly isComplete: boolean
}

/** The display name for a seat: `You` for the hero, else a stable `Seat N` label. */
export function seatName(seat: number, heroSeat: number): string {
  return seat === heroSeat ? 'You' : `Seat ${seat}`
}

/** The hero's hole cards are always shown; an opponent's only once the hand is complete. */
export function shouldReveal(seat: number, heroSeat: number, isComplete: boolean): boolean {
  return seat === heroSeat || isComplete
}

/** Render one seat row: name, cards, stack, bet, and marks. */
export function Seat({
  player,
  heroSeat,
  buttonIndex,
  toAct,
  isComplete,
}: SeatProps): React.JSX.Element {
  const reveal = shouldReveal(player.seat, heroSeat, isComplete)
  // The same marks `renderSeat` shows, in the same order: button, folded, all-in, to-act.
  const marks = [
    player.seat === buttonIndex ? 'BTN' : '',
    player.status === 'folded' ? 'folded' : '',
    player.status === 'allin' ? 'all-in' : '',
    toAct === player.seat ? '<= to act' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Box>
      <Box width={8}>
        <Text bold={player.seat === heroSeat}>{seatName(player.seat, heroSeat)}</Text>
      </Box>
      <Text>
        [<CardPair cards={player.holeCards} reveal={reveal} />] stack {player.stack}
        {player.committed > 0 ? `  bet ${player.committed}` : ''}
        {marks ? `  ${marks}` : ''}
      </Text>
    </Box>
  )
}
