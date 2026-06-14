/**
 * The felt centre (ticket 0034): the pot total, the community board, and the street tag — plus the
 * showdown / fold-win {@link ResultBanner} once the hand completes. The DOM analog of the TUI's
 * `Board` + `Result`, recreating the design's `.center`.
 *
 * Purely presentational: the pot comes from the engine's pure {@link potTotal}; the board cards are
 * the engine's `board`; the result reads `payouts` / `showdownHands` / `endReason`. The only engine
 * calls are the read-only `potTotal` / `isComplete` / `describeHand`.
 */

import { describeHand, isComplete, potTotal, type HandState } from '@holdem/engine'
import { Card } from './Card.js'
import { CENTER } from './layout.js'

/** Props for {@link Center}. */
export interface CenterProps {
  readonly hand: HandState
  /** Engine seat the hero occupies — drives the win/lose colour on the banner. */
  readonly heroSeat: number
}

/** Human-readable street label, e.g. `preflop` → `Preflop`. */
function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1)
}

/** Render the pot, board (or a pre-flop street tag), and the result banner once complete. */
export function Center({ hand, heroSeat }: CenterProps): React.JSX.Element {
  const complete = isComplete(hand)
  const [cx, cy] = CENTER
  return (
    <div className="center" style={{ left: `${cx}%`, top: `${cy}%` }}>
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
      {complete && <ResultBanner hand={hand} heroSeat={heroSeat} />}
    </div>
  )
}

/** Props for {@link ResultBanner}: a completed hand and the hero seat. */
export interface ResultBannerProps {
  readonly hand: HandState
  readonly heroSeat: number
}

/**
 * The showdown / fold-win banner for a completed hand: who won, for how much, and (at a showdown)
 * the winning hand description. Reads `payouts` / `showdownHands` / `endReason` — no game logic.
 */
export function ResultBanner({ hand, heroSeat }: ResultBannerProps): React.JSX.Element | null {
  if (!isComplete(hand)) return null

  // The winner(s): seats that collected chips. (Uncalled-bet returns also show as payouts, but on
  // a completed hand the seat that collected the pot is the meaningful winner for the banner.)
  const winners = hand.players
    .filter((p) => (hand.payouts[p.seat] ?? 0) > 0)
    .sort((a, b) => (hand.payouts[b.seat] ?? 0) - (hand.payouts[a.seat] ?? 0))
  const top = winners[0]
  if (top === undefined) return null

  const heroWon = winners.some((p) => p.seat === heroSeat)
  const split = winners.length > 1
  const amount = winners.reduce((sum, p) => sum + (hand.payouts[p.seat] ?? 0), 0)

  let who: string
  if (split) who = 'Split pot'
  else if (top.seat === heroSeat) who = 'You win'
  else who = `Seat ${top.seat} wins`

  let what: string
  if (hand.endReason === 'fold') {
    what = `Everyone else folded · ${amount}`
  } else {
    const hv = hand.showdownHands[top.seat]
    what = `${hv ? describeHand(hv) : ''} · ${amount}`
  }

  return (
    <div className="result-banner" data-testid="result-banner">
      <div className={`who ${heroWon ? 'win' : 'lose'}`}>{who}</div>
      <div className="what">{what}</div>
    </div>
  )
}
