/**
 * The live, interactive root of the PWA (ticket 0035) — the DOM analog of the Ink TUI's `Root`. It
 * holds the MVU model and drives a full **multiway session**: a touch table-setup screen, then
 * multiple hands at a 2–6-max table where stacks carry, the button rotates, busted players drop out,
 * and the session ends with a summary.
 *
 * MVU discipline (identical to `Root`): the model lives in `useReducer(reducer, …)` and the *only*
 * way it changes is a dispatched {@link Msg}; the reducer is pure and owns the whole session/setup
 * state machine. The two non-pure concerns it must not hold live here in the shell:
 *
 * - **The deck shuffle.** When a hand needs dealing (after setup, on play-again) the shell pulls a
 *   deck — an injected one (tests) from {@link deckQueueRef}, else a fresh {@link shuffledDeck} — and
 *   dispatches `{ type: 'start-hand', deck }`. The reducer builds the seating + button and deals.
 * - **The bots' decisions.** One {@link Opponent} is created per stable player id (in {@link botsRef},
 *   once the session starts) and reused every hand. A `useEffect` watches the live hand and, whenever
 *   it is a bot's turn, routes the acting engine seat → its stable player id (via `seatToId`) → that
 *   player's persistent bot, and dispatches the decision. Several bots act between the hero's turns.
 *
 * Input is phase-gated by *rendering*: `'setup'` → {@link SetupScreen};
 * `'playing'`/`'hand-over'`/`'session-over'` → {@link Table} + {@link ActionBar} (active only on the
 * hero's turn) + the between-hands / view-summary CTA; `'game-over'` → {@link Summary}.
 * `'session-over'` keeps the busted-out final hand on the table for review until the hero dismisses
 * it to the summary. "New table" remounts a fresh session via a key bump.
 *
 * The bot "thinking" delay is injectable (`botDelayMs`, default {@link DEFAULT_BOT_DELAY_MS}) so
 * tests pass `0` and never depend on the wall clock.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { isComplete, legalActions, type Action, type Card, type LegalActions } from '@holdem/engine'
import { decisionContext, type Opponent } from '@holdem/bots'
import {
  createInitialModel,
  reducer,
  shuffledDeck,
  actionIsLegal,
  makeBot,
  type InitialModelOptions,
  type Model,
  type SessionPlayer,
} from '@holdem/session'
import { ActionBar } from './components/ActionBar.js'
import { CoachDrawer } from './components/CoachDrawer.js'
import { CoachFab } from './components/CoachFab.js'
import { HistoryView } from './components/HistoryView.js'
import { EndOfPrimer } from './components/EndOfPrimer.js'
import { LearnView } from './components/LearnView.js'
import { LessonPlayer } from './components/LessonPlayer.js'
import { SetupScreen } from './components/SetupScreen.js'
import { Summary } from './components/Summary.js'
import { Table } from './components/Table.js'
import type { Tab } from './components/TabBar.js'
import { learnLessons } from './learn/lessonMeta.js'
import { LocalStorageLessonProgressStore, type LessonProgressStore } from './learn/progressStore.js'
import {
  assembleRecord,
  IndexedDbHandHistoryStore,
  type HandHistoryStore,
  type HeroDecision,
} from './history/index.js'
import './styles.css'
import './primer.css'

/** Default bot "thinking" delay (ms) before a bot's action dispatches — for feel. Tests pass `0`. */
export const DEFAULT_BOT_DELAY_MS = 500

/** A unique record id, using `crypto.randomUUID` where present and a timestamp+random fallback else. */
function newRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Build the per-player bot instance for an opponent — its own randomised PRNG seed per session. */
function defaultMakeBot(player: SessionPlayer): Opponent {
  return makeBot(player, Math.floor(Math.random() * 0x100000000))
}

/** Props for {@link App}. */
export interface AppProps {
  /** Initial setup selection (seats, opponent presets) — tests pin these for determinism. */
  readonly initial?: InitialModelOptions
  /**
   * A queue of pre-shuffled decks, consumed one per hand. When exhausted (or absent) the shell
   * shuffles a fresh deck. Tests pass fixed decks so the whole session is reproducible.
   */
  readonly decks?: readonly (readonly Card[])[]
  /**
   * Factory for an opponent's bot instance, keyed off the stable {@link SessionPlayer}. Tests inject
   * fixed-seed bots; defaults to a `@holdem/bots` heuristic bot for the seat's chosen preset.
   */
  readonly makeBot?: (player: SessionPlayer) => Opponent
  /** Bot "thinking" delay (ms). Defaults to {@link DEFAULT_BOT_DELAY_MS}; tests pass `0`. */
  readonly botDelayMs?: number
  /**
   * The hand-history store the recording seam appends completed hands to (ticket 0037). Defaults to
   * the IndexedDB-backed store; tests inject a fake / `fake-indexeddb`-backed one. A single instance
   * is shared across "New table" remounts so the log is one continuous history.
   */
  readonly historyStore?: HandHistoryStore
  /**
   * The on-device store the Learn primer persists lesson progress to (ticket 0048). Defaults to the
   * `localStorage`-backed store; tests inject a fake / throwing fake so they never touch real storage.
   * Created once (via a ref) and threaded into {@link LearnBranch}.
   */
  readonly progressStore?: LessonProgressStore
}

