/**
 * `pnpm sim` — the headless, scriptable engine harness (ticket 0030). With the Ink TUI now the
 * human play experience (`pnpm play`), this is the demoted `apps/cli`: a thin, **non-interactive**
 * driver that plays hands against the bots from a seed + scripted lines and prints either a plain,
 * greppable transcript or a machine-readable NDJSON stream, then exits. No readline, no prompts —
 * handy for manual engine smoke-tests, for reproducing a specific line deterministically, and (the
 * Tier-1..3 testing enhancements) for sweeping the coach across many spots and flagging where its
 * advice diverges from the truth. The real correctness gate stays the `vitest` suite that drives the
 * pure packages directly; this is a convenience/measurement driver, so all the poker/coach math
 * lives in the pure packages and this file only wires + prints.
 *
 * Determinism is the whole point: same args ⇒ byte-identical output. The deck is shuffled with the
 * seeded {@link mulberry32} PRNG (the engine never shuffles), the bots are seeded from the same seed
 * (one derived seed per opponent seat), and the coach grading is itself deterministic.
 *
 * Usage:
 *
 *     pnpm --filter @holdem/cli sim -- --seed=1 --seats=6 --hero=c,k,k,k
 *
 * Flags (all optional):
 *   --seed=<int>      Seeds the deck shuffle and the bots. Default 1.
 *   --seeds=<spec>    Batch: play many hands. A range `1-50` or a list `1,4,9`. Overrides --seed.
 *   --seats=<2..6>    Number of seats: the hero (seat 0) plus N-1 bot opponents. Default 6.
 *   --button=<seat>   Dealer-button seat (0..seats-1). Moving it puts the hero (always seat 0) in any
 *                     position — UTG, the blinds, etc. — so a sweep can test out-of-position play.
 *                     Default 0 (hero on the button).
 *   --hero=<list>     Comma/space-separated hero actions in the shared input grammar (e.g.
 *                     `c,b50,k,a`), consumed one per hero turn. When the script runs out, the hero
 *                     defaults to the cheapest legal continue (check, else call, else fold) so the
 *                     hand always completes — making a bare `pnpm sim` a zero-config smoke test.
 *   --villain=<seat>:<list>  Script a specific opponent's line (repeatable), e.g. `--villain=1:r6,b50`.
 *                     The seat plays the tokens in order, then falls back to its heuristic bot once
 *                     exhausted (or on an illegal token) — the only way to make the hero face a
 *                     preflop raise/3-bet, which the bots rarely volunteer.
 *   --json            Emit NDJSON (one hand record per line, then a `{"type":"summary"}` line)
 *                     instead of the text transcript — for scripted sweeps and aggregation.
 */

import { stdout } from 'node:process'
import {
  createHand,
  legalActions,
  applyAction,
  isComplete,
  makeDeck,
  formatCard,
  describeHand,
  handWinnings,
  type Action,
  type Card,
  type HandState,
  type LegalActions,
} from '@holdem/engine'
import { mulberry32 } from '@holdem/odds'
import { decisionContext, heuristicOpponent, TIGHT_AGGRESSIVE, type Opponent } from '@holdem/bots'
import { coachDecision, gradePreflop } from '@holdem/coach'
import {
  parseAction,
  renderState,
  renderResult,
  renderCoachFeedback,
  renderPreflopCoach,
  renderGroundTruth,
} from './table.js'
import {
  positionName,
  groundTruthEquity,
  assessTruth,
  coachMisleads,
  type DecisionRecord,
  type HandRecord,
  type ShowdownRecord,
  type SweepSummary,
} from './analysis.js'

const HERO = 0
const SMALL_BLIND = 1
const BIG_BLIND = 2
const STARTING_STACK = 200
const MIN_SEATS = 2
const MAX_SEATS = 6
const DEFAULT_SEATS = 6
const DEFAULT_SEED = 1

/** The parsed command line for one harness run. */
interface Args {
  /** The seeds to play, in order — one for a single hand, many for a `--seeds` batch sweep. */
  readonly seeds: readonly number[]
  readonly seats: number
  /** Dealer-button seat; sets the hero's position. */
  readonly button: number
  /** The raw hero-action tokens, parsed against the live legal actions one per hero turn. */
  readonly heroScript: readonly string[]
  /** Per-seat scripted villain lines, parsed one token per that seat's turn. */
  readonly villainScripts: ReadonlyMap<number, readonly string[]>
  /** Emit NDJSON instead of the text transcript. */
  readonly json: boolean
}

