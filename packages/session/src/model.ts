/**
 * The MVU `Model` — the single source of truth the Ink view renders (tickets 0025 / 0029).
 *
 * Following the Bubble Tea mental model the rest of this milestone is built on: there is
 * exactly one immutable model, a pure `reducer` advances it (see {@link file://./reducer.ts}),
 * and the React/Ink components only *read* it. The model is the engine's {@link HandState}
 * plus whatever UI-only state the terminal client needs (none of which is poker logic — all
 * rules stay in `@holdem/engine`).
 *
 * Ticket 0029 grows the scaffold's single-hand model into a **multiway session state machine**:
 * a `phase` (`'setup' | 'playing' | 'hand-over' | 'game-over'`), a stable list of
 * {@link SessionPlayer}s (the hero plus bots, each with a STABLE `id` that does NOT change as
 * seats compact), and a setup-screen selection. The reducer owns every transition; the shell
 * (Root) supplies the only non-pure inputs — a freshly shuffled deck per hand and the bots'
 * PRNG-backed decisions.
 *
 * **The load-bearing seating decision.** The engine's `createHand` rejects any 0-stack player,
 * so a busted player cannot be seated and the session cannot keep a fixed N-seat array with 0s.
 * Instead the session tracks players by stable `id`; each hand we **compact** the still-alive
 * players into a fresh `stacks` array (seats `0..k-1` for that hand) and keep a `seatToId` map so
 * we can route each seat back to its player (which seat is the hero, which bot acts, where to
 * write post-hand stacks). See {@link compactSeating}, {@link rotateButton}, {@link removeBusted}.
 */

import { createHand, makeDeck, type Action, type Card, type HandState } from '@holdem/engine'
import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'
import type { DecisionContext } from '@holdem/bots'

/** Default table size for the milestone — 6-max (hero plus five opponents). */
export const DEFAULT_SEATS = 6

/** The smallest and largest tables the setup screen offers: heads-up through 6-max. */
export const MIN_SEATS = 2
export const MAX_SEATS = 6

/** Blinds and starting stack for a session. */
export const SMALL_BLIND = 1
export const BIG_BLIND = 2
export const STARTING_STACK = 200

/** A chosen blind level for a session — a small/big-blind pair. */
export interface BlindLevel {
  readonly sb: number
  readonly bb: number
}

/**
 * The full blind **ladder** a session can move through, low to high. Cash mode sits on the bottom
 * rung ({@link DEFAULT_BLIND_LEVEL}, `1/2`) for the whole session; tournament mode
 * ({@link SessionMode}) starts there too and climbs one rung every {@link TOURNAMENT_LEVEL_LENGTH}
 * hands, topping out at the last rung (see {@link tournamentLevel}). Blinds are scale-invariant in
 * cash play, so there is no level picker — the lever that matters is stack depth in big blinds.
 */
export const BLIND_LADDER: readonly BlindLevel[] = [
  { sb: SMALL_BLIND, bb: BIG_BLIND },
  { sb: 2, bb: 5 },
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  { sb: 100, bb: 200 },
]

/** The default blind level — `1/2`, the bottom rung of {@link BLIND_LADDER} and every session's start. */
export const DEFAULT_BLIND_LEVEL: BlindLevel = BLIND_LADDER[0]!

/**
 * How a session's blinds behave over time:
 * - `'cash'` — fixed at the chosen {@link BlindLevel} for the whole session (today's behaviour).
 * - `'tournament'` — they **escalate**: starting on the chosen rung, the session climbs one
 *   {@link BLIND_LADDER} rung every {@link TOURNAMENT_LEVEL_LENGTH} hands so the game naturally
 *   accelerates toward an end, the way a real tournament does.
 */
export type SessionMode = 'cash' | 'tournament'

/** The default session mode — `'cash'` (fixed blinds), preserving pre-tournament behaviour. */
export const DEFAULT_MODE: SessionMode = 'cash'

/** Hands played at each tournament level before the blinds step up one {@link BLIND_LADDER} rung. */
export const TOURNAMENT_LEVEL_LENGTH = 4

/** A tournament's current level — what the table indicator shows and {@link tournamentLevel} derives. */
export interface LevelStatus {
  /** 1-based level number within this session (level `1` is the starting blinds). */
  readonly level: number
  /** The blinds in force at this level (the ladder rung the session has climbed to). */
  readonly blinds: BlindLevel
  /** Hands remaining at this level before the next step-up; `0` once the top rung is reached. */
  readonly handsUntilNext: number
  /** `true` once the ladder's top rung is reached — blinds no longer escalate. */
  readonly atTop: boolean
}

