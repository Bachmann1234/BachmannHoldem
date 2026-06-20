/**
 * The **spot** model — a self-contained, serialisable description of one retrieval check
 * (ticket 0044).
 *
 * A spot is the atom the Foundations primer ([[0042-foundations-primer]]) and the M5
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
 * One answer on a {@link HandReadingSpot} (ticket 0078): a single hand-category `label` — one of the
 * engine's {@link HAND_CATEGORY_NAMES} strings, e.g. `"Two Pair"`, `"Flush"`. The player taps the
 * category they believe their cards make on the board.
 *
 * **No `correct` flag — the category is derived, not authored.** Exactly like a {@link NumericChoice}
 * stores a bucket but never *which* bucket is right, this stores a category *label* but never *which*
 * label is right. {@link gradeSpot} evaluates `evaluate7([...holeCards, ...board])` at grade time and
 * the correct choice is the one whose `label` equals `HAND_CATEGORY_NAMES[category]` — the no-answer-key
 * invariant applied to the engine's *evaluator* instead of the coach. The label is the *only* thing the
 * grade matches on, so it must be a verbatim `HAND_CATEGORY_NAMES` string (the generator guarantees this).
 */
export interface HandReadingChoice {
  /** A hand-category name shown as the button — a verbatim `HAND_CATEGORY_NAMES` string the grade matches. */
  readonly label: string
}

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
 *
 * **Facing a raise (optional — {@link facingRaiseBb}).** By default a `PreflopSpot` is an *unraised*
 * pot: the hero is first in and `gradePreflop` consults the *opening* chart. Set {@link facingRaiseBb}
 * to grade a *facing-a-raise* spot instead — a single villain has raised to that many big blinds, so
 * `gradePreflop` switches to its raise-aware *defend* standard (`facingRaiseAdvice`: the continue
 * range tightens with the price faced, the big blind defends wider). {@link synthesizeContext}
 * threads the size into the synthesised `DecisionContext`'s `currentBet` so the coach's
 * `raiseBb = round(currentBet / bigBlind)` rounds back to exactly this value. **Absent/undefined ⇒
 * unraised pot ⇒ byte-for-byte the pre-existing behaviour** — the field is the *only* difference
 * between an open spot and a defend spot.
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
  /**
   * The size, in big blinds, of the single raise the hero faces — `undefined`/absent for an unraised
   * pot (the default: the hero is first to act and the *opening* chart grades the spot). When set,
   * {@link synthesizeContext} builds a raised context (`currentBet = facingRaiseBb × bigBlind`) so
   * `gradePreflop` takes its raise-aware *defend* path and the coach's rounded raise size matches this
   * value. Must be `> 1` to actually exceed the big blind (a value of `1` is the unraised standing
   * bet); the bands `facingRaiseAdvice` keys off are `< 5` (small), `≥ 5` (large), `≥ 9` (3-bet).
   */
  readonly facingRaiseBb?: number
}

/**
 * The numeric **quantity** a {@link CalculationSpot} asks the player to retrieve — the discriminator
 * for *which* deterministic number the grade computes and finds the player's bucket against (ticket
 * 0077). Every one of these is a number the app *already computes* somewhere, so a calculation spot
 * can never disagree with the live coach (the no-answer-key invariant, carried over to a numeric ask).
 *
 * - `'pot-odds'` — the price the hero is getting, as a fraction `0..1`: `potOdds(toCall, pot)` =
 *   `toCall / (pot + toCall)`. *"What price are you getting?"*
 * - `'required-equity'` — the minimum equity a call needs to break even, which is *the same number*
 *   (`potOdds(toCall, pot)` is by definition the break-even equity). The two share a value but ask the
 *   idea from opposite ends — the price you pay vs. the equity that price demands — so they exist as
 *   distinct prompts/quantities even though {@link gradeSpot} grades both against `potOdds`. *"What
 *   equity do you need to call?"*
 * - `'equity'` — the hero's estimated share of the pot at showdown, as a fraction `0..1`, graded
 *   against the **coach's own seeded read** — `coachDecision(synthesizeContext(ctx), { type: 'call' }).equity`
 *   — never a fresh sim with a different seed/method, so the estimate the drill grades is byte-identical
 *   to the equity the live coach would narrate for the same deal. The bucket width is the
 *   "rule-of-2-and-4 close enough" tolerance the ticket asks for. *"Estimate your equity here."*
 */
