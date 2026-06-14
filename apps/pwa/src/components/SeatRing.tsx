/**
 * The mini six-seat ring (ticket 0047) — recreated as TSX from the design bundle's `components.jsx`
 * `SeatRing`. The preflop lesson spots ({@link PreflopSpot}) render it beside the hero's hand to make
 * *position* legible at a glance: a small felt oval with six seat dots, the hero's seat lit accent,
 * and the dealer button marked with a "B" chip.
 *
 * Purely presentational — it takes the spot's seat geometry (`heroSeat` / `buttonIndex` /
 * `numPlayers`) and draws the ring. The dot coordinates are the design's fixed six-seat oval (adapted
 * from the table's `SEAT_LAYOUTS[6]`); tables with fewer seats simply light fewer dots.
 */

/** Fixed percentage coordinates for the six seats around the oval (the design's layout). */
const RING_SEATS: readonly (readonly [number, number])[] = [
  [50, 86],
  [12, 60],
  [20, 22],
  [50, 12],
  [80, 22],
  [88, 60],
]

/** Props for {@link SeatRing}. */
export interface SeatRingProps {
  /** The hero's seat index — lit accent. */
  readonly heroSeat: number
  /** The dealer-button seat index — carries the "B" chip. */
  readonly buttonIndex: number
  /** How many seats are at the table (≤ 6; extra dots beyond this are not drawn). */
  readonly numPlayers?: number
}

/** Render the mini seat ring: a felt oval, the seat dots, the hero highlight, the button chip. */
export function SeatRing({
  heroSeat,
  buttonIndex,
  numPlayers = 6,
}: SeatRingProps): React.JSX.Element {
  const seats = RING_SEATS.slice(0, Math.min(numPlayers, RING_SEATS.length))
  return (
    <div className="seat-ring" data-testid="seat-ring" aria-hidden="true">
      <div className="sr-oval" />
      {seats.map(([x, y], i) => {
        const isHero = i === heroSeat
        const isBtn = i === buttonIndex
        return (
          <div
            key={i}
            className={'sr-seat' + (isHero ? ' hero' : '')}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {isBtn && <span className="btn-dot">B</span>}
          </div>
        )
      })}
    </div>
  )
}
