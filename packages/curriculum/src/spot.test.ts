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

  it('builds an unraised pot by default (currentBet === bigBlind on the preflop path)', () => {
    // No facingRaiseBb ⇒ the pre-existing behaviour: a preflop open synthesises currentBet from the
    // (zero) toCall, so it never exceeds the big blind — gradePreflop reads this as an unraised pot.
    const out = synthesizeContext(ctx({ board: [], pot: 0, toCall: 0 }), {
      seat: 0,
      buttonIndex: 3,
      numPlayers: 6,
    })
    expect(out.currentBet).toBeLessThanOrEqual(out.bigBlind)
    expect(out.currentBet).toBe(0) // byte-for-byte the old synthesis (currentBet = toCall = 0)
    expect(out.pot).toBe(0)
  })

  it('threads facingRaiseBb into a raised context (currentBet > bigBlind, rounds back to the size)', () => {
    const out = synthesizeContext(ctx({ board: [], pot: 0, toCall: 0 }), {
      seat: 5,
      buttonIndex: 3,
      numPlayers: 6,
      facingRaiseBb: 6,
    })
    // currentBet must exceed the big blind so gradePreflop's facingRaise test fires…
    expect(out.currentBet).toBeGreaterThan(out.bigBlind)
    // …and round(currentBet / bigBlind) must recover exactly the authored size.
    expect(Math.round(out.currentBet / out.bigBlind)).toBe(6)
    // toCall is the whole raise (the hero is uncommitted) and the pot is the coherent blinds + raise.
    expect(out.toCall).toBe(out.currentBet)
    expect(out.pot).toBe(out.smallBlind + out.bigBlind + out.currentBet)
  })

  it('rejects a facingRaiseBb that is not actually a raise', () => {
    expect(() =>
      synthesizeContext(ctx({ board: [] }), {
        seat: 0,
        buttonIndex: 3,
        numPlayers: 6,
        facingRaiseBb: 1,
      }),
    ).toThrow(/facingRaiseBb/)
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
