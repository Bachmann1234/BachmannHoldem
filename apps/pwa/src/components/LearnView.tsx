/**
 * The **Learn the fundamentals** route (ticket 0046) — the §5.2 design: a light, game-like vertical
 * path over the `FOUNDATIONS` sequence. Medallion nodes sit on an accent spine: **done** (filled with
 * a check), **current** (ringed, gently pulsing, carrying the Start/Resume tag), **locked** (dim, a
 * lock glyph). A header progress meter reads `n / 6`, the spine fills with accent up to the current
 * node, and a sticky bottom CTA resumes where you left off. The bottom {@link TabBar} sits beneath it
 * (this is a lobby surface — the tab bar shows here, unlike the immersive lesson player).
 *
 * Progress is **in-memory only for this ticket** — `progress` is the count of completed lessons
 * (default 0 ⇒ lesson 1 is "current", the rest locked). Durable, on-device progress is ticket 0048;
 * this view is already shaped to take a `progress` number from wherever that store lands.
 *
 * Selecting an unlocked node (done or current) calls `onOpenLesson(index)` — the shell opens the
 * lesson player at that index. Locked nodes are inert.
 */

import { useRef, useState } from 'react'
import { learnLessons, lessonHead } from '../learn/lessonMeta.js'
import { LocalStorageRulesGateStore, type RulesGateStore } from '../learn/rulesGateStore.js'
import { ChartOverlay } from './ChartOverlay.js'
import { GlossaryOverlay } from './GlossaryOverlay.js'
import { RulesOverlay } from './RulesOverlay.js'
import { CheckIcon, ChevIcon, LockIcon } from './Icons.js'
import { TabBar } from './TabBar.js'
import type { Tab } from './TabBar.js'

/** The medallion row height (px) — must match the design's `ROW_H` so the spine geometry lines up. */
const ROW_H = 104
/** The vertical centre of medallion `i` within the `.path` block (medallion is ~60px tall, top-aligned). */
const medCenter = (i: number): number => i * ROW_H + 52

/** Props for {@link LearnView}. */
export interface LearnViewProps {
  /** How many lessons the learner has completed (0..N). In-memory this ticket; durable in 0048. */
  readonly progress: number
  /** Open the lesson at `index` (only called for unlocked nodes / the resume CTA). */
  readonly onOpenLesson: (index: number) => void
  /** Navigate to another top-level tab (the bottom tab bar). */
  readonly onNavigate: (tab: Tab) => void
  /**
   * The on-device store for the one-time rules-reference soft-gate (ticket 0075). Defaults to the
   * `localStorage`-backed impl; tests inject a fake. The gate is a *nudge*: it shows once for a brand
   * new learner (so they meet a flush draw / overcard in the rules before the equity lesson), and is
   * dismissed forever the moment they open the rules or skip it.
   */
  readonly rulesGateStore?: RulesGateStore
}

