/**
 * Felt geometry shared by the table view (ticket 0034) — the seat `%`-coordinate tables and the
 * centre/wager positioning math, ported verbatim from the confirmed design's `app.jsx`
 * (`SEAT_LAYOUTS` / `CENTER` / `lerp`). Layout-only: no game logic.
 */

/**
 * Seat coordinates as `[x%, y%]` of the felt, keyed by seat count. Index 0 = hero (bottom).
 *
 * Invariant: no seat sits in the centre's vertical band (~38–60%). That band holds the board (a
 * fixed-width 5-card row centred on {@link CENTER}'s `y=45`, spanning most of the felt width on a
 * narrow phone) AND — once the hand completes — the result banner that grows *downward* from the
 * board to ~60%. A seat level with either has its info pill / revealed cards overlap them. Side
 * seats therefore go above it (the 3/4-max upper arc) or below it (the 5/6-max lower wings at
 * ~63–65%, clear of the banner and above the hero). Flank seats also edge-anchor (see Seat.tsx) so
 * their pills grow inward and never spill off the screen edge.
 */
export const SEAT_LAYOUTS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  2: [
    [50, 80],
    [50, 17],
  ],
  3: [
    [50, 81],
    [13, 27],
    [87, 27],
  ],
  4: [
    [50, 81],
    [13, 31],
    [50, 16],
    [87, 31],
  ],
  5: [
    [50, 82],
    [14, 63],
    [27, 19],
    [73, 19],
    [86, 63],
  ],
  6: [
    [50, 83],
    [13, 65],
    [19, 22],
    [50, 15],
    [81, 22],
    [87, 65],
  ],
}

/** The felt centre (pot + board), as `[x%, y%]`. */
export const CENTER: readonly [number, number] = [50, 45]

/** Linear interpolation — used to place a seat's wager chip part-way toward the centre. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * How far below an upper seat's coordinate to drop its wager chip, in CSS pixels.
 *
 * A seat's coordinate is its *container* centre, and a seat stacks its (fixed-px) cards ABOVE its
 * pill — so the pill bottom sits a roughly CONSTANT ~43px below the coordinate, independent of
 * viewport. For an upper seat that pill is on the pot side of the coordinate, so a chip floated a
 * fixed *percentage* toward the pot lands on it (the garbled "225" overlap) — and worse, the needed
 * percentage grows as the felt shrinks, so no single % clears it on every screen. Pixels do: 56px
 * clears the ~43px pill drop plus the chip's ~11px half-height with a small margin, at any size.
 */
const WAGER_DROP_PX = 56

/**
 * The CSS `left`/`top` for a seat's wager chip. The chip reads as money pushed toward the pot.
 *
 * UPPER seats drop their chip a fixed pixel distance past the pill (see {@link WAGER_DROP_PX}).
 * LOWER seats (the hero and the 5/6-max wings) carry their pill on the *far* side of the coordinate
 * from the pot, so a gentle float toward {@link CENTER} already clears it — they keep the original
 * percentage interpolation. The horizontal nudge toward centre is cosmetic and also keeps flank
 * chips off the screen edge.
 */
export function wagerStyle(seat: readonly [number, number]): { left: string; top: string } {
  const [sx, sy] = seat
  const left = `${lerp(sx, CENTER[0], 0.34)}%`
  if (sy < CENTER[1]) return { left, top: `calc(${sy}% + ${WAGER_DROP_PX}px)` }
  return { left, top: `${lerp(sy, CENTER[1], 0.34)}%` }
}

/**
 * The BTN/SB/BB tag for an engine seat, derived from the button index and seat count using the
 * same rule the engine uses: heads-up → the button is the small blind and the other seat the big
 * blind; 3+ → SB sits one left of the button, BB two left (wrapping). Returns `null` for any other
 * seat.
 */
export function posTag(
  seat: number,
  buttonIndex: number,
  count: number,
): 'BTN' | 'SB' | 'BB' | null {
  const sbIdx = count === 2 ? buttonIndex : (buttonIndex + 1) % count
  const bbIdx = count === 2 ? (buttonIndex + 1) % count : (buttonIndex + 2) % count
  if (seat === buttonIndex) return 'BTN'
  if (seat === sbIdx) return 'SB'
  if (seat === bbIdx) return 'BB'
  return null
}
