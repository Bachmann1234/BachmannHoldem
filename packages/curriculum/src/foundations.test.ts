/**
 * Tests for the Foundations primer content (ticket 0045).
 *
 * The cardinal guarantee these tests defend: **every coach-/chart-graded primer spot grades to the
 * verdict the live coach actually returns**, so a future coach retune that moved a verdict would
 * break this suite rather than silently desync the lesson from the table. For each spot we therefore
 * assert the *coach's* ruling — the correct choice grades `correct === true` (and carries a non-leak
 * verdict), the leak choice grades `correct === false` with a `'leak'` verdict — plus the concept tag
 * the coach stamps. We also assert every lesson is well-formed: a non-empty explanation, ≥1 spot, a
 * unique id, and the {@link Concept} it declares.
 *
 * Because the coach's equity is a seeded Monte-Carlo read, these are not eyeballed: the spots were
 * tuned so the coach lands where the lesson teaches, and these assertions pin it.
 */

import { describe, expect, it } from 'vitest'
import { parseCards, type Card } from '@holdem/engine'
import type { Concept } from '@holdem/coach'
import { gradeSpot } from './grade.js'
import { FOUNDATIONS } from './foundations.js'
import type { Lesson } from './lesson.js'
import type { Spot } from './spot.js'

/** Parse a two-card string into the `[Card, Card]` tuple a spot context takes (test-local helper). */
function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  return [cards[0]!, cards[1]!]
}

/** Look a lesson up by id, failing loudly if the primer reshuffles out from under a test. */
function lesson(id: string): Lesson {
  const found = FOUNDATIONS.find((l) => l.id === id)
  if (!found) throw new Error(`no foundations lesson with id "${id}"`)
  return found
}

/** The first (and, for the single-spot lessons, only) spot of a lesson. */
function firstSpot(id: string) {
  const l = lesson(id)
  expect(l.spots.length).toBeGreaterThanOrEqual(1)
  return l.spots[0]!
}

/** The Concepts the coach can stamp — the only valid `Lesson.concept` values (ticket 0070 locks the
 * v2 lessons to reuse these six rather than extend the union). */
const VALID_CONCEPTS: ReadonlySet<Concept> = new Set<Concept>([
  'equity',
  'pot-odds',
  'equity-vs-price',
  'ev',
  'position',
  'ranges',
])

