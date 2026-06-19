/**
 * Felt geometry shared by the table view (ticket 0034) — the seat `%`-coordinate tables and the
 * centre/wager positioning math, ported from the confirmed design's `app.jsx` (`SEAT_LAYOUTS` /
 * `CENTER` / `lerp`). Layout-only: no game logic.
 *
 * Sizing model (ticket 0096): the whole table scene (cards, pills, board, pot, banner, wagers) is
 * sized in one shared "design pixel" `--u` in `styles.css`, so it scales as a single unit with the
 * felt. That makes these `%` coordinates *size-stable* — a `[x%, y%]` maps to the same relative spot
 * AND the same apparent size at any felt size — which is why {@link wagerStyle} can be pure `%` again
 * (the old `WAGER_DROP_PX` pixel hack is gone; see its replacement note below).
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
 * How far (in felt %) to push an UPPER seat's wager chip past its coordinate toward the pot.
 *
 * Pre-0096 this branch could not be a percentage at all: cards/pills were a CONSTANT pixel size
 * while the felt's pixel height varied, so a seat's pill sat a constant ~43px below its coordinate
 * — a distance that is a SMALL % on a tall felt but a LARGE % on a short one. No single % cleared
 * the pill on every screen, which forced the old `WAGER_DROP_PX = 56` pixel hack (deleted here).
 *
 * Now that the whole felt scales as one unit (the `--u` design-pixel; see `styles.css`), the pill
 * drop is a CONSTANT FRACTION of the felt at every size, so a plain percentage clears it everywhere
 * — and the chip scales with the felt instead of "growing" as the felt shrinks. So both branches
 * are now pure `%` again. {@link WAGER_DROP_PCT} replaces the old `WAGER_DROP_PX = 56`: that 56px
 * was 8% of the reference felt height (701px), and since the pill now holds that same ~8% drop at
 * EVERY felt size, the literal 8% clears it on every screen.
 */
const WAGER_DROP_PCT = 8

/**
 * The CSS `left`/`top` for a seat's wager chip. The chip reads as money pushed toward the pot.
 *
 * Both branches are now pure percentage placement (the felt scales uniformly, so a constant pill
 * drop is a constant % at any size — no more pixel patch):
 *  - UPPER seats (above {@link CENTER}) carry their pill on the *pot* side of the coordinate, so the
 *    chip is dropped DOWN past it — toward the pot but clear of the pill — by {@link WAGER_DROP_PCT}.
 *  - LOWER seats (the hero + the 5/6-max wings) carry their pill on the *far* side, so a gentle
 *    float UP toward {@link CENTER} already clears it.
 * The horizontal nudge toward centre is cosmetic and also keeps flank chips off the screen edge.
 */
export function wagerStyle(seat: readonly [number, number]): { left: string; top: string } {
  const [sx, sy] = seat
  const left = `${lerp(sx, CENTER[0], 0.34)}%`
  if (sy < CENTER[1]) return { left, top: `${sy + WAGER_DROP_PCT}%` }
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
