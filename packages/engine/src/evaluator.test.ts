import { describe, expect, it } from 'vitest'
import { makeDeck, parseCards, type Card } from './card.js'
import {
  compareHands,
  describeHand,
  evaluate5,
  evaluate7,
  HandCategory,
  pickWinners,
  type HandValue,
} from './evaluator.js'

const hand = (text: string): HandValue => evaluate7(parseCards(text))
const cat = (text: string): HandCategory => hand(text).category

describe('5-card categorisation', () => {
  it('recognises every category', () => {
    expect(cat('As Ks Qs Js Ts')).toBe(HandCategory.StraightFlush)
    expect(cat('9h 9s 9d 9c 2h')).toBe(HandCategory.FourOfAKind)
    expect(cat('Kh Ks Kd 4c 4h')).toBe(HandCategory.FullHouse)
    expect(cat('2h 7h 9h Jh Kh')).toBe(HandCategory.Flush)
    expect(cat('5c 6d 7h 8s 9c')).toBe(HandCategory.Straight)
    expect(cat('Qh Qs Qd 7c 2h')).toBe(HandCategory.ThreeOfAKind)
    expect(cat('Jh Js 4d 4c 9h')).toBe(HandCategory.TwoPair)
    expect(cat('Th Ts 8d 5c 2h')).toBe(HandCategory.Pair)
    expect(cat('Ah Kc 9d 6s 2h')).toBe(HandCategory.HighCard)
  })

  it('handles the wheel (A-2-3-4-5) as a Five-high straight', () => {
    const wheel = hand('Ah 2c 3d 4s 5h')
    expect(wheel.category).toBe(HandCategory.Straight)
    // A Six-high straight must beat the wheel.
    expect(compareHands(hand('2c 3d 4s 5h 6c'), wheel)).toBeGreaterThan(0)
    // The wheel is the weakest straight: weaker than a Six-high one.
    expect(wheel.ranks[0]).toBe(3) // rank index of the Five
  })

  it('handles the steel wheel (A-2-3-4-5 suited) as a straight flush', () => {
    const steel = hand('Ah 2h 3h 4h 5h')
    expect(steel.category).toBe(HandCategory.StraightFlush)
    // The royal-adjacent 6-high straight flush beats the steel wheel.
    expect(compareHands(hand('2h 3h 4h 5h 6h'), steel)).toBeGreaterThan(0)
  })
})

describe('tie-breaking by kickers', () => {
  it('ranks pairs by kicker', () => {
    const acesKingKicker = hand('Ah Ad Kc 5d 2h')
    const acesQueenKicker = hand('Ah Ad Qc 5d 2h')
    expect(compareHands(acesKingKicker, acesQueenKicker)).toBeGreaterThan(0)
  })

  it('ranks two pair by the higher pair, then lower pair, then kicker', () => {
    expect(compareHands(hand('Ah Ad 2c 2d 9h'), hand('Kh Kd Qc Qd Jh'))).toBeGreaterThan(0)
    expect(compareHands(hand('Kh Kd Qc Qd Ah'), hand('Kh Kd Jc Jd Ah'))).toBeGreaterThan(0)
    expect(compareHands(hand('Kh Kd Qc Qd Ah'), hand('Kh Kd Qc Qd 9h'))).toBeGreaterThan(0)
  })

  it('ranks flushes by their high cards', () => {
    expect(compareHands(hand('Ah 7h 5h 4h 2h'), hand('Kh Qh Jh 9h 7h'))).toBeGreaterThan(0)
  })

  it('ranks full houses by trips first, then the pair', () => {
    expect(compareHands(hand('5h 5d 5c Kh Kd'), hand('4h 4d 4c Ah Ad'))).toBeGreaterThan(0)
    expect(compareHands(hand('5h 5d 5c Ah Ad'), hand('5h 5d 5c Kh Kd'))).toBeGreaterThan(0)
  })

  it('treats genuinely equal hands as an exact tie', () => {
    // Same hand, different suits -> identical score (chopped pot).
    expect(compareHands(hand('Ah Ad Kc Qd Jh'), hand('As Ac Kd Qh Js'))).toBe(0)
  })
})

describe('best-of-7 selection', () => {
  it('picks the best five from seven cards', () => {
    // Board pairs the board; player makes a flush with hole cards.
    const flush = hand('Ah Kh 2h 7h 9h 3c 4d')
    expect(flush.category).toBe(HandCategory.Flush)
  })

  it('finds a straight that uses both hole cards and the board', () => {
    const straight = hand('6c 5d Ah 7h 8s 9c Kd')
    expect(straight.category).toBe(HandCategory.Straight)
    expect(straight.ranks[0]).toBe(7) // Nine-high straight (rank index 7)
  })

  it('prefers the higher category when several are available', () => {
    // Quads beat the flush also present on this board.
    const quads = hand('9h 9s 9d 9c Kh Kd Kc')
    expect(quads.category).toBe(HandCategory.FourOfAKind)
  })

  it('accepts 5, 6, and 7 card hands', () => {
    expect(() => evaluate7(parseCards('Ah Kh Qh Jh Th'))).not.toThrow()
    expect(() => evaluate7(parseCards('Ah Kh Qh Jh Th 2c'))).not.toThrow()
    expect(() => evaluate7(parseCards('Ah Kh Qh Jh Th 2c 3d'))).not.toThrow()
    expect(() => evaluate7(parseCards('Ah Kh Qh Jh'))).toThrow()
    expect(() => evaluate7(parseCards('Ah Kh Qh Jh Th 2c 3d 4d'))).toThrow()
  })
})

