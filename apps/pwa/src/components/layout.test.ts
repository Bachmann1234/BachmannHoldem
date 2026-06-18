/**
 * Felt geometry invariants (layout.ts). The headline guard is wager-chip placement. A seat's
 * coordinate is its container centre and a seat stacks its cards above its pill, so the pill sits a
 * roughly constant ~43px below the coordinate. For an UPPER seat that puts the pill on the pot side
 * of the coordinate, so a chip floated a fixed *percentage* toward the pot lands on the stack
 * number (the "225" overlap bug) — and the needed percentage grows as the felt shrinks, so the fix
 * drops upper-seat chips a fixed *pixel* distance instead. Lower seats keep the gentle % float
 * (their pill is on the far side of the coordinate from the pot). These tests pin both branches.
 */

import { describe, expect, it } from 'vitest'
import { CENTER, SEAT_LAYOUTS, wagerStyle } from './layout.js'

describe('wagerStyle', () => {
  it('drops every upper-seat chip a fixed pixel distance past its pill', () => {
    for (const seats of Object.values(SEAT_LAYOUTS)) {
      for (const seat of seats) {
        const [, sy] = seat
        if (sy >= CENTER[1]) continue
        const { top } = wagerStyle(seat)
        // Pixel offset (viewport-invariant) so it clears the ~43px pill drop on any screen, NOT a
        // percentage that would shrink to nothing on a short felt.
        expect(top, `upper seat ${JSON.stringify(seat)}`).toBe(`calc(${sy}% + 56px)`)
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
    expect(wagerStyle([50, 16])).toEqual({ left: '50%', top: 'calc(16% + 56px)' }) // top-centre drop
  })
})
