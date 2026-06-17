// @vitest-environment jsdom
/**
 * Top-level navigation test (ticket 0046, Drills unlocked in 0067) — proves the nav shell without
 * touching the M4 play loop. Mirrors {@link App.test}'s Testing Library idiom (`render(<App .../>)`,
 * `getByTestId`, `fireEvent`). Covers: the tab bar renders Play + Learn + (now navigable) Drills;
 * choosing Learn shows the lesson list with all six Foundations lessons; choosing Play returns to the
 * setup screen; tapping a lesson opens the player and Back returns to the list.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FOUNDATIONS } from '@holdem/curriculum'
import { App } from './App.js'
import { lessonHead } from './learn/lessonMeta.js'

afterEach(cleanup)

describe('App — top-level navigation', () => {
  it('boots on Play with a tab bar offering Play, Learn, and a navigable Drills', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    // Boot lands on the Play setup screen.
    expect(screen.getByTestId('setup')).toBeTruthy()

    // The lobby tab bar offers all three destinations; Drills is now unlocked (ticket 0067).
    expect(screen.getByTestId('tab-play')).toBeTruthy()
    expect(screen.getByTestId('tab-learn')).toBeTruthy()
    const drills = screen.getByTestId('tab-drills') as HTMLButtonElement
    expect(drills.disabled).toBe(false)
    expect(within(drills).queryByText('Soon')).toBeNull()
  })

  it('switches to Learn and shows the lesson list with every lesson', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))

    expect(screen.getByTestId('learn')).toBeTruthy()
    // One node per lesson, each carrying its title *head* (the concept name before the colon) — the
    // qualifier after the colon is the subtitle, shown once, not the full title repeated.
    for (let i = 0; i < FOUNDATIONS.length; i++) {
      const node = within(screen.getByTestId(`node-${i}`))
      expect(node.getByRole('heading').textContent).toContain(lessonHead(FOUNDATIONS[i]!))
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
    expect(within(player).getByText(new RegExp(`LESSON 1 OF ${FOUNDATIONS.length}`))).toBeTruthy()
    // The path is hidden while the player is open.
    expect(screen.queryByTestId('learn')).toBeNull()

    // Back returns to the path list.
    fireEvent.click(screen.getByTestId('lesson-back'))
    expect(screen.getByTestId('learn')).toBeTruthy()
    expect(screen.queryByTestId('lesson-player')).toBeNull()
  })

  it('opens the current lesson from the "Start here" tag (not just the medallion)', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    // The "Start here" tag on the current node is a button, wired to the same open as the medallion.
    fireEvent.click(screen.getByTestId('start-0'))

    const player = screen.getByTestId('lesson-player')
    expect(within(player).getByText(FOUNDATIONS[0]!.title)).toBeTruthy()
    expect(screen.queryByTestId('learn')).toBeNull()
  })

  it('opens a lesson via the sticky Resume CTA', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-learn'))
    fireEvent.click(screen.getByTestId('resume-cta'))

    expect(screen.getByTestId('lesson-player')).toBeTruthy()
  })

  it('switches to Drills and starts a session from the lobby (ticket 0067)', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    // The Drills tab navigates to the (minimal) drills lobby.
    fireEvent.click(screen.getByTestId('tab-drills'))
    expect(screen.getByTestId('drills')).toBeTruthy()

    // Starting a session launches the immersive, tab-less drill loop with a first spot + answers.
    fireEvent.click(screen.getByTestId('drills-start'))
    expect(screen.getByTestId('drill-session')).toBeTruthy()
    expect(screen.getByTestId('answers')).toBeTruthy()
    // The lobby (and its tab bar) is gone while the session runs.
    expect(screen.queryByTestId('drills')).toBeNull()

    // Back from the running session returns to the lobby.
    fireEvent.click(screen.getByTestId('drill-back'))
    expect(screen.getByTestId('drills')).toBeTruthy()
  })

  it('returns to Play from the Drills lobby tab bar', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-drills'))
    fireEvent.click(within(screen.getByTestId('drills')).getByTestId('tab-play'))

    expect(screen.queryByTestId('drills')).toBeNull()
    expect(screen.getByTestId('setup')).toBeTruthy()
  })

  it('switches to Stats and shows the play stats / leaks / mastery sections (ticket 0089)', async () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    // The lobby tab bar now offers a Stats destination.
    expect(screen.getByTestId('tab-stats')).toBeTruthy()
    fireEvent.click(screen.getByTestId('tab-stats'))

    // The Stats screen renders, with its three read-only sections + the lobby tab bar. The sections
    // are present immediately (loading state) regardless of the async store read, so no waitFor needed.
    expect(screen.getByTestId('stats')).toBeTruthy()
    expect(screen.getByTestId('play-stats')).toBeTruthy()
    expect(screen.getByTestId('leaks')).toBeTruthy()
    expect(screen.getByTestId('mastery')).toBeTruthy()
    expect(within(screen.getByTestId('stats')).getByTestId('tabbar')).toBeTruthy()
  })

  it('returns to Play from the Stats tab bar (and keeps Play mounted across the switch)', () => {
    render(<App initial={{ seats: 2 }} botDelayMs={0} />)

    fireEvent.click(screen.getByTestId('tab-stats'))
    fireEvent.click(within(screen.getByTestId('stats')).getByTestId('tab-play'))

    expect(screen.queryByTestId('stats')).toBeNull()
    expect(screen.getByTestId('setup')).toBeTruthy()
  })
})