/** The {@link BLIND_LADDER} rung matching a level (by sb/bb), or `0` if it is not a ladder rung. */
function ladderRungOf(level: BlindLevel): number {
  const rung = BLIND_LADDER.findIndex((l) => l.sb === level.sb && l.bb === level.bb)
  return rung < 0 ? 0 : rung
}

/**
 * The tournament {@link LevelStatus} in force for a given (1-based) `handNumber`, climbing from the
 * `start` rung. The session steps up one {@link BLIND_LADDER} rung every `levelLength` hands and
 * stops at the ladder's top. **Pure and total**: the reducer derives the level from `handNumber`
 * (which it already bumps each hand) rather than carrying a mutable level index, so escalation can
 * never desync from the hand count. The schedule boundary is the hand at which a step-up lands:
 * with `levelLength = 4`, hands 1–4 are level 1, hand 5 is level 2, and so on.
 */
export function tournamentLevel(
  start: BlindLevel,
  handNumber: number,
  levelLength: number = TOURNAMENT_LEVEL_LENGTH,
): LevelStatus {
  const startRung = ladderRungOf(start)
  const handsIn = Math.max(0, handNumber - 1) // hands completed before this one, floored at 0
  const stepsTaken = Math.floor(handsIn / levelLength)
  const rung = Math.min(startRung + stepsTaken, BLIND_LADDER.length - 1)
  const atTop = rung === BLIND_LADDER.length - 1
  return {
    level: rung - startRung + 1,
    blinds: BLIND_LADDER[rung]!,
    handsUntilNext: atTop ? 0 : levelLength - (handsIn % levelLength),
    atTop,
  }
}

/**
 * The blinds in force for a given (1-based) `handNumber` of a session — the single place the
 * {@link SessionMode} escalation rule is applied. Every session starts on the bottom rung
 * ({@link DEFAULT_BLIND_LEVEL}, `1/2`): cash mode stays there every hand; tournament mode climbs the
 * ladder from it via {@link tournamentLevel}. Pure; the reducer calls it at each `start-hand` and
 * {@link dealHand} freezes the result into that hand.
 */
export function sessionBlinds(setup: SetupState, handNumber: number): BlindLevel {
  if ((setup.mode ?? DEFAULT_MODE) === 'cash') return DEFAULT_BLIND_LEVEL
  return tournamentLevel(DEFAULT_BLIND_LEVEL, handNumber).blinds
}

/**
 * The starting-stack depths the setup screen offers as one-tap presets, expressed in **big blinds**
 * — the unit the coaching speaks in and the lever that actually changes how long a session runs. A
 * shallow 25bb is shove-or-fold and fast; 50bb is a brisk middle; 100bb is the deep cash-game
 * default. Depth is denominated in big blinds: "100bb deep" is 100 × the big blind, which
 * {@link stackForDepthBb} turns into chips. The hero picks a depth, not a chip count.
 */
export const STACK_DEPTH_PRESETS_BB: readonly number[] = [25, 50, 100]

/**
 * Chips for a starting depth given in big blinds (depth × bigBlind). The `bigBlind` defaults to
 * {@link BIG_BLIND} (`2`), the session's fixed level, but stays a parameter so callers can express a
 * depth at any blind level if needed.
 */
export function stackForDepthBb(bigBlinds: number, bigBlind: number = BIG_BLIND): number {
  return Math.max(bigBlind, Math.round(bigBlinds) * bigBlind)
}

/**
 * A starting stack (chips) expressed back in big blinds — the depth label the setup screen shows.
 * Inverse of {@link stackForDepthBb}, so it takes the same big blind to read the depth back.
 */
export function depthBbForStack(stack: number, bigBlind: number = BIG_BLIND): number {
  return Math.round(stack / bigBlind)
}

/**
 * The four `@holdem/bots` presets the setup screen offers, as the stable keys the model stores
 * for each opponent seat (the shell maps these to a `@holdem/bots` `Personality` when it builds
 * the per-player bot instances). Mirrors the `PERSONALITIES` collection's quadrant keys —
 * TAG / LAG / rock / calling station.
 */
export type BotKind = 'tag' | 'lag' | 'rock' | 'station'

