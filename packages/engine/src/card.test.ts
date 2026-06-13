import { describe, expect, it } from 'vitest'
import { formatCard, makeDeck, NUM_CARDS, parseCard, parseCards, rankOf, suitOf } from './card.js'

describe('card encoding', () => {
  it('builds a full, unique 52-card deck', () => {
    const deck = makeDeck()
    expect(deck).toHaveLength(NUM_CARDS)
    expect(new Set(deck).size).toBe(NUM_CARDS)
  })

  it('round-trips every card through format/parse', () => {
    for (const card of makeDeck()) {
      expect(parseCard(formatCard(card))).toBe(card)
    }
  })

  it('parses rank and suit correctly', () => {
    const ace = parseCard('As')
    expect(rankOf(ace)).toBe('A')
    expect(suitOf(ace)).toBe('s')

    const two = parseCard('2c')
    expect(rankOf(two)).toBe('2')
    expect(suitOf(two)).toBe('c')
  })

  it('parses a list of cards', () => {
    const cards = parseCards('As Kd 7h')
    expect(cards.map(formatCard)).toEqual(['As', 'Kd', '7h'])
  })

  it('rejects malformed input', () => {
    expect(() => parseCard('Xx')).toThrow()
    expect(() => parseCard('A')).toThrow()
    expect(() => parseCard('Ahh')).toThrow()
  })
})
