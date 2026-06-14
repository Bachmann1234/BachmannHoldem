// @vitest-environment jsdom
/**
 * HistoryView component test (ticket 0037): it reads recent hands back through the
 * {@link HandHistoryStore} contract and behaves as a proper modal dialog — Escape and scrim-click
 * dismiss it, focus moves to the close button on open and restores to the opener on close, and a
 * store read failure degrades to an inline notice rather than throwing. We inject a fake store, so
 * no IndexedDB is involved.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandHistoryRecord, HandHistoryStore } from '../history/index.js'
import { HistoryView } from './HistoryView.js'

afterEach(cleanup)

/** A record stub — only the fields the view reads need to be real. */
function record(id: string, heroNet: number, seatCount = 6): HandHistoryRecord {
  return {
    schemaVersion: 1,
    id,
    playedAt: 1_700_000_000_000,
    handNumber: 1,
    seatCount,
    players: [],
    heroSeat: 0,
    decisions: [],
    outcome: { board: [], endReason: 'showdown', payouts: {}, players: [], heroNet },
  } as unknown as HandHistoryRecord
}

/** A fake store whose `recent` resolves to the given records (or rejects when `fail`). */
function fakeStore(records: HandHistoryRecord[], fail = false): HandHistoryStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue(records),
    recent: fail
      ? vi.fn().mockRejectedValue(new Error('boom'))
      : vi.fn().mockResolvedValue(records),
  }
}

describe('HistoryView', () => {
  it('lists recent hands read back through the store', async () => {
    render(<HistoryView store={fakeStore([record('a', 12), record('b', -5)])} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('history-list')).toBeTruthy())
    expect(screen.getByText('+12')).toBeTruthy()
    expect(screen.getByText('-5')).toBeTruthy()
  })

  it('degrades to an inline notice when the read fails', async () => {
    render(<HistoryView store={fakeStore([], true)} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('history-error')).toBeTruthy())
  })

  it('is a modal dialog and focuses the close button on open', () => {
    render(<HistoryView store={fakeStore([])} onClose={vi.fn()} />)
    expect(screen.getByTestId('history-view').getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByTestId('history-close'))
  })

  it('closes on Escape, on a scrim click, and on the close button — but not on a click inside the sheet', () => {
    const onClose = vi.fn()
    render(<HistoryView store={fakeStore([])} onClose={onClose} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('history-view')) // the scrim
    fireEvent.click(screen.getByTestId('history-close'))
    expect(onClose).toHaveBeenCalledTimes(3)

    // A click inside the sheet must NOT bubble to the scrim's close handler.
    fireEvent.click(screen.getByText('Recent hands'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('restores focus to the opener when it unmounts', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(<HistoryView store={fakeStore([])} onClose={vi.fn()} />)
    expect(document.activeElement).toBe(screen.getByTestId('history-close'))

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
