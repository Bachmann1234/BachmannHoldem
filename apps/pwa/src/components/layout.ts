/**
 * Felt geometry shared by the table view (ticket 0034) — the seat `%`-coordinate tables and the
 * centre/wager positioning math, ported verbatim from the confirmed design's `app.jsx`
 * (`SEAT_LAYOUTS` / `CENTER` / `lerp`). Layout-only: no game logic.
 */

/**
 * Seat coordinates as `[x%, y%]` of the felt, keyed by seat count. Index 0 = hero (bottom).
 *
 * Invariant: no seat sits in the board's vertical band (~40–50%, around {@link CENTER}'s `y=45`).
 * The board is a fixed-width 5-card row, so on a narrow phone it spans most of the felt width at
 * that latitude — any seat level with it has its info pill / revealed cards overlap the community
 * cards. Side seats therefore go above (e.g. the 3/4-max upper arc) or below (5/6-max lower wings).
 */
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
    [16, 31],
    [50, 16],
    [84, 31],
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
