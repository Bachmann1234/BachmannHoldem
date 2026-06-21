// @vitest-environment jsdom
/**
 * SessionRecapCard component test (ticket 0110): the end-of-session recap card is a pure render of the
 * owned `SessionRecap` structure that `@holdem/coach`'s `synthesizeSession` produces — it does NO
 * synthesis. So we hand it plain `SessionRecap` records (the exact shape the App computes from
 * `model.gradedDecisions`) and assert it renders the owned `headline` / takeaway `line`s verbatim, with
 * the right good/leak/neutral tone per `status`. We never recompute copy here — the recap owns its lines
 * and this component renders them. The takeaway `line` already names its anchored hands inline, so the
 * card renders the line (not separate exemplar chips that would repeat the same hands).
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionRecap } from '@holdem/coach'
import { SessionRecapCard } from './SessionRecapCard.js'

afterEach(cleanup)

/** A has-takeaways recap with two prioritized themes, each anchored to exemplar hands. */
const HAS_TAKEAWAYS: SessionRecap = {
  status: 'has-takeaways',
  headline:
    'Looking over your 24 graded hands tonight, the main thing to work on is weighing your hand against the price to continue (and 1 more to watch).',
  gradedCount: 24,
  takeaways: [
    {
      theme: 'equity-vs-price',
      count: 3,
      line: 'Work on weighing your hand against the price to continue: it cost you across 3 spots this session — for example in hands #7 (Ace-King suited) and #14 (pair of Tens).',
      exemplars: [
        {
          handNumber: 7,
          label: 'AKs',
          description: 'Ace-King suited',
          line: 'hand #7 (Ace-King suited)',
        },
        {
          handNumber: 14,
          label: 'TT',
          description: 'pair of Tens',
          line: 'hand #14 (pair of Tens)',
        },
      ],
    },
    {
      theme: 'preflop-too-loose',
      count: 1,
      line: 'Work on playing too many weak hands before the flop: in hand #3 (Seven-Two offsuit).',
      exemplars: [
        {
          handNumber: 3,
          label: '72o',
          description: 'Seven-Two offsuit',
          line: 'hand #3 (Seven-Two offsuit)',
        },
      ],
    },
  ],
}

/** A clean recap: enough hands, zero leaks — the positive branch, never a manufactured criticism. */
const CLEAN: SessionRecap = {
  status: 'clean',
  headline: 'Solid session — over 18 graded decisions, nothing stood out as a leak. Keep it up.',
  gradedCount: 18,
  takeaways: [],
}

/** A too-few recap: fewer than the gate's worth of graded decisions — the honest low-sample branch. */
const TOO_FEW: SessionRecap = {
  status: 'too-few',
  headline:
    'Too few hands this session to call out a pattern (only 4 graded decisions) — play a few more and I’ll have a real read for you.',
  gradedCount: 4,
  takeaways: [],
}

describe('SessionRecapCard', () => {
  it('renders a multi-takeaway recap: the headline and each takeaway line (which names its anchored hands)', () => {
    render(<SessionRecapCard recap={HAS_TAKEAWAYS} />)

    // The owned top-level headline renders verbatim, with the leak ("!") tone.
    expect(screen.getByTestId('recap-headline').textContent).toBe(HAS_TAKEAWAYS.headline)
    expect(screen.getByTestId('session-recap').getAttribute('data-status')).toBe('has-takeaways')
    expect(screen.getByTestId('recap-verdict').className).toContain('leak')

    // Both prioritized takeaways render their owned lines — which already name the anchored hands
    // inline ("…in hands #7 … and #14 …"), so rendering the line renders the anchor (no separate chips).
    const takeaways = screen.getAllByTestId('recap-takeaway')
    expect(takeaways).toHaveLength(2)
    expect(screen.getByText(HAS_TAKEAWAYS.takeaways[0]!.line)).toBeTruthy()
    expect(screen.getByText(HAS_TAKEAWAYS.takeaways[1]!.line)).toBeTruthy()
    // The anchor hands are present via the line text (not duplicated in separate exemplar chips).
    expect(screen.getByTestId('recap-takeaways').textContent).toContain('#7')
    expect(screen.getByTestId('recap-takeaways').textContent).toContain('#14')
    expect(screen.getByTestId('recap-takeaways').textContent).toContain('#3')
    expect(screen.queryByTestId('recap-exemplar')).toBeNull()
  })

  it('renders the clean-session recap with its positive copy and the good tone, no takeaways', () => {
    render(<SessionRecapCard recap={CLEAN} />)

    expect(screen.getByTestId('recap-headline').textContent).toBe(CLEAN.headline)
    expect(screen.getByTestId('session-recap').getAttribute('data-status')).toBe('clean')
    expect(screen.getByTestId('recap-verdict').className).toContain('good')
    // The clean branch carries no takeaways — none are rendered.
    expect(screen.queryByTestId('recap-takeaways')).toBeNull()
    expect(screen.queryByTestId('recap-takeaway')).toBeNull()
  })

  it('renders the too-few recap with its honest low-sample copy and the neutral tone, no takeaways', () => {
    render(<SessionRecapCard recap={TOO_FEW} />)

    expect(screen.getByTestId('recap-headline').textContent).toBe(TOO_FEW.headline)
    expect(screen.getByTestId('session-recap').getAttribute('data-status')).toBe('too-few')
    expect(screen.getByTestId('recap-verdict').className).toContain('neutral')
    expect(screen.queryByTestId('recap-takeaways')).toBeNull()
  })
})
