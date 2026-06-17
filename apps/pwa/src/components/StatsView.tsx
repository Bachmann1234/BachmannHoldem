/**
 * The **Stats** screen (ticket 0089) — the M6 "analyze my hands" surface and the 4th top-level tab
 * (Play / Learn / Drills / **Stats**). It is the unified "how am I doing" home that turns the durable
 * play log and the durable drill log into three read-only sections:
 *
 * - **Play stats** — VPIP / PFR / aggression factor / fold-to-3bet (overall, with a by-position
 *   breakdown), each carrying its **sample size** ("over N hands"). Read through
 *   `historyStore.list()` → {@link aggregateHeroStats} (ticket 0087). NEVER recomputed here.
 * - **Leaks** — {@link detectLeaks}' output (ticket 0088): `confirmed` leaks shown plainly, `pending`
 *   candidates shown as a "need N more hands" cue (NEVER as a confirmed leak), and an encouraging
 *   empty state ("keep playing — N hands so far") rather than a blank.
 * - **Drill mastery** — per-concept mastery via {@link masteryByConcept} / {@link formatMastery}
 *   (ticket 0081) over `drillProgressStore.list()`. Read-only; the Drills lobby keeps its own inline
 *   readout.
 *
 * **This is a thin wiring layer — surface, don't compute.** All the math lives in the aggregation /
 * leak / mastery modules; this component only reads those and renders, exactly like {@link DrillsBranch}.
 * If a number needs a new derivation it belongs in those modules, not here.
 *
 * **Sample-size honesty is the whole point.** Every play stat shows its denominator ("over N hands");
 * an absent position slice reads "not seen yet" (not 0%); a null AF ratio (calls === 0) renders as "—"
 * (not 0); and a `pending` leak shows the "need N more hands" cue, never the confirmed treatment.
 *
 * **Graceful degradation (the store-read contract).** Both store reads are async and may fail; a
 * failure shows an inline notice for that section and NEVER throws — mirroring {@link HistoryView}. The
 * two reads are independent: a drill-store failure does not blank the play stats and vice-versa.
 *
 * **Local stat explanations.** Each stat name carries a concise plain-English help line in the app's
 * teaching voice (see {@link STAT_HELP}). These are deliberately LOCAL to this view and NOT wired into
 * the hand-strength `GlossaryText` / `GLOSSARY_TERMS` system, which is exhaustively typed to the
 * `@holdem/coach` `GradeTermId` hand-strength vocabulary (a different jargon domain).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Concept, Position } from '@holdem/coach'
import type { Tab } from './TabBar.js'
import { TabBar } from './TabBar.js'
import {
  aggregateHeroStats,
  detectLeaks,
  IndexedDbHandHistoryStore,
  POSITION_ORDER,
  type AggregatedHeroStats,
  type AggressionStat,
  type DetectedLeak,
  type HandHistoryStore,
  type HeroStats,
  type RateStat,
} from '../history/index.js'
import {
  formatMastery,
  IndexedDbDrillProgressStore,
  masteryByConcept,
  type ConceptMastery,
  type DrillProgressStore,
} from '../drills/index.js'

/** The concepts the drill-mastery section lists, in a stable teaching order (mirrors the primer vocab). */
const MASTERY_CONCEPTS: readonly Concept[] = [
  'pot-odds',
  'equity',
  'equity-vs-price',
  'ev',
  'position',
  'ranges',
]

/** Human-readable label for each {@link Position} bucket (the by-position breakdown rows). */
const POSITION_LABEL: Readonly<Record<Position, string>> = {
  early: 'Early',
  middle: 'Middle',
  late: 'Late',
  'small-blind': 'Small blind',
  'big-blind': 'Big blind',
}

/** Render a kebab-case {@link Concept} as words ("pot-odds" → "pot odds") — the shared primer idiom. */
function conceptWords(concept: Concept): string {
  return concept.replace(/-/g, ' ')
}

/**
 * The four core play stats, with a concise plain-English help line each (the app's teaching voice).
 * Kept local to the Stats view on purpose — these are stats jargon, a different domain from the
 * hand-strength glossary (`@holdem/coach` `GradeTermId`), which we deliberately do not touch.
 */
