/**
 * The drill generator's **config seam** — the minimal parameterisation ticket 0066 hangs its theme
 * catalogue and session composer on, without forcing a rewrite here (ticket 0065).
 *
 * This ticket builds the generation *primitive*, not the themes: a seed in, a legal graded spot out.
 * But 0066 must be able to ask the generator for, say, "preflop only" or "a postflop spot with a
 * non-trivial price to call" — so the generator takes an optional {@link DrillConfig} that constrains
 * *which* kind of spot it deals and *what character* a postflop spot has. That is the whole seam: a
 * small, declarative description of the spot family wanted, which {@link generateSpot} reads to pick a
 * branch. It is deliberately **not** a theme catalogue (the named sets), **not** a session composer
 * (the interleaver), and **not** a god-object — those are 0066. Every field is optional with a
 * documented default, so today's caller passes a seed and nothing else and 0066 layers its themes on
 * top by supplying a config per drill.
 *
 * Purity: a plain data shape, no I/O, no randomness — the randomness is the {@link makeDealer} seed
 * the generator threads, never anything here.
 */

// `CalculationQuantity` is the curriculum's type, imported for use in this module's annotations and
// re-exported below — never redeclared here, so the drill config and the curriculum's
// `CalculationSpot`/`gradeSpot` are keyed on the one type and can't drift apart.
import type { CalculationQuantity } from '@holdem/curriculum'
// `BoardStreet` is the dealer's own street→size type, imported for the postflop `street` knob and
// re-exported below — never redeclared here, so the config's street and the dealer's board deal are
// keyed on the one type and can't drift apart.
import type { BoardStreet } from './deal.js'

/**
 * Which curriculum spot kind a drill should be — the top-level branch {@link generateSpot} takes.
 * Mirrors the curriculum's own discriminated union ({@link Spot}'s `kind`), minus the `'declarative'`
 * carve-out: the generator only ever emits *coach-graded* spots, because the cardinal rule is that a
 * generated spot's correctness comes from the live coach math, never an authored flag — and the
 * declarative kind is precisely the hand-authored-answer carve-out, which a procedural generator has
 * no business minting.
 *
 * - `'coach'` — a postflop priced continue-decision graded by `coachDecision` (a {@link CoachSpot}).
 * - `'preflop'` — a starting-hand-chart open/fold decision graded by `gradePreflop` (a
 *   {@link PreflopSpot}).
 * - `'calculation'` — a numeric-retrieval ask graded by `gradeSpot`'s calculation branch (a
 *   {@link CalculationSpot}, ticket 0077): the player taps the number bucket the math lands in. Still
 *   no answer key — the correct bucket is *computed* from `potOdds` / the coach's seeded equity at
 *   grade time, exactly the no-answer-key invariant the `'declarative'` kind would have violated and
 *   the reason this set excludes it.
 * - `'hand-reading'` — a board-reading recognition ask graded by `gradeSpot`'s hand-reading branch (a
 *   {@link HandReadingSpot}, ticket 0078): the player taps the hand category their cards make on the
 *   board. Still no answer key — the correct category is *derived* from the engine's `evaluate7` at
 *   grade time (the same evaluator the showdown ranks every real hand with), so a board-reading drill
 *   can never disagree with the live evaluator — the no-answer-key invariant applied to the engine.
 */
export type DrillKind = 'coach' | 'preflop' | 'calculation' | 'hand-reading'

/**
 * Which numeric quantity a generated `'calculation'` spot asks for. **Re-exported from the curriculum's
 * own {@link CalculationQuantity}** (not redeclared here) so a calculation theme can demand a *specific*
 * number to retrieve (the pot-odds price vs. an equity estimate) using the very type the curriculum's
 * `CalculationSpot`/`gradeSpot` are keyed on — the two can never drift apart. Each quantity is graded
 * deterministically against the math the app already computes:
 *
 * - `'pot-odds'` — "what price are you getting?" — graded against `potOdds(toCall, pot)`.
 * - `'required-equity'` — "what equity do you need to call?" — the same break-even number, framed as
 *   the equity the price demands.
 * - `'equity'` — "estimate your equity" — graded against the coach's *own seeded* `.equity` read, so
 *   the drill can never disagree with the live coach. The bucket width is the rule-of-2-and-4 tolerance.
 */
export type { CalculationQuantity }

