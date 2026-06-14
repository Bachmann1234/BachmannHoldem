/**
 * The **spot** model — a self-contained, serialisable description of one retrieval check
 * (ticket 0044).
 *
 * A spot is the atom the Foundations primer ([[0042-foundations-primer]]) and the future M5
 * drills ([[0009-drills-and-quizzes]]) both render: a `prompt`, a small ordered set of answer
 * **choices** the player picks from, and the engine inputs needed to *grade* the pick. It is the
 * curriculum's analogue of a live hand — the UI shells render it, {@link gradeSpot} rules on it —
 * exactly as the play clients render a {@link DecisionContext} and `@holdem/coach` rules on it.
 *
 * **The cardinal rule (the epic's "no answer keys").** A coach-graded spot carries *no stored
 * correct answer*. The correct choice is **whatever the deterministic coach rules** — `coachDecision`
 * postflop, `gradePreflop` preflop — over the spot's inputs. The lesson can therefore never disagree
 * with the live coach, because the lesson *is* the coach. The only spot kind that stores its own
 * answer is the {@link DeclarativeSpot} carve-out (see below), and it is flagged as the last resort.
 *
 * **Why a discriminated union.** Different concepts are ruled on by different deterministic graders,
 * and M5 must be able to add drill spots without touching the engine. A small discriminated union on
 * a `kind` tag gives exactly that: {@link gradeSpot} switches on `kind`, and a new kind is a new
 * branch — no generic rules engine, no per-spot bespoke code.
 *
 * **Authoring ergonomics (the design note).** Content authors must *not* hand-build a 17-field
 * {@link DecisionContext} per spot. The coach reads only five of those fields, so the coach-graded
 * spot kinds carry a *minimal* {@link SpotContext} of just those, and {@link synthesizeContext}
 * inflates it into the full `DecisionContext` the graders take — filling the ignored fields with
 * inert defaults. Authoring stays a five-field affair; synthesis lives in one documented helper.
 *
 * Purity: zero I/O, no Node/DOM/network, no randomness of its own (the equity read's randomness is
 * the coach's, seeded). Imports only `@holdem/*`.
 */

import type { Action, Card, LegalActions, Street } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import type { Concept } from '@holdem/coach'

/**
 * The minimal authoring shape for a coach-graded spot — the *only* table inputs the coach actually
 * reads, so the *only* ones a content author must supply.
 *
 * `coachDecision` reads `holeCards`, `board`, `numActive`, `pot`, and `toCall` and nothing else
 * (see its module doc); `gradePreflop` additionally consults the seat geometry, which
 * {@link synthesizeContext} derives from sensible defaults. Everything else on a
 * {@link DecisionContext} is inert for grading, so this shape omits it and {@link synthesizeContext}
 * fills it.
 *
 * **Pot accounting (the pitfall the coach warns about, carried over verbatim).** `pot` is the dead
 * money in the pot *before* the call; `toCall` is the chips the hero must *add* to call. They are
 * forwarded to the coach untouched — the coach maps them directly into the pot-odds math. Do **not**
 * fold `toCall` into `pot`; that double-counts.
 */
export interface SpotContext {
  /** The hero's two hole cards — the one holding the spot is about. */
  readonly holeCards: readonly [Card, Card]
  /** The community cards on the table (0, 3, 4, or 5), in board order. Empty preflop. */
  readonly board: readonly Card[]
  /** The dead money in the pot *before* the hero's call. Forwarded to the coach as-is. */
  readonly pot: number
  /** The chips the hero must *add* to call. `0` for a free check. Forwarded to the coach as-is. */
  readonly toCall: number
  /** How many seats are still live in the pot (the hero plus villains). Drives the multiway read. */
  readonly numActive: number
}

/**
 * One answer the player can pick on a coach-graded spot: a human `label` plus the {@link Action} it
 * stands for. The grader runs the coach over each choice's `action` (postflop) / the chart over it
 * (preflop) and the *correct* choice is the one whose action the coach blesses — never a flag stored
 * here. Order matters: it is the order the UI lists the buttons in, and the order
 * {@link gradeSpot} scans to pick the canonical correct choice.
 */
export interface ActionChoice {
  /** The button text shown to the player, e.g. `"Call"` / `"Fold"`. */
  readonly label: string
  /** The poker action this choice commits to — what the coach is asked to rule on. */
  readonly action: Action
}

/**
 * One answer on a {@link DeclarativeSpot}: a human `label` and a `correct` flag. The carve-out — the
 * one place an answer is hand-authored — so the flag lives here rather than being derived from the
 * coach. Use only for concepts the coach genuinely cannot rule on (see {@link DeclarativeSpot}).
 */
export interface DeclarativeChoice {
  /** The button text shown to the player. */
  readonly label: string
  /** Whether this choice is a correct answer. Authored, because the coach cannot rule here. */
  readonly correct: boolean
}

