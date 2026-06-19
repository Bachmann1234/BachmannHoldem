// @vitest-environment jsdom
/**
 * StatsView component test (ticket 0089) — the M6 "analyze my hands" surface (the 4th tab). It reads
 * the durable play log → {@link aggregateHeroStats} + {@link detectLeaks} and the durable drill log →
 * {@link masteryByConcept}, then RENDERS (it never recomputes). We inject fake stores (the
 * DrillsBranch/HistoryView idiom), so no IndexedDB is involved. Coverage:
 *
 * - populated play stats render with their sample sizes ("over N hands");
 * - a `confirmed` leak renders plainly; a `pending` leak renders the "need N more hands" cue and is
 *   NOT shown as a confirmed leak;
 * - the empty / no-hands state reads encouragingly, not blank;
 * - drill mastery renders, and an undrilled concept shows the "not drilled yet" placeholder;
 * - an absent position reads "not seen yet" (not 0%), and a null AF (calls === 0) renders "—";
 * - a store read failure degrades to an inline notice (per section), never a crash.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Action } from '@holdem/engine'
import type {
  DecisionFacing,
  HandHistoryRecord,
  HandHistoryStore,
  HeroDecision,
} from '../history/index.js'
import type { DrillProgressRecord, DrillProgressStore } from '../drills/index.js'
import { DRILL_PROGRESS_SCHEMA_VERSION } from '../drills/index.js'
import { StatsView } from './StatsView.js'

afterEach(cleanup)

/** Build one hand-history record from a list of hero decisions (+ optional position/blind context). */
function record(
  id: string,
  decisions: readonly HeroDecision[],
  opts: { buttonIndex?: number; bigBlind?: number; heroSeat?: number; seatCount?: number } = {},
): HandHistoryRecord {
  return {
    schemaVersion: 2,
    id,
    playedAt: 1_700_000_000_000,
    handNumber: 1,
    seatCount: opts.seatCount ?? 6,
    players: [],
    heroSeat: opts.heroSeat ?? 0,
    buttonIndex: opts.buttonIndex,
    bigBlind: opts.bigBlind,
    decisions,
    outcome: { board: [], endReason: 'showdown', payouts: {}, players: [], heroNet: 0 },
  } as unknown as HandHistoryRecord
}

/** A bare preflop call decision (voluntary → VPIP, not PFR). */
function call(facing?: DecisionFacing): HeroDecision {
  return { street: 'preflop', action: { type: 'call' } as Action, facing }
}

/** A preflop raise decision (voluntary → VPIP + PFR + aggressive). */
function raise(amount: number, facing?: DecisionFacing): HeroDecision {
  return { street: 'preflop', action: { type: 'raise', amount } as Action, facing }
}

/** A fake history store whose `list` resolves to the given records (or rejects when `fail`). */
function fakeHistory(records: HandHistoryRecord[], fail = false): HandHistoryStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
    list: fail ? vi.fn().mockRejectedValue(new Error('boom')) : vi.fn().mockResolvedValue(records),
    recent: vi.fn().mockResolvedValue(records),
  }
}

/** A fake drill store whose `list` resolves to the given records (or rejects when `fail`). */
function fakeDrills(records: DrillProgressRecord[], fail = false): DrillProgressStore {
  return {
    recordOutcomes: vi.fn().mockResolvedValue(undefined),
    list: fail ? vi.fn().mockRejectedValue(new Error('boom')) : vi.fn().mockResolvedValue(records),
  }
}

/** A drill-progress record stub. */
function drillRecord(
  concept: DrillProgressRecord['concept'],
  correct: number,
  total: number,
): DrillProgressRecord {
  return {
    schemaVersion: DRILL_PROGRESS_SCHEMA_VERSION,
    concept,
    correct,
    total,
    missStreak: 0,
    lastDrilledAt: 1000,
    lastMissedAt: 0,
  }
}

describe('StatsView — play stats + sample sizes', () => {
  it('renders populated overall stats with their sample sizes ("over N hands")', async () => {
    // 30 hands, each a voluntary preflop call → VPIP 100%, PFR 0%, AF — (no aggression, no calls? a
    // call IS a call, so AF = 0/30 → ratio null). We assert VPIP value + sample render.
    const records = Array.from({ length: 30 }, (_, i) => record(`h${i}`, [call()]))
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory(records)}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('play-stats')).toBeTruthy())
    expect(screen.getByTestId('overall-vpip-value').textContent).toBe('100%')
    expect(screen.getByTestId('overall-vpip-sample').textContent).toContain('over 30 hands')
    expect(screen.getByTestId('play-stats-sample').textContent).toContain('over 30 hands')
  })

  it('renders a null aggression factor (calls === 0) as a placeholder, never 0', async () => {
    // One hand, a single preflop raise: aggressive=1, calls=0 → AF ratio is null → "—".
    const records = [record('a', [raise(3)])]
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory(records)}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('play-stats')).toBeTruthy())
    expect(screen.getByTestId('overall-af-value').textContent).toBe('—')
  })

  it('shows "not seen yet" for an absent position (not 0%)', async () => {
    // No records → no position buckets at all → every position reads "not seen yet".
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([])}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('play-by-position')).toBeTruthy())
    expect(screen.getByTestId('position-big-blind-empty').textContent).toContain('not seen yet')
  })

  it('does not render the Middle bucket (unreachable at the app’s 6-max cap)', async () => {
    // `middle` only occurs at 7+ handed tables; this app caps at 6-max, so the slice can never fill.
    // We drop the row entirely rather than show a permanently-"not seen yet" cue that misleads.
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([])}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('play-by-position')).toBeTruthy())
    expect(screen.queryByTestId('position-middle')).toBeNull()
  })
})