/**
 * Parse `process.argv` (everything after the script name) into {@link Args}. Tiny and
 * dependency-free. An out-of-range `--seats`/`--button` is clamped; a missing flag takes its
 * documented default. A `--villain` for seat 0 (the hero) or an out-of-range seat is dropped with a
 * warning so a typo never silently scripts the wrong seat.
 */
function parseArgs(argv: readonly string[]): Args {
  let seed = DEFAULT_SEED
  let seeds: number[] | null = null
  let seats = DEFAULT_SEATS
  let button = 0
  let heroScript: string[] = []
  const villainScripts = new Map<number, readonly string[]>()
  let json = false
  for (const arg of argv) {
    const seedMatch = /^--seed=(-?\d+)$/.exec(arg)
    const seedsMatch = /^--seeds=(.+)$/.exec(arg)
    const seatsMatch = /^--seats=(\d+)$/.exec(arg)
    const buttonMatch = /^--button=(\d+)$/.exec(arg)
    const heroMatch = /^--hero=(.*)$/.exec(arg)
    const villainMatch = /^--villain=(\d+):(.*)$/.exec(arg)
    if (seedMatch) seed = Number(seedMatch[1])
    else if (seedsMatch) seeds = parseSeeds(seedsMatch[1]!)
    else if (seatsMatch) seats = clamp(Number(seatsMatch[1]), MIN_SEATS, MAX_SEATS)
    else if (buttonMatch) button = Number(buttonMatch[1])
    else if (heroMatch) heroScript = heroMatch[1]!.split(/[,\s]+/).filter(Boolean)
    else if (villainMatch) {
      const seat = Number(villainMatch[1])
      const tokens = villainMatch[2]!.split(/[,\s]+/).filter(Boolean)
      villainScripts.set(seat, tokens)
    } else if (arg === '--json') json = true
  }
  // Clamp the button into the seat range now that we know `seats`, and drop villain scripts that
  // target the hero or a non-existent seat.
  button = clamp(button, 0, seats - 1)
  for (const seat of [...villainScripts.keys()]) {
    if (seat === HERO || seat < 0 || seat >= seats) {
      emit(`(ignoring --villain for seat ${seat}: must be an opponent seat 1..${seats - 1})`)
      villainScripts.delete(seat)
    }
  }
  return { seeds: seeds ?? [seed], seats, button, heroScript, villainScripts, json }
}

/** Parse a `--seeds` spec: an inclusive range `a-b` or a comma/space list `a,b,c`. */
function parseSeeds(spec: string): number[] {
  const rangeMatch = /^(-?\d+)-(-?\d+)$/.exec(spec)
  if (rangeMatch) {
    const lo = Number(rangeMatch[1])
    const hi = Number(rangeMatch[2])
    const [from, to] = lo <= hi ? [lo, hi] : [hi, lo]
    return Array.from({ length: to - from + 1 }, (_unused, i) => from + i)
  }
  return spec
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

/** Clamp `n` into the inclusive `[lo, hi]` range. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * A deterministic Fisher–Yates shuffle of a fresh deck driven by the seeded {@link mulberry32}
 * PRNG — never `Math.random`, so the same seed always yields the same deck (and therefore the same
 * output). The engine itself never shuffles, so the shuffle lives here.
 */
function shuffledDeck(seed: number): Card[] {
  const rng = mulberry32(seed)
  const deck = makeDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j]!, deck[i]!]
  }
  return deck
}

/** Print one line to stdout (the whole transcript/NDJSON is plain text, so callers can pipe it). */
function emit(line: string): void {
  stdout.write(`${line}\n`)
}

/** The cheapest legal continue: check if free, else call, else fold — so a hand always completes. */
function cheapestContinue(legal: LegalActions): Action {
  return legal.check ? { type: 'check' } : legal.call ? { type: 'call' } : { type: 'fold' }
}

/**
 * Pick the hero's action this turn: the next scripted token (parsed against the live legal actions),
 * or — when the script is exhausted or a token is illegal here — the cheapest legal continue.
 * Mutates `script` (shifts the consumed token). `note` receives the illegal-token notice (suppressed
 * in JSON mode).
 */
function takeHeroAction(state: HandState, script: string[], note: (line: string) => void): Action {
  const legal = legalActions(state)
  const token = script.shift()
  if (token !== undefined) {
    const parsed = parseAction(token, legal)
    if (parsed.ok) return parsed.action
    note(`  (scripted "${token}" is not legal here — ${parsed.error} taking the default)`)
  }
  return cheapestContinue(legal)
}

/**
 * Decide a villain seat's action: its next scripted token if it has one (and it is legal), else its
 * heuristic bot's decision. Mutates the seat's `script`. The bot seam may be async, so the result is
 * awaited by the caller.
 */