/**
 * The board street a generated *postflop* spot is dealt on — the seam ticket 0078's turn/river themes
 * need so board reading and continue decisions appear on every street, not only the flop.
 * **Re-exported from the dealer's own {@link BoardStreet}** (not redeclared) so the dealer's
 * board-deal mapping stays the single source of truth. Exported for callers that need the *dealer's*
 * total street→size type (which legitimately includes `'preflop'` ⇒ 0 cards). A drill *config*,
 * however, never asks a postflop generator for a `'preflop'` board — it uses the narrower
 * {@link PostflopStreet}; see {@link DrillConfig.street}.
 */
export type { BoardStreet }

/**
 * The board streets a *postflop* drill spot ({@link CoachSpot} / {@link HandReadingSpot}) can be dealt
 * on — exactly the {@link BoardStreet}s that carry community cards (`'flop'` = 3, `'turn'` = 4,
 * `'river'` = 5), with **`'preflop'` deliberately excluded**.
 *
 * This is the *altitude-correct* fix for a real defect: a postflop generator dealt a `'preflop'`
 * (0-card) board produces an incoherent spot, and a hand-reading generator handed one would call
 * `evaluate7` on just the 2 hole cards and throw `RangeError('evaluate7 expects 5..7 cards, got 2')`.
 * Rather than guard that at runtime, {@link DrillConfig.street} is typed `PostflopStreet`, so a config
 * that asks a postflop spot for `'preflop'` **does not type-check** — the invalid state is
 * unrepresentable. The dealer keeps the wider {@link BoardStreet} (it legitimately maps `'preflop'` ⇒
 * 0 for the preflop kind); only the *config knob* a postflop spot reads is narrowed.
 *
 * A `'coach'` or `'hand-reading'` theme sets this to `'turn'`/`'river'`; omitted ⇒
 * {@link DEFAULT_STREET} (`'flop'`), so every existing caller is byte-identical.
 */
export type PostflopStreet = 'flop' | 'turn' | 'river'

/**
 * The price character a generated *postflop* ({@link CoachSpot}) spot should have — the seam 0066's
 * "pot-odds calls" theme needs to demand a spot where there is actually a price to weigh.
 *
 * - `'any'` — no constraint; the generator may deal a free (`toCall === 0`) or a priced spot. The
 *   default, so an unconstrained caller gets the full variety.
 * - `'priced'` — the spot must carry a non-trivial `toCall` (a real continue decision against a
 *   price), never a free check. This is the knob a pot-odds drill set turns on without this package
 *   needing to know what "pot-odds drill set" means.
 */
export type PriceMode = 'any' | 'priced'

/**
 * Which answer buttons a generated *postflop* ({@link CoachSpot}) continue decision offers — the seam
 * ticket 0078 uses to break the hard-wired Call/Fold binary *without* minting an answer key.
 *
 * **Every option here is still graded entirely by the live coach.** The cardinal rule holds: the
 * generator never authors which button is correct; `gradeSpot` runs `coachDecision` over each choice's
 * action and the correct one is whichever the coach does not rule a leak. These modes only change *which
 * actions are on offer*, never how they are graded — and they are chosen so that the coach genuinely
 * rules on each (see below). Bet *sizing* (specific amounts) is deliberately **not** an option here: the
 * coach cannot grade sizing deterministically (it grades only whether to put chips in, not how much —
 * see `@holdem/coach`'s verdict module and ticket 0072's open question), so an amount-picking drill
 * would need an authored key the live coach could contradict. It is deferred, not faked.
 *
 * - `'call-fold'` — the classic binary: **Call** then **Fold**. The default, so every existing theme is
 *   byte-identical. The coach rules `call` a continue and `fold` the surrender.
 * - `'call-raise-fold'` — a third **Raise** button between them: **Call** / **Raise** / **Fold**. The
 *   coach grades `raise` and `call` *identically* — both are "continues" (non-folds), both `'good'` when
 *   continuing is EV-correct and both `'leak'` when folding is — so this is a legitimate
 *   continue-or-fold drill with a third continue button the coach genuinely rules on, never an authored
 *   "raise is the one right answer" key. (When continuing is correct BOTH Call and Raise grade correct,
 *   exactly as the coach would at the table; the no-answer-key test asserts this.)
 */
export type ActionSet = 'call-fold' | 'call-raise-fold'