/** All four presets in display order — the setup screen cycles each opponent seat through these. */
export const BOT_KINDS: readonly BotKind[] = ['tag', 'lag', 'rock', 'station']

/** Short labels for each preset — shown on the setup screen, where the hero *chooses* the spread. */
export const BOT_LABELS: Readonly<Record<BotKind, string>> = {
  tag: 'TAG',
  lag: 'LAG',
  rock: 'Rock',
  station: 'Station',
}

/**
 * A one-line description of each archetype's tendencies, shown under its name on the setup screen so
 * the hero knows what they're choosing. (The *felt* still hides the style — see [[OPPONENT_NAMES]] —
 * but the setup screen is where the hero deliberately picks the spread, so it spells them out.)
 */
export const BOT_BLURBS: Readonly<Record<BotKind, string>> = {
  tag: 'Tight & aggressive — few hands, played hard.',
  lag: 'Loose & aggressive — many hands, lots of pressure.',
  rock: 'Tight & passive — folds often, rarely bluffs.',
  station: 'Loose & passive — calls down, rarely folds or raises.',
}

/**
 * How to *exploit* each archetype — the one-line read the coach surfaces for an opponent (see
 * {@link opponentReads}). The felt hides who is who; the coach is where the type is taught, so
 * this is the payoff of having kept {@link SessionPlayer.botKind} after anonymising the names.
 */
export const BOT_TIPS: Readonly<Record<BotKind, string>> = {
  tag: 'Solid and aggressive — respect their raises and rarely bluff into them.',
  lag: 'Wide and aggressive — call down lighter and let them bluff into you.',
  rock: 'Their bets mean strength — fold more, but steal their blinds relentlessly.',
  station: 'Calls too much — value-bet thin and bluff less; they rarely fold.',
}

/**
 * The pool of neutral opponent names shown on the felt (the hero is always `You`). Deliberately
 * short (≤ 4 chars — they share a narrow seat pill with the stack and a BTN/SB/BB tag on a phone)
 * and deliberately *not* the archetype, so the table reveals no read. {@link shuffledOpponentNames}
 * draws a fresh, unique subset per session, so a name maps to no fixed playing style across games;
 * the style lives in {@link SessionPlayer.botKind}. Must hold at least {@link MAX_SEATS} − 1 names.
 */
export const OPPONENT_NAMES: readonly string[] = [
  'Mia',
  'Theo',
  'Alex',
  'Nia',
  'Sam',
  'Ada',
  'Ben',
  'Cleo',
  'Dot',
  'Eli',
  'Fay',
  'Gus',
  'Ivy',
  'Jae',
  'Kai',
  'Liv',
  'Max',
  'Ola',
  'Pip',
  'Quin',
  'Rae',
  'Sky',
  'Tom',
  'Uma',
  'Val',
  'Wes',
  'Zoe',
  'Jin',
  'Lee',
  'Remy',
]

/**
 * A fresh, randomly ordered copy of {@link OPPONENT_NAMES} — the impure per-session name draw, kept
 * out of the pure reducer (which receives the result via the `start-hand` message), exactly like
 * {@link shuffledDeck}. The shell calls this once when the session's players are built; tests omit
 * it and fall back to the pool's natural order so labels stay deterministic.
 */
export function shuffledOpponentNames(): string[] {
  const names = [...OPPONENT_NAMES]
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[names[i], names[j]] = [names[j]!, names[i]!]
  }
  return names
}

/**
 * The coach's view of the hero's *most recent* decision — the advisory state the
 * {@link CoachPanel} renders (ticket 0028). It is a small, serialisable union with three
 * states, computed by the pure reducer from the spot captured *before* the action was applied:
 *
 * - `'none'` — no hero decision has been graded yet (the opening frames of a hand, before the
 *   hero first acts). The panel renders a dim placeholder.
 * - `'verdict'` — a graded *postflop* decision: the `@holdem/coach` {@link DecisionVerdict} the
 *   panel lays out (equity / pot odds / EV / good-leak). The panel does *no* verdict math of its own.
 * - `'preflop'` — a graded *preflop* decision off the starting-hand chart: the
 *   {@link PreflopVerdict} (tier rationale + good/leak). Preflop is graded by the chart, not pot
 *   odds (ticket [[BUG-0001]]), so it carries no equity/EV fields to contradict the chart.
 * - `'error'` — coaching is strictly advisory, so any throw from the coach (a malformed spot
 *   the verdict math rejects) degrades to this one-line notice rather than crashing the hand.
 *
 * **Spot capture.** The two graded variants also carry the *exact inputs the coach graded* — the
 * {@link DecisionContext} the hero faced and the {@link Action} they took. The coach is a pure
 * function of that pair, so a client (the PWA's "Copy ruling" button) can hand `(ctx, action)` to
 * `serializeSpot` to produce a self-contained blob that re-grades to this same verdict. `'none'` /
 * `'error'` carry no spot — there is no graded ruling to capture.
 */
