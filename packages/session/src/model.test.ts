/**
 * Focused unit tests for the pure session helpers that the reducer's tests do not exercise
 * directly — chiefly {@link shuffledDeck}, the one non-pure helper in the core (it draws from
 * `Math.random`, so the shell calls it and dispatches the deck in, but the permutation invariant
 * is worth pinning here). The reducer + session state machine are covered by `reducer.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { makeDeck, formatCard } from '@holdem/engine'
import {
  BLIND_LADDER,
  DEFAULT_BLIND_LEVEL,
  sessionBlinds,
  shuffledDeck,
  tournamentLevel,
  TOURNAMENT_LEVEL_LENGTH,
} from './model.js'

describe('shuffledDeck', () => {
  it('returns a full 52-card permutation of a fresh deck (no missing or duplicate cards)', () => {
    const shuffled = shuffledDeck()
    expect(shuffled).toHaveLength(52)
    const seen = new Set(shuffled.map(formatCard))
    expect(seen.size).toBe(52) // all distinct
    // It is exactly the set of cards a fresh deck has — a permutation, nothing added or dropped.
    const expected = new Set(makeDeck().map(formatCard))
    expect(seen).toEqual(expected)
  })
})

describe('tournamentLevel', () => {
  it('starts on the ladder bottom rung (1/2), the default for every session', () => {
    expect(DEFAULT_BLIND_LEVEL).toEqual(BLIND_LADDER[0])
    expect(DEFAULT_BLIND_LEVEL).toEqual({ sb: 1, bb: 2 })
  })

  it('steps up exactly one rung every level-length hands, starting from the chosen rung', () => {
    const start = DEFAULT_BLIND_LEVEL // 1/2 — the ladder's first rung
    // Hands 1..L are level 1; hand L+1 is level 2 — the schedule boundary at one level-length.
    expect(tournamentLevel(start, 1).level).toBe(1)
    expect(tournamentLevel(start, 1).blinds).toEqual({ sb: 1, bb: 2 })
    expect(tournamentLevel(start, TOURNAMENT_LEVEL_LENGTH).level).toBe(1) // hand 4: still level 1
    expect(tournamentLevel(start, TOURNAMENT_LEVEL_LENGTH + 1).level).toBe(2) // hand 5: stepped up
    expect(tournamentLevel(start, TOURNAMENT_LEVEL_LENGTH + 1).blinds).toEqual({ sb: 2, bb: 5 })
    // Two boundaries later: hand 9 is level 3.
    expect(tournamentLevel(start, 2 * TOURNAMENT_LEVEL_LENGTH + 1).blinds).toEqual({
      sb: 5,
      bb: 10,
    })
  })

  it('counts down the hands remaining until the next step-up across a level', () => {
    const start = DEFAULT_BLIND_LEVEL
    const L = TOURNAMENT_LEVEL_LENGTH
    expect(tournamentLevel(start, 1).handsUntilNext).toBe(L) // full level ahead
    expect(tournamentLevel(start, L).handsUntilNext).toBe(1) // last hand of the level
    expect(tournamentLevel(start, L + 1).handsUntilNext).toBe(L) // fresh level, counter resets
  })

  it('starts the climb from a non-default chosen rung (5/10) and tops out at the ladder ceiling', () => {
    const start = { sb: 5, bb: 10 } // the third rung
    expect(tournamentLevel(start, 1).blinds).toEqual({ sb: 5, bb: 10 })
    expect(tournamentLevel(start, TOURNAMENT_LEVEL_LENGTH + 1).blinds).toEqual({ sb: 10, bb: 20 }) // one rung up
    // Climb far past the end: the level pins to the ladder's top rung and stops escalating.
    const top = BLIND_LADDER[BLIND_LADDER.length - 1]!
    const wayPast = tournamentLevel(start, 1000)
    expect(wayPast.blinds).toEqual(top)
    expect(wayPast.atTop).toBe(true)
    expect(wayPast.handsUntilNext).toBe(0)
  })

  it('floors a degenerate hand number at level 1 rather than going negative', () => {
    expect(tournamentLevel(DEFAULT_BLIND_LEVEL, 0).level).toBe(1)
    expect(tournamentLevel(DEFAULT_BLIND_LEVEL, 0).blinds).toEqual({ sb: 1, bb: 2 })
  })
})

describe('sessionBlinds', () => {
  const base = { seats: 2, opponents: ['tag'] as const, startingStack: 200 }

  it('returns the fixed 1/2 level every hand in cash mode', () => {
    const setup = { ...base, mode: 'cash' as const }
    expect(sessionBlinds(setup, 1)).toEqual({ sb: 1, bb: 2 })
    expect(sessionBlinds(setup, 50)).toEqual({ sb: 1, bb: 2 }) // never escalates
  })

  it('escalates each hand in tournament mode (the default), tracking the level schedule', () => {
    const setup = { ...base, mode: 'tournament' as const }
    expect(sessionBlinds(setup, 1)).toEqual({ sb: 1, bb: 2 })
    expect(sessionBlinds(setup, TOURNAMENT_LEVEL_LENGTH + 1)).toEqual({ sb: 2, bb: 5 })
    // Mode absent → tournament by default, so it escalates too.
    expect(sessionBlinds(base, TOURNAMENT_LEVEL_LENGTH + 1)).toEqual({ sb: 2, bb: 5 })
  })
})
