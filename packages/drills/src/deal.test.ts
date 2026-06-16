import { describe, expect, it } from 'vitest'
import { makeDeck, type Card } from '@holdem/engine'
import { BOARD_SIZE, makeDealer } from './deal.js'

describe('makeDealer', () => {
  it('rejects a non-integer seed (the determinism contract fails loudly)', () => {
    expect(() => makeDealer(1.5)).toThrow(RangeError)
    expect(() => makeDealer(Number.NaN)).toThrow(RangeError)
  })

  it('is deterministic: the same seed deals byte-identical cards in order', () => {
    const a = makeDealer(42)
    const b = makeDealer(42)
    expect(a.deal(10)).toEqual(b.deal(10))
    expect(a.dealHole()).toEqual(b.dealHole())
    expect(a.dealBoard('flop')).toEqual(b.dealBoard('flop'))
  })

  it('different seeds (almost always) deal different orders', () => {
    expect(makeDealer(1).deal(10)).not.toEqual(makeDealer(2).deal(10))
  })

  it('deals without replacement — every dealt card is distinct', () => {
    const dealer = makeDealer(7)
    const cards = dealer.deal(52)
    expect(new Set(cards).size).toBe(52)
    // It is a permutation of a real deck, so the SET of cards equals a fresh deck's.
    expect(new Set(cards)).toEqual(new Set<Card>(makeDeck()))
  })

  it('hole + board dealt off one dealer never collide', () => {
    const dealer = makeDealer(99)
    const hole = dealer.dealHole()
    const board = dealer.dealBoard('river')
    const all = [...hole, ...board]
    expect(new Set(all).size).toBe(all.length)
  })

  it('dealBoard sizes the board to the street', () => {
    expect(makeDealer(1).dealBoard('preflop')).toHaveLength(BOARD_SIZE.preflop)
    expect(makeDealer(1).dealBoard('flop')).toHaveLength(BOARD_SIZE.flop)
    expect(makeDealer(1).dealBoard('turn')).toHaveLength(BOARD_SIZE.turn)
    expect(makeDealer(1).dealBoard('river')).toHaveLength(BOARD_SIZE.river)
  })

  it('nextInt draws within [0, n) and validates its bound', () => {
    const dealer = makeDealer(3)
    for (let i = 0; i < 50; i++) {
      const v = dealer.nextInt(5)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(5)
      expect(Number.isInteger(v)).toBe(true)
    }
    expect(() => dealer.nextInt(0)).toThrow(RangeError)
    expect(() => dealer.nextInt(-1)).toThrow(RangeError)
    expect(() => dealer.nextInt(2.5)).toThrow(RangeError)
  })

  it('deal validates its count and never overruns the deck', () => {
    const dealer = makeDealer(3)
    expect(() => dealer.deal(-1)).toThrow(RangeError)
    expect(() => dealer.deal(1.5)).toThrow(RangeError)
    expect(() => dealer.deal(53)).toThrow(RangeError)
    // Drain the deck, then any further deal overruns.
    dealer.deal(52)
    expect(() => dealer.deal(1)).toThrow(RangeError)
  })

  it('deal(0) is a legal no-op (the preflop board)', () => {
    expect(makeDealer(1).deal(0)).toEqual([])
  })
})