export type CoachResult =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'verdict'
      readonly verdict: DecisionVerdict
      /** The exact context the coach graded — the input `serializeSpot` captures. */
      readonly ctx: DecisionContext
      /** The action the hero took — the other half of the captured spot. */
      readonly action: Action
    }
  | {
      readonly kind: 'preflop'
      readonly verdict: PreflopVerdict
      /** The exact context the coach graded — the input `serializeSpot` captures. */
      readonly ctx: DecisionContext
      /** The action the hero took — the other half of the captured spot. */
      readonly action: Action
    }
  | { readonly kind: 'error'; readonly message: string }

/**
 * A seat at the table for the lifetime of the *session*, identified by a STABLE {@link id} that
 * never changes — unlike the per-hand engine seat index, which shifts as busted players compact
 * out. Bots and the hero are routed by this id; the post-hand stacks are written back by id.
 *
 * The hero is the single player with `isHero: true` (and no `botKind`); every other player is a
 * bot carrying a {@link BotKind} preset (the shell builds one persistent bot instance per id).
 */
export interface SessionPlayer {
  /** Stable identity for the whole session (NOT the per-hand seat index). */
  readonly id: number
  /** The human sits in exactly one of these. */
  readonly isHero: boolean
  /**
   * Display name shown on the felt (e.g. `You`, `Mia`). Opponents get a unique, neutral human
   * name from {@link OPPONENT_NAMES} rather than their archetype — so the table doesn't hand the
   * hero each bot's exploitable tendency on a plate. The strategy preset lives in {@link botKind}
   * (kept for bot behaviour, history, and the coach), decoupled from what the player sees.
   */
  readonly label: string
  /** The bot preset for an opponent; `undefined` for the hero. */
  readonly botKind?: BotKind
  /** Chips this player has right now — carried between hands. A busted player has `0`. */
  readonly stack: number
}

/**
 * The table-setup selection the {@link SetupScreen} edits (ticket 0029). Pure, unit-testable
 * state: how many seats, and a {@link BotKind} per opponent seat (seat 0 is always the hero, so
 * `opponents` has `seats - 1` entries, one per opponent). The reducer owns every edit.
 */
export interface SetupState {
  /** Chosen table size, clamped to {@link MIN_SEATS}..{@link MAX_SEATS}. */
  readonly seats: number
  /** Preset per opponent seat, length `seats - 1` (heads-up has exactly one). */
  readonly opponents: readonly BotKind[]
  /**
   * Starting chips every player is seated with, chosen on the setup screen (one of the
   * {@link STACK_DEPTH_PRESETS_BB} depths, in chips). Optional so older {@link SetupState} literals
   * (and the inert curriculum) still type-check; {@link buildSessionPlayers} falls back to
   * {@link STARTING_STACK} when it is absent. {@link createInitialModel} always sets it.
   */
  readonly startingStack?: number
  /**
   * Whether the session's blinds are fixed (`'cash'`) or escalate over time (`'tournament'`) — see
   * {@link SessionMode}. Optional with the same fallback shape as {@link startingStack}: older
   * {@link SetupState} literals (and the inert curriculum) still type-check and fall back to
   * {@link DEFAULT_MODE} (cash, today's behaviour). {@link createInitialModel} always sets it. Both
   * modes start on the bottom rung ({@link DEFAULT_BLIND_LEVEL}, `1/2`); tournament mode climbs from
   * there (see {@link sessionBlinds}) — there is no blind-level picker.
   */
  readonly mode?: SessionMode
}

/**
 * The session's lifecycle phase — the reducer owns every transition.
 *
 * `'session-over'` is the final-hand review state: the last hand is complete and the session has
 * ended (the hero busted, or one survivor remains), but the table is still shown so the hero sees
 * the showdown of the hand that ended it before the summary. The hero then dismisses it to reach
 * `'game-over'`, which renders the end-of-session summary.
 */
