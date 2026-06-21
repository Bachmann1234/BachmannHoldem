import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { recommendedBand } from '@holdem/coach'
import { gradeSpot } from './grade.js'
import { serializeDrillSpot, parseDrillSpot } from './serialize.js'
import { synthesizeContext } from './spot.js'
import type {
  CalculationSpot,
  CoachSpot,
  HandReadingSpot,
  PreflopSpot,
  SizingSpot,
  Spot,
} from './spot.js'

function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

const COACH: CoachSpot = {
  kind: 'coach',
  prompt: 'Nut flush draw, cheap price — call or fold?',
  choices: [
    { label: 'Call', action: { type: 'call' } },
    { label: 'Fold', action: { type: 'fold' } },
  ],
  context: {
    holeCards: hole('Ah Kh'),
    board: parseCards('2h 7h 9c'),
    pot: 100,
    toCall: 30,
    numActive: 2,
  },
}

const PREFLOP: PreflopSpot = {
  kind: 'preflop',
  prompt: 'On the button with AA — open or fold?',
  choices: [
    { label: 'Open', action: { type: 'raise', amount: 6 } },
    { label: 'Fold', action: { type: 'fold' } },
  ],
  holeCards: hole('As Ah'),
  seat: 1,
  buttonIndex: 1,
  numPlayers: 6,
}

const CALCULATION: CalculationSpot = {
  kind: 'calculation',
  prompt: '30 to call into a 90 pot — what is the price?',
  quantity: 'pot-odds',
  concept: 'pot-odds',
  choices: [
    { label: '10–20%', lo: 0.1, hi: 0.2 },
    { label: '20–30%', lo: 0.2, hi: 0.3 },
    { label: '30–40%', lo: 0.3, hi: 0.4 },
  ],
  context: {
    holeCards: hole('Ah Kd'),
    board: parseCards('As 7c 2d'),
    pot: 90,
    toCall: 30,
    numActive: 2,
  },
}

const HAND_READING: HandReadingSpot = {
  kind: 'hand-reading',
  prompt: 'What hand do you have?',
  concept: 'equity',
  holeCards: hole('As Ah'),
  board: parseCards('Ac Kd 7h'),
  choices: [{ label: 'Two Pair' }, { label: 'Three of a Kind' }, { label: 'Straight' }],
}

function sizingSpot(): SizingSpot {
  const context = {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 0,
    numActive: 2,
  } as const
  const band = recommendedBand(synthesizeContext(context))
  const mid = Math.round((band.toLo + band.toHi) / 2)
  return {
    kind: 'sizing',
    prompt: "It's checked to you (pot 100). What size?",
    concept: 'pot-odds',
    choices: [
      { label: '¼ pot', toAmount: Math.round(0.25 * context.pot) },
      { label: '½ pot', toAmount: mid },
      { label: '1.5× pot', toAmount: Math.round(1.5 * context.pot) },
    ],
    context,
  }
}

/** Every spot kind paired with a chosen index, so the round-trip is proven across the union. */
const CASES: ReadonlyArray<{ name: string; spot: Spot; chosenIndex: number }> = [
  { name: 'coach', spot: COACH, chosenIndex: 0 },
  { name: 'preflop', spot: PREFLOP, chosenIndex: 1 },
  { name: 'calculation', spot: CALCULATION, chosenIndex: 2 },
  { name: 'hand-reading', spot: HAND_READING, chosenIndex: 0 },
  { name: 'sizing', spot: sizingSpot(), chosenIndex: 1 },
]

describe('serializeDrillSpot / parseDrillSpot', () => {
  it('produces human-readable JSON with cards as strings', () => {
    const blob = serializeDrillSpot(COACH, gradeSpot(COACH, 0))
    expect(blob).toContain('"kind": "holdem-drill-spot-report"')
    expect(blob).toContain('"Ah"') // cards rendered as readable strings, not raw ints
    expect(blob).toContain('"2h"')
    expect(blob).toContain('"workedSteps"') // the steps the report is most often about
  })

  it.each(CASES)(
    'round-trips a $name spot to a byte-identical re-grade',
    ({ spot, chosenIndex }) => {
      const original = gradeSpot(spot, chosenIndex)
      const blob = serializeDrillSpot(spot, original)

      const { spot: parsed, chosenIndex: parsedIndex } = parseDrillSpot(blob)
      expect(parsedIndex).toBe(chosenIndex)

      // The cardinal property: the parsed spot re-grades to exactly what the learner reported — same
      // correctness, same canonical answer, same explanation, and the SAME worked steps (the wording the
      // bug report is about). This is what makes the blob a reproducible artifact.
      const regraded = gradeSpot(parsed, parsedIndex)
      expect(regraded.correct).toBe(original.correct)
      expect(regraded.correctIndex).toBe(original.correctIndex)
      expect(regraded.concept).toBe(original.concept)
      expect(regraded.explanation).toBe(original.explanation)
      expect(regraded.workedSteps).toEqual(original.workedSteps)
    },
  )

  it('rejects a blob that is not a drill-spot report', () => {
    expect(() => parseDrillSpot('{"kind":"something-else"}')).toThrow(/kind/)
    expect(() => parseDrillSpot('not json at all')).toThrow()
    expect(() =>
      parseDrillSpot(JSON.stringify({ kind: 'holdem-drill-spot-report', schemaVersion: 999 })),
    ).toThrow(/schema version/)
  })
})
