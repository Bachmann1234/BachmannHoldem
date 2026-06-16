// @vitest-environment jsdom
/**
 * App-level Foundations primer flow test (ticket 0047) — proves the lesson player integrates with the
 * Learn shell: completing a lesson advances in-memory progress and returns to the path, and completing
 * all six shows the end-of-primer hand-off whose Play CTA switches to the Play tab.
 *
 * Mirrors {@link App.nav.test}'s idiom (`render(<App .../>)`, `getByTestId`, `fireEvent`). Progress is
 * in-memory this ticket (durable resume is 0048), so we drive every lesson in one mounted session.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FOUNDATIONS } from '@holdem/curriculum'
import { App } from './App.js'
import type { LessonProgressStore } from './learn/progressStore.js'

afterEach(cleanup)

/**
 * A fresh in-memory {@link LessonProgressStore} per render — never the real `LocalStorageLessonProgressStore`.
 * Without it the default store persists to the jsdom localStorage that is SHARED across this file's tests
 * (and, under some worker scheduling, across files): the all-six-lessons test would leave the primer marked
 * complete, so the next test boots straight to the end-of-primer hand-off and never shows `lesson-0`. Injecting
 * a fresh store keeps every test independent of any prior persisted progress, matching App.progress.test.
 */
function memoryStore(initial: readonly string[] = []): LessonProgressStore {
  let completed: string[] = [...initial]
  return {
    load: () => [...completed],
    save: (ids) => {
      completed = [...ids]
    },
  }
}

/** Play one open lesson to the end: start the checks, then answer + advance through every spot. */
function finishOpenLesson(spotCount: number): void {
  fireEvent.click(screen.getByTestId('lesson-start'))
  for (let s = 0; s < spotCount; s++) {
    // Pick the first answer; correctness does not matter for advancing — the CTA always advances.
    fireEvent.click(screen.getByTestId('answer-0'))
    fireEvent.click(screen.getByTestId('result-cta'))
  }
}

describe('App — Foundations primer flow', () => {
  it('completing the current lesson advances progress and returns to the path', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={memoryStore()} />)
    fireEvent.click(screen.getByTestId('tab-learn'))

    // Open and finish lesson 1 (the equity lesson — a single spot).
    fireEvent.click(screen.getByTestId('lesson-0'))
    finishOpenLesson(FOUNDATIONS[0]!.spots.length)

    // Back on the path, the progress meter advanced to 1 / 6 and lesson 2 is now unlocked.
    const learn = screen.getByTestId('learn')
    expect(learn).toBeTruthy()
    expect(learn.textContent).toContain('1 / 6')
    expect((screen.getByTestId('lesson-1') as HTMLButtonElement).disabled).toBe(false)
  })

  it('completing all six lessons shows the end-of-primer hand-off; its Play CTA switches tabs', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={memoryStore()} />)
    fireEvent.click(screen.getByTestId('tab-learn'))

    for (let i = 0; i < FOUNDATIONS.length; i++) {
      fireEvent.click(screen.getByTestId(`lesson-${i}`))
      finishOpenLesson(FOUNDATIONS[i]!.spots.length)
    }

    // The path hands off to the end-of-primer celebration.
    const end = screen.getByTestId('end-of-primer')
    expect(end).toBeTruthy()
    // The recap lists all six lessons by title.
    for (const lesson of FOUNDATIONS) {
      expect(end.textContent).toContain(lesson.title)
    }

    // The Play CTA switches to the Play tab (the setup screen).
    fireEvent.click(screen.getByTestId('endprimer-play'))
    expect(screen.queryByTestId('end-of-primer')).toBeNull()
    expect(screen.getByTestId('setup')).toBeTruthy()
  })

  it('the end-of-primer Drills CTA hands off into the Drills tab (ticket 0068)', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={memoryStore()} />)
    fireEvent.click(screen.getByTestId('tab-learn'))

    for (let i = 0; i < FOUNDATIONS.length; i++) {
      fireEvent.click(screen.getByTestId(`lesson-${i}`))
      finishOpenLesson(FOUNDATIONS[i]!.spots.length)
    }

    // The completion screen now offers a LIVE drills hand-off (the M4.5 forward reference's destination).
    expect(screen.getByTestId('end-of-primer')).toBeTruthy()
    fireEvent.click(screen.getByTestId('endprimer-drills'))

    // It routes to the Drills tab — the theme picker, with its lobby tab bar.
    expect(screen.queryByTestId('end-of-primer')).toBeNull()
    expect(screen.getByTestId('drills')).toBeTruthy()
    expect(screen.getByTestId('drills-start')).toBeTruthy()
  })
})