export type CalculationQuantity = 'pot-odds' | 'required-equity' | 'equity'

/**
 * One answer on a {@link CalculationSpot}: a human `label` (e.g. `"~25%"`, `"30–40%"`) plus the
 * **half-open numeric range** `[lo, hi)` it stands for. The player taps a range rather than typing a
 * number, reusing the tappable-choice UI machinery — the bucket width *is* the estimate tolerance.
 *
 * **No `correct` flag — the bucket is graded, not authored.** {@link gradeSpot} computes the spot's
 * quantity from the math at grade time and the correct bucket is whichever one *contains* that value.
 * This is the no-answer-key invariant applied to a numeric ask: the spot stores the *ranges*, never
 * *which* range is right.
 *
 * **Half-open `[lo, hi)` convention (so buckets partition cleanly).** A value `v` is contained when
 * `lo <= v < hi`. Half-open at the top means adjacent buckets (`[a, b)`, `[b, c)`) share their
 * boundary `b` without overlapping — `b` belongs to the *upper* bucket only — so any computed value
 * falls in **exactly one** offered bucket when the buckets tile the line with no gaps. The generator
 * is responsible for offering a gap-free tiling that covers the computed value; {@link gradeSpot}
 * throws a {@link RangeError} if no offered bucket contains it (an ill-posed spot).
 */
export interface NumericChoice {
  /** The button text shown to the player, e.g. `"~25%"` or `"20–28%"`. Purely presentational. */
  readonly label: string
  /** The **inclusive** lower bound of the bucket — `v` is in this bucket when `lo <= v`. */
  readonly lo: number
  /** The **exclusive** upper bound of the bucket — `v` is in this bucket when `v < hi`. */
  readonly hi: number
}

/**
 * A **calculation** spot — the retrieval check that asks the player to *produce a number*, not pick a
 * line (ticket 0077). The single biggest gap on the practice side was that the primer *teaches* the
 * math (pot odds, equity, break-even) but every other spot reduces to a binary Call/Fold pick — the
 * player never *retrieves the number*. This kind closes that gap: it presents a small set of
 * {@link NumericChoice} buckets ("~20%", "~28%", "~33%") and asks the player to land the math in the
 * right one.
 *
 * **It is graded against the math the app already computes — never an authored answer key.** The spot
 * carries the {@link SpotContext} inputs and a {@link CalculationQuantity} discriminator; at grade time
 * {@link gradeSpot} *computes* the value (`potOdds(toCall, pot)` for the price quantities, the coach's
 * seeded `.equity` for the equity quantity) and the correct bucket is whichever one contains it. So
 * exactly like a {@link CoachSpot}, the lesson can never disagree with the live coach — the correct
 * answer is derived, not stored. This is the cardinal rule extended from "which action" to "which
 * number".
 *
 * **Pot accounting (the same pitfall as every other priced spot).** `context.pot` is the pot the hero
 * would *win* (dead money **plus** the villain's current bet) and `context.toCall` is the chips the
 * hero must *add* — forwarded untouched, exactly as {@link CoachSpot} does, so a calculation spot's
 * pot-odds answer equals the coach's `potOddsThreshold` for the same deal. Do **not** fold `toCall`
 * into `pot`.
 */
