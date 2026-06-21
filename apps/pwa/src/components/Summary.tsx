/**
 * The end-of-session summary (ticket 0035) — the DOM analog of the TUI's `Summary`, shown once the
 * session reaches `'game-over'` (the hero busted, the hero quit, or one player has the chips).
 *
 * Purely presentational: it reads the stable {@link SessionPlayer} list (final stacks carried by the
 * reducer) and reports the outcome + standings (sorted by stack). No game logic — the reducer
 * decided the session was over (`sessionOver`); this just names it. A "New table" CTA resets the
 * shell to a fresh setup screen (the shell rebuilds via `createInitialModel`).
 */

import { livePlayers, type SessionPlayer } from '@holdem/session'
import { SessionRecapCard } from './SessionRecapCard.js'
import type { SessionRecap } from '@holdem/coach'

/** Props for {@link Summary}. */
export interface SummaryProps {
  /** The final stable players (final stacks). */
  readonly players: readonly SessionPlayer[]
  /** How many hands were played this session. */
  readonly handNumber: number
  /** Start a brand-new session (back to the setup screen). */
  readonly onNewTable: () => void
  /** Open the recent-hands history view (ticket 0037). Optional so the component reads standalone. */
  readonly onShowHistory?: () => void
  /**
   * The end-of-session coach synthesis to render on this screen (ticket 0110), already folded by
   * `@holdem/coach`'s `synthesizeSession` — the App computes it from `model.gradedDecisions` and passes
   * it down; this component stays presentational and never synthesizes. Optional so the summary reads
   * standalone (older callers / a session with no log render the standings + CTAs unchanged).
   */
  readonly recap?: SessionRecap
}

/** Render the session outcome headline, the standings by stack, and a new-table CTA. */
export function Summary({
  players,
  handNumber,
  onNewTable,
  onShowHistory,
  recap,
}: SummaryProps): React.JSX.Element {
  const hero = players.find((p) => p.isHero)
  const live = livePlayers(players)
  const heroBusted = hero !== undefined && hero.stack === 0

  let headline: string
  let outcome: 'win' | 'lose' | ''
  if (heroBusted) {
    headline = 'You busted. Better luck next time.'
    outcome = 'lose'
  } else if (live.length === 1 && live[0]!.isHero) {
    headline = 'You stacked the table. Nice.'
    outcome = 'win'
  } else if (live.length === 1) {
    headline = `${live[0]!.label} took the table.`
    outcome = 'lose'
  } else {
    headline = 'Session over.'
    outcome = ''
  }

  const standings = [...players].sort((a, b) => b.stack - a.stack)

  return (
    <div className="app" data-testid="summary">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">SESSION OVER</div>
          </div>
        </div>
      </div>

      <div className="summary">
        <div className="summary-head">
          <div className="summary-kicker">Session over</div>
          <div className={'summary-headline' + (outcome ? ` ${outcome}` : '')}>{headline}</div>
          <div className="summary-meta">
            Played {handNumber} hand{handNumber === 1 ? '' : 's'}.
          </div>
        </div>

        <div className="standings" data-testid="standings">
          {standings.map((p) => (
            <div className={'standing' + (p.stack === 0 ? ' busted' : '')} key={p.id}>
              <div className="standing-name">
                {p.label}
                {p.stack === 0 ? <span className="tag">BUSTED</span> : null}
              </div>
              <div className="standing-stack">{p.stack}</div>
            </div>
          ))}
        </div>

        {/* The coach's end-of-session read (ticket 0110), between the standings and the CTAs. It is
            ADDED to the screen, not a modal: `.summary` scrolls and `.summary-ctas` keeps `margin-top:
            auto`, so the New table / View history CTAs stay pinned and clickable below the recap. */}
        {recap !== undefined ? <SessionRecapCard recap={recap} /> : null}

        <div className="summary-ctas">
          <button type="button" className="btn next-cta summary-cta" onClick={onNewTable}>
            New table →
          </button>
          {onShowHistory !== undefined ? (
            <button
              type="button"
              className="btn summary-cta"
              data-testid="history-open"
              onClick={onShowHistory}
            >
              View hand history
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
