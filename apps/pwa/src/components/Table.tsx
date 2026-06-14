/**
 * The whole poker table (ticket 0034) — the DOM analog of the TUI's `Table`, recreating the
 * confirmed design's shell: the top bar (brand, `HAND #N · {count}-MAX`, hero bank chip), the oval
 * felt, the centred pot/board, every seat laid out by `SEAT_LAYOUTS[count]`, the per-seat wager
 * chips, and — once the hand completes — the result banner (inside {@link Center}).
 *
 * Generic over 2–6 seats via `hand.players`: a heads-up and a 6-max table render through the same
 * code with no per-size special-casing.
 *
 * **Reveal rule:** the "hide opponents until showdown" decision is computed *once* here via the
 * engine's pure {@link isComplete} (`reveal = seat === heroSeat || complete`) and passed down to
 * every {@link Seat}, so the rule is enforced in exactly one place and cannot leak a bot's cards.
 *
 * No game logic: the only engine calls are the read-only `isComplete` / `potTotal`. Seat *labels*
 * (`You`, `Seat 1 (TAG)`) come from the session model via `seatToId` → `players`.
 */

import { isComplete, type HandState } from '@holdem/engine'
import { Center } from './Center.js'
import { Seat } from './Seat.js'
import { CENTER, lerp, SEAT_LAYOUTS } from './layout.js'

/** A label provider for an engine seat — the table is decoupled from the session model shape. */
export type SeatLabel = (seat: number) => string

/** Props for {@link Table}. */
export interface TableProps {
  /** The hand to render. */
  readonly hand: HandState
  /** Engine seat the hero occupies this hand. */
  readonly heroSeat: number
  /** Display label for an engine seat (`You`, `Seat 1 (TAG)`). */
  readonly seatLabel: SeatLabel
  /** The session hand number, for the top bar. */
  readonly handNumber: number
  /**
   * Optional overlay rendered inside the felt, on top of the seats — the coach FAB (ticket 0036)
   * lives here so its `position:absolute` anchors to the felt, exactly like the design's `.coach-fab`.
   */
  readonly overlay?: React.ReactNode
}

/** Render the top bar, the felt, the centred pot/board, every seat, and the wager chips. */
export function Table({
  hand,
  heroSeat,
  seatLabel,
  handNumber,
  overlay,
}: TableProps): React.JSX.Element {
  const complete = isComplete(hand)
  const count = hand.players.length
  const layout = SEAT_LAYOUTS[count] ?? SEAT_LAYOUTS[6]!
  const heroStack = hand.players[heroSeat]?.stack ?? 0
  // Seats that win chips at showdown — used to ring their (revealed) cards green.
  const winnerSeats = new Set(
    hand.players.filter((p) => (hand.payouts[p.seat] ?? 0) > 0).map((p) => p.seat),
  )

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">
              HAND #{handNumber} · {count}-MAX
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="chip-counter" data-testid="bank">
            BANK {heroStack}
          </div>
        </div>
      </div>

      <div className="table">
        <div className="felt">
          <Center hand={hand} heroSeat={heroSeat} />

          {/* wager chips — the current-street bet, placed part-way toward the centre */}
          {hand.players.map((p) => {
            if (p.committed <= 0) return null
            const [sx, sy] = layout[p.seat] ?? CENTER
            const wx = lerp(sx, CENTER[0], 0.34)
            const wy = lerp(sy, CENTER[1], 0.34)
            return (
              <div
                className="wager"
                key={`w${p.seat}`}
                data-testid={`wager-${p.seat}`}
                style={{ left: `${wx}%`, top: `${wy}%` }}
              >
                <span className="disc" />
                {p.committed}
              </div>
            )
          })}

          {/* seats */}
          {hand.players.map((p) => (
            <Seat
              key={p.seat}
              player={p}
              label={seatLabel(p.seat)}
              isHero={p.seat === heroSeat}
              reveal={p.seat === heroSeat || complete}
              winning={complete && winnerSeats.has(p.seat) && p.status !== 'folded'}
              buttonIndex={hand.buttonIndex}
              seatCount={count}
              toAct={hand.toAct}
              position={layout[p.seat] ?? CENTER}
            />
          ))}

          {overlay}
        </div>
      </div>
    </div>
  )
}
