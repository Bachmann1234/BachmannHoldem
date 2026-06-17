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
 * **Spaced repetition (ticket 0080).** Progress is no longer ephemeral: each finished session's
 * per-concept outcomes are recorded to a durable {@link DrillProgressStore} (the shared IndexedDB layer
 * M6 stats + per-concept mastery [[0081]] also consume), and the NEXT session is *biased* toward the
 * concepts the learner recently got wrong — resurfacing the missed *concept TYPE* via a freshly composed
 * spot, interleaved (never blocked), so mistakes get spaced reps. The store provides the "weak concepts"
 * input; the pure {@link composeSession} stays seeded + deterministic, weighting the draw via its
 * {@link SessionBias} seam. Recording and the weak-concept read are BOTH wrapped so any storage failure
 * degrades gracefully (console.warn) and never breaks the loop — the history/progress-store idiom.
 *
 * The bias only *re-weights* the topics the player already picked; it never force-includes an unpicked
 * topic. The picker + recap show the bottom tab bar (they are lobby surfaces); the running session is
 * tab-less and immersive, exactly like the lesson player.
 *
 * **Mastery + adaptive difficulty (ticket 0081).** Off the SAME durable store (one `list()` read — no
 * second aggregation), we also surface per-concept **mastery** ("70% over 40 reps") next to each theme in
 * the lobby and in the recap, and *adapt difficulty* from it: a mastered concept is dealt **harder**
 * parameters (less-round money — {@link applyDifficulty} bakes the per-concept {@link Difficulty} into the
 * theme's `config`), and a chronically-weak concept is weighted UP in the next session's draw — folded
 * into 0080's review {@link SessionBias} via {@link mergeBiasConcepts} (the SAME single weighting seam, not
 * a second one). All of it is a pure read of the store's records (see `../drills/mastery`); difficulty
 * shifts which legal spot is dealt, never the correct answer (the coach/engine still grades).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DRILL_THEMES, type DrillTheme, type SessionBias } from '@holdem/drills'
import type { Concept } from '@holdem/coach'
import type { Tab } from './TabBar.js'
import { TabBar } from './TabBar.js'
import { CheckIcon, SparkIcon } from './Icons.js'
import { DrillSession, type DrillOutcome } from './DrillSession.js'
import {
  applyDifficulty,
  formatMastery,
  IndexedDbDrillProgressStore,
  lowMasteryConcepts,
  masteryByConcept,
  mergeBiasConcepts,
  weakConcepts,
  type ConceptMastery,
  type DrillProgressStore,
  type DrillSpotOutcome,
} from '../drills/index.js'

/** The session-length choices the picker offers — a short warm-up, the default, or a longer set. */
const LENGTHS = [5, 10, 20] as const
/** The default session length (the middle choice), preselected in the picker. */
const DEFAULT_LENGTH = 10

/**
 * How many of the learner's recently-missed concepts to resurface as review at most, and how hard to
 * weight them. A light touch on purpose: re-queue *augments* the session (a few extra reps on weak
 * topics, interleaved) rather than swamping it with review — the same "drills complement, not dominate"
 * discipline. The weight makes a weak topic ~2× as likely at each position it is a candidate.
 */
const MAX_REVIEW_CONCEPTS = 3
const REVIEW_WEIGHT = 1

/** Render a kebab-case {@link Concept} as words ("pot-odds" → "pot odds"), the shared primer idiom. */
function conceptWords(concept: Concept): string {
  return concept.replace(/-/g, ' ')
}

/** Props for {@link DrillsBranch}. */
export interface DrillsBranchProps {
  /** Navigate to another top-level tab — forwarded to the lobby/summary tab bar. */
  readonly onNavigate: (tab: Tab) => void
  /**
   * The durable per-concept drill-progress store the spaced-repetition seam records to and reads weak
   * concepts from (ticket 0080). Defaults to the IndexedDB-backed store; tests inject a fake / throwing
   * fake so they never touch real storage. Optional so a non-persisting caller still works — and every
   * call is wrapped, so even a present-but-throwing store never breaks the loop.
   */
  readonly progressStore?: DrillProgressStore
  /**
   * Epoch-ms clock the recording seam stamps outcomes with (recency for re-queue). Defaults to
   * `Date.now`; tests inject a fixed clock. Kept out of the pure store/record (the shell supplies time),
   * mirroring how the hand-history record's `playedAt` is shell-supplied.
   */
  readonly now?: () => number
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
      /** The spaced-repetition bias frozen at session start — so a mid-session refresh never re-deals. */
      readonly bias: SessionBias | undefined
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

export function DrillsBranch({
  onNavigate,
  progressStore,
  now,
}: DrillsBranchProps): React.JSX.Element {
  // A monotonically advancing seed so each session (and "Drill again") deals a different reproducible set.
  const [seed, setSeed] = useState(1)
  const [phase, setPhase] = useState<Phase>({ kind: 'lobby' })
  // The picker selection: the set of chosen theme ids (all selected by default — a mixed, interleaved
  // session across every topic is the sensible starting point). And the chosen length.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(DRILL_THEMES.map((t) => t.id)),
  )
  const [length, setLength] = useState<number>(DEFAULT_LENGTH)
  // The learner's recently-missed concepts — the spaced-repetition "review" set the next session's draw
  // is biased toward. Loaded from the durable store (async) and refreshed after each session is recorded.
  const [reviewConcepts, setReviewConcepts] = useState<readonly Concept[]>([])
  // Per-concept mastery (ticket 0081), read from the SAME store records as the review set — the source for
  // the lobby/recap readout AND the adaptive difficulty + low-mastery bias. A view, not a second store.
  const [mastery, setMastery] = useState<ReadonlyMap<Concept, ConceptMastery>>(() => new Map())