export interface CalculationSpot {
  readonly kind: 'calculation'
  /** The question shown to the player, e.g. "30 to call into a 90 pot — what equity do you need?". */
  readonly prompt: string
  /**
   * The ordered bucket buttons, each a half-open `[lo, hi)` numeric range (see {@link NumericChoice}).
   * At least two, partitioning the line so the computed value lands in exactly one — the correct one is
   * derived by {@link gradeSpot}, never stored.
   */
  readonly choices: readonly NumericChoice[]
  /** The quantity to compute and bucket the player against — the {@link gradeSpot} branch selector. */
  readonly quantity: CalculationQuantity
  /** The five coach-read inputs the quantity is computed from; {@link synthesizeContext} inflates them. */
  readonly context: SpotContext
  /** The `concept` this spot exercises — `'pot-odds'`, `'equity'`, … — for the cross-link to its lesson. */
  readonly concept: Concept
}

/**
 * A **hand-reading** spot — the board-reading recognition check that asks *"what's the best hand you
 * have here?"* (ticket 0078). The thinnest gap on the practice side was that the most basic beginner
 * skill — recognising *what hand you actually hold* on a board, the prerequisite for every strength
 * read — had no drill at all. This kind closes it: it shows the hero's two cards on a board and a small
 * set of {@link HandReadingChoice} category buttons (`"Pair"`, `"Two Pair"`, `"Flush"`, …) and asks the
 * player to name the made hand.
 *
 * **It is graded against the engine's evaluator — never an authored answer key.** The spot carries the
 * `holeCards` + `board` and a set of category *labels*; at grade time {@link gradeSpot} runs
 * `evaluate7([...holeCards, ...board])` (the same 5..7-card evaluator the showdown uses) and the correct
 * choice is whichever offered label equals `HAND_CATEGORY_NAMES[category]`. So exactly like a
 * {@link CoachSpot} can never disagree with the live coach and a {@link CalculationSpot} can never
 * disagree with the math, a hand-reading spot can never disagree with the live *evaluator* — the
 * correct answer is *derived* from the same engine that rules every real hand, not stored. This is the
 * cardinal rule extended from "which action / which number" to "which hand".
 *
 * **Works across streets (ticket 0078's turn/river extension).** The board may be a flop (3), turn (4),
 * or river (5); `evaluate7` accepts 5..7 cards, so the made hand is read correctly at every street, and
 * the same spot drills board reading on a draw-heavy turn or a four-flush river, not just the flop.
 *
 * **No pot/money fields — this is not a continue decision.** Unlike the priced kinds, a hand-reading
 * spot weighs no pot odds and offers no Call/Fold, so it carries *only* the cards it reads; there is no
 * {@link SpotContext} to synthesise.
 */
export interface HandReadingSpot {
  readonly kind: 'hand-reading'
  /** The question shown to the player, e.g. "You hold A♠ K♠ on K♦ 7♠ 2♠ — what's the best hand you have?". */
  readonly prompt: string
  /**
   * The ordered category buttons — the true category (so the answer is always on offer) plus plausible
   * distractor categories. At least two; the correct one is *derived* by {@link gradeSpot} from
   * `evaluate7`, never stored. {@link gradeSpot} throws if no offered label matches the true category
   * (an ill-posed spot, mirroring the calculation kind's "no bucket contains the value" guard).
   */
  readonly choices: readonly HandReadingChoice[]
  /** The hero's two hole cards — half of the seven the evaluator reads. */
  readonly holeCards: readonly [Card, Card]
  /** The community board (3, 4, or 5 cards) the hand is read on — flop, turn, or river. */
  readonly board: readonly Card[]
  /**
   * The `concept` this spot exercises — `'ranges'` (see the {@link gradeSpot} hand-reading branch for
   * why: reading the made hand is the *strength-tier* recognition the `'ranges'` lens is built on, and
   * no other {@link Concept} fits board reading; the coach has no verdict for it).
   */
  readonly concept: Concept
}