export type Phase = 'setup' | 'playing' | 'hand-over' | 'session-over' | 'game-over'

/**
 * The application model: the setup selection, the stable session players, the live hand (once
 * playing), and the coach grade. UI-only fields carry no poker logic — all rules stay in
 * `@holdem/engine` / `@holdem/coach`.
 *
 * While `phase === 'setup'` there is no hand yet (`hand` is `null` and `seatToId` is empty); the
 * reducer's `start-hand` case deals the first hand. While playing/hand-over the `hand` is live and
 * `seatToId[engineSeat] === player.id` routes each engine seat back to its stable player.
 */
export interface Model {
  /** The lifecycle phase; the reducer is the only thing that advances it. */
  readonly phase: Phase
  /** The table-setup selection (always present; edited in `'setup'`, then frozen). */
  readonly setup: SetupState
  /** The stable session players (hero + bots), keyed by {@link SessionPlayer.id}. */
  readonly players: readonly SessionPlayer[]
  /** The engine's immutable snapshot of the hand in progress, or `null` before the first hand. */
  readonly hand: HandState | null
  /**
   * Map from this hand's engine seat index to the stable {@link SessionPlayer.id} sitting there.
   * Empty in `'setup'`. Rebuilt every hand by {@link compactSeating} as seats compact.
   */
  readonly seatToId: readonly number[]
  /** Which engine seat the hero occupies *this hand* (derived from {@link seatToId}). */
  readonly heroSeat: number
  /** Stable id of the player on the button — rotates among live players between hands. */
  readonly buttonId: number
  /** How many hands have been dealt this session (for the summary / header). */
  readonly handNumber: number
  /**
   * The coach's grade of the hero's most recent decision (ticket 0028). Reset to `'none'` at the
   * start of every hand (a fresh hand must not show the previous hand's stale verdict) and
   * replaced each time the *hero* acts; bot actions leave it in place.
   */
  readonly coach: CoachResult
}

/** The coach's "table read" for one live opponent — their felt name, archetype, and an exploit tip. */
export interface OpponentRead {
  readonly name: string
  readonly kind: BotKind
  readonly tip: string
}

/**
 * Reads for every opponent at the table this hand — each with the exploit tip for its
 * {@link BotKind} (see {@link BOT_TIPS}). The read is a *personality* (a persistent trait), not a
 * pot status, so it lists the whole table including players who have folded — the felt hides who is
 * who, and once the hero opens the coach it names them all. Empty in `'setup'` or with no live hand.
 */
export function opponentReads(model: Model): OpponentRead[] {
  if (model.hand === null) return []
  const reads: OpponentRead[] = []
  for (const p of model.hand.players) {
    if (p.seat === model.heroSeat) continue
    const id = model.seatToId[p.seat]
    const sp = id === undefined ? undefined : model.players.find((x) => x.id === id)
    if (sp?.botKind === undefined) continue
    reads.push({ name: sp.label, kind: sp.botKind, tip: BOT_TIPS[sp.botKind] })
  }
  return reads
}

/** Options for {@link createInitialModel}; all default to a fresh 6-max setup screen. */
export interface InitialModelOptions {
  /** Initial seat count for the setup selection. Defaults to {@link DEFAULT_SEATS}. */
  seats?: number
  /** Opponent presets, length `seats - 1`. Defaults to {@link defaultOpponents}. */
  opponents?: readonly BotKind[]
  /** Initial starting stack (chips). Defaults to {@link STARTING_STACK} (the deep 100bb default). */
  startingStack?: number
  /** Initial session mode. Defaults to {@link DEFAULT_MODE} (cash — fixed blinds). */
  mode?: SessionMode
}

/**
 * Sensible varied opponent defaults so it is one keypress to just play: a spread across the four
 * presets, and — per the ticket — **heads-up defaults to a TAG opponent**. For larger tables we
 * cycle through the quadrants so the table is a believable mix rather than five identical bots.
 */
export function defaultOpponents(seats: number): BotKind[] {
  const count = Math.max(0, seats - 1)
  if (count === 1) return ['tag'] // heads-up: a single TAG opponent
  // A varied, repeatable spread for 3..6-max (TAG / LAG / Rock / Station, then wrap).
  return Array.from({ length: count }, (_, i) => BOT_KINDS[i % BOT_KINDS.length]!)
}