const STAT_HELP = {
  vpip: 'how often you voluntarily put money in the pot before the flop',
  pfr: 'how often you raise before the flop',
  af: 'how often you bet or raise versus just calling (bets + raises ÷ calls)',
  foldTo3bet: 'how often you fold after opening and getting re-raised',
} as const

/** Props for {@link StatsView}. */
export interface StatsViewProps {
  /** Navigate to another top-level tab — forwarded to the lobby tab bar (Stats is a lobby surface). */
  readonly onNavigate: (tab: Tab) => void
  /**
   * The durable hand-history store the play stats read through (ticket 0037). Defaults to the
   * IndexedDB-backed store; tests inject a fake / throwing fake so they never touch real storage. The
   * App shares the SAME instance the recording seam appends to, so the stats reflect live play.
   */
  readonly historyStore?: HandHistoryStore
  /**
   * The durable per-concept drill-progress store the mastery readout reads through (ticket 0080).
   * Defaults to the IndexedDB-backed store; tests inject a fake / throwing fake. Read-only here.
   */
  readonly drillProgressStore?: DrillProgressStore
}

/** Async load state for the play-stats read (mirrors {@link HistoryView}'s load-state handling). */
type PlayState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready'
      readonly stats: AggregatedHeroStats
      readonly leaks: readonly DetectedLeak[]
    }
  | { readonly kind: 'error' }

/** Async load state for the drill-mastery read. */
type MasteryState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly mastery: ReadonlyMap<Concept, ConceptMastery> }
  | { readonly kind: 'error' }

/** Format a `0..1` fraction as a whole-percent string, e.g. `0.234 → "23%"`. */
function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

/** The "over N hands" sample phrase for a denominator (pluralised). */
function overHands(n: number): string {
  return `over ${n} ${n === 1 ? 'hand' : 'hands'}`
}

/**
 * Render a single rate stat (VPIP / PFR / fold-to-3bet) as a value + sample phrase. A `null` fraction
 * (no sample) reads as a "no data yet" placeholder, NEVER as 0%.
 */
function rateDisplay(stat: RateStat): { value: string; sample: string } {
  return {
    value: stat.fraction === null ? '—' : pct(stat.fraction),
    sample: stat.fraction === null ? 'not seen yet' : overHands(stat.denominator),
  }
}

/** Render the aggression factor: a `null` ratio (calls === 0) is a placeholder "—", never 0. */
function afDisplay(stat: AggressionStat): { value: string; sample: string } {
  return {
    value: stat.ratio === null ? '—' : stat.ratio.toFixed(1),
    sample: stat.hands === 0 ? 'not seen yet' : overHands(stat.hands),
  }
}

/** One stat row: a name + help line on the left, the value + sample on the right. */
function StatRow({
  label,
  help,
  value,
  sample,
  testid,
}: {
  label: string
  help: string
  value: string
  sample: string
  testid: string
}): React.JSX.Element {
  return (
    <div className="setup-row" data-testid={testid}>
      <div className="setup-label">
        {label}
        <span className="hint">{help}</span>
      </div>
      <div className="stat-value">
        <span className="stat-num" data-testid={`${testid}-value`}>
          {value}
        </span>
        <span className="stat-sample" data-testid={`${testid}-sample`}>
          {sample}
        </span>
      </div>
    </div>
  )
}

/** The four core stat rows for a slice of stats (overall, or one position). */
function StatRows({ stats, prefix }: { stats: HeroStats; prefix: string }): React.JSX.Element {
  const vpip = rateDisplay(stats.vpip)
  const pfr = rateDisplay(stats.pfr)
  const af = afDisplay(stats.aggressionFactor)
  const ftb = rateDisplay(stats.foldToThreeBet)
  return (
    <>
      <StatRow label="VPIP" help={STAT_HELP.vpip} {...vpip} testid={`${prefix}-vpip`} />
      <StatRow label="PFR" help={STAT_HELP.pfr} {...pfr} testid={`${prefix}-pfr`} />
      <StatRow label="Aggression factor" help={STAT_HELP.af} {...af} testid={`${prefix}-af`} />
      <StatRow
        label="Fold to 3-bet"
        help={STAT_HELP.foldTo3bet}
        {...ftb}
        testid={`${prefix}-fold3bet`}
      />
    </>
  )
}

