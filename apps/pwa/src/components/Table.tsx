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

import { handWinners, isComplete, type HandState } from '@holdem/engine'
import type { LevelStatus } from '@holdem/session'
import { Center } from './Center.js'
import { Seat } from './Seat.js'
import { tableLayout, wagerStyle } from './layout.js'
import { useOrientation } from './useOrientation.js'

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
   * The tournament level in force, when the session is in tournament mode — drives the top-bar level
   * chip (current level, blinds, and a hint of when the next step-up lands). Omitted in cash mode, so
   * the top bar renders exactly as before.
   */
  readonly tournament?: LevelStatus
  /**
   * Optional overlay rendered inside the felt, on top of the seats — the coach FAB (ticket 0036)
   * lives here so its `position:absolute` anchors to the felt, exactly like the design's `.coach-fab`.
   */
  readonly overlay?: React.ReactNode
  /**
   * How many board cards to render — the all-in runout reveal (ticket 0093) passes a sub-count so the
   * board fills in street by street. Threaded straight to {@link Center}; defaults there to the full
   * board, so non-runout callers are unaffected.
   */
  readonly revealBoardCount?: number
  /**
   * Whether the result is shown yet — the all-in runout (ticket 0093) withholds the result banner AND
   * the winner green rings until the river is revealed, so the result doesn't spoil the board sweat.
   * Defaults to {@link isComplete} so non-runout callers ring + banner exactly as before.
   */
  readonly showResult?: boolean
}

/** Render the top bar, the felt, the centred pot/board, every seat, and the wager chips. */
export function Table({
  hand,
  heroSeat,
  seatLabel,
  handNumber,
  tournament,
  overlay,
  revealBoardCount,
  showResult = isComplete(hand),
}: TableProps): React.JSX.Element {
  const complete = isComplete(hand)
  const count = hand.players.length
  // The single layout owner picks the portrait/landscape coordinate set + matching centre off the
  // live orientation (ticket 0097). Components below read THIS — they never re-derive orientation.
  const orientation = useOrientation()
  const { seats: layout, center } = tableLayout(count, orientation)
  // Seats that actually won a pot — used to ring their (revealed) cards green. Reads
  // `handWinners` (not `payouts > 0`) so a returned uncalled bet isn't ringed (BUG-0002).
  const winnerSeats = new Set(handWinners(hand))

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
          {tournament ? (
            <div
              className="chip-counter level-chip"
              data-testid="level"
              aria-label={
                `Level ${tournament.level}, blinds ${tournament.blinds.sb}/${tournament.blinds.bb}, ` +
                (tournament.atTop
                  ? 'top level, blinds no longer rise'
                  : `next level in ${tournament.handsUntilNext} hand${tournament.handsUntilNext === 1 ? '' : 's'}`)
              }
            >
              LVL {tournament.level} · {tournament.blinds.sb}/{tournament.blinds.bb}
              {tournament.atTop ? ' · TOP' : ` · ↑${tournament.handsUntilNext}`}
            </div>
          ) : null}
        </div>
      </div>

      <div className="table">
        <div className="felt" data-orientation={orientation}>
          <Center
            hand={hand}
            heroSeat={heroSeat}
            seatLabel={seatLabel}
            center={center}
            revealBoardCount={revealBoardCount}
            showResult={showResult}
          />

          {/* wager chips — the current-street bet, placed part-way toward the centre */}
          {hand.players.map((p) => {
            if (p.committed <= 0) return null
            return (
              <div
                className="wager"
                key={`w${p.seat}`}
                data-testid={`wager-${p.seat}`}
                style={wagerStyle(layout[p.seat] ?? center, center)}
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
              winning={showResult && winnerSeats.has(p.seat) && p.status !== 'folded'}
              buttonIndex={hand.buttonIndex}
              seatCount={count}
              toAct={hand.toAct}
              position={layout[p.seat] ?? center}
            />
          ))}

          {overlay}
        </div>
      </div>
    </div>
  )
}