/** Tally an opponent mix by archetype, in {@link BOT_KINDS} order — the setup screen shows counts. */
export function countsByKind(opponents: readonly BotKind[]): Record<BotKind, number> {
  const counts: Record<BotKind, number> = { tag: 0, lag: 0, rock: 0, station: 0 }
  for (const k of opponents) counts[k] += 1
  return counts
}

/**
 * A random opponent mix of `count` archetypes — the impure draw behind the setup screen's
 * "Randomize" button, kept out of the pure reducer (which receives the result via `set-opponents`),
 * like {@link shuffledDeck}. Each seat is an independent uniform pick over the four {@link BOT_KINDS}.
 */
export function randomOpponents(count: number): BotKind[] {
  return Array.from(
    { length: Math.max(0, count) },
    () => BOT_KINDS[Math.floor(Math.random() * BOT_KINDS.length)]!,
  )
}

/**
 * Fisher–Yates shuffle of a fresh deck. The engine is deterministic and never shuffles, so the
 * shuffle lives in the app shell (the non-pure concern stays out of the reducer). `Math.random` is
 * fine for a play client; determinism that matters lives in tests, which dispatch their own decks
 * into the reducer via a `start-hand` message.
 */
export function shuffledDeck(): Card[] {
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/**
 * Build the initial model: a fresh table-setup screen (no hand dealt yet — the shell shuffles and
 * dispatches `start-hand` once the hero confirms the setup). The hero is player id `0`; opponent
 * players take ids `1..seats-1` in stable order.
 */
export function createInitialModel(options: InitialModelOptions = {}): Model {
  const seats = clampSeats(options.seats ?? DEFAULT_SEATS)
  const opponents = (options.opponents ?? defaultOpponents(seats)).slice(0, seats - 1)
  const startingStack = options.startingStack ?? STARTING_STACK
  const mode = options.mode ?? DEFAULT_MODE
  return {
    phase: 'setup',
    setup: { seats, opponents, startingStack, mode },
    players: [],
    hand: null,
    seatToId: [],
    heroSeat: 0,
    buttonId: 0,
    handNumber: 0,
    coach: { kind: 'none' },
  }
}

/** Clamp a requested seat count into the legal {@link MIN_SEATS}..{@link MAX_SEATS} range. */
export function clampSeats(seats: number): number {
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.trunc(seats)))
}

/**
 * Freeze the setup selection into the stable {@link SessionPlayer} list — the hero at id `0` plus
 * one bot per opponent seat at ids `1..seats-1` — every player on {@link STARTING_STACK}. Called by
 * the reducer the moment the hero confirms the setup. The order is the session's canonical stable
 * order; everything downstream (compaction, button rotation, summary) reads it.
 */
export function buildSessionPlayers(
  setup: SetupState,
  names: readonly string[] = OPPONENT_NAMES,
): SessionPlayer[] {
  // The hero chooses the depth on the setup screen; fall back to the deep default for older literals.
  const stack = setup.startingStack ?? STARTING_STACK
  const players: SessionPlayer[] = [{ id: 0, isHero: true, label: 'You', stack }]
  setup.opponents.forEach((botKind, i) => {
    const id = i + 1
    players.push({
      id,
      isHero: false,
      // A unique neutral name (not the archetype) from the shell's per-session draw. Falls back to
      // `Bot N` past the pool, though the pool covers every legal opponent seat (MAX_SEATS − 1).
      label: names[i] ?? `Bot ${id}`,
      botKind,
      stack,
    })
  })
  return players
}

/** The still-alive players (those with chips) in stable order — the ones seated next hand. */
export function livePlayers(players: readonly SessionPlayer[]): SessionPlayer[] {
  return players.filter((p) => p.stack > 0)
}

/**
 * Rotate the button to the next LIVE player after the current `buttonId`, in stable order. Used
 * between hands so the dealer button advances around only the players who still have chips (a
 * busted player is skipped). If the current button holder has busted, we still rotate from their
 * stable position, so the button keeps moving in the same direction. Returns the live player's id.
 */
export function rotateButton(players: readonly SessionPlayer[], buttonId: number): number {
  const live = livePlayers(players)
  if (live.length === 0) return buttonId // degenerate; caller ends the session
  // Find the first live player whose stable id comes strictly after the current button, wrapping.
  const ordered = [...players]
  const startIndex = ordered.findIndex((p) => p.id === buttonId)
  for (let step = 1; step <= ordered.length; step++) {
    const candidate = ordered[(startIndex + step) % ordered.length]!
    if (candidate.stack > 0) return candidate.id
  }
  return live[0]!.id
}

