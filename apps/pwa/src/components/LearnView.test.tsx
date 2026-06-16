// @vitest-environment jsdom
/**
 * LearnView test: the rules entry + the one-time rules-reference soft gate (ticket 0075). The Learn
 * screen offers a standalone "start with the rules" card that opens the {@link RulesOverlay} reference,
 * and — for a brand-new learner — a prominent, dismissible soft gate that nudges them to read the rules
 * before the first lesson. Other LearnView behaviour (the medallion path, progress) is exercised via
 * App.nav.test.tsx.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LearnView } from './LearnView.js'
import type { RulesGateStore } from '../learn/rulesGateStore.js'

afterEach(cleanup)

/** A fresh in-memory {@link RulesGateStore} so tests never touch the shared jsdom localStorage. */
function memoryGateStore(initialSeen = false): RulesGateStore {
  let seen = initialSeen
  return {
    seen: () => seen,
    markSeen: () => {
      seen = true
    },
  }
}

describe('LearnView rules entry', () => {
  it('opens the rules reference overlay without opening a lesson', () => {
    const onOpenLesson = vi.fn()
    render(
      <LearnView
        progress={0}
        onOpenLesson={onOpenLesson}
        onNavigate={vi.fn()}
        rulesGateStore={memoryGateStore(true)}
      />,
    )

    // The reference is closed until the entry is tapped.
    expect(screen.queryByTestId('rules-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('open-rules'))

    expect(screen.getByTestId('rules-modal')).toBeTruthy()
    // Opening the rules reference is not opening a lesson node.
    expect(onOpenLesson).not.toHaveBeenCalled()
  })
})

describe('LearnView rules soft gate (ticket 0075)', () => {
  it('shows the gate to a brand-new learner (progress 0, never seen)', () => {
    render(
      <LearnView
        progress={0}
        onOpenLesson={vi.fn()}
        onNavigate={vi.fn()}
        rulesGateStore={memoryGateStore(false)}
      />,
    )
    expect(screen.getByTestId('rules-gate')).toBeTruthy()
  })

  it('hides the gate once it has been seen/dismissed before', () => {
    render(
      <LearnView
        progress={0}
        onOpenLesson={vi.fn()}
        onNavigate={vi.fn()}
        rulesGateStore={memoryGateStore(true)}
      />,
    )
    expect(screen.queryByTestId('rules-gate')).toBeNull()
  })

  it('hides the gate for a returning learner who has already started the primer', () => {
    render(
      <LearnView
        progress={2}
        onOpenLesson={vi.fn()}
        onNavigate={vi.fn()}
        rulesGateStore={memoryGateStore(false)}
      />,
    )
    expect(screen.queryByTestId('rules-gate')).toBeNull()
  })

  it('opening the rules from the gate dismisses it for good and opens the overlay', () => {
    const store = memoryGateStore(false)
    const markSeen = vi.spyOn(store, 'markSeen')
    render(
      <LearnView progress={0} onOpenLesson={vi.fn()} onNavigate={vi.fn()} rulesGateStore={store} />,
    )

    fireEvent.click(screen.getByTestId('rules-gate-open'))

    expect(markSeen).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('rules-gate')).toBeNull()
    expect(screen.getByTestId('rules-modal')).toBeTruthy()
  })

  it('skipping the gate dismisses it without opening the overlay', () => {
    const store = memoryGateStore(false)
    const markSeen = vi.spyOn(store, 'markSeen')
    render(
      <LearnView progress={0} onOpenLesson={vi.fn()} onNavigate={vi.fn()} rulesGateStore={store} />,
    )

    fireEvent.click(screen.getByTestId('rules-gate-skip'))

    expect(markSeen).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('rules-gate')).toBeNull()
    expect(screen.queryByTestId('rules-modal')).toBeNull()
  })
})
