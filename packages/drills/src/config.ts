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
 */
export type DrillKind = 'coach' | 'preflop'

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
}

/** The spot kind generated when a config omits {@link DrillConfig.kind} — the postflop coach spot. */
export const DEFAULT_KIND: DrillKind = 'coach'

/** The price character used when a coach config omits {@link DrillConfig.priceMode} — unconstrained. */
export const DEFAULT_PRICE_MODE: PriceMode = 'any'

/**
 * Resolve a (possibly-`undefined`, possibly-partial) {@link DrillConfig} into a fully-populated one,
 * applying {@link DEFAULT_KIND} / {@link DEFAULT_PRICE_MODE} — so {@link generateSpot} reads concrete
 * values and the defaulting lives in exactly one documented place rather than scattered `?? default`
 * across the generator. A pure mapping, no randomness.
 */
export function resolveConfig(config?: DrillConfig): Required<DrillConfig> {
  return {
    kind: config?.kind ?? DEFAULT_KIND,
    priceMode: config?.priceMode ?? DEFAULT_PRICE_MODE,
  }
}