/**
 * Compact the live players into a fresh per-hand seating: the `stacks` array (seats `0..k-1`), the
 * `buttonIndex` for this hand, and the `seatToId` map back to stable ids. Live players keep their
 * stable order, so seat `i` is always the `i`-th still-alive player. The `buttonId` must belong to
 * a live player (the caller rotates it first).
 *
 * This is the whole reason for stable ids: the engine rejects a 0-stack player, so we never seat a
 * busted one — we re-seat only the survivors and remember which stable player each seat is.
 */
export function compactSeating(
  players: readonly SessionPlayer[],
  buttonId: number,
): { stacks: number[]; buttonIndex: number; seatToId: number[]; heroSeat: number } {
  const live = livePlayers(players)
  const stacks = live.map((p) => p.stack)
  const seatToId = live.map((p) => p.id)
  const buttonIndex = seatToId.indexOf(buttonId)
  const heroSeat = live.findIndex((p) => p.isHero)
  return { stacks, buttonIndex, seatToId, heroSeat }
}

/**
 * Write a completed hand's per-seat stacks back to the stable players (by the `seatToId` map),
 * then drop nobody — busted players are *kept at 0* here so the summary can still name them; the
 * next {@link compactSeating} simply never seats them. (Removal is implicit: a 0-stack player is
 * not "live".) Returns a fresh stable player list.
 */
export function applyHandResult(
  players: readonly SessionPlayer[],
  hand: HandState,
  seatToId: readonly number[],
): SessionPlayer[] {
  const stackById = new Map<number, number>()
  hand.players.forEach((p) => {
    const id = seatToId[p.seat]
    if (id !== undefined) stackById.set(id, p.stack)
  })
  return players.map((p) => {
    const next = stackById.get(p.id)
    return next === undefined ? p : { ...p, stack: next }
  })
}

/**
 * The players removed (busted) versus those still standing after a hand result — purely a *view*
 * over stacks (busted = 0 chips). Exposed for the summary and unit-tested directly; it does not
 * mutate the list (a busted player stays in {@link Model.players} at 0 so it can be named).
 */
export function removeBusted(players: readonly SessionPlayer[]): {
  alive: SessionPlayer[]
  busted: SessionPlayer[]
} {
  return {
    alive: players.filter((p) => p.stack > 0),
    busted: players.filter((p) => p.stack === 0),
  }
}

/**
 * Has the session ended? It ends when the hero has busted (0 chips) or only one player has chips
 * left (a single survivor — the hero stacked everyone, or a bot did). The reducer uses this after
 * each completed hand to decide between `'hand-over'` and `'session-over'` (which the hero then
 * dismisses to `'game-over'`).
 */
export function sessionOver(players: readonly SessionPlayer[]): boolean {
  const live = livePlayers(players)
  const hero = players.find((p) => p.isHero)
  return live.length <= 1 || (hero !== undefined && hero.stack === 0)
}

/**
 * Deal a hand from the stable players + a (shell-supplied, already-shuffled) deck, with the button
 * on `buttonId`: compact the survivors into seats and call the real {@link createHand}. Pure given
 * the deck — the reducer calls this; the RNG stays in the shell. The caller decides `buttonId`
 * (the first hand uses the seeded button as-is; later hands {@link rotateButton} first). The chosen
 * `blinds` (the hero's setup pick, frozen at `start-hand`) are the ONLY place blinds enter a hand;
 * they default to {@link DEFAULT_BLIND_LEVEL} (1/2) for callers without a choice. Returns the new
 * hand plus the seating it was dealt over (so the model can store the map).
 */
export function dealHand(
  players: readonly SessionPlayer[],
  buttonId: number,
  deck: readonly Card[],
  blinds: BlindLevel = DEFAULT_BLIND_LEVEL,
): { hand: HandState; seatToId: number[]; heroSeat: number } {
  const { stacks, buttonIndex, seatToId, heroSeat } = compactSeating(players, buttonId)
  const hand = createHand({
    stacks,
    buttonIndex,
    smallBlind: blinds.sb,
    bigBlind: blinds.bb,
    deck,
  })
  return { hand, seatToId, heroSeat }
}