/**
 * A **postflop coach-graded** spot — the default, preferred kind.
 *
 * The player picks among {@link ActionChoice}s and {@link gradeSpot} runs `coachDecision` over the
 * spot's {@link SpotContext} to decide which action is correct. This covers every priced
 * continue-decision concept the primer teaches: equity, pot odds, equity-vs-price, EV. The verdict's
 * `concept` tag flows straight out of the coach.
 */
export interface CoachSpot {
  readonly kind: 'coach'
  /** The question shown to the player, e.g. "25% equity, 33% price — call or fold?". */
  readonly prompt: string
  /** The ordered answer buttons; the correct one is whichever action the coach blesses. */
  readonly choices: readonly ActionChoice[]
  /** The five coach-read inputs; {@link synthesizeContext} inflates them for the grader. */
  readonly context: SpotContext
}

/**
 * A **preflop chart-graded** spot — the starting-hand-chart counterpart of {@link CoachSpot}.
 *
 * Graded by `gradePreflop` (the chart), not the pot-odds math, because preflop equity-vs-price is
 * the wrong lens (see `@holdem/coach`'s preflop module). The correct choice is the one matching the
 * chart's open/fold prescription for the holding; the verdict's `concept` is always `'ranges'`.
 *
 * The chart's marginal-tier guidance is position-aware, so this kind carries the seat geometry the
 * chart needs (`seat`, `buttonIndex`, `numPlayers`) on top of the holding. The board is empty
 * preflop and the pot-odds fields are unused by the chart, so they are defaulted in synthesis.
 */
export interface PreflopSpot {
  readonly kind: 'preflop'
  /** The question shown to the player, e.g. "You're on the button with A♣J♣ — open or fold?". */
  readonly prompt: string
  /** The ordered answer buttons; the correct one is whichever action the chart prescribes. */
  readonly choices: readonly ActionChoice[]
  /** The hero's two hole cards — all the chart classifies on. */
  readonly holeCards: readonly [Card, Card]
  /** The hero's seat index — the chart uses it (with the button) to detect late position. */
  readonly seat: number
  /** Seat index of the dealer button — half of the late-position test. */
  readonly buttonIndex: number
  /** Total seats at the table — the modulus for the cutoff/button geometry. */
  readonly numPlayers: number
}

/**
 * A **declarative** spot — the flagged last-resort carve-out.
 *
 * Some concepts the content ticket needs (position, board texture) do not map onto a single coach
 * continue-verdict, so for *those* — and only those — a spot may hand-author its answer via
 * {@link DeclarativeChoice}s. This is deliberately the least-preferred kind: prefer {@link CoachSpot}
 * /{@link PreflopSpot} whenever the coach *can* rule, so the lesson stays tethered to the live coach
 * math. {@link gradeSpot} reads the `correct` flags here; there is no coach verdict to attach.
 */
export interface DeclarativeSpot {
  readonly kind: 'declarative'
  /** The question shown to the player. */
  readonly prompt: string
  /** The ordered answer buttons, each carrying its own authored `correct` flag. */
  readonly choices: readonly DeclarativeChoice[]
  /** The `concept` this spot exercises — supplied by the author, since no coach verdict carries it. */
  readonly concept: Concept
  /** The explanation shown after answering — authored, since no deterministic numbers back it. */
  readonly explanation: string
}

/**
 * A retrieval check the curriculum can grade — the discriminated union over spot {@link CoachSpot.kind
 * kinds}. M5 drills extend the curriculum by adding spots of these kinds (or, if ever needed, a new
 * `kind` + a new {@link gradeSpot} branch), never by adding bespoke engine code.
 */
export type Spot = CoachSpot | PreflopSpot | DeclarativeSpot

/**
 * The inert seat the synthesised {@link DecisionContext} is built for. The coach's postflop read
 * ignores the seat entirely; the chart uses it only relative to {@link DEFAULT_BUTTON_INDEX}, and
 * {@link PreflopSpot} overrides it with the authored geometry, so a fixed `0` is a safe default for
 * the postflop path.
 */
const DEFAULT_SEAT = 0

/** The inert button seat for the synthesised context — see {@link DEFAULT_SEAT}. */
const DEFAULT_BUTTON_INDEX = 0

/** The inert table size for the synthesised context (heads-up). Overridden preflop by the author. */
const DEFAULT_NUM_PLAYERS = 2

