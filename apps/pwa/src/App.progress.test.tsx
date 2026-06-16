// @vitest-environment jsdom
/**
 * App-level durable lesson-progress test (ticket 0048) — proves the primer's progress persists through
 * the {@link LessonProgressStore} seam: completing a lesson updates the store, a fresh App mount with
 * the SAME store reflects it done and resumes at the next lesson, a throwing store degrades gracefully,
 * an unknown stored id is ignored on load, and a fully-completed (persisted) primer lands on the
 * EndOfPrimer hand-off.
 *
 * Mirrors {@link App.primer.test} / {@link App.history.test}: render `<App progressStore={fake} />`,
 * drive the UI with `fireEvent`, inject an in-memory / throwing fake store (never real localStorage).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FOUNDATIONS } from '@holdem/curriculum'
import { App } from './App.js'
import type { LessonProgressStore } from './learn/progressStore.js'

afterEach(cleanup)

/** An in-memory {@link LessonProgressStore} that round-trips ids without touching localStorage. */
function memoryStore(initial: readonly string[] = []): LessonProgressStore {
  let completed: string[] = [...initial]
  return {
    load: () => [...completed],
    save: (ids) => {
      completed = [...ids]
    },
  }
}

/** A {@link LessonProgressStore} whose every call throws — to prove the primer survives a bad store. */
function throwingStore(): LessonProgressStore {
  return {
    load: () => {
      throw new Error('load failed')
    },
    save: () => {
      throw new Error('save failed')
    },
  }
}

/** Play one open lesson to the end: start the checks, then answer + advance through every spot. */
function finishOpenLesson(spotCount: number): void {
  fireEvent.click(screen.getByTestId('lesson-start'))
  for (let s = 0; s < spotCount; s++) {
    fireEvent.click(screen.getByTestId('answer-0'))
    fireEvent.click(screen.getByTestId('result-cta'))
  }
}

describe('App — durable lesson progress', () => {
  it('completing a lesson saves to the store and a fresh mount reflects + resumes', () => {
    const store = memoryStore()

    // First mount: complete lesson 1.
    const first = render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={store} />)
    fireEvent.click(screen.getByTestId('tab-learn'))
    fireEvent.click(screen.getByTestId('lesson-0'))
    finishOpenLesson(FOUNDATIONS[0]!.spots.length)
    expect(screen.getByTestId('learn').textContent).toContain(`1 / ${FOUNDATIONS.length}`)
    // The store recorded the completed id (not a bare count).
    expect(store.load()).toEqual([FOUNDATIONS[0]!.id])
    first.unmount()

    // Fresh mount with the SAME store: lesson 1 shows done, lesson 2 is the unlocked resume point.
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={store} />)
    fireEvent.click(screen.getByTestId('tab-learn'))
    const learn = screen.getByTestId('learn')
    expect(learn.textContent).toContain(`1 / ${FOUNDATIONS.length}`)
    expect((screen.getByTestId('lesson-1') as HTMLButtonElement).disabled).toBe(false)
    // Lesson 3 is still locked (sequential unlock).
    expect((screen.getByTestId('lesson-2') as HTMLButtonElement).disabled).toBe(true)
    // The resume CTA targets lesson 2.
    expect(screen.getByTestId('resume-cta').textContent).toContain('Resume')
  })

  it('a throwing store degrades gracefully — the primer still works in-memory', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Mount does not crash even though load() throws...
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={throwingStore()} />)
    fireEvent.click(screen.getByTestId('tab-learn'))
    expect(screen.getByTestId('learn').textContent).toContain(`0 / ${FOUNDATIONS.length}`)
    // ...and completing a lesson (whose save() throws) still advances in-memory progress.
    fireEvent.click(screen.getByTestId('lesson-0'))
    finishOpenLesson(FOUNDATIONS[0]!.spots.length)
    expect(screen.getByTestId('learn').textContent).toContain(`1 / ${FOUNDATIONS.length}`)
  })

  it('ignores an unknown stored id on load', () => {
    const store = memoryStore(['some-old-removed-lesson', FOUNDATIONS[0]!.id])
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={store} />)
    fireEvent.click(screen.getByTestId('tab-learn'))
    // Only the one known completed lesson counts; the unknown id is dropped, no crash.
    expect(screen.getByTestId('learn').textContent).toContain(`1 / ${FOUNDATIONS.length}`)
  })

  it('reopens a fully-completed primer to the path for review, not the forced hand-off', () => {
    const store = memoryStore(FOUNDATIONS.map((l) => l.id))
    render(<App initial={{ seats: 2 }} botDelayMs={0} progressStore={store} />)
    fireEvent.click(screen.getByTestId('tab-learn'))
    // The end-of-primer celebration is a one-time, in-session hand-off — never re-shown on reopen.
    expect(screen.queryByTestId('end-of-primer')).toBeNull()
    const learn = screen.getByTestId('learn')
    expect(learn.textContent).toContain(`${FOUNDATIONS.length} / ${FOUNDATIONS.length}`)
    // The resume CTA offers review-from-the-start, not a jump back to the last lesson.
    expect(screen.getByTestId('resume-cta').textContent).toContain('Review from the start')
  })
})
