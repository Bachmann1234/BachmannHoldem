/**
 * The top-level bottom tab bar (ticket 0046) — the §5.1 navigation pattern the design locked. Three
 * destinations: **Play** (the free-play session), **Learn** (the Foundations primer), and **Drills**
 * (M5) which ships now as a *visible-but-locked* tab carrying a "Soon" pill, so the information
 * architecture already has its third slot.
 *
 * Pure presentation over the shell's `activeTab` state: the active tab lights accent, and tapping an
 * unlocked tab calls `onNavigate`. The locked Drills tab is disabled and never navigates. This is
 * rendered only on the **lobby** surfaces (the Play setup screen and the Learn path) — not during a
 * live hand or the lesson player, which are immersive and tab-less by design.
 */

import { DrillsIcon, LearnIcon, PlayIcon } from './Icons.js'

/** The two reachable top-level destinations. (Drills is locked and not a navigable target yet.) */
export type Tab = 'play' | 'learn'

/** Props for {@link TabBar}. */
export interface TabBarProps {
  /** Which tab is currently showing (drives the accent highlight). */
  readonly active: Tab
  /** Navigate to a reachable tab (Play / Learn). Locked tabs never call this. */
  readonly onNavigate: (tab: Tab) => void
}

/** Render the Play / Learn / Drills(locked) bottom tab bar. */
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

      {/* Drills is the M5 destination: visible so the IA is correct, but locked (disabled + Soon). */}
      <button
        type="button"
        className="tab locked"
        data-testid="tab-drills"
        disabled
        aria-disabled="true"
      >
        <span className="soon">Soon</span>
        <span className="tab-icon">
          <DrillsIcon />
        </span>
        <span className="tab-label">Drills</span>
      </button>
    </nav>
  )
}