  // The default store is created lazily ONCE (same idiom as App's history/progress stores) so the drill
  // loop reads/writes one durable on-device record across renders. Tests inject their own store. Memoised
  // so `store` is a STABLE dep for the callbacks below (a new default instance per render would re-fire
  // the effect; an injected store is referentially stable already).
  const defaultStoreRef = useRef<DrillProgressStore | null>(null)
  const store = useMemo(
    () => progressStore ?? (defaultStoreRef.current ??= new IndexedDbDrillProgressStore()),
    [progressStore],
  )
  const clock = now ?? Date.now

  // Read the store ONCE and derive BOTH the spaced-repetition review set (0080) AND the per-concept mastery
  // view (0081) from the same records — no second aggregation. Wrapped so a storage failure degrades
  // gracefully (empty review set, empty mastery) and never throws into the loop — the progress-store idiom.
  const refreshReview = useCallback(async (): Promise<void> => {
    try {
      const records = await store.list()
      setReviewConcepts(weakConcepts(records, MAX_REVIEW_CONCEPTS))
      setMastery(masteryByConcept(records))
    } catch (err: unknown) {
      console.warn('drill-progress: weak-concept read failed', err)
      setReviewConcepts([])
      setMastery(new Map())
    }
  }, [store])

  // Load the review set once on mount so the FIRST session of a visit is already biased toward prior
  // mistakes. (The store is stable, so this runs once.)
  useEffect(() => {
    void refreshReview()
  }, [refreshReview])

  // Record a finished session's per-concept outcomes durably, then refresh the review set so the next
  // session re-queues the just-missed concepts. Wrapped so a storage failure is swallowed — recording is
  // best-effort and must never block the recap. The store owns the per-concept aggregation.
  const record = useCallback(
    async (outcomes: readonly DrillOutcome[]): Promise<void> => {
      const spotOutcomes: DrillSpotOutcome[] = outcomes.map((o) => ({
        concept: o.theme.concept,
        correct: o.result.correct,
      }))
      try {
        await store.recordOutcomes(spotOutcomes, clock())
      } catch (err: unknown) {
        console.warn('drill-progress: record failed', err)
      }
      await refreshReview()
    },
    [store, clock, refreshReview],
  )

  const toggleTheme = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Start a session over the picked themes. Guarded so we never hand composeSession an empty list. The
  // spaced-repetition bias (weight the seeded draw toward the learner's recently-missed concepts) is
  // FROZEN here at session start — `undefined` when there is nothing to review, so the composer takes its
  // plain uniform-interleave path (byte-identical to no bias). Freezing it means a mid-session review
  // refresh never re-deals the running session.
  const start = (themes: readonly DrillTheme[], len: number): void => {
    if (themes.length === 0) return
    // The bias concepts MERGE 0080's recently-missed review set with this ticket's chronically-low-mastery
    // set — through the SAME single SessionBias seam (mergeBiasConcepts unions them), never a second knob.
    const biasConcepts = mergeBiasConcepts(reviewConcepts, lowMasteryConcepts(mastery))
    const bias: SessionBias | undefined =
      biasConcepts.length > 0
        ? { concepts: new Set(biasConcepts), weight: REVIEW_WEIGHT }
        : undefined
    // Bake the adaptive per-concept difficulty into the picked themes' configs (harder draws for mastered
    // concepts) — frozen with the session so a mid-session mastery refresh never re-deals.
    const dealt = applyDifficulty(themes, mastery)
    setPhase({ kind: 'running', seed, themes: dealt, length: len, bias })
    setSeed((s) => s + 1)
  }

  if (phase.kind === 'running') {
    return (
      <DrillSession
        themes={phase.themes}
        length={phase.length}
        seed={phase.seed}
        bias={phase.bias}
        onComplete={(outcomes) => {
          void record(outcomes)
          setPhase({ kind: 'over', outcomes, themes: phase.themes, length: phase.length })
        }}
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
              That is the decision-quality read, not a score to grind. Keep mixing these reps with
              real hands at the table.
            </p>

            {/* By-concept breakdown — which topics you drilled, and where you slipped. */}
            <div className="recap" data-testid="drills-breakdown">
              {byConcept.map((c) => {
                // The lifetime mastery over time (ticket 0081), alongside this session's tally — so the
                // learner sees progress across sessions, not just today's count. Read from the same store.
                const readout = formatMastery(mastery.get(c.concept))
                return (
                  <div className="recap-row" key={c.concept} data-testid={`concept-${c.concept}`}>
                    <span className="rr-check">
                      <CheckIcon />
                    </span>
                    <span className="rr-name">{c.title}</span>
                    <span className="rr-sub" data-testid={`concept-tally-${c.concept}`}>
                      {c.correct} / {c.total} · {conceptWords(c.concept)}
                      {readout ? ` · ${readout.percent} over ${readout.reps}` : ''}
                    </span>
                  </div>
                )
              })}
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
            Fast, interleaved reps to complement your time at the table, not replace it.
          </div>
        </div>

        <div className="setup-card">
          {DRILL_THEMES.map((theme) => {
            const on = selectedIds.has(theme.id)
            // The per-concept mastery readout (ticket 0081), read from the same store — "70% over 40 reps"
            // when drilled, a gentle "not drilled yet" before. It is a decision-quality read, not a score.
            const readout = formatMastery(mastery.get(theme.concept))
            return (
              <div className="setup-row" key={theme.id}>
                <div className="setup-label">
                  {theme.title}
                  <span className="hint" data-testid={`theme-mastery-${theme.id}`}>
                    {readout
                      ? `${conceptWords(theme.concept)} · ${readout.percent} over ${readout.reps}`
                      : `${conceptWords(theme.concept)} · not drilled yet`}
                  </span>
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
            <div className="setup-label">Length</div>
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
