/**
 * Felt geometry invariants (layout.ts). The headline guard is wager-chip placement. A seat's
 * coordinate is its container centre and a seat stacks its cards above its pill, so the pill sits a
 * roughly constant distance below the coordinate. Pre-0096 that distance was a constant ~43px while
 * the felt's pixel height varied, so it was a SMALL % on a tall felt but a LARGE % on a short one —
 * no single % cleared the pill on every screen (the "225" overlap bug), forcing a `WAGER_DROP_PX`
 * pixel hack for upper seats. Since 0096 the whole felt scales as ONE unit (the `--u` design-pixel
 * in styles.css), so that pill drop is a constant FRACTION of the felt at every size and a plain
 * percentage clears it everywhere. Both branches are pure `%` again; these tests pin both.
 */

import { describe, expect, it } from 'vitest'
import {
  CENTER,
  LANDSCAPE_CENTER,
  LANDSCAPE_SEAT_LAYOUTS,
  SEAT_LAYOUTS,
  tableLayout,
  wagerStyle,
} from './layout.js'

describe('wagerStyle', () => {
  it('drops every upper-seat chip a fixed percentage past its pill toward the pot', () => {
    for (const seats of Object.values(SEAT_LAYOUTS)) {
      for (const seat of seats) {
        const [, sy] = seat
        if (sy >= CENTER[1]) continue
        const { top } = wagerStyle(seat)
        // Now a pure percentage: the felt scales uniformly, so the constant pill drop is a constant
        // % (8% — the old 56px was 8% of the 701px reference felt) at any size. The chip lands BELOW
        // the coordinate (toward the pot), still above felt-centre.
        expect(top, `upper seat ${JSON.stringify(seat)}`).toBe(`${sy + 8}%`)
        const ty = parseFloat(top)
        expect(ty, `upper chip ${JSON.stringify(seat)} dropped toward pot`).toBeGreaterThan(sy)
        expect(ty, `upper chip ${JSON.stringify(seat)} stays above centre`).toBeLessThan(CENTER[1])
      }
    }
  })

  it('keeps lower-seat chips (hero + wings) on the gentle % float toward the pot', () => {
    for (const seats of Object.values(SEAT_LAYOUTS)) {
      for (const seat of seats) {
        const [, sy] = seat
        if (sy < CENTER[1]) continue
        const { top } = wagerStyle(seat)
        const ty = parseFloat(top)
        expect(top.endsWith('%'), `lower seat ${JSON.stringify(seat)} stays in %`).toBe(true)
        // Floats up toward the pot — above the coordinate, never crossing it.
        expect(ty).toBeLessThan(sy)
        expect(ty).toBeGreaterThan(CENTER[1])
      }
    }
  })

  it('nudges flank chips inward so they never hug the screen edge', () => {
    for (const seats of Object.values(SEAT_LAYOUTS)) {
      for (const seat of seats) {
        const [sx] = seat
        if (sx > 18 && sx < 82) continue // flanks only
        const lx = parseFloat(wagerStyle(seat).left)
        if (sx >= 82) {
          expect(lx, `right flank ${sx}`).toBeLessThan(sx)
          expect(lx).toBeGreaterThan(CENTER[0])
        } else {
          expect(lx, `left flank ${sx}`).toBeGreaterThan(sx)
          expect(lx).toBeLessThan(CENTER[0])
        }
      }
    }
  })

  it('matches the documented values for the hero and a top-centre seat', () => {
    expect(wagerStyle([50, 81])).toEqual({ left: '50%', top: '68.76%' }) // hero: gentle float up
    expect(wagerStyle([50, 16])).toEqual({ left: '50%', top: '24%' }) // top-centre: 8% drop past pill
  })

  it('places landscape chips off the landscape centre when one is passed', () => {
    // Upper landscape seat: dropped a flat 8% toward the (landscape) pot, same rule as portrait.
    expect(wagerStyle([50, 18], LANDSCAPE_CENTER)).toEqual({ left: '50%', top: '26%' })
    // A landscape lower wing (y=70, below LANDSCAPE_CENTER.y=46) floats UP toward that centre.
    const wing = wagerStyle([7, 70], LANDSCAPE_CENTER)
    const ty = parseFloat(wing.top)
    expect(ty).toBeLessThan(70) // floated up toward the pot
    expect(ty).toBeGreaterThan(LANDSCAPE_CENTER[1]) // but not past centre
  })
})

/**
 * Landscape arrangement (ticket 0097). The portrait table is frozen; landscape is a SECOND
 * coordinate set selected by the layout owner. These pin the selection, the per-seat-count wide-arc
 * shape, and the "no seat in the centre band" invariant re-derived for the short-wide felt.
 */