/**
 * One answer on a {@link SizingSpot} (ticket 0105): a human `label` in the bet-sizing lesson's **peg
 * vocabulary** (e.g. `"½ pot"`, `"¼ pot"`, `"1.5× pot"`) plus the candidate bet-**to** chip amount it
 * stands for. The player taps the size they would bet; the grader runs the coach's `gradeSizing` over a
 * `{ type: 'bet', amount: toAmount }` action.
 *
 * **No `correct` flag — the right size is derived, not authored.** Exactly like a {@link NumericChoice}
 * stores a bucket but never *which* is right and a {@link HandReadingChoice} stores a category but never
 * *which* is right, this stores a candidate size but never *which* size is good. {@link gradeSpot}
 * runs the coach's `gradeSizing` over each choice's `toAmount` at grade time and the correct choice is
 * the one whose `verdict === 'good'` — the no-answer-key invariant applied to the coach's *sizing* read
 * (the band grader **is** the drill grader). The `label` is purely presentational; the grade keys on
 * `toAmount` alone.
 */
export interface SizingChoice {
  /** The button text shown to the player, in peg vocabulary, e.g. `"½ pot"` / `"1.5× pot"`. */
  readonly label: string
  /** The candidate bet-**to** chip amount this choice commits to — what the coach is asked to grade. */
  readonly toAmount: number
}

/**
 * A **bet-sizing** spot — the "what size?" retrieval check that asks the player to *pick a bet size*,
 * not a line (ticket 0105). The gap on the practice side was that the coach grades whether to *put
 * chips in* (call/fold, or — for a bet — whether the size is right via [[0100-coach-betting-sizing-guidance]]),
 * but no drill ever asked the learner to **choose the size**. This kind closes that gap: it presents an
 * **unbet** postflop spot (`context.toCall === 0`, so the hero is choosing a *bet*, not matching one)
 * and offers a small set of {@link SizingChoice} sizes ("¼ pot", "½ pot", "1.5× pot") and asks the
 * player to pick the one that serves the bet's purpose.
 *
 * **It is graded against the coach's own sizing read — never an authored answer key.** The spot carries
 * the {@link SpotContext} inputs and the candidate sizes; at grade time {@link gradeSpot} runs the
 * coach's `gradeSizing` (the **same** band grader the live play coach uses to grade a hero's bet size)
 * over each choice's `toAmount` and the correct choice is the one it grades `verdict === 'good'`. So
 * exactly like a {@link CoachSpot} can never disagree with the live coach and a {@link CalculationSpot}
 * can never disagree with the math, a sizing spot can never disagree with the live *sizing coach* — the
 * correct size is *derived* from the same band logic that grades a real bet, not stored. This is the
 * cardinal rule extended from "which action / which number / which hand" to "which size", and the
 * **out-of-band** picks are explained with the *same* `why` the coach gives the hero in play.
 *
 * **Always unbet (the design choice).** The spot is dealt with `context.toCall === 0`: an unbet pot is
 * where the hero genuinely *chooses* a bet size (a raise is sized off a bet faced; a call matches a
 * number and picks none). The generator guarantees this, so `classifySpot` reads the spot as a postflop
 * c-bet/lead and `recommendedBand` produces a real pot-fraction band to grade the candidate sizes
 * against.
 *
 * **Pot accounting (the same pitfall as every priced spot).** `context.pot` is the dead money in the
 * pot the bet is sized against, and `context.toCall` is `0` (unbet) — forwarded untouched, exactly as
 * {@link CoachSpot} does, so a sizing spot's band is computed off the same pot the live coach would read.
 */
export interface SizingSpot {
  readonly kind: 'sizing'
  /** The question shown to the player, e.g. "You hold A♠ K♠ on K♦ 7♠ 2♠ — pot 100, unbet. What size?". */
  readonly prompt: string
  /**
   * The ordered size buttons, each a candidate bet-to amount (see {@link SizingChoice}). At least two;
   * the correct one — the in-band ('good') size — is *derived* by {@link gradeSpot} from the coach's
   * `gradeSizing`, never stored. {@link gradeSpot} throws if no offered size grades 'good' (an ill-posed
   * spot, mirroring the calculation kind's "no bucket contains the value" guard).
   */
  readonly choices: readonly SizingChoice[]
  /** The coach-read inputs; {@link synthesizeContext} inflates them for the band grader. `toCall` is `0`. */
  readonly context: SpotContext
  /** The `concept` this spot exercises — `'pot-odds'`, matching how the bet-sizing lesson 0072 is tagged. */
  readonly concept: Concept
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
 * `kind` + a new {@link gradeSpot} branch), never by adding bespoke engine code. The
 * {@link CalculationSpot} (ticket 0077) is exactly such an addition: a numeric-retrieval ask whose
 * correct bucket is *derived* from the same `potOdds`/coach math at grade time, still no answer key. The
 * {@link HandReadingSpot} (ticket 0078) is another: a board-reading recognition ask whose correct
 * category is *derived* from `evaluate7` at grade time — the no-answer-key invariant applied to the
 * engine's evaluator. The {@link SizingSpot} (ticket 0105) is a third: a "what size?" ask whose correct
 * size is *derived* from the coach's `gradeSizing` band grader at grade time — the no-answer-key
 * invariant applied to the coach's sizing read (the band grader **is** the drill grader).
 */
