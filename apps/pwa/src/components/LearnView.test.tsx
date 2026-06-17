// @vitest-environment jsdom
/**
 * LearnView test: the rules entry. The Learn screen offers a standalone "Rulebook" reference button
 * that opens the {@link RulesOverlay} without opening a lesson. Other LearnView behaviour (the
 * medallion path, progress) is exercised via App.nav.test.tsx.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LearnView } from './LearnView.js'

afterEach(cleanup)

describe('LearnView rules entry', () => {
  it('opens the rules reference overlay without opening a lesson', () => {
    const onOpenLesson = vi.fn()
    render(<LearnView progress={0} onOpenLesson={onOpenLesson} onNavigate={vi.fn()} />)

    // The reference is closed until the entry is tapped.
    expect(screen.queryByTestId('rules-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('open-rules'))

    expect(screen.getByTestId('rules-modal')).toBeTruthy()
    // Opening the rules reference is not opening a lesson node.
    expect(onOpenLesson).not.toHaveBeenCalled()
  })
})