describe('tableLayout (the layout owner)', () => {
  it('returns the portrait set + portrait centre for orientation "portrait"', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const { seats, center } = tableLayout(count, 'portrait')
      expect(seats).toBe(SEAT_LAYOUTS[count])
      expect(center).toEqual(CENTER)
    }
  })

  it('returns the landscape set + landscape centre for orientation "landscape"', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const { seats, center } = tableLayout(count, 'landscape')
      expect(seats).toBe(LANDSCAPE_SEAT_LAYOUTS[count])
      expect(center).toEqual(LANDSCAPE_CENTER)
    }
  })

  it('falls back to the 6-max table for out-of-range seat counts in both orientations', () => {
    expect(tableLayout(99, 'portrait').seats).toBe(SEAT_LAYOUTS[6])
    expect(tableLayout(99, 'landscape').seats).toBe(LANDSCAPE_SEAT_LAYOUTS[6])
  })
})

describe('LANDSCAPE_SEAT_LAYOUTS arrangement', () => {
  it('has one coordinate per seat for every supported count (2..6)', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      expect(LANDSCAPE_SEAT_LAYOUTS[count]).toHaveLength(count)
    }
  })

  it('seats the hero (index 0) bottom-centre, clear of the action bar, at every count', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const [hx, hy] = LANDSCAPE_SEAT_LAYOUTS[count]![0]!
      expect(hx).toBe(50) // centred
      expect(hy).toBeGreaterThanOrEqual(82) // bottom, clear of the footer action bar
    }
  })

  it('spreads a WIDER horizontal arc than portrait (flanks pushed further out)', () => {
    // Compare the extreme flank x of each count: landscape should reach at least as far out as
    // portrait toward both edges, since the wide felt has the horizontal room for it.
    for (const count of [3, 4, 5, 6]) {
      const land = LANDSCAPE_SEAT_LAYOUTS[count]!
      const port = SEAT_LAYOUTS[count]!
      const minLand = Math.min(...land.map(([x]) => x))
      const maxLand = Math.max(...land.map(([x]) => x))
      const minPort = Math.min(...port.map(([x]) => x))
      const maxPort = Math.max(...port.map(([x]) => x))
      expect(minLand).toBeLessThanOrEqual(minPort)
      expect(maxLand).toBeGreaterThanOrEqual(maxPort)
    }
  })

  it('keeps no seat in the centre band that holds the board + downward banner', () => {
    // The board (centred on LANDSCAPE_CENTER.y=46) and the banner growing down from it occupy a
    // vertical band; a seat level with it would have its pill/cards overlap. Pin a band around the
    // centre and assert every seat is clear of it (above, or below toward the hero).
    const cy = LANDSCAPE_CENTER[1]
    const band = { top: cy - 10, bottom: cy + 12 } // 36..58
    for (const count of [2, 3, 4, 5, 6]) {
      for (const [, y] of LANDSCAPE_SEAT_LAYOUTS[count]!) {
        const clear = y <= band.top || y >= band.bottom
        expect(clear, `landscape ${count}-max seat at y=${y} sits in the board/banner band`).toBe(
          true,
        )
      }
    }
  })

  it('keeps the 5/6-max lower wings clear of the fixed bottom-corner controls', () => {
    // The History button (bottom-left) and Coach FAB (bottom-right) are fixed-px corner chrome that
    // does NOT scale with the felt, so on a short landscape felt they're a big fraction of the height.
    // A lower wing dropped too low has its pill clipped behind the control (the original 0097 bug, the
    // wing sat at y=70). The clearance is bought from BOTH sides and the two are COUPLED:
    //   1) here — the wings are pinned high (y≤68) instead of y=70, and
    //   2) styles.css `@media (orientation: landscape)` — the controls themselves are compacted +
    //      anchored to `bottom: 8px` so they reach less far up the felt.
    // This is a felt-% proxy and CANNOT see the CSS, so if you change the corner-control size/position
    // in styles.css, re-verify this clearance in a browser — this assertion alone won't catch it.
    const CORNER_CONTROL_TOP = 68 // felt-%; wings must sit above this to clear History / Coach FAB
    for (const count of [5, 6]) {
      const seats = LANDSCAPE_SEAT_LAYOUTS[count]!
      const leftWing = seats[1]!
      const rightWing = seats[count - 1]!
      expect(leftWing[1], `${count}-max left wing clears corner controls`).toBeLessThanOrEqual(
        CORNER_CONTROL_TOP,
      )
      expect(rightWing[1], `${count}-max right wing clears corner controls`).toBeLessThanOrEqual(
        CORNER_CONTROL_TOP,
      )
    }
  })

  it('keeps flank seats outside the x<=18 / x>=82 anchor thresholds so pills grow inward', () => {
    // The 5/6-max lower wings and the wide side seats must classify as left/right flanks (Seat.tsx
    // `x<=18 ? 'left' : x>=82 ? 'right'`) so their wide pills anchor inward off the screen edge.
    for (const count of [5, 6]) {
      const seats = LANDSCAPE_SEAT_LAYOUTS[count]!
      const leftWing = seats[1]! // index 1 is the left lower wing in both
      const rightWing = seats[count - 1]! // last seat is the right lower wing
      expect(leftWing[0], `${count}-max left wing anchors left`).toBeLessThanOrEqual(18)
      expect(rightWing[0], `${count}-max right wing anchors right`).toBeGreaterThanOrEqual(82)
    }
  })
})
