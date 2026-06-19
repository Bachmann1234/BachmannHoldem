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

/**
 * Landscape seat coordinates (ticket 0097) — the WIDE-arc sibling of {@link SEAT_LAYOUTS}, used when
 * the felt is short and wide (`useOrientation` → `'landscape'`). Same contract: `[x%, y%]` of the
 * felt keyed by seat count, index 0 = hero (bottom-centre).
 *
 * Why a second table rather than reusing the portrait one: a short-wide felt has the OPPOSITE
 * head-room budget. Portrait stacks seats up a tall arc (lots of vertical room, little horizontal);
 * landscape has the room along X, so seats spread along a wide arc — pushed out toward the left/right
 * edges and pulled IN vertically — and the board sits in a central horizontal STRIP rather than a
 * tall column. This is the "use the wide space" arrangement, not a letterboxed portrait table.
 *
 * Invariant (mirrors the portrait one, re-derived for the wide felt): no seat sits in the centre's
 * vertical band around {@link LANDSCAPE_CENTER}'s `y=46` (~36–58%). That band holds the board (the
 * 5-card row, which on a wide felt has ample horizontal room) and the eventual result banner growing
 * downward from it. So side seats go ABOVE the band (the upper wide arc, y≈18–26) or — for 5/6-max —
 * a lower pair just BELOW it (y≈61, below the live board band and still above the hero at y≈86). The
 * hero sits at the very bottom (y≈86) so it clears the action-bar footer. (The result banner's
 * landscape extent vs these wings is a completion-surface concern, verified in ticket 0098.)
 *
 * Why the lower wings sit at y≈61 and not lower: the felt's bottom corners hold the fixed-px
 * (un-scaled) corner chrome — the History button (bottom-left) and the Coach FAB (bottom-right). On
 * the short landscape felt those controls are a big fraction of the height, so a wing dropped to y≈70
 * had its pill clipped behind them (the History button landed on the left wing's stack; the Coach FAB
 * ate the right wing's name). The clearance is COUPLED across two files: y≈61 here lifts the wings,
 * AND the styles.css `@media (orientation: landscape)` block compacts + lowers those controls so they
 * reach less far up the felt. Change one and re-check the other (pinned, with that caveat, in
 * layout.test.ts).
 *
 * Flank anchoring: the wings sit at x≈6–12 / x≈88–94 — comfortably past the `x<=18 / x>=82`
 * thresholds in Seat.tsx — so their pills still classify as left/right and grow INWARD off the edge.
 * They are pushed FURTHER out than portrait precisely because the wide felt has the horizontal room
 * for it, which is what spreads the arc.
 */
export const LANDSCAPE_SEAT_LAYOUTS: Readonly<
  Record<number, ReadonlyArray<readonly [number, number]>>
> = {
  2: [
    [50, 86],
    [50, 12],
  ],
  3: [
    [50, 86],
    [10, 24],
    [90, 24],
  ],
  4: [
    [50, 86],
    [9, 26],
    [50, 13],
    [91, 26],
  ],
  5: [
    [50, 86],
    [7, 61],
    [22, 18],
    [78, 18],
    [93, 61],
  ],
  6: [
    [50, 86],
    [6, 61],
    [16, 20],
    [50, 13],
    [84, 20],
    [94, 61],
  ],
}

/** The felt centre (pot + board) in LANDSCAPE, as `[x%, y%]` (ticket 0097). Sits a touch higher than
 * its `y` would in portrait so the downward-growing banner has room in the short felt below the board
 * and above the hero; horizontally centred like portrait. */
export const LANDSCAPE_CENTER: readonly [number, number] = [50, 46]

/** Felt orientation — the signal that selects between the portrait and landscape coordinate sets. */
export type Orientation = 'portrait' | 'landscape'

/**
 * The single layout owner (ticket 0097): given a seat count and the felt orientation, return the seat
 * coordinates AND the matching centre. ALL portrait-vs-landscape selection lives HERE — components ask
 * for "the current layout" and never re-derive orientation or pick a coordinate table themselves. Seat
 * counts outside 2–6 fall back to the 6-max table (matching the prior `SEAT_LAYOUTS[6]` default).
 */
export function tableLayout(
  count: number,
  orientation: Orientation,
): { seats: ReadonlyArray<readonly [number, number]>; center: readonly [number, number] } {
  if (orientation === 'landscape') {
    return {
      seats: LANDSCAPE_SEAT_LAYOUTS[count] ?? LANDSCAPE_SEAT_LAYOUTS[6]!,
      center: LANDSCAPE_CENTER,
    }
  }
  return { seats: SEAT_LAYOUTS[count] ?? SEAT_LAYOUTS[6]!, center: CENTER }
}

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
 * Both branches are pure percentage placement (the felt scales uniformly, so a constant pill drop is
 * a constant % at any size — no pixel patch in EITHER orientation):
 *  - UPPER seats (above the active `center`) carry their pill on the *pot* side of the coordinate, so
 *    the chip is dropped DOWN past it — toward the pot but clear of the pill — by {@link WAGER_DROP_PCT}.
 *  - LOWER seats (the hero + the 5/6-max wings) carry their pill on the *far* side, so a gentle float
 *    UP toward the `center` already clears it.
 * The horizontal nudge toward centre is cosmetic and also keeps flank chips off the screen edge.
 *
 * Ticket 0097: the `center` is passed in (defaulting to the portrait {@link CENTER}) instead of
 * hardcoded, so the SAME function places chips in landscape off the landscape centre. `WAGER_DROP_PCT`
 * needs no orientation branch: the landscape `--u` is bound to felt height just like portrait (see
 * styles.css), so the pill drop is the same constant fraction of felt height in both — 8% clears it.
 */
export function wagerStyle(
  seat: readonly [number, number],
  center: readonly [number, number] = CENTER,
): { left: string; top: string } {
  const [sx, sy] = seat
  const left = `${lerp(sx, center[0], 0.34)}%`
  if (sy < center[1]) return { left, top: `${sy + WAGER_DROP_PCT}%` }
  return { left, top: `${lerp(sy, center[1], 0.34)}%` }
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