describe('FOUNDATIONS — shape & scope discipline', () => {
  // The v2 primer (ticket 0070) appends lessons and reuses concept tags, so the old "exactly six, in
  // this order" / "each concept exactly once" pins are gone (ticket 0075 sets the final canonical
  // order). These relax to the durable invariants: well-formed, unique ids, a valid declared concept.
  it('every lesson is well-formed: unique id, title, ~30s explanation, ≥1 spot, valid concept', () => {
    const ids = new Set<string>()
    for (const l of FOUNDATIONS) {
      expect(l.id.length).toBeGreaterThan(0)
      expect(ids.has(l.id)).toBe(false)
      ids.add(l.id)
      expect(l.title.length).toBeGreaterThan(0)
      // A real ~30-second teach, not a stub — but not a textbook chapter either.
      expect(l.explanation.length).toBeGreaterThan(80)
      expect(l.explanation.length).toBeLessThan(900)
      expect(l.spots.length).toBeGreaterThanOrEqual(1)
      // The declared concept must be one the coach actually emits (the locked-decision invariant).
      expect(VALID_CONCEPTS.has(l.concept)).toBe(true)
    }
  })

  it('every spot offers a prompt and at least two choices', () => {
    for (const l of FOUNDATIONS) {
      for (const s of l.spots) {
        expect(s.prompt.length).toBeGreaterThan(0)
        expect(s.choices.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('declarative spots are the flagged exception, and every one is well-formed', () => {
    // The old blanket "every spot is coach- or chart-graded" no longer holds: the draws lesson
    // (ticket 0074) authors the primer's first sanctioned DeclarativeSpot, used precisely where the
    // coach cannot rule (a draw's future-street implied odds). The durable invariant is not "no
    // declarative spots" but "coach/preflop is the default, and any declarative spot is well-formed":
    // it carries ≥1 correct choice, a non-empty explanation, and a concept the coach actually emits.
    for (const l of FOUNDATIONS) {
      for (const s of l.spots) {
        if (s.kind === 'declarative') {
          expect(s.choices.some((c) => c.correct)).toBe(true)
          expect(s.explanation.length).toBeGreaterThan(0)
          expect(VALID_CONCEPTS.has(s.concept)).toBe(true)
        } else {
          // Everything else stays coach- or chart-graded — the preferred, coach-tethered default.
          expect(s.kind === 'coach' || s.kind === 'preflop').toBe(true)
        }
      }
    }
  })

  it('teaches every coach Concept — each of the six is covered by ≥1 lesson', () => {
    // The cross-link the v2 relaxation must not lose: the coach speaks six concepts and the primer's
    // job is to teach all of them. A mistaken retag (e.g. the position lesson re-tagged 'ranges')
    // would drop a concept's coverage to zero and trip this — without pinning lesson count or order.
    const taught = new Set<Concept>(FOUNDATIONS.map((l) => l.concept))
    for (const concept of VALID_CONCEPTS) {
      expect(taught.has(concept)).toBe(true)
    }
  })
})

describe('equity lesson — free check, the equity concept (coach-true)', () => {
  // Choice 0 = Check (correct, the free continue), choice 1 = Fold (the leak).
  const spot = firstSpot('foundations-equity')

  it('grades checking the free strong draw correct, with the equity concept', () => {
    const res = gradeSpot(spot, 0)
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(0)
    expect(res.verdict).toBeDefined()
    expect(res.verdict!.verdict).not.toBe('leak')
    // A free check carries the coach's 'equity' tag — the very idea this lesson teaches.
    expect(res.concept).toBe('equity')
  })

  it('grades folding the free card a leak', () => {
    const res = gradeSpot(spot, 1)
    expect(res.correct).toBe(false)
    expect(res.verdict!.verdict).toBe('leak')
  })
})

describe('pot-odds lesson — price too high (coach-true)', () => {
  // Choice 0 = Call (the leak: ~17% equity vs the line-narrowed read < 43% price), choice 1 = Fold (correct).
  const spot = firstSpot('foundations-pot-odds')

  it('grades folding the overpriced marginal hand correct', () => {
    const res = gradeSpot(spot, 1)
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(1)
    expect(res.verdict!.verdict).not.toBe('leak')
  })

  it('grades calling a leak, and the coach reads equity below the pot-odds price', () => {
    const res = gradeSpot(spot, 0)
    expect(res.correct).toBe(false)
    expect(res.verdict!.verdict).toBe('leak')
    // The lesson's point: equity is short of the price the bet sets.
    const v = res.verdict!
    expect('equity' in v && 'potOddsThreshold' in v).toBe(true)
    if ('potOddsThreshold' in v) {
      expect(v.equity).toBeLessThan(v.potOddsThreshold)
    }
  })
})

describe('equity-vs-price lesson — the continue rule (coach-true)', () => {
  // Choice 0 = Call (correct, equity crushes price), choice 1 = Fold (the leak).
  const spot = firstSpot('foundations-equity-vs-price')

  it('grades calling top set at a cheap price correct, equity-vs-price concept', () => {
    const res = gradeSpot(spot, 0)
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(0)
    expect(res.concept).toBe('equity-vs-price')
    const v = res.verdict!
    if ('potOddsThreshold' in v) {
      expect(v.equity).toBeGreaterThan(v.potOddsThreshold)
    }
  })

  it('grades folding the cheap +EV spot a leak', () => {
    const res = gradeSpot(spot, 1)
    expect(res.correct).toBe(false)
    expect(res.verdict!.verdict).toBe('leak')
  })
})

describe('ev lesson — the decision in chips (coach-true on both spots)', () => {
  const l = lesson('foundations-ev')

  it('has two spots: a clearly +EV continue and a clearly −EV one', () => {
    expect(l.spots).toHaveLength(2)
  })

  it('grades the +EV spot: calling correct with positive chip EV, folding the leak', () => {
    const good = l.spots[0]!
    const call = gradeSpot(good, 0)
    expect(call.correct).toBe(true)
    expect(call.correctIndex).toBe(0)
    const v = call.verdict!
    if ('callEv' in v) expect(v.callEv).toBeGreaterThan(0)
    expect(gradeSpot(good, 1).verdict!.verdict).toBe('leak') // folding the +EV spot
  })

  it('grades the −EV spot: folding correct, calling the leak with negative chip EV', () => {
    const bad = l.spots[1]!
    const fold = gradeSpot(bad, 1)
    expect(fold.correct).toBe(true)
    expect(fold.correctIndex).toBe(1)
    const call = gradeSpot(bad, 0)
    expect(call.correct).toBe(false)
    expect(call.verdict!.verdict).toBe('leak')
    const v = call.verdict!
    if ('callEv' in v) expect(v.callEv).toBeLessThan(0)
  })
})

describe('position lesson — same hand, button vs UTG (coach-true via the chart)', () => {
  const l = lesson('foundations-position')

  it('has two spots contrasting the button and under the gun', () => {
    expect(l.spots).toHaveLength(2)
  })

  it('button (late position): opening the marginal hand is correct, folding the leak', () => {
    const button = l.spots[0]!
    const open = gradeSpot(button, 0)
    expect(open.correct).toBe(true)
    expect(open.correctIndex).toBe(0)
    expect(open.concept).toBe('ranges') // gradePreflop always tags 'ranges'
    expect(gradeSpot(button, 1).verdict!.verdict).toBe('leak') // folding it on the button
  })

  it('UTG (early position): folding the SAME hand is correct, opening the leak', () => {
    const utg = l.spots[1]!
    const fold = gradeSpot(utg, 1)
    expect(fold.correct).toBe(true)
    expect(fold.correctIndex).toBe(1)
    const open = gradeSpot(utg, 0)
    expect(open.correct).toBe(false)
    expect(open.verdict!.verdict).toBe('leak')
  })
})

describe('ranges lesson — premium vs trash tiers (coach-true via the chart)', () => {
  const l = lesson('foundations-ranges')

  it('has two spots bracketing the chart: a premium hand and a trash hand', () => {
    expect(l.spots).toHaveLength(2)
  })

  it('premium hand: opening is correct, folding the leak, ranges concept', () => {
    const premium = l.spots[0]!
    const open = gradeSpot(premium, 0)
    expect(open.correct).toBe(true)
    expect(open.correctIndex).toBe(0)
    expect(open.concept).toBe('ranges')
    expect(gradeSpot(premium, 1).verdict!.verdict).toBe('leak')
  })

  it('trash hand: folding is correct, opening the leak', () => {
    const trash = l.spots[1]!
    const fold = gradeSpot(trash, 1)
    expect(fold.correct).toBe(true)
    expect(fold.correctIndex).toBe(1)
    const open = gradeSpot(trash, 0)
    expect(open.correct).toBe(false)
    expect(open.verdict!.verdict).toBe('leak')
  })
})

describe('facing-a-raise lesson — call / fold / 3-bet (coach-true via the raise-aware chart)', () => {
  const l = lesson('foundations-facing-a-raise')

  it('teaches the ranges concept with two bracketing facing-raise spots', () => {
    expect(l.concept).toBe('ranges')
    expect(l.spots).toHaveLength(2)
  })

  it('spot A — 76s in early position vs a large raise: folding correct, calling the leak, on the defend path', () => {
    // Choice 0 = Call (the leak: a large raise collapses the range to value only), choice 1 = Fold.
    const foldSpot = l.spots[0]!
    const fold = gradeSpot(foldSpot, 1)
    expect(fold.correct).toBe(true)
    expect(fold.correctIndex).toBe(1)
    expect(fold.concept).toBe('ranges') // gradePreflop always tags 'ranges'
    const call = gradeSpot(foldSpot, 0)
    expect(call.correct).toBe(false)
    expect(call.verdict!.verdict).toBe('leak')
    // This really graded through the raise-aware DEFEND path, not the unraised open chart.
    // `advice` is a PreflopVerdict-only field, so it narrows the union to the preflop trace.
    const v = call.verdict!
    expect('advice' in v && v.trace.facingRaise).toBe(true)
    if ('advice' in v) expect(v.trace.raiseBb).toBe(6)
  })

  it('spot B — KJo big-blind defend vs a small raise: continuing correct, folding the leak', () => {
    // Choice 0 = Call (correct: the BB defends wide vs a small raise), choice 1 = Fold (the leak),
    // choice 2 = 3-bet (also a non-fold continue, graded identically to Call).
    const defendSpot = l.spots[1]!
    const call = gradeSpot(defendSpot, 0)
    expect(call.correct).toBe(true)
    expect(call.correctIndex).toBe(0)
    const v = call.verdict!
    expect('advice' in v && v.trace.facingRaise).toBe(true)
    if ('advice' in v) {
      expect(v.trace.raiseBb).toBe(3)
      expect(v.trace.mode).toBe('bb-defend')
    }
    // Folding the defend is the leak.
    const fold = gradeSpot(defendSpot, 1)
    expect(fold.correct).toBe(false)
    expect(fold.verdict!.verdict).toBe('leak')
    // The coach cannot distinguish a 3-bet from a call: both are non-fold continues, so the 3-bet
    // also grades correct (the graded point is continue-vs-fold, per the lesson note).
    expect(gradeSpot(defendSpot, 2).correct).toBe(true)
  })
})

describe('draws & implied odds lesson — the coach-graded draw + the declarative carve-out (ticket 0074)', () => {
  const l = lesson('foundations-draws')

  it('teaches the equity-vs-price concept with a coach-graded spot and a declarative spot', () => {
    expect(l.concept).toBe('equity-vs-price')
    expect(l.spots).toHaveLength(2)
    expect(l.spots[0]!.kind).toBe('coach')
    expect(l.spots[1]!.kind).toBe('declarative')
  })

  it('spot A (coach-graded) — a draw with enough immediate equity at a small price: call correct, fold the leak', () => {
    // Choice 0 = Call (correct: the draw's current equity ~37% beats the 20% price), choice 1 = Fold.
    // This grades through the REAL coach — the continue rule still holds for a draw with enough equity
    // right now, no implied odds needed. Proves the tuned equity > price.
    const coachSpot = l.spots[0]!
    const call = gradeSpot(coachSpot, 0)
    expect(call.correct).toBe(true)
    expect(call.correctIndex).toBe(0)
    expect(call.concept).toBe('equity-vs-price')
    const v = call.verdict!
    expect(v.verdict).not.toBe('leak')
    if ('potOddsThreshold' in v) {
      // The draw's immediate equity genuinely beats the price here (the coach can rule the call).
      expect(v.equity).toBeGreaterThan(v.potOddsThreshold)
      expect(v.callEv).toBeGreaterThan(0)
    }
    // Folding a draw priced in is the leak.
    const fold = gradeSpot(coachSpot, 1)
    expect(fold.correct).toBe(false)
    expect(fold.verdict!.verdict).toBe('leak')
  })

  it('spot B (declarative) — the implied-odds-light call: graded by the authored flag, with the equity-vs-price concept', () => {
    // The heart of the lesson: the SAME draw at a steeper price than its immediate equity. The coach
    // models only current equity, so it would call this a leak — which is exactly why it must be
    // declarative. The authored answer is "call" (implied odds flip it), and the explanation is honest
    // that the immediate continue rule alone says fold.
    const declSpot = l.spots[1]!
    expect(declSpot.kind).toBe('declarative')

    // Choice 0 = Call (the implied-odds call, authored correct), choice 1 = Fold (authored wrong).
    const call = gradeSpot(declSpot, 0)
    expect(call.correct).toBe(true)
    expect(call.correctIndex).toBe(0)
    expect(call.concept).toBe('equity-vs-price')
    // No coach verdict backs a declarative spot — the carve-out reads the authored flags instead.
    expect(call.verdict).toBeUndefined()
    // The explanation is the author's (the coach builds none here).
    if (declSpot.kind === 'declarative') {
      expect(call.explanation).toBe(declSpot.explanation)
      // Honesty constraint (ticket 0074): the explanation must NOT contradict the coach — it states
      // plainly that the immediate rule reads this as a fold, then explains why implied odds flip it.
      expect(declSpot.explanation.toLowerCase()).toContain('fold')
      expect(declSpot.explanation.toLowerCase()).toContain('implied odds')
    }

    // Folding grades wrong by the authored flag.
    const fold = gradeSpot(declSpot, 1)
    expect(fold.correct).toBe(false)
  })

  it('the same draw really is a coach LEAK at the steeper declarative price — proving the coach cannot rule it', () => {
    // The pedagogical contract: spot B is declarative *because* a coach read of its immediate equity
    // returns a leak (the coach does not model implied odds). Run the coach over the declarative spot's
    // own cards/price to prove that — so if a future coach retune ever started blessing this call, this
    // test fails and the carve-out can be reconsidered rather than silently desyncing.
    const declSpot = l.spots[1]!
    if (declSpot.kind !== 'declarative') throw new Error('expected the declarative spot')
    // Reconstruct the coach-graded form of the SAME spot (cards/board/price) and confirm the leak.
    const probe: Spot = {
      kind: 'coach',
      prompt: declSpot.prompt,
      choices: [
        { label: 'Call', action: { type: 'call' } },
        { label: 'Fold', action: { type: 'fold' } },
      ],
      context: {
        holeCards: hole('Th 9h'),
        board: parseCards('Ah 7h 2c'),
        pot: 100,
        toCall: 75,
        numActive: 2,
      },
    }
    const coachCall = gradeSpot(probe, 0)
    expect(coachCall.verdict!.verdict).toBe('leak')
    const v = coachCall.verdict!
    if ('potOddsThreshold' in v) {
      // The coach's immediate-equity read is below the price — a fold by the continue rule alone.
      expect(v.equity).toBeLessThan(v.potOddsThreshold)
    }
  })
})

describe('board-texture lesson — same hand flips by texture, fully coach-graded (ticket 0073)', () => {
  // The epic's preferred design: TWO CoachSpots, the SAME bluff-catcher (QQ, a pair below an ace)
  // facing the SAME large barrel (pot 120 / call 80, a 40% price), on a dry vs a wet board — so the
  // coach's verdict flips by texture ALONE. Both grade through the board-aware polarized range (ticket
  // 0057): on a dry A-7-2 the QQ underpair is crushed by the aces the barrel range holds (fold), while
  // on a wet 9-8-7 the QQ overpair beats every top pair the board makes (call). No declarative carve-out
  // — the texture is gradable directly, which is the whole point of 0057.
  const l = lesson('foundations-board-texture')

  it('teaches equity-vs-price with two coach-graded spots (a dry board and a wet board)', () => {
    expect(l.concept).toBe('equity-vs-price')
    expect(l.spots).toHaveLength(2)
    expect(l.spots[0]!.kind).toBe('coach')
    expect(l.spots[1]!.kind).toBe('coach')
  })

  it('DRY board (A-7-2 rainbow): QQ is a beaten underpair — folding correct, calling the leak', () => {
    // Choice 0 = Call (the leak: ~26% equity vs the 40% price), choice 1 = Fold (correct).
    const dry = l.spots[0]!
    const fold = gradeSpot(dry, 1)
    expect(fold.correct).toBe(true)
    expect(fold.correctIndex).toBe(1)
    expect(fold.concept).toBe('equity-vs-price')
    const call = gradeSpot(dry, 0)
    expect(call.correct).toBe(false)
    expect(call.verdict!.verdict).toBe('leak')
    const v = call.verdict!
    if ('potOddsThreshold' in v) {
      // On the dry board the coach reads QQ BELOW the price — the call is −EV.
      expect(v.equity).toBeLessThan(v.potOddsThreshold)
      expect(v.callEv).toBeLessThan(0)
      // The texture path actually fired: a barreled line read against the board-aware polarized range.
      expect(v.trace.lineReason).toBe('barreled')
      expect(v.trace.assumedRange).toBe('board-aware')
    }
  })

  it('WET board (9-8-7 two-tone): the SAME QQ is an overpair — calling correct, folding the leak', () => {
    // Choice 0 = Call (correct: ~52% equity beats the 40% price), choice 1 = Fold (the leak). Same hand,
    // same bet — only the board changed, and the verdict flipped.
    const wet = l.spots[1]!
    const call = gradeSpot(wet, 0)
    expect(call.correct).toBe(true)
    expect(call.correctIndex).toBe(0)
    expect(call.concept).toBe('equity-vs-price')
    expect(call.verdict!.verdict).not.toBe('leak')
    const v = call.verdict!
    if ('potOddsThreshold' in v) {
      // On the wet board the coach reads QQ ABOVE the price — the call is +EV.
      expect(v.equity).toBeGreaterThan(v.potOddsThreshold)
      expect(v.callEv).toBeGreaterThan(0)
      // Same texture path fired here too — board-aware, so the flip is texture-driven, not price-driven.
      expect(v.trace.lineReason).toBe('barreled')
      expect(v.trace.assumedRange).toBe('board-aware')
    }
    // Folding the +EV overpair is the leak.
    const fold = gradeSpot(wet, 1)
    expect(fold.correct).toBe(false)
    expect(fold.verdict!.verdict).toBe('leak')
  })

  it('the flip is texture-only: the SAME hand and SAME price, different verdicts by board', () => {
    // The lesson's headline guarantee — pin that the two spots share the hero hand and the price but
    // differ only in the board, so a future change that accidentally diverged them would trip here.
    const dry = l.spots[0]!
    const wet = l.spots[1]!
    if (dry.kind !== 'coach' || wet.kind !== 'coach') throw new Error('expected two coach spots')
    expect(dry.context.holeCards).toEqual(wet.context.holeCards)
    expect(dry.context.pot).toBe(wet.context.pot)
    expect(dry.context.toCall).toBe(wet.context.toCall)
    expect(dry.context.board).not.toEqual(wet.context.board)
    // Dry: the call is the leak; Wet: the call is good — the verdict flipped on the board alone.
    expect(gradeSpot(dry, 0).verdict!.verdict).toBe('leak')
    expect(gradeSpot(wet, 0).verdict!.verdict).not.toBe('leak')
  })
})

describe('bet-sizing lesson — the declarative carve-out (ticket 0072)', () => {
  // Bet sizing is NOT coach-rulable (the coach grades whether to continue, never what size to bet), so
  // this lesson uses the flagged DeclarativeSpot carve-out: it stores its own answer, the coach is not
  // invoked, and the grade reports the authored concept + explanation with no verdict.
  const l = lesson('foundations-bet-sizing')
  // Choice 0 = bet small (wrong), 1 = bet big (correct), 2 = check (wrong).
  const spot = firstSpot('foundations-bet-sizing')

  it('teaches pot-odds via a single well-formed declarative spot', () => {
    expect(l.concept).toBe('pot-odds')
    expect(l.spots).toHaveLength(1)
    expect(spot.kind).toBe('declarative')
  })

  it('grades the big value-and-protection bet correct, the authored concept + explanation flowing', () => {
    const res = gradeSpot(spot, 1)
    expect(res.correct).toBe(true)
    expect(res.correctIndex).toBe(1)
    expect(res.concept).toBe('pot-odds')
    // The declarative carve-out: no coach verdict, the author's own explanation is the teaching.
    expect(res.verdict).toBeUndefined()
    expect(res.explanation.length).toBeGreaterThan(0)
  })

  it('grades the cheap small bet and the check incorrect', () => {
    expect(gradeSpot(spot, 0).correct).toBe(false)
    expect(gradeSpot(spot, 2).correct).toBe(false)
  })
})