describe('StatsView — leaks', () => {
  it('renders a confirmed leak plainly (30+ hands, VPIP 100% → too-loose)', async () => {
    // 30 voluntary preflop hands → VPIP 100% ≥ 0.40, sample 30 ≥ threshold → confirmed too-loose-vpip.
    const records = Array.from({ length: 30 }, (_, i) => record(`h${i}`, [call()]))
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory(records)}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('leaks')).toBeTruthy())
    const leak = screen.getByTestId('leak-too-loose-vpip')
    expect(leak).toBeTruthy()
    // Confirmed, not pending: the "need N more hands" cue is absent.
    expect(leak.className).toContain('leak-confirmed')
    expect(within(leak).queryByTestId('leak-too-loose-vpip-need')).toBeNull()
    expect(screen.queryByTestId('leaks-empty')).toBeNull()
  })

  it('renders a pending leak as a "need N more hands" cue, NOT as a confirmed leak', async () => {
    // 5 voluntary preflop hands → VPIP 100% ≥ 0.40 (trending) but sample 5 < 30 → pending,
    // handsNeeded = 25.
    const records = Array.from({ length: 5 }, (_, i) => record(`h${i}`, [call()]))
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory(records)}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('leaks')).toBeTruthy())
    const leak = screen.getByTestId('leak-too-loose-vpip')
    expect(leak.className).toContain('leak-pending')
    expect(leak.className).not.toContain('leak-confirmed')
    expect(screen.getByTestId('leak-too-loose-vpip-need').textContent).toContain(
      'need 25 more hands',
    )
  })

  it('renders an encouraging empty state when there are no hands', async () => {
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([])}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('leaks')).toBeTruthy())
    const empty = screen.getByTestId('leaks-empty')
    expect(empty.textContent).toMatch(/no hands yet/i)
    // No leak rows rendered.
    expect(screen.queryByTestId('leak-too-loose-vpip')).toBeNull()
  })

  it('renders an encouraging empty state (with the sample) when there are hands but no leak', async () => {
    // A few healthy hands: each a preflop RAISE → VPIP 100%? No — we want VPIP between the lines AND no
    // passive leak. One raise + two folds → VPIP 33% (between 15% and 40%, no VPIP leak); AF aggressive=1,
    // calls=0 → ratio null → NOT passive (the calls===0 case is silent, never a pending). So: no leaks.
    const records = [record('a', [raise(3)]), record('b', []), record('c', [])]
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory(records)}
        drillProgressStore={fakeDrills([])}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('leaks')).toBeTruthy())
    expect(screen.getByTestId('leaks-empty').textContent).toMatch(/3 hands so far/i)
    expect(screen.queryByTestId('leak-too-passive')).toBeNull()
    expect(screen.queryByTestId('leak-too-loose-vpip')).toBeNull()
  })
})

describe('StatsView — drill mastery', () => {
  it('renders per-concept mastery and a "not drilled yet" placeholder for an undrilled concept', async () => {
    // pot-odds 28/40 → "70% over 40 reps"; ranges undrilled → "not drilled yet".
    const records = [drillRecord('pot-odds', 28, 40)]
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([])}
        drillProgressStore={fakeDrills(records)}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('mastery')).toBeTruthy())
    const potOdds = screen.getByTestId('mastery-pot-odds-readout').textContent ?? ''
    expect(potOdds).toContain('70%')
    expect(potOdds).toContain('40 reps')
    expect(screen.getByTestId('mastery-ranges-readout').textContent).toContain('not drilled yet')
  })
})

describe('StatsView — graceful degradation', () => {
  it('degrades the play section to an inline notice when the history read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([], true)}
        drillProgressStore={fakeDrills([])}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('play-stats-error')).toBeTruthy())
    // The drill section is independent and still renders fine.
    await waitFor(() => expect(screen.getByTestId('mastery')).toBeTruthy())
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('degrades the mastery section to an inline notice when the drill read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <StatsView
        onNavigate={vi.fn()}
        historyStore={fakeHistory([])}
        drillProgressStore={fakeDrills([], true)}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('mastery-error')).toBeTruthy())
    // The play section is independent and still renders fine.
    await waitFor(() => expect(screen.getByTestId('play-stats')).toBeTruthy())
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
