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
import { CENTER, SEAT_LAYOUTS, wagerStyle } from './layout.js'

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
})
