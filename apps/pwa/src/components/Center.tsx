/**
 * The felt centre (ticket 0034): the pot total, the community board, and the street tag — plus the
 * showdown / fold-win {@link ResultBanner} once the hand completes. The DOM analog of the TUI's
 * `Board` + `Result`, recreating the design's `.center`.
 *
 * Purely presentational: the pot comes from the engine's pure {@link potTotal}; the board cards are
 * the engine's `board`; the result reads `payouts` / `showdownHands` / `endReason`. The only engine
 * calls are the read-only `potTotal` / `isComplete` / `describeHand`.
 */

import { describeHand, handWinners, isComplete, potTotal, type HandState } from '@holdem/engine'
import { Card } from './Card.js'
import { CENTER } from './layout.js'

/** Props for {@link Center}. */
export interface CenterProps {
  readonly hand: HandState
  /** Engine seat the hero occupies — drives the win/lose colour on the banner. */
  readonly heroSeat: number
  /** Display name for an engine seat (`You`, `Mia`) — names the winner on the result banner. */
  readonly seatLabel: (seat: number) => string
}

/** Human-readable street label, e.g. `preflop` → `Preflop`. */
function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1)
}

/**
 * How far (in felt %) to lift the centre block when the result banner appears (see {@link Center}),
 * by seat count. The banner stacks below the board, so lifting keeps it off the bottom seats; a
 * 6-max table seats opponents higher (less head-room), so it lifts less than a 5-max. Counts with no
 * *bottom* seats (≤ 4: opponents flank or sit above the board) just get the 5-max value cosmetically.
 */
function completeRise(seatCount: number): number {
  return seatCount >= 6 ? 2 : 4
}

/** Render the pot, board (or a pre-flop street tag), and the result banner once complete. */
export function Center({ hand, heroSeat, seatLabel }: CenterProps): React.JSX.Element {
  const complete = isComplete(hand)
  const [cx, cy] = CENTER
  // On a completed hand the result banner stacks *below* the board; since the whole block is
  // vertically centred, that would push it down toward the bottom seats while leaving a gap up top.
  // Lift the block so the pot/board ride higher and the banner has room below — balanced either way.
  const top = complete ? cy - completeRise(hand.players.length) : cy
  return (
    <div className="center" style={{ left: `${cx}%`, top: `${top}%` }}>
      <div className="pot">
        <div className="pot-label">Pot</div>
        <div className="pot-amt" data-testid="pot">
          <span className="disc" />
          {potTotal(hand)}
        </div>
      </div>
      <div className="board" data-testid="board">
        {hand.board.length === 0 ? (
          <div className="street-tag">
            {complete ? '' : `${streetLabel(hand.street)} · ${hand.smallBlind}/${hand.bigBlind}`}
          </div>
        ) : (
          hand.board.map((card) => <Card key={card} card={card} size="md" />)
        )}
      </div>
      {complete && <ResultBanner hand={hand} heroSeat={heroSeat} seatLabel={seatLabel} />}
    </div>
  )
}

/** Props for {@link ResultBanner}: a completed hand, the hero seat, and the seat-name lookup. */
export interface ResultBannerProps {
  readonly hand: HandState
  readonly heroSeat: number
  /** Display name for an engine seat — names a non-hero winner (`Mia wins`). */
  readonly seatLabel: (seat: number) => string
}

/**
 * The showdown / fold-win banner for a completed hand: who won, for how much, and (at a showdown)
 * the winning hand description. Reads `handWinners` / `pots` / `showdownHands` / `endReason` — no game logic.
 */
export function ResultBanner({
  hand,
  heroSeat,
  seatLabel,
}: ResultBannerProps): React.JSX.Element | null {
  if (!isComplete(hand)) return null

  // The winner(s): the seats the engine actually awarded a pot to. Reading `handWinners`
  // (not `payouts > 0`) keeps a returned uncalled bet from counting as a win (BUG-0002).
  const winners = handWinners(hand)
  const top = winners[0]
  if (top === undefined) return null

  const heroWon = winners.includes(heroSeat)
  const split = winners.length > 1
  const amount = hand.pots.reduce((sum, pot) => sum + pot.amount, 0)

  let who: string
  if (split) who = 'Split pot'
  else if (top === heroSeat) who = 'You win'
  else who = `${seatLabel(top)} wins`

  let what: string
  if (hand.endReason === 'fold') {
    what = `Everyone else folded · ${amount}`
  } else {
    const hv = hand.showdownHands[top]
    what = `${hv ? describeHand(hv) : ''} · ${amount}`
  }

  return (
    <div className="result-banner" data-testid="result-banner">
      <div className={`who ${heroWon ? 'win' : 'lose'}`}>{who}</div>
      <div className="what">{what}</div>
    </div>
  )
}
