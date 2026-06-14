/**
 * Felt geometry shared by the table view (ticket 0034) — the seat `%`-coordinate tables and the
 * centre/wager positioning math, ported verbatim from the confirmed design's `app.jsx`
 * (`SEAT_LAYOUTS` / `CENTER` / `lerp`). Layout-only: no game logic.
 */

/** Seat coordinates as `[x%, y%]` of the felt, keyed by seat count. Index 0 = hero (bottom). */
export const SEAT_LAYOUTS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  2: [
    [50, 80],
    [50, 17],
  ],
  3: [
    [50, 81],
    [17, 27],
    [83, 27],
  ],
  4: [
    [50, 81],
    [12, 44],
    [50, 16],
    [88, 44],
  ],
  5: [
    [50, 82],
    [13, 54],
    [27, 19],
    [73, 19],
    [87, 54],
  ],
  6: [
    [50, 83],
    [11, 57],
    [19, 24],
    [50, 15],
    [81, 24],
    [89, 57],
  ],
}

/** The felt centre (pot + board), as `[x%, y%]`. */
export const CENTER: readonly [number, number] = [50, 45]

/** Linear interpolation — used to place a seat's wager chip part-way toward the centre. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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