/**
 * The interactive app. A `sessionKey` keys the inner {@link Session} so "New table" remounts a
 * brand-new session (fresh reducer state + fresh bot/deck refs) without any reset plumbing.
 *
 * **Top-level navigation (ticket 0046)** lives here as app-shell state — `activeTab` (`'play'` |
 * `'learn'`, boot lands on `'play'`), exactly like the coach-drawer open flag: it is UI, NOT poker
 * state, so it deliberately stays out of the `@holdem/session` reducer (keeping the session model
 * unpolluted). The `'play'` branch renders the unchanged {@link Session}; the `'learn'` branch renders
 * the {@link LearnBranch} (the Foundations path + the placeholder lesson player). The bottom tab bar
 * shows only on the lobby surfaces (the Play setup screen and the Learn path) — `onNavigate` is
 * threaded down to both.
 *
 * Crucially the {@link Session} is kept *mounted* across tab switches (rendered hidden when Learn is
 * active) so flipping to Learn and back never tears down a live hand — switching tabs is navigation,
 * not "New table".
 */
export function App(props: AppProps): React.JSX.Element {
  const [sessionKey, setSessionKey] = useState(0)
  // Top-level nav: which path the player is on. App-shell UI state (like coachOpen) — never in the
  // reducer. Boot lands on Play (the design's locked decision).
  const [activeTab, setActiveTab] = useState<Tab>('play')
  const onNavigate = useCallback((tab: Tab) => setActiveTab(tab), [])
  // The default store is created lazily ONCE and reused across "New table" remounts, so the history
  // log is one continuous record of the whole play session (the inner Session remounts; this does
  // not). Tests pass their own `historyStore` and never touch IndexedDB.
  const defaultStoreRef = useRef<HandHistoryStore | null>(null)
  const historyStore =
    props.historyStore ?? (defaultStoreRef.current ??= new IndexedDbHandHistoryStore())
  // The default progress store is likewise created lazily ONCE (same idiom as historyStore) so the
  // Learn primer reads/writes one durable on-device record across renders. Tests inject their own.
  const defaultProgressStoreRef = useRef<LessonProgressStore | null>(null)
  const progressStore =
    props.progressStore ??
    (defaultProgressStoreRef.current ??= new LocalStorageLessonProgressStore())
  return (
    <div className="room" data-dir="playful" data-deck="four">
      {/* Keep Play mounted across tab switches so a live hand survives a peek at Learn — but hide it
          with `display: contents`/`none`, NOT a box: `.room` is a centering flexbox, and a normal
          wrapper div would be a shrink-to-fit flex item that collapses the nested `.app`'s
          `width: 100%` to min-content. `display: contents` makes the wrapper layout-transparent so
          `.app`/`.app-stack` is effectively a direct flex child of `.room` again (BUG-0005). */}
      <div style={{ display: activeTab === 'play' ? 'contents' : 'none' }}>
        <Session
          key={sessionKey}
          {...props}
          historyStore={historyStore}
          onNavigate={onNavigate}
          onNewTable={() => setSessionKey((k) => k + 1)}
        />
      </div>
      {activeTab === 'learn' ? (
        <LearnBranch onNavigate={onNavigate} progressStore={progressStore} />
      ) : null}
    </div>
  )
}

/**
 * Map the durable set of completed lesson ids to the numeric `progress` the {@link LearnView} consumes:
 * the length of the **leading run** of completed lessons in `FOUNDATIONS` order. That is the unlocked
 * prefix — lessons unlock sequentially (§5.4), so progress is "how many from the front are done", i.e.
 * the index of the first *un*finished lesson and the resume point. A completed id that is out of order
 * (e.g. a stored blob completed lesson 3 but not 2) does not jump the prefix; only the contiguous
 * front counts. Ignoring ids not in `learnLessons` is handled by the store (load filters), but the
 * `.has` check here is also id-set based, so unknown ids simply never match a node.
 */
