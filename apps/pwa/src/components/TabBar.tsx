/**
 * The top-level bottom tab bar (ticket 0046) — the §5.1 navigation pattern the design locked. Three
 * destinations: **Play** (the free-play session), **Learn** (the Foundations primer), and **Drills**
 * (the M5 themed practice loop, unlocked in ticket 0067).
 *
 * Pure presentation over the shell's `activeTab` state: the active tab lights accent, and tapping a tab
 * calls `onNavigate`. This is rendered only on the **lobby** surfaces (the Play setup screen, the Learn
 * path, and the Drills lobby/recap) — not during a live hand, the lesson player, or a running drill
 * session, which are immersive and tab-less by design.
 */

import { DrillsIcon, LearnIcon, PlayIcon } from './Icons.js'

/** The three reachable top-level destinations. */
export type Tab = 'play' | 'learn' | 'drills'

/** Props for {@link TabBar}. */
export interface TabBarProps {
  /** Which tab is currently showing (drives the accent highlight). */
  readonly active: Tab
  /** Navigate to a reachable tab (Play / Learn / Drills). */
  readonly onNavigate: (tab: Tab) => void
}

/** Render the Play / Learn / Drills bottom tab bar. */
export function TabBar({ active, onNavigate }: TabBarProps): React.JSX.Element {
  return (
    <nav className="tabbar" data-testid="tabbar" aria-label="Primary">
      <button
        type="button"
        className={'tab' + (active === 'play' ? ' active' : '')}
        data-testid="tab-play"
        aria-current={active === 'play' ? 'page' : undefined}
        onClick={() => onNavigate('play')}
      >
        <span className="tab-icon">
          <PlayIcon />
        </span>
        <span className="tab-label">Play</span>
      </button>

      <button
        type="button"
        className={'tab' + (active === 'learn' ? ' active' : '')}
        data-testid="tab-learn"
        aria-current={active === 'learn' ? 'page' : undefined}
        onClick={() => onNavigate('learn')}
      >
        <span className="tab-icon">
          <LearnIcon />
        </span>
        <span className="tab-label">Learn</span>
      </button>

      {/* Drills is the M5 destination — unlocked in ticket 0067. */}
      <button
        type="button"
        className={'tab' + (active === 'drills' ? ' active' : '')}
        data-testid="tab-drills"
        aria-current={active === 'drills' ? 'page' : undefined}
        onClick={() => onNavigate('drills')}
      >
        <span className="tab-icon">
          <DrillsIcon />
        </span>
        <span className="tab-label">Drills</span>
      </button>
    </nav>
  )
}
