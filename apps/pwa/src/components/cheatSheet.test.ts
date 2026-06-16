/**
 * The beginner cheat-sheet data (ticket 0081): the pot-odds → equity pegs and the rule-of-2-and-4 figures
 * are DERIVED from `@holdem/odds`, never hand-typed. These tests re-derive each cell straight from
 * `potOdds` / `outsToEquity` and assert the table value equals it — so the moment a number is typed by
 * hand (or the engine's math changes and the table is not regenerated) this fails. The known pegs
 * (half-pot = 25%, pot-sized = 33%, a 9-out flush draw = 36%/18%) are pinned as the human cross-check.
 */

import { describe, expect, it } from 'vitest'
import { outsToEquity, potOdds } from '@holdem/odds'
import { NUMBER_SENSE_TERMS, OUTS_PEGS, POT_ODDS_PEGS, requiredEquityForBet } from './cheatSheet.js'

/** Round an equity fraction to a whole-percent string the same way the cheat-sheet renders it. */
function asPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

describe('cheatSheet — pot-odds → equity pegs are derived from @holdem/odds', () => {
  it('every required-equity cell equals potOdds for its bet fraction (nothing hand-typed)', () => {
    for (const peg of POT_ODDS_PEGS) {
      // Re-derive from the SAME convention the module uses: a bet of f·P into pot P → call f, pot 1+f.
      const call = peg.fraction
      const expected = asPercent(potOdds(call, 1 + call))
      expect(peg.requiredEquity).toBe(expected)
      // And the exported helper agrees with potOdds directly.
      expect(asPercent(requiredEquityForBet(peg.fraction))).toBe(expected)
    }
  })

  it('pins the canonical pegs: half-pot needs 25%, pot-sized needs 33% (the coach pricing)', () => {
    const byBet = new Map(POT_ODDS_PEGS.map((p) => [p.bet, p.requiredEquity]))
    // Half-pot = potOdds(0.5, 1.5) = 25%; pot-sized = potOdds(1, 2) = 33%; quarter-pot =
    // potOdds(0.25, 1.25) = 16.7% → 17% (the call is a quarter of the win-pot, not of the pre-bet pot).
    expect(byBet.get('Half pot')).toBe('25%')
    expect(byBet.get('Pot-sized')).toBe('33%')
    expect(byBet.get('Quarter pot')).toBe('17%')
  })

  it('covers the common bet sizes a beginner meets', () => {
    const bets = POT_ODDS_PEGS.map((p) => p.bet)
    for (const bet of ['Quarter pot', 'Half pot', 'Three-quarter pot', 'Pot-sized']) {
      expect(bets).toContain(bet)
    }
  })
})

describe('cheatSheet — rule-of-2-and-4 figures are derived from outsToEquity', () => {
  it('every flop/turn cell equals outsToEquity(outs, 2|1) (nothing hand-typed)', () => {
    for (const peg of OUTS_PEGS) {
      expect(peg.flop).toBe(asPercent(outsToEquity(peg.outs, 2)))
      expect(peg.turn).toBe(asPercent(outsToEquity(peg.outs, 1)))
    }
  })

  it('pins the canonical draw: a 9-out flush draw is ~36% on the flop, ~18% on the turn', () => {
    const flush = OUTS_PEGS.find((p) => p.outs === 9)
    expect(flush).toBeDefined()
    expect(flush!.flop).toBe('36%')
    expect(flush!.turn).toBe('18%')
  })
})

describe('cheatSheet — number-sense vocabulary', () => {
  it('adds the load-bearing beginner number-sense terms', () => {
    const terms = NUMBER_SENSE_TERMS.map((t) => t.term)
    for (const term of ['Equity', 'Pot odds', 'Break-even equity', 'Outs', 'EV']) {
      expect(terms).toContain(term)
    }
  })

  it('keeps the honest framing — no "makes no money" false universal', () => {
    for (const t of NUMBER_SENSE_TERMS) {
      expect(t.meaning.toLowerCase()).not.toMatch(/never makes money|makes no money/)
      expect(t.meaning.length).toBeGreaterThan(0)
    }
  })
})