/** The Stats screen — reads both durable stores and renders the three read-only sections. */
export function StatsView({
  onNavigate,
  historyStore,
  drillProgressStore,
}: StatsViewProps): React.JSX.Element {
  // Default stores created lazily ONCE (the App's idiom) so a non-injecting caller still works without
  // creating a fresh DB binding each render. Tests inject their own. Memoised for stable effect deps.
  const defaultHistoryRef = useRef<HandHistoryStore | null>(null)
  const history = useMemo(
    () => historyStore ?? (defaultHistoryRef.current ??= new IndexedDbHandHistoryStore()),
    [historyStore],
  )
  const defaultDrillRef = useRef<DrillProgressStore | null>(null)
  const drills = useMemo(
    () => drillProgressStore ?? (defaultDrillRef.current ??= new IndexedDbDrillProgressStore()),
    [drillProgressStore],
  )

  const [play, setPlay] = useState<PlayState>({ kind: 'loading' })
  const [mastery, setMastery] = useState<MasteryState>({ kind: 'loading' })

  // Read the play log and project it to stats + leaks (no recompute — aggregateHeroStats/detectLeaks
  // own the math). A read failure degrades to an inline notice for THIS section only, never a throw.
  useEffect(() => {
    let cancelled = false
    Promise.resolve(history.list())
      .then((records) => {
        if (cancelled) return
        const stats = aggregateHeroStats(records)
        setPlay({ kind: 'ready', stats, leaks: detectLeaks(stats) })
      })
      .catch((err: unknown) => {
        console.warn('stats: play-stats read failed', err)
        if (!cancelled) setPlay({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [history])

  // Read the drill log and project it to per-concept mastery (no recompute — masteryByConcept owns it).
  // Independent of the play read: a drill-store failure degrades only the mastery section.
  useEffect(() => {
    let cancelled = false
    Promise.resolve(drills.list())
      .then((records) => {
        if (!cancelled) setMastery({ kind: 'ready', mastery: masteryByConcept(records) })
      })
      .catch((err: unknown) => {
        console.warn('stats: drill-mastery read failed', err)
        if (!cancelled) setMastery({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [drills])

  return (
    <div className="app" data-testid="stats">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">STATS</div>
          </div>
        </div>
      </div>

      <div className="setup">
        <div className="setup-head">
          <div className="setup-title">How am I doing</div>
          <div className="setup-sub">
            Your play stats, the leaks worth working on, and your drill mastery — all in one place.
            A thin sample reads as thin, so the numbers come with how many hands they are over.
          </div>
        </div>

        <PlayStatsSection state={play} />
        <LeaksSection state={play} />
        <MasterySection state={mastery} />
      </div>

      <TabBar active="stats" onNavigate={onNavigate} />
    </div>
  )
}

/** The play-side stats section: overall four stats + the by-position breakdown, each with its sample. */
function PlayStatsSection({ state }: { state: PlayState }): React.JSX.Element {
  if (state.kind === 'loading') {
    return (
      <div className="setup-card" data-testid="play-stats">
        <div className="hint">Loading your play stats…</div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="setup-card" data-testid="play-stats">
        <div className="hint" data-testid="play-stats-error">
          Couldn’t load your play stats.
        </div>
      </div>
    )
  }

  const { overall } = state.stats
  return (
    <>
      <div className="setup-card" data-testid="play-stats">
        <div className="stat-section-head">
          <div className="setup-label">Overall</div>
          <span className="hint" data-testid="play-stats-sample">
            {overHands(overall.hands)}
          </span>
        </div>
        <StatRows stats={overall} prefix="overall" />
      </div>

      <div className="setup-card" data-testid="play-by-position">
        <div className="stat-section-head">
          <div className="setup-label">By position</div>
          <span className="hint">where you were sitting</span>
        </div>
        {POSITION_ORDER.map((position) => {
          const slice = state.stats.byPosition.get(position)
          // An absent slice is "not seen yet", NEVER zeroed stats — surface that honestly.
          if (slice === undefined) {
            return (
              <div className="setup-row" key={position} data-testid={`position-${position}`}>
                <div className="setup-label">{POSITION_LABEL[position]}</div>
                <span className="stat-sample" data-testid={`position-${position}-empty`}>
                  not seen yet
                </span>
              </div>
            )
          }
          return (
            <details className="stat-position" key={position} data-testid={`position-${position}`}>
              <summary className="stat-position-head">
                <span className="setup-label">{POSITION_LABEL[position]}</span>
                <span className="stat-sample">{overHands(slice.hands)}</span>
              </summary>
              <div className="stat-position-body">
                <StatRows stats={slice} prefix={`position-${position}`} />
              </div>
            </details>
          )
        })}
      </div>
    </>
  )
}

/** The leaks section: confirmed leaks plainly, pending as "need N more hands", encouraging when empty. */
function LeaksSection({ state }: { state: PlayState }): React.JSX.Element {
  if (state.kind === 'loading') {
    return (
      <div className="setup-card" data-testid="leaks">
        <div className="hint">Looking for leaks…</div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="setup-card" data-testid="leaks">
        <div className="hint" data-testid="leaks-error">
          Couldn’t load your leaks.
        </div>
      </div>
    )
  }

  const confirmed = state.leaks.filter((l) => l.status === 'confirmed')
  const pending = state.leaks.filter((l) => l.status === 'pending')
  const hands = state.stats.overall.hands

  return (
    <div className="setup-card" data-testid="leaks">
      <div className="stat-section-head">
        <div className="setup-label">Leaks to work on</div>
        <span className="hint">gated on a real sample, so a thin read stays quiet</span>
      </div>

      {confirmed.length === 0 && pending.length === 0 ? (
        // Encouraging empty state — NOT a blank. Names the sample so the silence reads as honest.
        <div className="hint" data-testid="leaks-empty">
          {hands === 0
            ? 'No hands yet — play a few and your leaks will show up here.'
            : `No clear leaks yet — keep playing. ${hands} ${hands === 1 ? 'hand' : 'hands'} so far.`}
        </div>
      ) : null}

      {confirmed.map((leak) => (
        <div className="leak-row leak-confirmed" key={leak.key} data-testid={`leak-${leak.key}`}>
          <span className="leak-dot" aria-hidden="true" />
          <p className="leak-desc">{leak.description}</p>
        </div>
      ))}

      {pending.map((leak) => (
        // Pending is NEVER the confirmed treatment: a muted "need N more hands" cue, distinct styling.
        <div className="leak-row leak-pending" key={leak.key} data-testid={`leak-${leak.key}`}>
          <p className="leak-desc">{leak.description}</p>
          <span className="leak-need" data-testid={`leak-${leak.key}-need`}>
            need {leak.handsNeeded} more {leak.handsNeeded === 1 ? 'hand' : 'hands'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The drill-mastery section: per-concept readout, "not drilled yet" for an undrilled concept. */
function MasterySection({ state }: { state: MasteryState }): React.JSX.Element {
  if (state.kind === 'loading') {
    return (
      <div className="setup-card" data-testid="mastery">
        <div className="hint">Loading your drill mastery…</div>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="setup-card" data-testid="mastery">
        <div className="hint" data-testid="mastery-error">
          Couldn’t load your drill mastery.
        </div>
      </div>
    )
  }

  return (
    <div className="setup-card" data-testid="mastery">
      <div className="stat-section-head">
        <div className="setup-label">Drill mastery</div>
        <span className="hint">a decision-quality read, not a score to grind</span>
      </div>
      {MASTERY_CONCEPTS.map((concept) => {
        const readout = formatMastery(state.mastery.get(concept))
        return (
          <div className="setup-row" key={concept} data-testid={`mastery-${concept}`}>
            <div className="setup-label">{conceptWords(concept)}</div>
            <span className="stat-sample" data-testid={`mastery-${concept}-readout`}>
              {readout ? `${readout.percent} over ${readout.reps}` : 'not drilled yet'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
