/**
 * The Drills route (ticket 0067) — the **minimal** shell that hosts the M5 drill session loop. It is
 * deliberately thin: a lobby with a single "Start drilling" CTA over **all** {@link DRILL_THEMES}
 * (a sensible default length + seed), the immersive {@link DrillSession} it launches, and a minimal
 * "session over" recap (a correct-count + "Drill again" / back).
 *
 * **The real theme PICKER and the by-concept end-of-session SUMMARY are ticket 0068** — this entry/end
 * is intentionally minimal. {@link DrillSession} already exposes the clean props API (selected themes,
 * seed, length, `onComplete`/`onExit`) that 0068 wraps with its picker + concept-breakdown summary;
 * this branch is the placeholder both bookends those with.
 *
 * Progress is **ephemeral** (in-memory) this milestone — nothing is persisted (durable stats are M6).
 * The lobby + recap show the bottom tab bar (they are lobby surfaces); the running session is tab-less
 * and immersive, exactly like the lesson player.
 */

import { useState } from 'react'
import { DRILL_THEMES } from '@holdem/drills'
import type { Tab } from './TabBar.js'
import { TabBar } from './TabBar.js'
import { DrillSession, type DrillOutcome } from './DrillSession.js'

/** The default session length the minimal entry starts (0068's picker will make this selectable). */
const DEFAULT_LENGTH = 10

/** Props for {@link DrillsBranch}. */
export interface DrillsBranchProps {
  /** Navigate to another top-level tab — forwarded to the lobby/recap tab bar. */
  readonly onNavigate: (tab: Tab) => void
}

/**
 * The Drills branch state machine: `'lobby'` (the Start CTA), `'running'` (the live {@link DrillSession}),
 * `'over'` (the minimal recap). The session seed is bumped on each new session so "Drill again" deals a
 * fresh — but still reproducible — set rather than replaying the same spots.
 */
type Phase =
  | { readonly kind: 'lobby' }
  | { readonly kind: 'running'; readonly seed: number }
  | { readonly kind: 'over'; readonly outcomes: readonly DrillOutcome[] }

export function DrillsBranch({ onNavigate }: DrillsBranchProps): React.JSX.Element {
  // A monotonically advancing seed so each session (and "Drill again") deals a different reproducible set.
  const [seed, setSeed] = useState(1)
  const [phase, setPhase] = useState<Phase>({ kind: 'lobby' })

  const start = (): void => {
    setPhase({ kind: 'running', seed })
    setSeed((s) => s + 1)
  }

  if (phase.kind === 'running') {
    return (
      <DrillSession
        themes={DRILL_THEMES}
        length={DEFAULT_LENGTH}
        seed={phase.seed}
        onComplete={(outcomes) => setPhase({ kind: 'over', outcomes })}
        onExit={() => setPhase({ kind: 'lobby' })}
      />
    )
  }

  if (phase.kind === 'over') {
    const total = phase.outcomes.length
    const correct = phase.outcomes.filter((o) => o.result.correct).length
    return (
      <div className="screen" data-testid="drills-over">
        <div className="appbar">
          <div className="appbar-spacer" />
          <div className="appbar-titles">
            <div className="appbar-eyebrow">DRILLS</div>
            <div className="appbar-title">Session over</div>
          </div>
          <div className="appbar-spacer" />
        </div>

        <div className="endprimer">
          <div className="endprimer-body">
            <h1 data-testid="drills-score">
              {correct} of {total} right
            </h1>
            <p className="ep-lede">
              Drills sharpen the math — keep mixing them with hands at the table.
            </p>
          </div>
          <div className="endprimer-cta">
            <button
              type="button"
              className="cta-primary"
              onClick={start}
              data-testid="drills-again"
            >
              Drill again →
            </button>
          </div>
        </div>

        <TabBar active="drills" onNavigate={onNavigate} />
      </div>
    )
  }

  // Lobby: the single Start CTA over all themes (the real picker is ticket 0068).
  return (
    <div className="screen" data-testid="drills">
      <div className="appbar">
        <div className="appbar-spacer" />
        <div className="appbar-titles">
          <div className="appbar-eyebrow">DRILLS</div>
          <div className="appbar-title">Practice the math</div>
        </div>
        <div className="appbar-spacer" />
      </div>

      <div className="endprimer">
        <div className="endprimer-body">
          <h1>Mixed drills</h1>
          <p className="ep-lede">
            A fast, interleaved set across {DRILL_THEMES.length} topics — deal a spot, pick the
            line, see the math. Drills complement playing volume; they do not replace it.
          </p>
        </div>
        <div className="endprimer-cta">
          <button type="button" className="cta-primary" onClick={start} data-testid="drills-start">
            Start drilling →
          </button>
        </div>
      </div>

      <TabBar active="drills" onNavigate={onNavigate} />
    </div>
  )
}
