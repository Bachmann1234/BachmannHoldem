/**
 * Co-located unit tests for {@link explainGrade} (ticket 0064) — the plain-English "why this grade"
 * copy behind a chart cell. These pin the canonical contrasts a learner asks about (above all A9s vs
 * K9s) and the glossary terms each hand surfaces, so the wording and the term links can't silently
 * drift. They also assert the no-false-universal discipline ([[0056-coach-rationale-not-absolute]]):
 * the copy describes properties, never "always fold".
 */

import { describe, expect, it } from 'vitest'
import { explainGrade, type ExplanationSegment, type GradeTermId } from './gradeExplanation.js'

/** Flatten an explanation to its visible text, for content assertions. */
function text(segments: readonly ExplanationSegment[]): string {
  return segments.map((s) => (typeof s === 'string' ? s : s.text)).join('')
}

/** The set of glossary terms an explanation links. */
function terms(segments: readonly ExplanationSegment[]): GradeTermId[] {
  return segments.flatMap((s) => (typeof s === 'string' ? [] : [s.term]))
}

describe('explainGrade — the motivating A9s vs K9s contrast', () => {
  it('explains A9s by its nut-flush upside (the ace makes the best flush)', () => {
    const a9s = explainGrade('A9s')
    expect(text(a9s)).toMatch(/ace/i)
    expect(text(a9s)).toMatch(/flush/i)
    expect(terms(a9s)).toContain('nuts')
  })

  it('explains K9s as a dominated step-down: weaker flush and an out-kicked pair', () => {
    const k9s = explainGrade('K9s')
    expect(text(k9s)).toMatch(/King-high/)
    expect(terms(k9s)).toContain('dominated')
    expect(terms(k9s)).toContain('kicker')
    // The lesson lands: it loses chips — but as a tendency, never an absolute "always fold".
    expect(text(k9s)).toMatch(/lose chips/i)
    expect(text(k9s)).not.toMatch(/always|never (win|make)/i)
  })

  it('gives the two same-shape hands materially different explanations', () => {
    expect(text(explainGrade('A9s'))).not.toBe(text(explainGrade('K9s')))
  })
})

describe('explainGrade — coverage across the chart shapes', () => {
  it('premium pair: AA leans on its set upside', () => {
    const aa = explainGrade('AA')
    expect(text(aa)).toMatch(/pocket aces/i)
    expect(terms(aa)).toContain('set')
  })

  it('small pair: 22 is a set-miner', () => {
    const p = explainGrade('22')
    expect(text(p)).toMatch(/small pair/i)
    expect(terms(p)).toContain('set')
  })

  it('suited connector: 76s names the term and its straight/flush upside', () => {
    const sc = explainGrade('76s')
    expect(terms(sc)).toContain('suited-connector')
    expect(text(sc)).toMatch(/straight/i)
  })

  it('one-gapper is still a suited connector, flagged as such', () => {
    expect(text(explainGrade('97s'))).toMatch(/one-gapper/i)
    expect(terms(explainGrade('97s'))).toContain('suited-connector')
  })

  it('offsuit broadway: KJo is strong-but-no-flush', () => {
    const o = explainGrade('KJo')
    expect(text(o)).toMatch(/different suits/i)
    expect(text(o)).toMatch(/flush/i)
  })

  it('offsuit junk: 72o is the unconnected bottom, with no false universal', () => {
    const j = explainGrade('72o')
    expect(text(j)).toMatch(/bottom of the deck/i)
    expect(text(j)).not.toMatch(/always|never/i)
  })

  it('strong suited ace AKs reads as a top holding, not a weak-kicker apology', () => {
    const aks = explainGrade('AKs')
    expect(terms(aks)).toContain('nuts')
    expect(text(aks)).not.toMatch(/weak second card/i)
  })
})

describe('explainGrade — contract', () => {
  it('returns [] for an unparseable label so callers need not guard', () => {
    expect(explainGrade('XYZ')).toEqual([])
    expect(explainGrade('')).toEqual([])
  })

  it('every label in the chart produces a non-empty explanation', () => {
    // A representative sweep of each region — pairs, suited, offsuit, across the rank range.
    const labels = [
      'AA',
      'TT',
      '55',
      'AKs',
      'A2s',
      'KQs',
      'JTs',
      'T9s',
      'K9s',
      '54s',
      'AKo',
      'KJo',
      'T9o',
      '72o',
    ]
    for (const label of labels) {
      expect(explainGrade(label).length, label).toBeGreaterThan(0)
    }
  })
})