export type Spot =
  | CoachSpot
  | PreflopSpot
  | CalculationSpot
  | HandReadingSpot
  | SizingSpot
  | DeclarativeSpot

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
 * **Facing a raise (the preflop defend path).** When `seatGeometry.facingRaiseBb` is set the spot is
 * a *facing-a-raise* preflop decision, not an unraised open: a single villain has raised to that many
 * big blinds. The synthesised context's `currentBet` becomes `facingRaiseBb × bigBlind` (so
 * `gradePreflop`'s `raiseBb = round(currentBet / bigBlind)` rounds back to exactly `facingRaiseBb`
 * and its `facingRaise = currentBet > bigBlind` is `true`); `toCall` is the chips the as-yet-uncommitted
 * hero must add to call (the whole raise), and `pot` is the coherent blinds + raise. **When it is
 * absent the function is byte-for-byte its previous self** — `currentBet = toCall`, `pot = ctx.pot`,
 * the seat-geometry-only path every existing `PreflopSpot` already takes.
 *
 * @param ctx The five coach-read inputs.
 * @param seatGeometry Optional `{ seat, buttonIndex, numPlayers, facingRaiseBb? }` the chart path
 *   supplies; the postflop path omits it and the inert defaults apply. `facingRaiseBb` (preflop only)
 *   selects the raise-aware defend path described above.
 */
export function synthesizeContext(
  ctx: SpotContext,
  seatGeometry?: {
    readonly seat: number
    readonly buttonIndex: number
    readonly numPlayers: number
    readonly facingRaiseBb?: number
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

  // The faced-raise size selects the preflop defend path; absent ⇒ unraised pot ⇒ the unchanged money.
  const facingRaiseBb = seatGeometry?.facingRaiseBb
  if (facingRaiseBb !== undefined && facingRaiseBb <= 1) {
    // A raise must exceed the standing big blind; ≤ 1 BB is not a raise (the BB itself is 1 BB).
    throw new RangeError(`spot facingRaiseBb must be > 1 big blind, got ${facingRaiseBb}`)
  }

  // Money fields. Default (no faced raise): the pre-existing behaviour — `currentBet === toCall`,
  // `pot === ctx.pot`. Faced raise: build a coherent raised pot so `gradePreflop` sees
  // `currentBet > bigBlind` and `round(currentBet / bigBlind) === facingRaiseBb`. The hero is
  // uncommitted, so `toCall` is the whole raise, and the pot already holds the blinds + the raise.
  // `toCall`/`pot` are grading-inert for the chart, but kept self-consistent so the context never lies.
  const raised = facingRaiseBb !== undefined
  const currentBet = raised ? facingRaiseBb * INERT_BIG_BLIND : ctx.toCall
  // The uncommitted hero must call the whole standing bet, so `toCall === currentBet` in both branches
  // (in the unraised branch `currentBet` is just `ctx.toCall`).
  const toCall = currentBet
  const pot = raised ? INERT_SMALL_BLIND + INERT_BIG_BLIND + currentBet : ctx.pot

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
    legalActions: synthesizeLegalActions(toCall),
    pot,
    currentBet,
    toCall,
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