/**
 * How hard a generated spot's *parameters* are drawn — the adaptive-difficulty knob
 * ([[0081-drills-mastery-difficulty-glossary]]). This shifts **which legal spot is dealt**, never the
 * correct answer: every difficulty still produces a coach-/engine-graded spot with **no answer key**, so
 * the cardinal no-answer-key invariant is untouched. Difficulty only re-weights the *deal-time-deterministic*
 * parameter draws (the generator never computes equity at deal time, so it cannot target a break-even spot
 * — it leans the seeded draw toward inputs that demand more real mental math).
 *
 * - `'standard'` — the **default** and the pre-0081 behaviour, **byte-for-byte**: every parameter draw is
 *   the prior uniform `dealer.nextInt(n)` pick, in the same order, consuming the same dealer floats. So an
 *   omitted/`'standard'` difficulty replays every existing generated spot unchanged (pinned by a test).
 * - `'hard'` — lean the seeded draws toward harder values, on a handful of well-justified levers that are
 *   all deal-time-deterministic (no equity needed): a **less-round** pot/price (so the pot-odds arithmetic
 *   isn't a clean "half of 100") and **closer distractors** (a narrower number-bucket / category window, so
 *   the wrong answers sit right next to the right one). Each lever consumes the *same number of dealer
 *   draws in the same order* as `'standard'` — it only changes how a draw is *mapped to a value* — so a
 *   `'hard'` session stays a pure function of `(seed, config)` and replays byte-for-byte too.
 *
 * The level is *adaptive*: the PWA derives it from per-concept mastery (rises as mastery rises, eases when
 * it drops) — see the shell's `difficultyForMastery`. Kept a small enum (not a 0..1 scalar) so the levers
 * are a fixed, testable set rather than a continuum the generator would have to interpolate.
 */
export type Difficulty = 'standard' | 'hard'

/**
 * A drill **theme config** — the optional, all-defaults-provided parameterisation a caller (today: a
 * test; tomorrow: 0066's session composer) passes alongside a seed to shape the spot. Kept minimal on
 * purpose: it constrains the spot *family*, and nothing here knows about named themes, weighting, or
 * interleaving (0066). Adding a field later (e.g. a board-texture or position constraint) is additive
 * — existing callers keep working because every field is optional.
 */
export interface DrillConfig {
  /**
   * Which spot kind to generate. Omitted ⇒ {@link DEFAULT_KIND} (`'coach'`), the postflop priced
   * decision that is M5's centre of gravity. 0066's "preflop ranges" theme sets this to `'preflop'`.
   */
  readonly kind?: DrillKind
  /**
   * For a `'coach'` spot, the price character required. Omitted ⇒ {@link DEFAULT_PRICE_MODE}
   * (`'any'`). Ignored for a `'preflop'` spot, which has no postflop price. 0066's "pot-odds calls"
   * theme sets this to `'priced'`.
   */
  readonly priceMode?: PriceMode
  /**
   * For a `'calculation'` spot, which number to ask the player to retrieve. Omitted ⇒
   * {@link DEFAULT_QUANTITY} (`'pot-odds'`). Ignored for the `'coach'`/`'preflop'` kinds, which ask
   * for an *action*, not a number. A calculation theme ([[0077-drills-calculation-spots]]) sets this
   * to the quantity its topic isolates — `'required-equity'`, `'equity'`, …
   */
  readonly quantity?: CalculationQuantity
  /**
   * For a `'coach'` or `'hand-reading'` spot, the board street to deal — `'flop'` (3), `'turn'` (4), or
   * `'river'` (5). **Typed {@link PostflopStreet}, not {@link BoardStreet}**, so a postflop config
   * *cannot* request `'preflop'`: a 0-card board makes a postflop spot incoherent and would throw in
   * `evaluate7` (see {@link PostflopStreet}). Omitted ⇒ {@link DEFAULT_STREET} (`'flop'`), so every
   * existing theme/test is byte-identical (the generator dealt a flop before this knob existed). Ignored
   * for `'preflop'` (no board) and `'calculation'` (always a flop). A turn/river continue or
   * board-reading theme ([[0078-drills-board-reading-and-actions]]) sets this to `'turn'`/`'river'`.
   */
  readonly street?: PostflopStreet
  /**
   * For a `'coach'` spot, which answer buttons the continue decision offers. Omitted ⇒
   * {@link DEFAULT_ACTION_SET} (`'call-fold'`), the classic binary, so every existing theme/test is
   * byte-identical. Ignored for the non-coach kinds (which offer numbers / categories / a chart
   * open-fold, not a postflop continue). A richer-action theme
   * ([[0078-drills-board-reading-and-actions]]) sets this to `'call-raise-fold'` — still coach-graded,
   * see {@link ActionSet}.
   */
  readonly actions?: ActionSet
  /**
   * How hard to draw this spot's *parameters* — the adaptive-difficulty knob ([[0081]]). Omitted ⇒
   * {@link DEFAULT_DIFFICULTY} (`'standard'`), the prior uniform draw, **byte-for-byte**, so every existing
   * theme/test is unchanged. The PWA raises this to `'hard'` for concepts the learner has mastered (so the
   * arithmetic gets less round and the distractors get closer); it never changes the *correct* answer, only
   * which legal spot is dealt. See {@link Difficulty}.
   */
  readonly difficulty?: Difficulty
}