describe('showdown winners', () => {
  it('returns the single strongest hand index', () => {
    const hands = [hand('Ah Ad Kc Qd Jh'), hand('Kh Kd Qc Jd 9h'), hand('7c 3d 4s 8h Jc')]
    expect(pickWinners(hands)).toEqual([0])
  })

  it('returns multiple indices on a chopped pot', () => {
    const hands = [hand('Ah Ad Kc Qd Jh'), hand('As Ac Kd Qh Js'), hand('Kh Kd Qc Jd Th')]
    expect(pickWinners(hands)).toEqual([0, 1])
  })

  it('throws on no contenders', () => {
    expect(() => pickWinners([])).toThrow()
  })
})

describe('category ordering is strictly monotonic', () => {
  // One representative hand per category, weakest -> strongest.
  const ladder: [HandCategory, string][] = [
    [HandCategory.HighCard, 'Ah Kc 9d 6s 2h'],
    [HandCategory.Pair, 'Th Ts 8d 5c 2h'],
    [HandCategory.TwoPair, 'Jh Js 4d 4c 9h'],
    [HandCategory.ThreeOfAKind, 'Qh Qs Qd 7c 2h'],
    [HandCategory.Straight, '5c 6d 7h 8s 9c'],
    [HandCategory.Flush, '2h 7h 9h Jh Kh'],
    [HandCategory.FullHouse, 'Kh Ks Kd 4c 4h'],
    [HandCategory.FourOfAKind, '9h 9s 9d 9c 2h'],
    [HandCategory.StraightFlush, 'As Ks Qs Js Ts'],
  ]

  it('orders the canonical ladder strictly by score', () => {
    for (let i = 1; i < ladder.length; i++) {
      const lower = hand(ladder[i - 1]![1])
      const higher = hand(ladder[i]![1])
      expect(higher.score).toBeGreaterThan(lower.score)
      expect(describeHand(higher)).toBe(
        [
          'Ace-high', // Ah Kc 9d 6s 2h
          'Pair of Tens', // Th Ts 8d 5c 2h
          'Two Pair, Jacks and Fours', // Jh Js 4d 4c 9h
          'Three of a Kind, Queens', // Qh Qs Qd 7c 2h
          'Straight, Nine-high', // 5c 6d 7h 8s 9c
          'Flush, King-high', // 2h 7h 9h Jh Kh
          'Full House, Kings full of Fours', // Kh Ks Kd 4c 4h
          'Four of a Kind, Nines', // 9h 9s 9d 9c 2h
          'Royal Flush', // As Ks Qs Js Ts
        ][ladder[i]![0]],
      )
    }
  })
})

describe('exhaustive sanity over all 5-card hands', () => {
  // Enumerate every C(52,5) = 2,598,960 five-card hand, tally category counts, and
  // check they match the textbook frequencies. This is the strongest correctness
  // guarantee: it touches every distinct hand exactly once.
  it('matches known 5-card hand frequencies', () => {
    const deck = makeDeck()
    const counts = new Array<number>(9).fill(0)
    const c: Card[] = new Array(5)
    for (let a = 0; a < 48; a++) {
      c[0] = deck[a]!
      for (let b = a + 1; b < 49; b++) {
        c[1] = deck[b]!
        for (let d = b + 1; d < 50; d++) {
          c[2] = deck[d]!
          for (let e = d + 1; e < 51; e++) {
            c[3] = deck[e]!
            for (let f = e + 1; f < 52; f++) {
              c[4] = deck[f]!
              counts[evaluate5(c).category]!++
            }
          }
        }
      }
    }
    // Textbook frequencies for 5-card poker hands (distinct draws, not "or better").
    expect(counts[HandCategory.HighCard]).toBe(1302540)
    expect(counts[HandCategory.Pair]).toBe(1098240)
    expect(counts[HandCategory.TwoPair]).toBe(123552)
    expect(counts[HandCategory.ThreeOfAKind]).toBe(54912)
    expect(counts[HandCategory.Straight]).toBe(10200)
    expect(counts[HandCategory.Flush]).toBe(5108)
    expect(counts[HandCategory.FullHouse]).toBe(3744)
    expect(counts[HandCategory.FourOfAKind]).toBe(624)
    expect(counts[HandCategory.StraightFlush]).toBe(40)
    expect(counts.reduce((x, y) => x + y, 0)).toBe(2598960)
  })
})
