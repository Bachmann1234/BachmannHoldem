// @vitest-environment jsdom
/**
 * Card component tests (ticket 0034). The repo's vitest defaults to the `node` environment, so this
 * file opts into `jsdom` via the docblock above.
 *
 * Covers the rendered rank+suit, the four-color suit class mapped by suit LETTER (the load-bearing
 * pitfall — our `['c','d','h','s']` ordering does not match the design's spade-first ordering), the
 * glyphs, and the face-down back.
 */

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeCard, RANKS, SUITS, type Card as EngineCard } from '@holdem/engine'
import { Card, HiddenCard, SUIT_CLASS, SUIT_GLYPH } from './Card.js'

afterEach(cleanup)

/** Build a card from a rank label + suit letter. */
function card(rank: (typeof RANKS)[number], suit: (typeof SUITS)[number]): EngineCard {
  return makeCard(RANKS.indexOf(rank), SUITS.indexOf(suit))
}

describe('Card', () => {
  it('renders the rank and suit glyph for a face-up card', () => {
    const { getByTestId } = render(<Card card={card('A', 's')} />)
    const el = getByTestId('card')
    expect(el.textContent).toContain('A')
    expect(el.textContent).toContain('♠')
  })

  it('renders the ten as "10" on the card face, not the "T" notation (BUG-0003 follow-up)', () => {
    const { getByTestId } = render(<Card card={card('T', 'h')} />)
    const el = getByTestId('card')
    expect(el.textContent).toContain('10')
    expect(el.textContent).not.toContain('T')
    // The canonical single-char rank is still exposed for selectors/tests.
    expect(el.getAttribute('data-card')).toBe('Th')
  })

  it('maps each suit LETTER to its four-color class and glyph (not by index)', () => {
    for (const suit of SUITS) {
      const { getByTestId, unmount } = render(<Card card={card('K', suit)} />)
      const el = getByTestId('card')
      expect(el.className).toContain(SUIT_CLASS[suit])
      expect(el.textContent).toContain(SUIT_GLYPH[suit])
      unmount()
    }
    // The four colors are genuinely distinct classes (clubs green, diamonds blue, hearts red,
    // spades black) — the whole point of the four-color deck.
    expect(SUIT_CLASS.c).toBe('suit-club')
    expect(SUIT_CLASS.d).toBe('suit-diamond')
    expect(SUIT_CLASS.h).toBe('suit-heart')
    expect(SUIT_CLASS.s).toBe('suit-spade')
  })

  it('applies the requested size class', () => {
    const { getByTestId } = render(<Card card={card('2', 'c')} size="lg" />)
    expect(getByTestId('card').className).toContain('lg')
  })

  it('renders a face-down back with no rank/suit text', () => {
    const { getByTestId, queryByTestId } = render(<HiddenCard size="sm" />)
    expect(getByTestId('card-back').className).toContain('back')
    expect(queryByTestId('card')).toBeNull()
  })
})