function progressFromCompleted(completedIds: ReadonlySet<string>): number {
  let n = 0
  for (const { lesson } of learnLessons) {
    if (!completedIds.has(lesson.id)) break
    n += 1
  }
  return n
}

/**
 * The Learn route (tickets 0046 / 0047 / 0048): the Foundations path, the full {@link LessonPlayer}
 * once a lesson is opened, and the {@link EndOfPrimer} hand-off once all six lessons are complete.
 *
 * Progress is now **durable, on-device** (ticket 0048): the {@link LessonProgressStore} persists the
 * SET of completed lesson ids. On mount we `load()` it into local state; finishing a lesson marks that
 * lesson's stable `id` complete (in the store AND in state) — forward-only, since completion only ever
 * adds an id. The numeric `progress` the {@link LearnView} wants (its done/current/locked nodes, the
 * `n / 6` meter, the resume CTA) is derived from the id set via {@link progressFromCompleted} (the
 * leading-completed prefix = the resume point). Reopening the app resumes at the next unfinished lesson
 * because the loaded id set rebuilds that same prefix. This state stays in the shell, never in the
 * `@holdem/session` reducer (it is primer state, not poker state).
 *
 * The open lesson is tracked by its index; `null` shows the path. The lesson player and the
 * end-of-primer screen are tab-less (immersive), so the bottom tab bar only appears on the path.
 */
function LearnBranch({
  onNavigate,
  progressStore,
}: {
  onNavigate: (tab: Tab) => void
  progressStore: LessonProgressStore
}): React.JSX.Element {
  const total = learnLessons.length
  // The durable set of completed lesson ids, seeded from the store ONCE on mount. The store's load
  // already tolerates a missing/malformed blob (returns []); we additionally filter to ids that still
  // exist in the live lesson set so a stored id from an older/renamed lesson is ignored, never crashes.
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(() => {
    const known = new Set(learnLessons.map(({ lesson }) => lesson.id))
    // Wrap the store call at the shell boundary (like the history seam): even a custom store whose
    // `load` throws must not crash the primer — fall back to "no progress" and carry on in-memory.
    let loaded: readonly string[] = []
    try {
      loaded = progressStore.load()
    } catch (err: unknown) {
      console.warn('primer-progress: load failed', err)
    }
    return new Set(loaded.filter((id) => known.has(id)))
  })
  // The numeric progress the LearnView consumes, derived from the id set (the leading-completed prefix).
  const progress = progressFromCompleted(completedIds)
  // Which lesson is open (index into `learnLessons`), or null for the path list.
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // Whether the end-of-primer hand-off is showing. Seeded from the loaded progress: reopening the app
  // with all six already persisted lands straight on the hand-off (§5.5), not the path. It is also set
  // when the last lesson completes in-session, and cleared by the screen's Back (to review the path).
  const [showEnd, setShowEnd] = useState(() => progress >= total)

  // Finishing a lesson marks that lesson's stable id complete — persisted to the store AND mirrored in
  // state (so the path reflects it immediately) — then returns to the path. Completion only ever adds
  // an id, so progress is forward-only. If this completes all six, hand off to the end-of-primer screen.
  const completeLesson = useCallback(
    (index: number) => {
      const entry = learnLessons[index]
      if (entry !== undefined) {
        setCompletedIds((prev) => {
          if (prev.has(entry.lesson.id)) return prev
          const next = new Set(prev)
          next.add(entry.lesson.id)
          // Persist the new id set, wrapped at the shell boundary so even a custom store whose `save`
          // throws never breaks the primer — progress still advances in-memory.
          try {
            progressStore.save([...next])
          } catch (err: unknown) {
            console.warn('primer-progress: save failed', err)
          }
          return next
        })
      }
      setOpenIndex(null)
      if (index + 1 >= total) setShowEnd(true)
    },
    [total, progressStore],
  )

  if (showEnd) {
    return (
      <EndOfPrimer
        lessons={learnLessons}
        onPlay={() => onNavigate('play')}
        onBack={() => setShowEnd(false)}
      />
    )
  }

  if (openIndex !== null) {
    const entry = learnLessons[openIndex]
    if (entry !== undefined) {
      return (
        <LessonPlayer
          lesson={entry.lesson}
          n={entry.n}
          total={total}
          onBack={() => setOpenIndex(null)}
          onComplete={() => completeLesson(openIndex)}
        />
      )
    }
  }

  return (
    <LearnView progress={progress} onOpenLesson={(i) => setOpenIndex(i)} onNavigate={onNavigate} />
  )
}

