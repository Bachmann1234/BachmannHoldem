import { describe, expect, it } from 'vitest'
import { parseCards, formatCard, suitIndex, type Card } from '@holdem/engine'
import { exactEquity } from './equity.js'
import {
  potOdds,
  outsToEquity,
  countOuts,
  countDrawOuts,
  evOfCall,
  evOfBet,
  callIsProfitable,
  evaluateCall,
} from './decisions.js'

/** Parse a two-card hand string into the fixed tuple the helpers expect. */
function hand(text: string): [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

describe('potOdds', () => {
  it('needs 1/3 equity to call 50 into a pot of 100 (the textbook spot)', () => {
    // Risk 50 to win 100 + your own 50 back = play for 150 → 50/150 = 0.3333…
    expect(potOdds(50, 100)).toBeCloseTo(1 / 3, 10)
  })

  it('needs 1/4 equity for a pot-sized-bet pot (call X into 3X)', () => {
    expect(potOdds(100, 300)).toBeCloseTo(0.25, 10)
  })

  it('is exactly 0.5 when the call equals the pot (call P into P)', () => {
    expect(potOdds(100, 100)).toBe(0.5)
  })

  it('a free call (callAmount 0) needs no equity', () => {
    expect(potOdds(0, 100)).toBe(0)
  })

  it('rejects negative amounts and a 0/0 spot', () => {
    expect(() => potOdds(-1, 100)).toThrow(/callAmount/)
    expect(() => potOdds(50, -1)).toThrow(/pot/)
    expect(() => potOdds(0, 0)).toThrow(/undefined/)
  })
})

describe('outsToEquity — rule of 2 and 4', () => {
  it('approximates a 9-out flush draw at ~36% on the flop / ~18% on the turn', () => {
    expect(outsToEquity(9, 2)).toBeCloseTo(0.36, 10) // two cards to come (×4%)
    expect(outsToEquity(9, 1)).toBeCloseTo(0.18, 10) // one card to come (×2%)
  })

  it('approximates an 8-out open-ender at ~32% / ~16%', () => {
    expect(outsToEquity(8, 2)).toBeCloseTo(0.32, 10)
    expect(outsToEquity(8, 1)).toBeCloseTo(0.16, 10)
  })

  it('clamps to 1 when the naive product would exceed 100%', () => {
    expect(outsToEquity(30, 2)).toBe(1) // 30 × 4% = 120% → clamped
  })

  it('rejects a non-integer/negative out count or a bad cardsToCome', () => {
    expect(() => outsToEquity(1.5, 2)).toThrow(/integer/)
    expect(() => outsToEquity(-1, 2)).toThrow(/non-negative/)
    // @ts-expect-error — 3 is not a legal cardsToCome
    expect(() => outsToEquity(9, 3)).toThrow(/cardsToCome/)
  })
})

describe('countOuts', () => {
  // AhKh (nut flush draw + two overcards) vs QsQd on 2h 7h 9c Td (turn, one to come).
  const hero = hand('Ah Kh')
  const villain = hand('Qs Qd')
  const turnBoard = parseCards('2h 7h 9c Td')

  it('counts 15 outs to beat QQ on the turn: 9 hearts + 3 aces + 3 kings', () => {
    const result = countOuts(hero, villain, turnBoard)
    expect(result.outs).toBe(15)
    expect(result.cards).toHaveLength(15)

    const hearts = result.cards.filter((c) => suitIndex(c) === 2)
    expect(hearts).toHaveLength(9) // every remaining heart completes the nut flush
    // The Queen of hearts is an out: it pairs villain's queens but completes hero's
    // flush, which wins — counting it proves we compare made hands, not draws.
    expect(result.cards.map(formatCard)).toContain('Qh')
  })

  it('agrees exactly with exactEquity: counted outs / remaining cards == next-card equity', () => {
    // On the turn the only randomness is the single river card, so hero's exact equity
    // is precisely (winning rivers) / (remaining cards). 44 cards remain (52 − 2 − 2 − 4).
    const result = countOuts(hero, villain, turnBoard)
    const [heroEquity] = exactEquity({ hands: [hero, villain], board: turnBoard })
    expect(result.outs / 44).toBeCloseTo(heroEquity!.equity, 12)
    expect(result.outs).toBe(15)
    expect(heroEquity!.tie).toBe(0) // no chops here, so outs and equity line up cleanly
  })

  it('counts the same 15 outs as next-card outs on the flop', () => {
    // The *next* card outs are identical on the flop (the draw is the same); only the
    // two-cards-to-come equity differs, which is exactEquity's job, not countOuts'.
    const flop = parseCards('2h 7h 9c')
    expect(countOuts(hero, villain, flop).outs).toBe(15)
  })

  it('a card that only ties the opponent is NOT an out (strict-beat definition)', () => {
    // Hero KhQh vs villain KsQs on Jh Th 2c 5d: both have K-Q, both can make the same
    // straight / pairs; any non-flush river chops. Hero's outs are exactly the hearts
    // that make a flush villain cannot match — never the chopping cards.
    const h = hand('Kh Qh')
    const v = hand('Ks Qs')
    const board = parseCards('Jh Th 2c 5d')
    const result = countOuts(h, v, board)
    // Every out must be a heart (the only way to break the symmetry in hero's favour).
    expect(result.cards.every((c) => suitIndex(c) === 2)).toBe(true)
    expect(result.outs).toBeGreaterThan(0)
  })

  it('rejects an illegal board size and duplicate cards', () => {
    expect(() => countOuts(hero, villain, parseCards('2h 7h 9c Td 3s'))).toThrow(/flop.*turn|3.*4/)
    expect(() => countOuts(hand('Ah Kh'), hand('Ah Qd'), parseCards('2h 7h 9c'))).toThrow(
      /duplicate/i,
    )
  })
})

describe('countDrawOuts', () => {
  it('reads a nut flush draw as 9 outs on the flop', () => {
    // AhKh on 2h 7h 9c — four hearts (two of them hero's), so every remaining heart completes.
    const draw = countDrawOuts(hand('Ah Kh'), parseCards('2h 7h 9c'))
    expect(draw).not.toBeNull()
    expect(draw!.type).toBe('flush')
    expect(draw!.outs).toBe(9)
    expect(draw!.cards.every((c) => suitIndex(c) === 2)).toBe(true) // all hearts
  })

  it('still reads the flush draw as 9 outs on the turn (one card to come)', () => {
    const draw = countDrawOuts(hand('Ah Kh'), parseCards('2h 7h 9c Td'))
    expect(draw!.type).toBe('flush')
    expect(draw!.outs).toBe(9)
  })

  it('reads an open-ended straight draw as 8 outs (two completing ranks)', () => {
    // 9h8c on 7d 6s 2c — 9-8-7-6 open at both ends, filled by any Ten or any Five.
    const draw = countDrawOuts(hand('9h 8c'), parseCards('7d 6s 2c'))
    expect(draw!.type).toBe('open-ender')
    expect(draw!.outs).toBe(8)
  })

  it('reads a gutshot as 4 outs (one completing rank)', () => {
    // JhTc on 8c 7d 2s — only a Nine fills J-T-9-8-7.
    const draw = countDrawOuts(hand('Jh Tc'), parseCards('8c 7d 2s'))
    expect(draw!.type).toBe('gutshot')
    expect(draw!.outs).toBe(4)
  })

  it('reads a combo draw (flush + straight) and sums both', () => {
    // 9h8h on 7h 6h 2c — four hearts (9 flush outs) AND a 9-8-7-6 open-ender whose
    // non-heart Tens and Fives (6) are straight outs; the heart T/5 are flush outs already.
    const draw = countDrawOuts(hand('9h 8h'), parseCards('7h 6h 2c'))
    expect(draw!.type).toBe('combo')
    expect(draw!.outs).toBe(15)
  })

  it('returns null for a made hand (a flush is not a draw)', () => {
    expect(countDrawOuts(hand('Ah Kh'), parseCards('2h 7h 9h'))).toBeNull()
  })

  it('returns null when there is no flush or straight draw', () => {
    expect(countDrawOuts(hand('Ah Kc'), parseCards('2d 7s 9h'))).toBeNull()
  })

  it('does not credit hero with a flush draw they do not share (board four-flush)', () => {
    // Board has four diamonds; hero holds none, so this is not hero's draw.
    expect(countDrawOuts(hand('Ah Kc'), parseCards('2d 7d 9d Td'))).toBeNull()
  })

  it('rejects an illegal board size', () => {
    expect(() => countDrawOuts(hand('Ah Kh'), parseCards('2h 7h 9c Td 3s'))).toThrow(
      /flop.*turn|3.*4/,
    )
  })
})

describe('evOfCall / callIsProfitable / potOdds agree at the threshold', () => {
  it('a clear +EV call: 60% equity calling 50 into 100', () => {
    const spot = { equity: 0.6, pot: 100, callAmount: 50 }
    // EV = 0.6*(100+50) − 50 = 90 − 50 = +40 (win the 100 dead money 60% of the time,
    // lose your own 50 the other 40%: 0.6*100 − 0.4*50 = 60 − 20 = 40).
    expect(evOfCall(spot)).toBeCloseTo(40, 10)
    expect(spot.equity).toBeGreaterThan(potOdds(spot.callAmount, spot.pot))
    expect(callIsProfitable(spot)).toBe(true)
  })

  it('a clear −EV call: 20% equity calling 50 into 100', () => {
    const spot = { equity: 0.2, pot: 100, callAmount: 50 }
    // EV = 0.2*(100+50) − 50 = 30 − 50 = −20 (win 100 only 20%, lose 50 the other 80%:
    // 0.2*100 − 0.8*50 = 20 − 40 = −20).
    expect(evOfCall(spot)).toBeCloseTo(-20, 10)
    expect(spot.equity).toBeLessThan(potOdds(spot.callAmount, spot.pot))
    expect(callIsProfitable(spot)).toBe(false)
  })

  it('the break-even spot: equity exactly equals the pot odds → EV 0, profitable (non-strict)', () => {
    const callAmount = 50
    const pot = 100
    const threshold = potOdds(callAmount, pot) // 1/3
    const spot = { equity: threshold, pot, callAmount }
    expect(evOfCall(spot)).toBeCloseTo(0, 10)
    expect(callIsProfitable(spot)).toBe(true) // `>=` makes break-even count as profitable
    // A hair below the threshold flips both the EV sign and the verdict.
    const justBelow = { equity: threshold - 1e-6, pot, callAmount }
    expect(evOfCall(justBelow)).toBeLessThan(0)
    expect(callIsProfitable(justBelow)).toBe(false)
  })

  it('evOfCall and callIsProfitable never disagree on sign (no contradictions)', () => {
    for (const equity of [0, 0.1, 1 / 3, 0.34, 0.5, 0.9, 1]) {
      const spot = { equity, pot: 100, callAmount: 50 }
      expect(callIsProfitable(spot)).toBe(evOfCall(spot) >= 0)
    }
  })

  it('a free call is always profitable and never loses chips', () => {
    const spot = { equity: 0, pot: 100, callAmount: 0 }
    expect(evOfCall(spot)).toBe(0)
    expect(callIsProfitable(spot)).toBe(true)
  })

  it('rejects out-of-range equity and negative chips', () => {
    expect(() => evOfCall({ equity: 1.5, pot: 100, callAmount: 50 })).toThrow(/equity/)
    expect(() => evOfCall({ equity: 0.5, pot: -1, callAmount: 50 })).toThrow(/pot/)
    expect(() => callIsProfitable({ equity: 0.5, pot: 100, callAmount: -1 })).toThrow(/callAmount/)
  })
})

describe('evOfBet', () => {
  it('with no fold equity (villain always calls) matches the call-shaped EV', () => {
    // EV = 0.6*(100 + 2*50) − 50 = 0.6*200 − 50 = +70, the same accounting as evOfCall.
    expect(evOfBet({ equity: 0.6, pot: 100, betAmount: 50 })).toBeCloseTo(70, 10)
    expect(
      evOfBet({ equity: 0.6, pot: 100, betAmount: 50, villainCallProbability: 1 }),
    ).toBeCloseTo(70, 10)
  })

  it('credits fold equity: a worse hand can still bet profitably when villain often folds', () => {
    // 30% equity when called, but villain folds 60% of the time.
    // EV = 0.4*(0.3*200 − 50) + 0.6*100 = 0.4*10 + 60 = 4 + 60 = +64
    const spot = { equity: 0.3, pot: 100, betAmount: 50, villainCallProbability: 0.4 }
    expect(evOfBet(spot)).toBeCloseTo(64, 10)
    // The same hand merely calling (no fold equity to win) is −EV.
    expect(evOfCall({ equity: 0.3, pot: 100, callAmount: 50 })).toBeLessThan(0)
  })

  it('when villain never calls the bet just scoops the pot', () => {
    expect(evOfBet({ equity: 0, pot: 100, betAmount: 50, villainCallProbability: 0 })).toBe(100)
  })

  it('rejects out-of-range equity / probability and negative chips', () => {
    expect(() => evOfBet({ equity: -0.1, pot: 100, betAmount: 50 })).toThrow(/equity/)
    expect(() =>
      evOfBet({ equity: 0.5, pot: 100, betAmount: 50, villainCallProbability: 2 }),
    ).toThrow(/villainCallProbability/)
    expect(() => evOfBet({ equity: 0.5, pot: 100, betAmount: -1 })).toThrow(/betAmount/)
  })
})

describe('evaluateCall — end-to-end on a known spot', () => {
  it('turns a fully-known turn spot into equity, threshold, EV, and verdict', () => {
    // AhKh vs QsQd on the turn 2h 7h 9c Td: hero has 15/44 ≈ 34.1% equity.
    const hero = hand('Ah Kh')
    const villain = hand('Qs Qd')
    const board = parseCards('2h 7h 9c Td')

    // Getting 2-to-1 (call 50 into 100, threshold 33.3%) the draw is a (thin) +EV call.
    const good = evaluateCall(hero, villain, board, 100, 50)
    expect(good.equity.equity).toBeCloseTo(15 / 44, 12)
    expect(good.threshold).toBeCloseTo(1 / 3, 10)
    expect(good.ev).toBeGreaterThan(0)
    expect(good.profitable).toBe(true)

    // Facing a pot-sized bet (call 100 into 100, threshold 50%) the same draw is −EV.
    const bad = evaluateCall(hero, villain, board, 100, 100)
    expect(bad.threshold).toBe(0.5)
    expect(bad.ev).toBeLessThan(0)
    expect(bad.profitable).toBe(false)
  })
})