function decideVillain(
  seat: number,
  state: HandState,
  bots: readonly Opponent[],
  scripts: Map<number, string[]>,
  note: (line: string) => void,
): Action | Promise<Action> {
  const script = scripts.get(seat)
  if (script && script.length > 0) {
    const legal = legalActions(state)
    const token = script.shift()!
    const parsed = parseAction(token, legal)
    if (parsed.ok) return parsed.action
    note(`  (scripted villain ${seat} "${token}" not legal — ${parsed.error} using the bot)`)
  }
  return bots[seat]!.decide(decisionContext(state, seat))
}

/** A one-line description of an action for the transcript (`bets 50`, `calls`, `folds`). */
function describeAction(seat: number, action: Action): string {
  const who = seat === HERO ? 'You' : `Bot ${seat}`
  const detail = 'amount' in action ? ` ${action.amount}` : ''
  return `${who} ${action.type}s${detail}.`
}

/** A compact action label for a JSON record (`call`, `bet 50`, `fold`). */
function actionLabel(action: Action): string {
  return 'amount' in action ? `${action.type} ${action.amount}` : action.type
}

/**
 * Grade the hero's decision, render it (text mode), and build the structured record. Preflop is
 * graded off the starting-hand chart; postflop off the pot-odds math, with a ground-truth equity
 * read (vs villains' actual cards) attached so a sweep can flag where the coach's assumed-range
 * advice diverges from the truth. The `ctx`/`state` must be captured while it is still the hero's
 * turn. Any throw from the coach degrades to a one-line notice rather than crashing the run.
 */