/** Resolve an engine seat to its session display label via `seatToId` → `players`. */
function seatLabelFor(model: Model, seat: number): string {
  const id = model.seatToId[seat]
  const player = id === undefined ? undefined : model.players.find((p) => p.id === id)
  return player?.label ?? `Seat ${seat}`
}

interface SessionProps extends AppProps {
  /** The hand-history store (resolved by {@link App} — always present here). */
  readonly historyStore: HandHistoryStore
  /** Navigate to another top-level tab — forwarded to the lobby {@link SetupScreen}'s tab bar. */
  readonly onNavigate: (tab: Tab) => void
  /** Start a brand-new session (the parent bumps the remount key). */
  readonly onNewTable: () => void
}

/** One session over the MVU loop — the part `Root` is the direct analog of. */
function Session({
  initial,
  decks,
  makeBot = defaultMakeBot,
  botDelayMs = DEFAULT_BOT_DELAY_MS,
  historyStore,
  onNavigate,
  onNewTable,
}: SessionProps): React.JSX.Element {
  const [model, dispatch] = useReducer(reducer, initial, createInitialModel)

  // The coach drawer's open/closed state is pure UI — component-local, never in the reducer model.
  // Stable handlers so the drawer's focus-management effect only re-runs on an actual open/close.
  const [coachOpen, setCoachOpen] = useState(false)
  const openCoach = useCallback(() => setCoachOpen(true), [])
  const closeCoach = useCallback(() => setCoachOpen(false), [])

  // Close the drawer when a fresh hand is dealt: the reducer resets `coach` to `'none'` at
  // `start-hand`, so a left-open sheet would otherwise flip from the graded verdict to the empty
  // placeholder mid-view. Closing it keeps the review tied to the hand it graded.
  useEffect(() => {
    if (model.coach.kind === 'none') setCoachOpen(false)
  }, [model.coach])

  // The bot instances live in a ref (shell machinery the render never reads), keyed by stable player
  // id and created ONCE per session — each carries its own PRNG and is reused every hand.
  const botsRef = useRef<Map<number, Opponent>>(new Map())
  // A queue of injected decks (tests); we pop from the front, falling back to a fresh shuffle.
  const deckQueueRef = useRef<(readonly Card[])[]>(decks ? [...decks] : [])

  // --- Hand-history recording seam (ticket 0037) -----------------------------------------------
  // Pure-reducer discipline: the reducer never touches IndexedDB/Date — recording is a shell effect.
  // `decisionsRef` accumulates the hero's voluntary decisions for the CURRENT hand (reset at deal);
  // `recordedRef` is the last hand number we appended, the once-per-hand guard (StrictMode-safe: a
  // double-invoked effect sees the same number and no-ops).
  const decisionsRef = useRef<HeroDecision[]>([])
  const recordedRef = useRef<number>(0)
  // A tiny "history open?" UI flag (component-local, like the coach drawer — not poker state).
  const [historyOpen, setHistoryOpen] = useState(false)

  const { phase, hand, heroSeat, seatToId, players } = model
  const handComplete = hand !== null && isComplete(hand)
  const isHeroTurn =
    phase === 'playing' && hand !== null && !handComplete && hand.toAct === heroSeat

  /** Pull the next deck (an injected one if queued, else a fresh shuffle) and start a hand. */
  const beginHand = (): void => {
    // Reset the per-hand decision buffer at the start of every hand (recording is per completed hand).
    decisionsRef.current = []
    const deck = deckQueueRef.current.shift() ?? shuffledDeck()
    dispatch({ type: 'start-hand', deck })
  }

  // Lazily create a bot for each opponent player the first time we see the session players, and
  // keep the same instances for the whole session (the ref persists across renders).
  for (const player of players) {
    if (!player.isHero && !botsRef.current.has(player.id)) {
      botsRef.current.set(player.id, makeBot(player))
    }
  }

  // --- Bot turns (one bot action per model state) ----------------------------------------------
  // The effect applies exactly one action when it is a bot's turn: route the acting engine seat →
  // its stable player id (via `seatToId`) → that player's persistent bot. Dispatching produces a new
  // `hand`, so the effect re-runs for the next actor — several bots act between the hero's decisions.
  // Cancel-safe under React 19 StrictMode (the `cancelled` flag + cleanup); the dispatch is delayed
  // by `botDelayMs` for "thinking" feel (tests pass 0).
  useEffect(() => {
    if (phase !== 'playing' || hand === null || handComplete || isHeroTurn) return
    const seat = hand.toAct
    if (seat === null) return
    const playerId = seatToId[seat]
    if (playerId === undefined) return
    const bot = botsRef.current.get(playerId)
    if (bot === undefined) return

    let cancelled = false
    const timer = setTimeout(() => {
      // `decide` may be sync or async (the Opponent seam); normalise with Promise.resolve.
      Promise.resolve(bot.decide(decisionContext(hand, seat))).then((action: Action) => {
        if (cancelled) return
        // Defensive: bots return legal actions by design, but never feed the engine an illegal move.
        const legal = legalActions(hand)
        if (!actionIsLegal(action, legal)) return
        dispatch({ type: 'apply-action', action })
      })
    }, botDelayMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [phase, hand, handComplete, isHeroTurn, seatToId, botDelayMs])

  const onAction = (action: Action): void => {
    // Capture the hero's voluntary decision (with the street it was made on) BEFORE dispatching, so
    // the buffer reflects the live hand. `onAction` only fires from the hero's ActionBar; the guard
    // is belt-and-suspenders. Blind posts never come through here, so VPIP/PFR stay correct for M6.
    if (isHeroTurn && hand !== null) {
      decisionsRef.current.push({ street: hand.street, action })
    }
    dispatch({ type: 'apply-action', action })
  }

  // --- Record exactly once when the hand completes ---------------------------------------------
  // Guarded by `recordedRef` (last recorded hand number): completes the once-per-hand contract and is
  // StrictMode-safe (a re-invoked effect sees the same handNumber and returns early). Every store
  // call is wrapped so a write failure is logged and NEVER blocks or crashes play (graceful
  // degradation). `model.handNumber` is captured at deal and is stable for the life of the hand.
  useEffect(() => {
    if (!handComplete || hand === null) return
    if (recordedRef.current === model.handNumber) return
    recordedRef.current = model.handNumber
    try {
      const record = assembleRecord(model, hand, decisionsRef.current, {
        id: newRecordId(),
        playedAt: Date.now(),
      })
      void Promise.resolve(historyStore.append(record)).catch((err: unknown) => {
        console.warn('hand-history: append failed', err)
      })
    } catch (err: unknown) {
      // Assembly should never throw on a completed hand, but never let recording break play.
      console.warn('hand-history: record failed', err)
    }
  }, [handComplete, hand, model, historyStore])

  // --- Render the current phase ----------------------------------------------------------------
  if (phase === 'setup') {
    return (
      <SetupScreen
        setup={model.setup}
        dispatch={dispatch}
        onStart={beginHand}
        onNavigate={onNavigate}
      />
    )
  }

  // The History affordance + overlay (ticket 0037): a button that reads recent hands back through the
  // store, proving the round-trip. Shared across the playing and game-over phases.
  const historyButton = (
    <button
      type="button"
      className="btn history-open"
      data-testid="history-open"
      onClick={() => setHistoryOpen(true)}
    >
      History
    </button>
  )
  const historyOverlay = historyOpen ? (
    <HistoryView store={historyStore} onClose={() => setHistoryOpen(false)} />
  ) : null

  if (phase === 'game-over') {
    return (
      <>
        <Summary
          players={players}
          handNumber={model.handNumber}
          onNewTable={onNewTable}
          onShowHistory={() => setHistoryOpen(true)}
        />
        {historyOverlay}
      </>
    )
  }

  // 'playing' / 'hand-over': the live table, the action bar, and the between-hands affordance. The
  // `Table` (0034) renders its own `.app` shell (topbar + felt); the `ActionBar` is its sibling
  // footer inside the same shell, so they share one flex column via the `.app-stack` wrapper (which
  // makes the nested `.app` flow inline rather than claim its own 100dvh).
  const legal: LegalActions | null = isHeroTurn && hand !== null ? legalActions(hand) : null
  return (
    <div className="app-stack">
      {hand !== null ? (
        <Table
          hand={hand}
          heroSeat={heroSeat}
          handNumber={model.handNumber}
          seatLabel={(seat) => seatLabelFor(model, seat)}
          overlay={
            <>
              {historyButton}
              <CoachFab coach={model.coach} onOpen={openCoach} />
            </>
          }
        />
      ) : null}
      {hand !== null ? (
        <ActionBar
          hand={hand}
          legal={legal}
          heroSeat={heroSeat}
          isHeroTurn={isHeroTurn}
          handOver={phase === 'hand-over'}
          sessionOver={phase === 'session-over'}
          onAction={onAction}
          onNext={beginHand}
          onQuit={() => dispatch({ type: 'quit' })}
        />
      ) : null}
      <CoachDrawer
        coach={model.coach}
        open={coachOpen}
        onClose={closeCoach}
        heroHoleCards={hand !== null ? hand.players[heroSeat]?.holeCards : undefined}
      />
      {historyOverlay}
    </div>
  )
}
