/**
 * lessonMeta test: the title/subtitle split that the Learn path and the lesson read view share.
 * Guards the regression where the path rendered the full title *plus* the subtitle and so repeated
 * the qualifier ("Equity: your share of the pot · your share of the pot").
 */

import { describe, expect, it } from 'vitest'
import { FOUNDATIONS } from '@holdem/curriculum'
import { learnLessons, lessonHead, lessonMeta } from './lessonMeta.js'

describe('lessonHead', () => {
  it('returns the concept name before the colon', () => {
    const equity = FOUNDATIONS.find((l) => l.id === 'foundations-equity')!
    expect(equity.title).toBe('Equity: your share of the pot')
    expect(lessonHead(equity)).toBe('Equity')
  })

  it('returns the whole title when there is no colon', () => {
    expect(lessonHead({ ...FOUNDATIONS[0]!, title: 'No colon here' })).toBe('No colon here')
  })

  it('never repeats the subtitle — "head · subtitle" carries no duplicate phrase', () => {
    // The bug: rendering `${title} · ${subtitle}` repeated the part after the colon. With the head,
    // the qualifier appears exactly once across the whole "head · subtitle" line.
    for (const { lesson, meta } of learnLessons) {
      const line = meta.subtitle ? `${lessonHead(lesson)} · ${meta.subtitle}` : lessonHead(lesson)
      if (meta.subtitle) {
        const occurrences = line.split(meta.subtitle).length - 1
        expect(occurrences).toBe(1)
      }
    }
  })

  it('agrees with the design copy: each subtitle is exactly the title tail after the colon', () => {
    // Confirms the split is the right seam — the package title is "head: subtitle" verbatim.
    for (const lesson of FOUNDATIONS) {
      const { subtitle } = lessonMeta(lesson)
      if (subtitle) expect(lesson.title).toBe(`${lessonHead(lesson)}: ${subtitle}`)
    }
  })
})
