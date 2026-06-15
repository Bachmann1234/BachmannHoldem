/**
 * One seat at the table (ticket 0034) — the DOM analog of the TUI's `Seat`, recreating the
 * design's `.pseat`: the avatar, name + BTN/SB/BB position tag, stack (or `ALL-IN`), the
 * acting-seat ring, the folded dim, and the two hole cards. Positioned absolutely on the felt via
 * the `%` coordinate handed in by {@link Table}.
 *
 * **Reveal rule (must match the TUI exactly):** the hero always sees their own cards; every
 * opponent's cards stay face-down until the hand is complete. The decision is
 * `seat === heroSeat || isComplete` — computed ONCE in {@link Table} and passed down as `reveal` —
 * so a bug here cannot leak an opponent's hole cards mid-hand.
 *
 * No game logic: it reads {@link PlayerState} fields and renders. All rules live in the engine.
 */

import type { PlayerState } from '@holdem/engine'
import { CardPair } from './Card.js'
import { posTag } from './layout.js'

/** Props for {@link Seat}. */
export interface SeatProps {
  /** The player to render. */
  readonly player: PlayerState
  /** Display label (`You`, `Seat 1 (TAG)`) from the session model. */
  readonly label: string
  /** Whether this seat is the hero — drives the hero styling, avatar, and card size. */
  readonly isHero: boolean
  /** Whether this seat's hole cards should be face-up (the reveal rule, decided in {@link Table}). */
  readonly reveal: boolean
  /** Whether this seat is part of a winning showdown hand — highlights the cards. */
  readonly winning: boolean
  /** Seat holding the dealer button — drives the position tag. */
  readonly buttonIndex: number
  /** Total seats this hand — drives the position tag. */
  readonly seatCount: number
  /** Seat to act, or `null` — drives the acting ring + turn timer. */
  readonly toAct: number | null
  /** `[x%, y%]` of the felt to place this seat at. */
  readonly position: readonly [number, number]
}

/** The hero's avatar glyph. Opponents render no avatar — the felt position + label identify them,
 * so dropping the (identical `SE`) bot circle keeps the pill narrow enough that two opposing seats
 * never overlap on a phone-width felt. */
export const HERO_AVATAR = 'YOU'

/** Render one seat: avatar, name + position tag, stack, acting ring, and the two hole cards. */
export function Seat({
  player,
  label,
  isHero,
  reveal,
  winning,
  buttonIndex,
  seatCount,
  toAct,
  position,
}: SeatProps): React.JSX.Element {
  const folded = player.status === 'folded'
  const allIn = player.status === 'allin'
  const acting = toAct === player.seat
  const tag = posTag(player.seat, buttonIndex, seatCount)
  const [x, y] = position
  // Horizontal anchor: a seat on the felt's left/right flank grows its (wide) info pill INWARD
  // from that edge rather than centring on its coordinate, so the pill can never spill off the
  // narrow-phone screen edge. Only near-centre seats (the hero, a top-centre seat) stay centred.
  const side = x <= 18 ? 'left' : x >= 82 ? 'right' : 'center'
  const cls = [
    'pseat',
    `pseat-${side}`,
    isHero ? 'hero' : '',
    acting ? 'acting' : '',
    folded ? 'folded' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={cls}
      data-testid={`seat-${player.seat}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <CardPair
        cards={player.holeCards}
        reveal={reveal}
        size={isHero ? 'lg' : 'sm'}
        muck={folded}
        winning={winning}
      />
      <div className="pseat-info">
        {isHero && <div className="avatar">{HERO_AVATAR}</div>}
        <div className="seat-meta">
          <div className="seat-name">
            <span className="seat-label">{label}</span>
            {tag !== null && (
              <span className={tag === 'BTN' ? 'postag postag-btn' : 'postag'}>{tag}</span>
            )}
          </div>
          <div className="seat-stack">{allIn && player.stack === 0 ? 'ALL-IN' : player.stack}</div>
        </div>
      </div>
      {acting && <div className="turn-timer" />}
    </div>
  )
}
