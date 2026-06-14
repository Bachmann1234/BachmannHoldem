import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { firstUnansweredSpotIndex, type Lesson } from './lesson.js'
import type { CoachSpot } from './spot.js'

function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

function spot(prompt: string): CoachSpot {
  return {
    kind: 'coach',
    prompt,
    choices: [{ label: 'Call', action: { type: 'call' } }],
    context: {
      holeCards: hole('As Ah'),
      board: parseCards('Ac Kd 7h'),
      pot: 100,
      toCall: 10,
      numActive: 2,
    },
  }
}

const LESSON: Lesson = {
  id: 'pot-odds',
  title: 'Pot odds',
  explanation: 'The price a call lays is the minimum equity it needs.',
  concept: 'pot-odds',
  spots: [spot('one'), spot('two'), spot('three')],
}

describe('firstUnansweredSpotIndex', () => {
  it('returns the first unanswered index', () => {
    expect(firstUnansweredSpotIndex(LESSON, [true, false, false])).toBe(1)
    expect(firstUnansweredSpotIndex(LESSON, [])).toBe(0)
  })

  it('returns -1 when every spot is answered', () => {
    expect(firstUnansweredSpotIndex(LESSON, [true, true, true])).toBe(-1)
  })
})