function coachAndRecord(
  state: HandState,
  action: Action,
  emitText: (line: string) => void,
): DecisionRecord | null {
  try {
    const ctx = decisionContext(state, HERO)
    const board = state.board.length ? state.board.map(formatCard).join(' ') : '—'
    if (ctx.street === 'preflop') {
      const v = gradePreflop(ctx, action)
      emitText(renderPreflopCoach(v))
      return {
        street: ctx.street,
        board,
        action: actionLabel(action),
        coach: null,
        preflop: { tier: v.tier, advice: v.advice, verdict: v.verdict, trace: v.trace },
        truth: null,
        misleads: null,
      }
    }
    const v = coachDecision(ctx, action)
    emitText(renderCoachFeedback(v))
    // The omniscient read the coach lacks: hero equity vs the live villains' actual cards.
    const truth = assessTruth(groundTruthEquity(state, HERO), ctx.pot, ctx.toCall)
    emitText(renderGroundTruth(truth, v, ctx.toCall))
    return {
      street: ctx.street,
      board,
      action: actionLabel(action),
      toCall: ctx.toCall,
      pot: ctx.pot,
      coach: {
        equity: v.equity,
        potOdds: v.potOddsThreshold,
        callEv: v.callEv,
        correct: v.correctDecision,
        verdict: v.verdict,
        trace: v.trace,
      },
      preflop: null,
      truth,
      misleads: coachMisleads(v.correctDecision, truth, ctx.toCall),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    emitText(`\n(Coaching unavailable for this spot — ${reason})`)
    return null
  }
}

/** Read the completed hand's outcome into the serialisable result block. */
function buildResult(state: HandState): HandRecord['result'] {
  const showdown: ShowdownRecord[] = []
  if (state.endReason === 'showdown') {
    for (const p of state.players) {
      if (p.status === 'folded') continue
      const hv = state.showdownHands[p.seat]
      showdown.push({
        seat: p.seat,
        cards: p.holeCards.map(formatCard).join(' '),
        hand: hv ? describeHand(hv) : '',
      })
    }
  }
  const hero = state.players[HERO]!
  // Net = everything collected (winnings + any returned uncalled bet) minus everything committed.
  const heroNet = (state.payouts[HERO] ?? 0) - hero.totalCommitted
  return { endReason: state.endReason, heroNet, showdown, winners: handWinnings(state) }
}

/**
 * Play one hand to completion. In text mode prints the transcript as it goes (state, actions, coach
 * verdicts, ground-truth check, result); in JSON mode prints one NDJSON record at the end. Always
 * returns the structured {@link HandRecord} so the batch driver can aggregate. The hero's and
 * villains' scripts are consumed one token per their turn, falling back to a default once exhausted.
 */
async function playHand(
  seed: number,
  seats: number,
  button: number,
  deck: Card[],
  bots: readonly Opponent[],
  heroScript: readonly string[],
  villainScripts: ReadonlyMap<number, readonly string[]>,
  json: boolean,
): Promise<HandRecord> {
  let state = createHand({
    stacks: Array.from({ length: seats }, () => STARTING_STACK),
    buttonIndex: button,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    deck,
  })

  // Text emits are suppressed in JSON mode; the record is always built.
  const emitText = (line: string): void => {
    if (!json) emit(line)
  }
  // Fresh, mutable copies of every script so a batch sweep replays each hand from the start.
  const heroRem = [...heroScript]
  const villainRem = new Map([...villainScripts].map(([seat, tokens]) => [seat, [...tokens]]))
  const decisions: DecisionRecord[] = []
  const heroCards = state.players[HERO]!.holeCards.map(formatCard).join(' ')

  while (!isComplete(state)) {
    emitText(renderState(state, HERO))
    // Not complete, so someone is to act — `toAct` is a real seat here (`isComplete` guards null).
    const seat = state.toAct!
    if (seat === HERO) {
      const action = takeHeroAction(state, heroRem, emitText)
      emitText(`\n${describeAction(HERO, action)}`)
      // Capture + grade the spot *before* applying — `decisionContext` throws once the turn moves on.
      const rec = coachAndRecord(state, action, emitText)
      if (rec) decisions.push(rec)
      state = applyAction(state, action)
    } else {
      const action = await Promise.resolve(decideVillain(seat, state, bots, villainRem, emitText))
      emitText(`\n${describeAction(seat, action)}`)
      state = applyAction(state, action)
    }
  }

  emitText(renderState(state, HERO))
  emitText(renderResult(state, HERO))

  const record: HandRecord = {
    seed,
    seats,
    button,
    heroSeat: HERO,
    heroCards,
    heroPosition: positionName(HERO, button, seats),
    decisions,
    result: buildResult(state),
  }
  if (json) emit(JSON.stringify(record))
  return record
}

/** Fold the per-hand records into the running batch tallies emitted as the summary. */
function summarize(records: readonly HandRecord[]): SweepSummary {
  const verdicts = { good: 0, leak: 0, breakEven: 0 }
  let heroDecisions = 0
  let misleads = 0
  let pricedPostflop = 0
  for (const r of records) {
    for (const d of r.decisions) {
      heroDecisions++
      const verdict = d.coach?.verdict ?? d.preflop?.verdict
      if (verdict) verdicts[verdict]++
      if (d.misleads !== null) {
        pricedPostflop++
        if (d.misleads) misleads++
      }
    }
  }
  return {
    type: 'summary',
    hands: records.length,
    heroDecisions,
    verdicts,
    misleads,
    pricedPostflop,
  }
}

/** Render the batch summary as a human-readable text block (text mode only). */
function renderSummary(s: SweepSummary): string {
  return [
    '',
    `══ Sweep summary ${'═'.repeat(32)}`,
    `  Hands: ${s.hands}   Hero decisions graded: ${s.heroDecisions}`,
    `  Verdicts — good: ${s.verdicts.good}  leak: ${s.verdicts.leak}  break-even: ${s.verdicts.breakEven}`,
    `  Coach vs ground truth (priced postflop spots): ${s.misleads}/${s.pricedPostflop} misleading`,
  ].join('\n')
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (!args.json) {
    emit(`Bachmann Hold'em — headless harness.`)
    const seedLabel =
      args.seeds.length === 1 ? `seed=${args.seeds[0]}` : `seeds=[${args.seeds.join(' ')}]`
    emit(
      `${seedLabel}  seats=${args.seats}  button=${args.button}` +
        `  hero=[${args.heroScript.join(' ') || '(default-continue)'}]`,
    )
    emit(`Blinds ${SMALL_BLIND}/${BIG_BLIND}, starting stacks ${STARTING_STACK}.`)
  }

  const records: HandRecord[] = []
  for (const seed of args.seeds) {
    if (!args.json && args.seeds.length > 1) emit(`\n${'━'.repeat(56)}\n# seed ${seed}`)
    // One bot per seat, each seeded from a seat-derived seed so the table is reproducible yet the
    // seats do not all play an identical line. Seat 0 (the hero) never `decide`s, but seating a bot
    // there keeps the array index-aligned with `state.toAct`.
    const bots: Opponent[] = Array.from({ length: args.seats }, (_unused, seat) =>
      heuristicOpponent(TIGHT_AGGRESSIVE, seed + seat),
    )
    records.push(
      await playHand(
        seed,
        args.seats,
        args.button,
        shuffledDeck(seed),
        bots,
        args.heroScript,
        args.villainScripts,
        args.json,
      ),
    )
  }

  // A summary closes a batch: an NDJSON `{"type":"summary"}` line in JSON mode, a text block
  // otherwise. A single hand needs no summary.
  if (args.seeds.length > 1) {
    const summary = summarize(records)
    emit(args.json ? JSON.stringify(summary) : renderSummary(summary))
  }
}

void main()