/**
 * Inflate a {@link SpotContext} (plus optional seat geometry) into the full {@link DecisionContext}
 * the graders take — the single, documented synthesis seam the design note calls for.
 *
 * The coach reads only `holeCards`, `board`, `numActive`, `pot`, and `toCall`; the chart additionally
 * reads `seat`, `buttonIndex`, and `numPlayers`. Every *other* `DecisionContext` field is inert for
 * grading, so we fill it with a sensible, internally-consistent default rather than burdening the
 * author with it. `legalActions` is derived from the real engine helper over the synthesised
 * money/seat values so the context is well-formed, not hand-faked.
 *
 * **Validation (the odds/bots `RangeError` idiom).** Malformed inputs are rejected here, up front,
 * with the same `RangeError` style the engine packages use — a clearer message than a deep helper's,
 * and it documents the spot contract: exactly two distinct hole cards, a legal board size, a
 * non-negative pot and `toCall`, and at least two live seats.
 *
 * **Pot accounting.** `pot` and `toCall` are copied through *untouched* — the coach maps them
 * directly into the pot-odds math, so folding `toCall` into `pot` here would double-count.
 *
 * @param ctx The five coach-read inputs.
 * @param seatGeometry Optional `{ seat, buttonIndex, numPlayers }` the chart path supplies; the
 *   postflop path omits it and the inert defaults apply.
 */
export function synthesizeContext(
  ctx: SpotContext,
  seatGeometry?: {
    readonly seat: number
    readonly buttonIndex: number
    readonly numPlayers: number
  },
): DecisionContext {
  // --- Validate in the odds/bots RangeError idiom, before anything reaches a grader. ----
  if (ctx.holeCards.length !== 2) {
    throw new RangeError(`spot holeCards must have exactly 2 cards, got ${ctx.holeCards.length}`)
  }
  if (ctx.holeCards[0] === ctx.holeCards[1]) {
    throw new RangeError('spot holeCards must be two distinct cards')
  }
  const boardLen = ctx.board.length
  if (boardLen !== 0 && boardLen !== 3 && boardLen !== 4 && boardLen !== 5) {
    throw new RangeError(`spot board must have 0, 3, 4, or 5 cards, got ${boardLen}`)
  }
  if (ctx.pot < 0) throw new RangeError(`spot pot must be ≥ 0, got ${ctx.pot}`)
  if (ctx.toCall < 0) throw new RangeError(`spot toCall must be ≥ 0, got ${ctx.toCall}`)
  if (ctx.numActive < 2) {
    throw new RangeError(`spot numActive must be ≥ 2 (hero + ≥1 villain), got ${ctx.numActive}`)
  }

  const seat = seatGeometry?.seat ?? DEFAULT_SEAT
  const buttonIndex = seatGeometry?.buttonIndex ?? DEFAULT_BUTTON_INDEX
  const numPlayers = seatGeometry?.numPlayers ?? DEFAULT_NUM_PLAYERS

  // Derive the street from the board size — the only street the coach/chart could care about, and it
  // keeps the synthesised context self-consistent (empty board ⇒ preflop, three ⇒ flop, …).
  const street: Street =
    boardLen === 0 ? 'preflop' : boardLen === 3 ? 'flop' : boardLen === 4 ? 'turn' : 'river'

  return {
    seat,
    holeCards: ctx.holeCards,
    board: ctx.board,
    street,
    // No grader reads `legalActions`, but the field is required, so we synthesise an internally
    // consistent value from the spot's money: checking is free exactly when `toCall === 0`, and a
    // call costs `toCall`. The deep-stacked hero can always bet/raise. Kept well-formed (not faked)
    // so the context never lies if a future grader ever consults it.
    legalActions: synthesizeLegalActions(ctx.toCall),
    pot: ctx.pot,
    currentBet: ctx.toCall,
    toCall: ctx.toCall,
    stack: INERT_STACK,
    committed: 0,
    smallBlind: INERT_SMALL_BLIND,
    bigBlind: INERT_BIG_BLIND,
    buttonIndex,
    isButton: seat === buttonIndex,
    numPlayers,
    numActive: ctx.numActive,
    // No villain detail is needed for grading; an empty redacted list keeps the shape peek-proof.
    opponents: [],
  }
}

/** An inert, comfortably-deep hero stack for the synthesised context — never short-stacks `toCall`. */
const INERT_STACK = 1_000_000
/** Inert blinds for the synthesised context; no grader reads them. */
const INERT_SMALL_BLIND = 1
const INERT_BIG_BLIND = 2

/**
 * Build an internally-consistent {@link LegalActions} from the spot's `toCall` for the synthesised
 * context. No grader reads it, but the field is mandatory, so rather than fake an arbitrary shape we
 * derive one that matches the spot's money: a free spot (`toCall === 0`) can check and bet; a priced
 * spot can fold and call. The deep-stacked hero can always escalate (`bet`/`raise` to an inert
 * ceiling). The exact `min`/`max` are immaterial because the field is grading-inert.
 */
function synthesizeLegalActions(toCall: number): LegalActions {
  const free = toCall === 0
  return {
    fold: !free,
    check: free,
    call: free ? null : { amount: toCall },
    bet: free ? { min: INERT_BIG_BLIND, max: INERT_STACK } : null,
    raise: free ? null : { min: toCall * 2, max: INERT_STACK },
  }
}
