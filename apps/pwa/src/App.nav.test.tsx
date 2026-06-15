// @vitest-environment jsdom
/**
 * Top-level navigation test (ticket 0046) — proves the M4.5 nav shell without touching the M4 play
 * loop. Mirrors {@link App.test}'s Testing Library idiom (`render(<App .../>)`, `getByTestId`,
 * `fireEvent`). Covers: the tab bar renders Play + Learn + a locked Drills; choosing Learn shows the
 * lesson list with all six Foundations lessons; choosing Play returns to the setup screen; tapping a
 * lesson opens the (placeholder) player and Back returns to the list.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FOUNDATIONS } from '@holdem/curriculum'
import { App } from './App.js'

afterEach(cleanup)

describe('App — top-level navigation', () => {
  it('boots on Play with a tab bar offering Play, Learn, and a locked Drills', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    // Boot lands on the Play setup screen.
    expect(screen.getByTestId('setup')).toBeTruthy()

    // The lobby tab bar offers all three destinations; Drills is disabled (the M5 lock).
    expect(screen.getByTestId('tab-play')).toBeTruthy()
    expect(screen.getByTestId('tab-learn')).toBeTruthy()
    const drills = screen.getByTestId('tab-drills') as HTMLButtonElement
    expect(drills.disabled).toBe(true)
    expect(within(drills).getByText('Soon')).toBeTruthy()
  })

  it('switches to Learn and shows the lesson list with all six lessons', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))

    expect(screen.getByTestId('learn')).toBeTruthy()
    // One node per lesson, each carrying its title (the node's h3 starts with the lesson title).
    for (let i = 0; i < FOUNDATIONS.length; i++) {
      const node = within(screen.getByTestId(`node-${i}`))
      expect(node.getByRole('heading').textContent).toContain(FOUNDATIONS[i]!.title)
    }
  })

  it('opens the starting-hand chart from the Learn section (ticket 0050)', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    expect(screen.queryByTestId('chart-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('open-chart'))
    expect(screen.getByTestId('chart-grid').children).toHaveLength(169)
    fireEvent.click(screen.getByTestId('chart-close'))
    expect(screen.queryByTestId('chart-modal')).toBeNull()
  })

  it('returns to the setup screen when Play is chosen from Learn', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    expect(screen.getByTestId('learn')).toBeTruthy()

    // The Learn path's tab bar can navigate back to Play.
    fireEvent.click(within(screen.getByTestId('learn')).getByTestId('tab-play'))

    expect(screen.queryByTestId('learn')).toBeNull()
    expect(screen.getByTestId('setup')).toBeTruthy()
  })

  it('opens the (placeholder) lesson player for the current lesson and Back returns to the list', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    // Lesson 1 is the current/unlocked node; tapping it opens the player.
    fireEvent.click(screen.getByTestId('lesson-0'))

    const player = screen.getByTestId('lesson-player')
    expect(player).toBeTruthy()
    expect(within(player).getByText(FOUNDATIONS[0]!.title)).toBeTruthy()
    expect(within(player).getByText(/LESSON 1 OF 6/)).toBeTruthy()
    // The path is hidden while the player is open.
    expect(screen.queryByTestId('learn')).toBeNull()

    // Back returns to the path list.
    fireEvent.click(screen.getByTestId('lesson-back'))
    expect(screen.getByTestId('learn')).toBeTruthy()
    expect(screen.queryByTestId('lesson-player')).toBeNull()
  })

  it('opens a lesson via the sticky Resume CTA', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    fireEvent.click(screen.getByTestId('resume-cta'))

    expect(screen.getByTestId('lesson-player')).toBeTruthy()
  })
})
