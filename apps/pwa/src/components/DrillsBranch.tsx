/**
 * The Drills route (tickets 0067 → 0068) — the shell that *brackets* the M5 drill session loop with a
 * real **theme picker** (the way in) and a by-**concept** end-of-session **summary** (the way out).
 *
 * - **The picker (the lobby).** A multi-select over {@link DRILL_THEMES}: the player toggles which
 *   topic(s) to drill (each row names the theme and the {@link Concept} it exercises) and picks a
 *   session length, then starts. At least one theme must be selected — {@link composeSession} throws on
 *   an empty list, so the Start CTA is disabled until something is picked. The selected subset + length
 *   + seed flow straight into {@link DrillSession}; this shell never grades.
 * - **The summary (the recap).** After the last spot, {@link DrillSession} hands back the per-spot
 *   {@link DrillOutcome}s. We aggregate them into an overall score AND a per-concept breakdown (grouped
 *   on the drilled {@link DrillTheme} — its `concept`/`title` — so the player sees which topics they
 *   drilled and where they slipped), in the SAME {@link Concept} vocabulary the coach and the
 *   Foundations primer speak. "Drill again" deals a fresh (new-seed) session; the tab bar routes back to
 *   play/learn. Counts only — the grades came from the real `gradeSpot` inside the session.
 *
 * **Honest framing (the learning doc is explicit).** Drills are high-efficiency reps but they
 * **complement** playing volume — they do not replace it, and improvement here is decision-quality, not
 * a score to grind. The picker + recap copy says exactly that and nothing stronger.
 *
 * Progress is **ephemeral** (in-memory) this milestone — the summary is derived from the just-finished
 * in-memory outcomes, nothing is persisted (durable cross-session stats are M6, which can later persist
 * this same per-concept shape). The picker + recap show the bottom tab bar (they are lobby surfaces);
 * the running session is tab-less and immersive, exactly like the lesson player.
 */

import { useState } from 'react'
import { DRILL_THEMES, type DrillTheme } from '@holdem/drills'
import type { Concept } from '@holdem/coach'
import type { Tab } from './TabBar.js'
import { TabBar } from './TabBar.js'
import { CheckIcon, SparkIcon } from './Icons.js'
import { DrillSession, type DrillOutcome } from './DrillSession.js'

/** The session-length choices the picker offers — a short warm-up, the default, or a longer set. */
const LENGTHS = [5, 10, 20] as const
/** The default session length (the middle choice), preselected in the picker. */
const DEFAULT_LENGTH = 10

/** Render a kebab-case {@link Concept} as words ("pot-odds" → "pot odds"), the shared primer idiom. */
function conceptWords(concept: Concept): string {
  return concept.replace(/-/g, ' ')
}

/** Props for {@link DrillsBranch}. */
export interface DrillsBranchProps {
  /** Navigate to another top-level tab — forwarded to the lobby/summary tab bar. */
  readonly onNavigate: (tab: Tab) => void
}

/**
 * The Drills branch state machine: `'lobby'` (the theme picker), `'running'` (the live
 * {@link DrillSession} over the chosen themes), `'over'` (the by-concept summary). The session seed is
 * bumped on each new session so "Drill again" deals a fresh — but still reproducible — set rather than
 * replaying the same spots.
 */
type Phase =
  | { readonly kind: 'lobby' }
  | {
      readonly kind: 'running'
      readonly seed: number
      readonly themes: readonly DrillTheme[]
      readonly length: number
    }
  | {
      readonly kind: 'over'
      readonly outcomes: readonly DrillOutcome[]
      readonly themes: readonly DrillTheme[]
      readonly length: number
    }

/** One concept's tally in the summary — the topic drilled and how many of its spots were coach-correct. */
interface ConceptTally {
  readonly concept: Concept
  readonly title: string
  readonly correct: number
  readonly total: number
}

/**
 * Group the finished session's {@link DrillOutcome}s by the drilled topic. We key on the theme's stable
 * `concept` (the shared {@link Concept} vocabulary — note `result.concept` is the grade-time tag and
 * agrees with the theme on the spots it produced) and tally correct/total per concept, preserving first
 * appearance order so the breakdown reads in the order the player met each topic.
 */
function tallyByConcept(outcomes: readonly DrillOutcome[]): readonly ConceptTally[] {
  const order: Concept[] = []
  const acc = new Map<Concept, { title: string; correct: number; total: number }>()
  for (const { result, theme } of outcomes) {
    let entry = acc.get(theme.concept)
    if (entry === undefined) {
      entry = { title: theme.title, correct: 0, total: 0 }
      acc.set(theme.concept, entry)
      order.push(theme.concept)
    }
    entry.total += 1
    if (result.correct) entry.correct += 1
  }
  return order.map((concept) => ({ concept, ...acc.get(concept)! }))
}

