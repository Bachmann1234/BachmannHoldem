import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import { recommendedBand } from '@holdem/coach'
import { gradeSpot } from './grade.js'
import { synthesizeContext } from './spot.js'
import type {
  CalculationSpot,
  CoachSpot,
  HandReadingSpot,
  PreflopSpot,
  SizingSpot,
} from './spot.js'

function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

/** Join every step's detail into one searchable string. */
function steps(result: ReturnType<typeof gradeSpot>): string {
  return (result.workedSteps ?? []).map((s) => `${s.label}: ${s.detail}`).join('\n')
}

describe('workedSteps — postflop coach spot', () => {
  // Air facing a pot-sized bet — folding is correct, no draw, so equity is stated not derived.
  const AIR: CoachSpot = {
    kind: 'coach',
    prompt: 'Air, big price — call or fold?',
    choices: [
      { label: 'Call', action: { type: 'call' } },
      { label: 'Fold', action: { type: 'fold' } },
    ],
    context: {
      holeCards: hole('2c 3d'),
      board: parseCards('As Kd Qh'),
      pot: 50,
      toCall: 200,
      numActive: 3,
    },
  }

  it('walks price → equity → compare and lands on the fold', () => {
    const res = gradeSpot(AIR, 1)
    const labels = (res.workedSteps ?? []).map((s) => s.label)
    expect(labels).toEqual(['Price', 'Your equity', 'Compare'])
    const text = steps(res)
    expect(text).toContain('200 to call') // the price arithmetic
    expect(text).toContain("so it's a fold") // the shared priceComparison verdict wording
  })

  // Nut flush draw on the flop at a cheap price — the equity step counts outs (rule of 4).
  const FLUSH_DRAW: CoachSpot = {
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

  it('derives the equity from outs on a draw (rule of 4)', () => {
    const res = gradeSpot(FLUSH_DRAW, 0)
    const equity = (res.workedSteps ?? []).find((s) => s.label === 'Your equity')
    expect(equity).toBeDefined()
    expect(equity!.detail).toContain('flush draw')
    expect(equity!.detail).toContain('9 outs')
    expect(equity!.detail).toContain('rule of 4')
  })
})

describe('workedSteps — preflop spot', () => {
  const BUTTON_PREMIUM: PreflopSpot = {
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

  it('walks tier → chart → why', () => {
    const res = gradeSpot(BUTTON_PREMIUM, 0)
    expect((res.workedSteps ?? []).map((s) => s.label)).toEqual(['Tier', 'Chart', 'Why'])
    expect(steps(res)).toContain('premium') // AA sorts into the premium tier
  })
})

describe('workedSteps — calculation spot', () => {
  const POT_ODDS: CalculationSpot = {
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

  it('walks setup → total → price with the arithmetic', () => {
    const res = gradeSpot(POT_ODDS, 1)
    expect((res.workedSteps ?? []).map((s) => s.label)).toEqual(['Setup', 'Total', 'Price'])
    const text = steps(res)
    expect(text).toContain('90 + 30 = 120') // the total step
    expect(text).toContain('25.0%') // the derived price
  })
})

describe('workedSteps — hand-reading spot', () => {
  const READ: HandReadingSpot = {
    kind: 'hand-reading',
    prompt: 'What hand do you have?',
    concept: 'equity',
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    choices: [{ label: 'Two Pair' }, { label: 'Three of a Kind' }, { label: 'Straight' }],
  }

  it('walks your cards → board → best hand', () => {
    const res = gradeSpot(READ, 1)
    expect((res.workedSteps ?? []).map((s) => s.label)).toEqual([
      'Your cards',
      'The board',
      'Best hand',
    ])
    expect(steps(res)).toContain('Three of a Kind')
  })
})

describe('workedSteps — sizing spot', () => {
  const CONTEXT = {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 0,
    numActive: 2,
  } as const
  const band = recommendedBand(synthesizeContext(CONTEXT))
  const mid = Math.round((band.toLo + band.toHi) / 2)
  const SIZING: SizingSpot = {
    kind: 'sizing',
    prompt: "It's checked to you (pot 100). What size?",
    concept: 'pot-odds',
    choices: [
      { label: '¼ pot', toAmount: Math.round(0.25 * CONTEXT.pot) },
      { label: '½ pot', toAmount: mid },
      { label: '1.5× pot', toAmount: Math.round(1.5 * CONTEXT.pot) },
    ],
    context: CONTEXT,
  }

  it('walks pot → band → why', () => {
    const res = gradeSpot(SIZING, 1)
    expect((res.workedSteps ?? []).map((s) => s.label)).toEqual(['Pot', 'Band', 'Why'])
    expect(steps(res)).toContain('The pot is 100')
  })
})

describe('workedSteps — declarative spot has none', () => {
  it('omits worked steps for the authored carve-out', () => {
    const res = gradeSpot(
      {
        kind: 'declarative',
        prompt: 'Position matters because…',
        concept: 'position',
        explanation: 'Acting last gives you more information.',
        choices: [
          { label: 'You act last', correct: true },
          { label: 'You act first', correct: false },
        ],
      },
      0,
    )
    expect(res.workedSteps).toBeUndefined()
  })
})
