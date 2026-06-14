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

/** The first two characters of a label, upper-cased, for the bot avatar (e.g. `Seat 1` → `SE`). */
export function avatarText(label: string, isHero: boolean): string {
  return isHero ? 'YOU' : label.replace(/\s+/g, '').slice(0, 2).toUpperCase()
}

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
  const cls = ['pseat', isHero ? 'hero' : '', acting ? 'acting' : '', folded ? 'folded' : '']
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
        <div className={isHero ? 'avatar' : 'avatar bot'}>{avatarText(label, isHero)}</div>
        <div className="seat-meta">
          <div className="seat-name">
            {label}
            {tag !== null && <span className={tag === 'BTN' ? 'postag btn' : 'postag'}>{tag}</span>}
          </div>
          <div className="seat-stack">{allIn && player.stack === 0 ? 'ALL-IN' : player.stack}</div>
        </div>
      </div>
      {acting && <div className="turn-timer" />}
    </div>
  )
}