/** Render the Learn path: progress meter, the medallion spine over `FOUNDATIONS`, resume CTA, tabs. */
export function LearnView({
  progress,
  onOpenLesson,
  onNavigate,
  rulesGateStore,
}: LearnViewProps): React.JSX.Element {
  const lessons = learnLessons
  const count = lessons.length
  // The starting-hand chart reference is a self-contained overlay; its open state is local UI.
  const [chartOpen, setChartOpen] = useState(false)
  // The poker-shorthand glossary is a sibling reference overlay — same local-UI open state.
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  // The poker-rules reference (the prerequisites the path assumes) — another sibling overlay.
  const [rulesOpen, setRulesOpen] = useState(false)
  // The rules-reference SOFT GATE (ticket 0075). The store defaults to the localStorage impl but is
  // constructed once (a ref) so re-renders never make a fresh one. The gate shows only for a learner
  // who has never seen/dismissed it AND has not started the primer — a brand-new beginner — so a
  // returning learner mid-path never re-meets the nudge.
  const gateStoreRef = useRef<RulesGateStore | null>(null)
  const gateStore = rulesGateStore ?? (gateStoreRef.current ??= new LocalStorageRulesGateStore())
  const [gateOpen, setGateOpen] = useState(() => progress === 0 && !gateStore.seen())
  // Dismiss the gate for good (open-the-rules and skip both land here so it never nags again).
  const dismissGate = (): void => {
    gateStore.markSeen()
    setGateOpen(false)
  }
  // The current node is the first unfinished lesson (clamped); once all are done the path is "all done".
  const allDone = progress >= count
  const currentIdx = Math.min(progress, count - 1)
  const fillTop = medCenter(0)
  const fillTo = allDone ? medCenter(count - 1) : medCenter(currentIdx)
  // The resume CTA targets the current node, or — once everything is done — the FIRST lesson, so the
  // done-state offers a clean "review from the start" rather than dumping the learner back on the last
  // lesson they just finished (every node is tappable for reference regardless).
  const resumeIdx = allDone ? 0 : currentIdx
  const resumeLesson = lessons[resumeIdx]!

  return (
    <div className="screen" data-testid="learn">
      <div className="appbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">FOUNDATIONS</div>
          </div>
        </div>
      </div>

      <div className="screen-body">
        <div className="learn">
          <div className="learn-head">
            <h1>Learn the fundamentals</h1>
            <div className="lh-sub">
              The fundamentals the coach assumes you know. ~30 seconds each.
            </div>
            <div className="progress-meter">
              <div className="pm-track">
                <div className="pm-fill" style={{ width: `${(progress / count) * 100}%` }} />
              </div>
              <div className="pm-count">
                {progress} / {count}
              </div>
            </div>
            <div className="learn-refs">
              <button
                type="button"
                className="chart-link"
                data-testid="open-chart"
                onClick={() => setChartOpen(true)}
              >
                ♠ Starting-hand chart
              </button>
              <button
                type="button"
                className="chart-link"
                data-testid="open-glossary"
                onClick={() => setGlossaryOpen(true)}
              >
                🔤 Glossary
              </button>
              <button
                type="button"
                className="chart-link"
                data-testid="open-rules"
                onClick={() => setRulesOpen(true)}
              >
                📖 Rulebook
              </button>
            </div>
          </div>

          {gateOpen ? (
            <div className="rules-gate" data-testid="rules-gate" role="note">
              <div className="rg-body">
                <div className="rg-title">New to poker? Start with the rules.</div>
                <p className="rg-text">
                  The lessons assume you already know the basics — what a flush draw or an overcard
                  is, and how a hand plays out. Skim the rule reference first so the very first
                  lesson lands.
                </p>
                <div className="rg-actions">
                  <button
                    type="button"
                    className="rg-primary"
                    data-testid="rules-gate-open"
                    onClick={() => {
                      dismissGate()
                      setRulesOpen(true)
                    }}
                  >
                    📖 Read the rules
                  </button>
                  <button
                    type="button"
                    className="rg-skip"
                    data-testid="rules-gate-skip"
                    onClick={dismissGate}
                  >
                    I know the rules
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="path" style={{ height: count * ROW_H + 8 }}>
            {/* the dim full-height spine, then the accent fill up to the current node */}
            <div
              style={{
                position: 'absolute',
                left: 53,
                top: fillTop,
                width: 5,
                height: medCenter(count - 1) - fillTop,
                borderRadius: 5,
                background: 'var(--surface-3)',
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 53,
                top: fillTop,
                width: 5,
                height: Math.max(0, fillTo - fillTop),
                borderRadius: 5,
                background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent-soft)',
                zIndex: 0,
              }}
            />

            {lessons.map(({ lesson, n, meta }, i) => {
              const done = i < progress
              const current = i === currentIdx && !allDone
              const locked = i > currentIdx && !allDone
              const open = done || current || allDone
              const cls = 'node-row ' + (done || allDone ? 'done' : current ? 'current' : 'locked')
              const handleOpen = open ? () => onOpenLesson(i) : undefined
              return (
                <div className={cls} key={lesson.id} data-testid={`node-${i}`}>
                  <button
                    type="button"
                    className="medallion"
                    data-testid={`lesson-${i}`}
                    disabled={!open}
                    aria-label={`Lesson ${n}: ${lesson.title}`}
                    onClick={handleOpen}
                  >
                    {done || allDone ? <CheckIcon /> : locked ? <LockIcon /> : n}
                  </button>
                  <div className="node-label">
                    <div className="nl-tier">Lesson {n}</div>
                    <h3>
                      {lessonHead(lesson)}
                      {meta.subtitle ? ` · ${meta.subtitle}` : ''}
                    </h3>
                    <p>{meta.teaser}</p>
                    {current && (
                      <button
                        type="button"
                        className="start-tag"
                        data-testid={`start-${i}`}
                        onClick={handleOpen}
                        aria-label={`${progress > 0 ? 'Resume' : 'Start'} lesson ${n}: ${lesson.title}`}
                      >
                        {progress > 0 ? 'Resume here' : 'Start here'}
                        <ChevIcon style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="resume-bar">
        <button
          type="button"
          className="resume-cta"
          data-testid="resume-cta"
          onClick={() => onOpenLesson(resumeIdx)}
        >
          <span>
            {allDone ? 'Review from the start · ' : progress > 0 ? 'Resume · ' : 'Start · '}
            {resumeLesson.lesson.title}
            <span className="rc-sub">
              {' '}
              Lesson {resumeLesson.n} of {count}
            </span>
          </span>
          <ChevIcon />
        </button>
      </div>

      <TabBar active="learn" onNavigate={onNavigate} />

      {chartOpen ? <ChartOverlay onClose={() => setChartOpen(false)} /> : null}
      {glossaryOpen ? <GlossaryOverlay onClose={() => setGlossaryOpen(false)} /> : null}
      {rulesOpen ? <RulesOverlay onClose={() => setRulesOpen(false)} /> : null}
    </div>
  )
}