export function DrillsBranch({ onNavigate }: DrillsBranchProps): React.JSX.Element {
  // A monotonically advancing seed so each session (and "Drill again") deals a different reproducible set.
  const [seed, setSeed] = useState(1)
  const [phase, setPhase] = useState<Phase>({ kind: 'lobby' })
  // The picker selection: the set of chosen theme ids (all selected by default — a mixed, interleaved
  // session across every topic is the sensible starting point). And the chosen length.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(DRILL_THEMES.map((t) => t.id)),
  )
  const [length, setLength] = useState<number>(DEFAULT_LENGTH)

  const toggleTheme = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Start a session over the picked themes. Guarded so we never hand composeSession an empty list.
  const start = (themes: readonly DrillTheme[], len: number): void => {
    if (themes.length === 0) return
    setPhase({ kind: 'running', seed, themes, length: len })
    setSeed((s) => s + 1)
  }

  if (phase.kind === 'running') {
    return (
      <DrillSession
        themes={phase.themes}
        length={phase.length}
        seed={phase.seed}
        onComplete={(outcomes) =>
          setPhase({ kind: 'over', outcomes, themes: phase.themes, length: phase.length })
        }
        onExit={() => setPhase({ kind: 'lobby' })}
      />
    )
  }

  if (phase.kind === 'over') {
    const total = phase.outcomes.length
    const correct = phase.outcomes.filter((o) => o.result.correct).length
    const byConcept = tallyByConcept(phase.outcomes)
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
            <div className="ep-medal">
              <SparkIcon style={{ width: 30, height: 30 }} />
            </div>
            <h1 data-testid="drills-score">
              {correct} of {total} right
            </h1>
            <p className="ep-lede">
              That is the decision-quality read, not a score to grind — keep mixing these reps with
              real hands at the table.
            </p>

            {/* By-concept breakdown — which topics you drilled, and where you slipped. */}
            <div className="recap" data-testid="drills-breakdown">
              {byConcept.map((c) => (
                <div className="recap-row" key={c.concept} data-testid={`concept-${c.concept}`}>
                  <span className="rr-check">
                    <CheckIcon />
                  </span>
                  <span className="rr-name">{c.title}</span>
                  <span className="rr-sub" data-testid={`concept-tally-${c.concept}`}>
                    {c.correct} / {c.total} · {conceptWords(c.concept)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="endprimer-cta">
            <button
              type="button"
              className="cta-primary"
              onClick={() => start(phase.themes, phase.length)}
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

  // Lobby: the theme picker. Choose which topic(s) to drill + a length, then start.
  const selectedThemes = DRILL_THEMES.filter((t) => selectedIds.has(t.id))
  const canStart = selectedThemes.length > 0

  return (
    <div className="app" data-testid="drills">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">DRILLS</div>
          </div>
        </div>
      </div>

      <div className="setup">
        <div className="setup-head">
          <div className="setup-title">Practice the math</div>
          <div className="setup-sub">
            Pick the topic(s) to drill. Fast, interleaved reps that complement your time at the
            table — they don&apos;t replace it.
          </div>
        </div>

        <div className="setup-card">
          {DRILL_THEMES.map((theme) => {
            const on = selectedIds.has(theme.id)
            return (
              <div className="setup-row" key={theme.id}>
                <div className="setup-label">
                  {theme.title}
                  <span className="hint">drills {conceptWords(theme.concept)}</span>
                </div>
                <button
                  type="button"
                  className="preset-pill"
                  aria-pressed={on}
                  aria-label={`${on ? 'Remove' : 'Add'} ${theme.title}`}
                  data-testid={`theme-${theme.id}`}
                  onClick={() => toggleTheme(theme.id)}
                >
                  {on ? '✓ On' : 'Off'}
                </button>
              </div>
            )
          })}
        </div>

        <div className="setup-card">
          <div className="setup-row">
            <div className="setup-label">
              Length
              <span className="hint">how many spots this session</span>
            </div>
            <div className="stepper" role="group" aria-label="Session length">
              {LENGTHS.map((len) => (
                <button
                  key={len}
                  type="button"
                  className="preset-pill"
                  aria-pressed={length === len}
                  data-testid={`length-${len}`}
                  onClick={() => setLength(len)}
                  style={{ minWidth: 52 }}
                >
                  {len}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn next-cta setup-cta"
          disabled={!canStart}
          data-testid="drills-start"
          onClick={() => start(selectedThemes, length)}
        >
          {canStart ? 'Start drilling →' : 'Pick a topic to start'}
        </button>
      </div>

      <TabBar active="drills" onNavigate={onNavigate} />
    </div>
  )
}
