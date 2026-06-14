import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { synthesizeContext, type SpotContext } from './spot.js'

/** Two distinct cards as a hole-card tuple for a context. */
function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

/** A valid baseline coach context, overridable per assertion. */
function ctx(overrides: Partial<SpotContext> = {}): SpotContext {
  return {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 25,
    numActive: 2,
    ...overrides,
  }
}

describe('synthesizeContext', () => {
  it('forwards the five coach-read fields untouched (no pot/toCall double-count)', () => {
    const out = synthesizeContext(ctx({ pot: 80, toCall: 20, numActive: 3 }))
    expect(out.pot).toBe(80)
    expect(out.toCall).toBe(20) // forwarded as-is, NOT folded into pot
    expect(out.numActive).toBe(3)
    expect(out.holeCards).toEqual(hole('As Ah'))
    expect(out.board).toEqual(parseCards('Ac Kd 7h'))
  })

  it('derives street from board size', () => {
    expect(synthesizeContext(ctx({ board: [] })).street).toBe('preflop')
    expect(synthesizeContext(ctx({ board: parseCards('Ac Kd 7h') })).street).toBe('flop')
    expect(synthesizeContext(ctx({ board: parseCards('Ac Kd 7h 2s') })).street).toBe('turn')
    expect(synthesizeContext(ctx({ board: parseCards('Ac Kd 7h 2s 9c') })).street).toBe('river')
  })

  it('applies inert seat defaults for the postflop path', () => {
    const out = synthesizeContext(ctx())
    expect(out.seat).toBe(0)
    expect(out.buttonIndex).toBe(0)
    expect(out.numPlayers).toBe(2)
    expect(out.isButton).toBe(true)
    expect(out.opponents).toEqual([])
  })

  it('honours supplied seat geometry (the preflop path)', () => {
    const out = synthesizeContext(ctx({ board: [] }), { seat: 2, buttonIndex: 5, numPlayers: 6 })
    expect(out.seat).toBe(2)
    expect(out.buttonIndex).toBe(5)
    expect(out.numPlayers).toBe(6)
    expect(out.isButton).toBe(false)
  })

  it('synthesises consistent legal actions for a free vs priced spot', () => {
    const free = synthesizeContext(ctx({ toCall: 0 })).legalActions
    expect(free.check).toBe(true)
    expect(free.fold).toBe(false)
    expect(free.call).toBeNull()
    expect(free.bet).not.toBeNull()

    const priced = synthesizeContext(ctx({ toCall: 25 })).legalActions
    expect(priced.check).toBe(false)
    expect(priced.fold).toBe(true)
    expect(priced.call).toEqual({ amount: 25 })
    expect(priced.raise).not.toBeNull()
  })

  it('rejects malformed spots in the RangeError idiom', () => {
    expect(() => synthesizeContext(ctx({ holeCards: [parseCards('As')[0]!] as never }))).toThrow(
      RangeError,
    )
    expect(() => synthesizeContext(ctx({ holeCards: hole('As As') }))).toThrow(RangeError)
    expect(() => synthesizeContext(ctx({ board: parseCards('Ac Kd') }))).toThrow(/board/)
    expect(() => synthesizeContext(ctx({ pot: -1 }))).toThrow(/pot/)
    expect(() => synthesizeContext(ctx({ toCall: -5 }))).toThrow(/toCall/)
    expect(() => synthesizeContext(ctx({ numActive: 1 }))).toThrow(/numActive/)
  })
})