/** The spot kind generated when a config omits {@link DrillConfig.kind} — the postflop coach spot. */
export const DEFAULT_KIND: DrillKind = 'coach'

/** The price character used when a coach config omits {@link DrillConfig.priceMode} — unconstrained. */
export const DEFAULT_PRICE_MODE: PriceMode = 'any'

/**
 * The quantity asked when a `'calculation'` config omits {@link DrillConfig.quantity} — the pot-odds
 * price, the most fundamental of the three (every priced spot has one, and it is computed closed-form,
 * not sampled). Ignored by the non-calculation kinds.
 */
export const DEFAULT_QUANTITY: CalculationQuantity = 'pot-odds'

/**
 * The board street dealt when a `'coach'`/`'hand-reading'` config omits {@link DrillConfig.street} — the
 * flop, the simplest legal postflop board and the only street the generator dealt before ticket 0078
 * added later streets. Keeping the default the flop is what makes every pre-0078 caller byte-identical.
 */
export const DEFAULT_STREET: PostflopStreet = 'flop'

/**
 * The answer buttons offered when a `'coach'` config omits {@link DrillConfig.actions} — the classic
 * Call/Fold binary, the only set the generator offered before ticket 0078 added the richer set. Keeping
 * the default the binary is what makes every pre-0078 coach theme/test byte-identical.
 */
export const DEFAULT_ACTION_SET: ActionSet = 'call-fold'

/**
 * The difficulty used when a config omits {@link DrillConfig.difficulty} — `'standard'`, the prior uniform
 * parameter draw. Keeping the default `'standard'` is what makes every pre-0081 caller byte-identical: the
 * generator's difficulty-aware draws collapse to the exact `dealer.nextInt(n)` picks they were before.
 */
export const DEFAULT_DIFFICULTY: Difficulty = 'standard'

/**
 * Resolve a (possibly-`undefined`, possibly-partial) {@link DrillConfig} into a fully-populated one,
 * applying {@link DEFAULT_KIND} / {@link DEFAULT_PRICE_MODE} / {@link DEFAULT_QUANTITY} /
 * {@link DEFAULT_STREET} / {@link DEFAULT_ACTION_SET} / {@link DEFAULT_DIFFICULTY} — so
 * {@link generateSpot} reads concrete values and
 * the defaulting lives in exactly one documented place rather than scattered `?? default` across the
 * generator. A pure mapping, no randomness.
 *
 * Throws {@link RangeError} (the odds/bots validation idiom) on a `street` of `'preflop'`. The
 * {@link PostflopStreet} type already makes that unrepresentable for a typed caller — this is the
 * belt-and-braces guard for any remaining runtime path (a JS caller, a deserialised config) that could
 * still smuggle `'preflop'` past the compiler into a postflop generator, where it would deal a 0-card
 * board and crash `evaluate7`. Better to fail loudly here than produce an incoherent spot downstream.
 */
export function resolveConfig(config?: DrillConfig): Required<DrillConfig> {
  const street = config?.street ?? DEFAULT_STREET
  if ((street as BoardStreet) === 'preflop') {
    throw new RangeError(
      `drill config street must be a postflop street (flop/turn/river), got "${street}"`,
    )
  }
  return {
    kind: config?.kind ?? DEFAULT_KIND,
    priceMode: config?.priceMode ?? DEFAULT_PRICE_MODE,
    quantity: config?.quantity ?? DEFAULT_QUANTITY,
    street,
    actions: config?.actions ?? DEFAULT_ACTION_SET,
    difficulty: config?.difficulty ?? DEFAULT_DIFFICULTY,
  }
}
