/**
 * End-of-session synthesis — the deterministic *brain* of the M9 recap
 * ([[0107-end-of-session-coach-synthesis]] / [[0109-coach-session-synthesis]]). At the end of a
 * play session the coach should look back over the hands just played and give **one synthesized
 * read** — _"looking over your hands tonight, here's the thing to work on"_ — anchored to the
 * specific spots that earned it. This module is that fold: a pure, deterministic
 * {@link synthesizeSession} that turns the session's retained, already-graded decisions into a
 * small, prioritized, hand-anchored {@link SessionRecap}.
 *
 * **It synthesizes over the session's OWN per-decision verdicts — NOT population leak stats.** This
 * is the load-bearing design decision of the whole milestone. The play-side M6 leak detector
 * (`apps/pwa/src/history/leaks.ts`) reasons over aggregate tendencies (VPIP / fold-to-3bet / AF)
 * and is *sample-gated* for good reason — one 20–40-hand session almost never clears the gate, so an
 * aggregate recap would honestly have to say "keep playing, not enough hands." This module answers a
 * **different, gate-free** question: "in *these specific hands you just played*, what did I actually
 * see?" Those are **facts about real decisions**, not population claims, so they sidestep the M6
 * sample gate honestly instead of fighting it. We mirror `leaks.ts`'s discipline — named, documented
 * threshold knobs; "data, not strings" structured findings; honest empty/low-signal handling; a pure
 * fold with a deterministic stable output order — but we reason over per-decision facts, never
 * population stats.
 *
 * **Recompute NOTHING.** Each retained entry already carries a graded {@link DecisionVerdict} (with
 * `verdict` ∈ `good`/`leak`/`breakEven` and a {@link Concept} tag) or {@link PreflopVerdict} (`tier`,
 * `advice`, `verdict`). Synthesis is a pure aggregation over those fields — it only **counts, ranks,
 * and selects exemplars**. No equity, pot-odds, or EV is recomputed; the live coach already did that
 * work. The "severity" used to rank exemplars is read off the already-computed numbers (the magnitude
 * of `callEv`, the distance of `equity` from `potOddsThreshold`) — never a re-grade.
 *
 * **The deterministic plain-English `line` IS the offline default.** Unlike `leaks.ts` (where the UI
 * owns all copy), the recap *owns* its prose: each takeaway and the top-level summary carry a
 * deterministic, layman-first, coachable-not-scolding `line` the PWA renders directly
 * ([[0110-pwa-session-recap-screen]]). An optional LLM narration layer ([[0011-llm-coaching]]) would
 * later only *reword* these lines — never restructure the recap and never compute a number. The copy
 * leans on the same coach vocabulary the live coach already speaks (the {@link Concept} tags) so the
 * recap sounds like the same coach.
 *
 * **No package cycle.** `@holdem/coach` must NOT import from `@holdem/session` — the dependency
 * direction is session → coach → bots, and importing session back would close a cycle. So the input
 * entry type {@link GradedSessionDecision} is declared **locally** here, structurally mirroring
 * session's `GradedDecision`, exactly the way {@link VillainArchetype} mirrors session's `BotKind` in
 * `verdict.ts`. Because the shapes match, `apps/pwa` passes `model.gradedDecisions` straight into
 * {@link synthesizeSession} with no conversion. See {@link GradedSessionDecision}.
 *
 * Purity: zero UI/DOM/Node/network, no `Date`, no `Math.random` — fully deterministic (same log →
 * byte-identical recap). Imports only `@holdem/engine`, `@holdem/bots`, and relative `./*.js`.
 */

import type { Action, Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import type { Concept, DecisionVerdict } from './verdict.js'
import type { PreflopVerdict } from './preflop.js'
import { handClassLabel, describeHandClass } from './preflop.js'

/**
 * One retained, already-graded hero decision — the input unit {@link synthesizeSession} folds over.
 *
 * **Declared locally to avoid a package cycle** (see the module doc). Its shape *structurally
 * mirrors* session's `GradedDecision` (`packages/session/src/model.ts`): a 1-based per-hand
 * {@link handNumber} ordinal plus the live graded {@link ruling}, which is exactly one of the two
 * **graded** {@link CoachResult}-style variants — a postflop `'verdict'` carrying a
 * {@link DecisionVerdict}, or a preflop `'preflop'` carrying a {@link PreflopVerdict}. Each variant
 * also carries the `ctx` ({@link DecisionContext}) the coach graded — from which synthesis reads the
 * hero's hole cards for the anchor (`ctx.holeCards`; there is no separate hole-cards field, mirroring
 * the session capture) — and the `action` the hero took. Because every literal and field matches, a
 * session `GradedDecision[]` is assignable to `GradedSessionDecision[]` with **no conversion**: the
 * PWA threads `model.gradedDecisions` straight in. This is the same structural-assignability trick
 * {@link VillainArchetype} uses for session's `BotKind`.
 *
 * The `'none'` / `'error'` {@link CoachResult} variants are deliberately absent — the session never
 * retains them (they carry no graded ruling), so synthesis never has to guard for them.
 */
export interface GradedSessionDecision {
  /**
   * The live graded ruling, copied through unchanged — never recomputed. Narrowed to the two graded
   * variants so a reader has the verdict, the `ctx` (and thus `ctx.holeCards` for the anchor), and the
   * hero's `action` without a `kind` guard for `'none'` / `'error'`.
   */
  readonly ruling:
    | {
        readonly kind: 'verdict'
        readonly verdict: DecisionVerdict
        readonly ctx: DecisionContext
        readonly action: Action
      }
    | {
        readonly kind: 'preflop'
        readonly verdict: PreflopVerdict
        readonly ctx: DecisionContext
        readonly action: Action
      }
  /**
   * The 1-based per-hand ordinal the decision happened in — the stable anchor that lets a takeaway
   * name the hand ("in hand #7…"). Mirrors session's `GradedDecision.handNumber`.
   */
  readonly handNumber: number
}

/**
 * The minimum number of graded decisions a session must contain before {@link synthesizeSession} will
 * call out a pattern at all — the M9 analog of `leaks.ts`'s `*_SAMPLE_THRESHOLD` knobs, and the gate
 * that keeps the recap honest about thin sessions.
 *
 * **Why a gate at all, when M9 makes no population claim?** A recap *is* honest about sample by
 * construction — it only describes decisions that actually happened. But naming a single leaked
 * decision "the thing to work on tonight" over-reads two-or-three-hand noise as a tendency. Below this
 * count we deliberately downgrade to the honest "too few hands this session to call out a pattern —
 * here's what I noticed" branch ({@link SessionRecapStatus} `'too-few'`) rather than overclaiming. This
 * is distinct from the *clean* branch (enough hands, zero leaks): see {@link synthesizeSession}.
 *
 * `8` is a deliberately *low* floor — far below M6's `VPIP_SAMPLE_THRESHOLD` (30) because we are not
 * gating a population stat, only refusing to crown a "pattern" from a near-empty session. A normal
 * 20–40-hand session clears it comfortably while a hero who quits after a couple of hands gets the
 * honest "too few" line instead of a manufactured takeaway. Tunable: raise it to be more conservative
 * about calling a pattern, lower it to speak sooner on short sessions.
 */
export const MIN_GRADED_DECISIONS = 8

/**
 * The most takeaways a recap will ever surface — the "at most one or two things to work on, not a
 * per-hand dump" cap from the ticket. A focused end-of-session read names the **dominant** theme (the
 * one the hero leaked on most) and, when a clear second theme exists, one runner-up; beyond that the
 * advice stops being a takeaway and becomes noise.
 *
 * `2` is the ticket's explicit ceiling. Tunable downward to `1` for a single-takeaway recap; raising
 * it past `2` re-opens the per-hand-dump failure the cap exists to prevent.
 */
export const MAX_TAKEAWAYS = 2

/**
 * The most exemplar hands a single takeaway names — the cap on the anchored "…in hands #7 and #14"
 * list. Two or three concrete hands make a takeaway feel earned and checkable without turning it into
 * a transcript; beyond that the anchor stops helping the hero find the spot.
 *
 * `3` is the ticket's upper bound (2–3). Tunable; keep it small so the anchor stays scannable.
 */
export const MAX_EXEMPLARS_PER_TAKEAWAY = 3

/**
 * The stable identity of a recap **theme** — the kind of leak a takeaway is about. A string-union key
 * (not a free-form string) so the PWA can switch on it for richer copy/links and tests can assert
 * exact identities, exactly like `leaks.ts`'s `LeakKey`.
 *
 * The **postflop** themes are the {@link Concept} tags the live coach already stamps on every
 * {@link DecisionVerdict}, so the recap speaks the coach's own vocabulary:
 *
 * - `'equity-vs-price'` — called/raised (or folded) a priced spot against the pot-odds math: the
 *   continue-decision concept the live postflop coach grades through.
 * - `'equity'` — a free-decision leak (the rare pathological fold of a free check).
 * - `'pot-odds'` / `'ev'` / `'position'` — the other {@link Concept} ideas, present so a verdict tagged
 *   with any of them maps to a theme rather than being dropped. (The live continue verdict rolls most
 *   priced spots into `'equity-vs-price'`; these exist for completeness and future tagging.)
 *
 * The **preflop** themes are the two distinct *shapes* a preflop `'leak'` takes — they are not a
 * {@link Concept} (preflop's concept is always `'ranges'`), so they get their own keys:
 *
 * - `'preflop-too-loose'` — the chart said **fold** but the hero **continued**: played too many weak
 *   hands before the flop.
 * - `'preflop-too-tight'` — the chart said **open** but the hero **folded**: folded hands worth opening.
 */
export type RecapThemeKey = Concept | 'preflop-too-loose' | 'preflop-too-tight'

/**
 * One anchored exemplar hand — the concrete spot that earned a takeaway, so a takeaway can say "you
 * called off light on the river in hands #7 and #14," not "you over-call." Plain structured DATA (no
 * markup), carrying the {@link handNumber} ordinal, the hero's hole-card {@link label} (e.g. `"AKs"`)
 * and its spoken {@link description} (e.g. `"Ace-King suited"`), and a deterministic per-hand
 * {@link line} the PWA can render directly.
 *
 * The hole cards are read off the graded `ruling.ctx.holeCards` (there is no separate hole-cards field
 * — synthesis reads them from the captured context, mirroring the session log). All fields are read or
 * derived from already-graded data; nothing here is recomputed.
 */
export interface RecapExemplar {
  /** The 1-based per-hand ordinal this exemplar happened in — the hand the takeaway points at. */
  readonly handNumber: number
  /** The hero's hole-card class label in standard notation (`"AA"` / `"AKs"` / `"AKo"`). */
  readonly label: string
  /** The spoken form of {@link label} for prose (`"pair of Aces"` / `"Ace-King suited"`). */
  readonly description: string
  /** A deterministic plain-English anchor line for this one hand — the offline default the PWA renders. */
  readonly line: string
}

/**
 * One prioritized takeaway — a single theme the hero leaked on this session, with the exemplar hands
 * that earned it and the deterministic plain-English {@link line} that IS the offline default copy.
 *
 * Plain structured DATA shaped so the PWA renders it directly ([[0110]]) **and** an LLM narration
 * layer ([[0011]]) could reword the {@link line} without computing anything. Like `leaks.ts`'s
 * `DetectedLeak`, it carries a stable {@link theme} key, the {@link count} of leaked decisions that
 * fed it (so the UI can show "3 spots"), and the anchored {@link exemplars} — but unlike `leaks.ts`
 * it also ships its own deterministic {@link line}.
 */
export interface RecapTakeaway {
  /** The stable theme key this takeaway is about (switchable union, not free-form). */
  readonly theme: RecapThemeKey
  /**
   * How many leaked decisions this session fed this theme — the count synthesis ranked themes by (the
   * dominant theme is the one with the highest count). Always `>= 1`; `>= exemplars.length` (the
   * exemplars are the sharpest {@link MAX_EXEMPLARS_PER_TAKEAWAY} of these).
   */
  readonly count: number
  /**
   * The anchored exemplar hands, ordered deterministically (sharpest first — see
   * {@link synthesizeSession} for the per-theme severity proxy), capped at
   * {@link MAX_EXEMPLARS_PER_TAKEAWAY}. Non-empty.
   */
  readonly exemplars: readonly RecapExemplar[]
  /**
   * The deterministic, layman-first, coachable-not-scolding plain-English line — the offline default
   * the PWA renders and an LLM would later reword. Names the theme in plain terms and folds in the
   * anchored hands. Owned here (not by the UI), the load-bearing difference from `leaks.ts`.
   */
  readonly line: string
}

/**
 * Which of the three honest cases a {@link SessionRecap} is — the discriminant that keeps the
 * clean / too-few / has-takeaways branches distinct (the ticket forbids collapsing them):
 *
 * - `'has-takeaways'` — enough graded decisions AND at least one leak: a prioritized recap of the one
 *   or two dominant themes, each hand-anchored. The only case with a non-empty {@link
 *   SessionRecap.takeaways}.
 * - `'clean'` — enough graded decisions ({@link MIN_GRADED_DECISIONS}+) but **zero** leaks: a positive,
 *   truthful recap ("solid session — nothing stood out as a leak"). No manufactured criticism.
 * - `'too-few'` — **fewer** than {@link MIN_GRADED_DECISIONS} graded decisions: the explicit "too few
 *   hands this session to call out a pattern — here's what I noticed" branch, rather than overclaiming
 *   a tendency from noise. Distinct from `'clean'` (which had the sample but no leaks).
 */
export type SessionRecapStatus = 'has-takeaways' | 'clean' | 'too-few'

/**
 * The structured end-of-session recap — the deterministic source of truth the PWA renders
 * ([[0110]]) and an optional LLM layer ([[0011]]) could later narrate without computing anything.
 *
 * A small object discriminated by {@link status}: a deterministic top-level {@link headline} (the
 * offline default summary line, owned here), the prioritized {@link takeaways} (empty unless
 * `status === 'has-takeaways'`), and the {@link gradedCount} the recap was folded from (the sample,
 * carried so the UI can show "over N decisions" and so the too-few branch is self-describing). Every
 * field is a plain, serialisable value — the recap round-trips trivially and the LLM layer reads its
 * lines, not its logic.
 */
export interface SessionRecap {
  /** Which honest case this recap is — the discriminant for the three branches. */
  readonly status: SessionRecapStatus
  /**
   * The deterministic top-level summary line — the offline default headline the PWA renders and an LLM
   * would reword. Reflects the {@link status}: a leak-naming lead-in for `'has-takeaways'`, a positive
   * line for `'clean'`, an honest low-sample line for `'too-few'`.
   */
  readonly headline: string
  /**
   * The prioritized takeaways, at most {@link MAX_TAKEAWAYS}, dominant theme first. **Empty** for
   * `'clean'` and `'too-few'` (there is no leak to work on, or too little sample to call one);
   * non-empty only for `'has-takeaways'`.
   */
  readonly takeaways: readonly RecapTakeaway[]
  /** The number of graded decisions this recap was folded from — the sample it describes. */
  readonly gradedCount: number
}

/**
 * The plain-English name of a {@link RecapThemeKey} — the layman-first noun phrase the deterministic
 * {@link RecapTakeaway.line} is built around, in the same coachable-not-scolding voice as `leaks.ts`'s
 * descriptions. Keyed by theme so the copy lives in exactly one place and the recap speaks the coach's
 * own {@link Concept} vocabulary in words a beginner reads.
 *
 * The postflop entries name the *idea* the leaked decisions turned on; the preflop entries name the
 * *shape* of the preflop leak. A tunable copy table, like `leaks.ts`'s description strings.
 *
 * **What the live grader can actually key.** Today `coachDecision` tags a postflop verdict only
 * `'equity-vs-price'` (a priced continue) or `'equity'` (a free check) — and a free check is always
 * graded `'good'` (never a leak), so in production data the only theme keys a real leak produces are
 * `'equity-vs-price'` and the two preflop shapes. The remaining postflop phrases (`'pot-odds'`,
 * `'ev'`, `'position'`, `'ranges'`, and a leaked `'equity'`) are carried for **type totality** — every
 * {@link RecapThemeKey} needs a phrase — and to stay correct if future tagging widens what the coach
 * stamps; they are exercised only by the unit tests' fabricated verdicts. Honest, not dead: the map is
 * total over the union by construction, not padded with unreachable guesses.
 */
export const THEME_PHRASE: Readonly<Record<RecapThemeKey, string>> = {
  // Postflop concepts — the live coach's own vocabulary, rendered in plain terms.
  'equity-vs-price': 'weighing your hand against the price to continue',
  equity: 'reading how good your hand is',
  'pot-odds': 'the price the pot was laying you',
  ev: 'the long-run value of the decision',
  position: 'using your position',
  // 'ranges' completes the Concept union but is unreachable as a postflop theme — a preflop leak
  // (whose concept IS 'ranges') is remapped by themeOf to the two preflop *shape* keys below, never
  // to this concept. Carried for type totality with honest phrasing in case future tagging uses it.
  ranges: 'thinking in ranges of hands',
  // Preflop shapes — not a Concept (preflop concept is always 'ranges'); their own plain phrasing.
  'preflop-too-loose': 'playing too many weak hands before the flop',
  'preflop-too-tight': 'folding hands worth opening before the flop',
} as const

/**
 * Read the hero's hole cards off a graded entry's captured context. There is no separate hole-cards
 * field on a {@link GradedSessionDecision} — they ride on `ruling.ctx.holeCards` (the
 * {@link DecisionContext} the coach graded), exactly as the session log stores them — so this is the
 * single place synthesis reaches for them. Returns the readonly two-card tuple `handClassLabel`
 * consumes. Pure — a field read, no recompute.
 */
function holeCardsOf(entry: GradedSessionDecision): readonly [Card, Card] {
  return entry.ruling.ctx.holeCards
}

/**
 * The deterministic per-theme **severity** of one leaked decision — the rank key that orders a
 * takeaway's exemplars sharpest-first, computed entirely from already-graded numbers (NO recompute):
 *
 * - **Postflop** (`ruling.kind === 'verdict'`): the magnitude of the already-computed `callEv` — how
 *   many chips the decision was off by — is the natural "how bad was this" proxy the ticket names. A
 *   bigger `|callEv|` is a more egregious continue/fold, so it sorts first. (Distance of `equity` from
 *   `potOddsThreshold` is the alternative the ticket allows; `|callEv|` is the chip-denominated form of
 *   the same thing and is what the coach already narrates, so we use it.)
 * - **Preflop** (`ruling.kind === 'preflop'`): a {@link PreflopVerdict} carries no EV number — the chart
 *   grader deliberately runs no pot-odds math — so there is no severity gradient to read. Every preflop
 *   leak gets severity `0`, and exemplars then fall back to the {@link handNumber} tiebreak below, which
 *   is fully deterministic.
 *
 * Pure: reads only graded fields. Larger = more severe = sorted earlier.
 */
function severityOf(entry: GradedSessionDecision): number {
  if (entry.ruling.kind === 'verdict') {
    return Math.abs(entry.ruling.verdict.callEv)
  }
  // Preflop has no EV gradient; rank by handNumber alone (see the tiebreak in pickExemplars).
  return 0
}

/**
 * The theme a single **leaked** decision belongs to — the grouping key the dominant-theme tally counts
 * over. Postflop maps straight to the verdict's already-computed {@link Concept} tag (the coach's own
 * vocabulary); preflop maps to one of the two leak *shapes*:
 *
 * - chart said **fold** (`advice === 'fold'`) but the hero **continued** → `'preflop-too-loose'`.
 * - chart said **open** (`advice === 'open'`) but the hero **folded** → `'preflop-too-tight'`.
 *
 * Returns `null` for a non-leak (a `'good'` / `'breakEven'` decision is not grouped — only leaks feed a
 * theme), so the caller filters on a non-null theme. Pure — a field read, no recompute. The preflop
 * branch is total over a *leak*: a preflop leak is by definition an action that disagreed with the
 * chart advice, so exactly one of the two shapes applies (a `'fold'`-advice leak is a continue; an
 * `'open'`-advice leak is a fold).
 */
function themeOf(entry: GradedSessionDecision): RecapThemeKey | null {
  const { ruling } = entry
  if (ruling.verdict.verdict !== 'leak') return null
  if (ruling.kind === 'verdict') {
    return ruling.verdict.concept
  }
  // Preflop leak: the action disagreed with the chart advice. Which shape it is falls out of the
  // advice — a 'fold'-advice leak means the hero continued a hand the chart folds (too loose); an
  // 'open'-advice leak means the hero folded a hand the chart opens (too tight).
  return ruling.verdict.advice === 'fold' ? 'preflop-too-loose' : 'preflop-too-tight'
}

/**
 * Build the deterministic anchor {@link line} for one exemplar hand — a layman-first "hand #N with
 * <hand>" fragment the PWA renders directly. Pure prose over already-derived data (the ordinal and the
 * spoken hand class), in the recap's owned voice.
 */
function exemplarLine(handNumber: number, description: string): string {
  return `hand #${handNumber} (${description})`
}

/**
 * Pick and order a theme's exemplar **hands** — the sharpest {@link MAX_EXEMPLARS_PER_TAKEAWAY}
 * distinct hands the hero leaked this theme on, ordered deterministically so the recap is byte-stable.
 *
 * **Distinct hands, not distinct decisions.** A single hand can contribute *several* leaked decisions
 * to one theme — the session retains one entry per graded hero action, so a hero who leaks the same
 * concept on both the flop and the river of hand #7 yields two entries with the same `handNumber`. The
 * anchor is the **hand** ("in hands #7 and #14"), so we dedupe by `handNumber`, keeping the sharpest
 * decision as that hand's representative. Without this the recap would name the same hand twice (a
 * stuttering "in hands #7 and #7") and a renderer keying on `handNumber` would collide. The takeaway's
 * `count` still reflects every leaked *decision* (see {@link synthesizeSession}); only the exemplar
 * *anchors* collapse to distinct hands.
 *
 * **The ordering, documented (the ticket requires it):** descending {@link severityOf} (the bigger the
 * already-computed `|callEv|`, the more egregious the spot, so it leads), with **ascending
 * {@link handNumber} as the tiebreak** — so equal-severity spots (and *all* preflop leaks, which share
 * severity `0`) fall into stable hand order. The tiebreak makes the sort total and deterministic with
 * no reliance on input order or `Array.sort` stability. The dedupe runs *after* the sort, so the
 * representative kept per hand is its sharpest decision. Reads only graded fields; recomputes nothing.
 */
function pickExemplars(entries: readonly GradedSessionDecision[]): RecapExemplar[] {
  const ordered = [...entries].sort((a, b) => {
    const sevDiff = severityOf(b) - severityOf(a) // descending severity (sharpest first)
    if (sevDiff !== 0) return sevDiff
    return a.handNumber - b.handNumber // ascending handNumber tiebreak (stable, total order)
  })
  // Collapse to distinct hands, keeping each hand's sharpest decision (the first seen post-sort). The
  // anchor is a hand, so two leaked decisions in one hand are one exemplar, not two.
  const seenHands = new Set<number>()
  const distinct = ordered.filter((entry) => {
    if (seenHands.has(entry.handNumber)) return false
    seenHands.add(entry.handNumber)
    return true
  })
  return distinct.slice(0, MAX_EXEMPLARS_PER_TAKEAWAY).map((entry): RecapExemplar => {
    const label = handClassLabel(holeCardsOf(entry))
    const description = describeHandClass(label)
    return {
      handNumber: entry.handNumber,
      label,
      description,
      line: exemplarLine(entry.handNumber, description),
    }
  })
}

/**
 * Join an exemplar list into the "in hands #7 (…) and #14 (…)" clause of a takeaway line — plain,
 * deterministic English with an Oxford-style "and" for the last item, in the recap's owned voice.
 * One hand reads "in hand #7 (…)"; two read "…#7 (…) and #14 (…)"; three "…, …, and …".
 */
function anchorClause(exemplars: readonly RecapExemplar[]): string {
  const fragments = exemplars.map((e) => `#${e.handNumber} (${e.description})`)
  const noun = fragments.length === 1 ? 'hand' : 'hands'
  if (fragments.length === 1) return `in ${noun} ${fragments[0]}`
  if (fragments.length === 2) return `in ${noun} ${fragments[0]} and ${fragments[1]}`
  const last = fragments[fragments.length - 1]
  return `in ${noun} ${fragments.slice(0, -1).join(', ')}, and ${last}`
}

/**
 * Build a takeaway's deterministic plain-English {@link line} — the offline default copy, owned here
 * (not by the UI). Names the theme in layman terms ({@link THEME_PHRASE}) and folds in the anchored
 * hands, in the coachable-not-scolding voice `leaks.ts` uses. The `count` lets the line say "a few
 * spots" honestly when more decisions fed the theme than the {@link MAX_EXEMPLARS_PER_TAKEAWAY} named.
 */
function takeawayLine(
  theme: RecapThemeKey,
  count: number,
  exemplars: readonly RecapExemplar[],
): string {
  const phrase = THEME_PHRASE[theme]
  const anchor = anchorClause(exemplars)
  // When more decisions fed the theme than we named, say so honestly ("across N spots, for example …")
  // so the line never implies the listed hands were the *only* ones. Otherwise just name the hands.
  if (count > exemplars.length) {
    return `Work on ${phrase}: it cost you across ${count} spots this session — for example ${anchor}.`
  }
  return `Work on ${phrase}: ${anchor}.`
}

/**
 * Fold the session's retained graded decisions into a small, prioritized, hand-anchored
 * {@link SessionRecap} — the pure, deterministic brain of the M9 end-of-session synthesis
 * ([[0109]]). Same log in → byte-identical recap out; no UI/I/O/network, no `Date`, no
 * `Math.random`, and **no recompute** of any equity/pot-odds/EV (it only counts, ranks, and selects
 * exemplars over fields the live coach already graded).
 *
 * **The three honest branches** (kept distinct — see {@link SessionRecapStatus}):
 *
 * 1. **Too few** (`log.length < `{@link MIN_GRADED_DECISIONS}) → `status: 'too-few'`. An explicit
 *    low-sample headline rather than crowning a "pattern" from two-or-three-hand noise. No takeaways.
 *    Checked **first**, on the *total* graded count — before looking at leaks — so a short session that
 *    happens to contain a leak still gets the honest "too few hands" line, never an overclaim.
 * 2. **Clean** (enough decisions, **zero** leaks) → `status: 'clean'`. A positive, truthful recap; no
 *    manufactured criticism. No takeaways.
 * 3. **Has takeaways** (enough decisions, ≥1 leak) → `status: 'has-takeaways'`. The prioritized recap.
 *
 * **Prioritization (the dominant theme over noise):** every leaked decision is grouped by its
 * {@link themeOf} key — postflop by the verdict's {@link Concept}, preflop by the too-loose / too-tight
 * shape. Themes are ranked by **leak count** (the theme the hero leaked on *most* this session leads),
 * with the theme key as a deterministic tiebreak so equal-count themes order stably. We keep at most
 * {@link MAX_TAKEAWAYS} (one or two), each anchored to its sharpest {@link pickExemplars} hands — not a
 * per-hand dump.
 *
 * Every takeaway and the top-level headline carry their own deterministic plain-English line (the
 * offline default the PWA renders, the LLM would later reword). The recap also carries the
 * {@link SessionRecap.gradedCount} sample it was folded from.
 *
 * @param log The session's retained graded decisions (the PWA passes `model.gradedDecisions` straight
 *   in — see {@link GradedSessionDecision} for why that type-checks with no conversion). Reasoned over
 *   directly; never re-graded.
 */
export function synthesizeSession(log: readonly GradedSessionDecision[]): SessionRecap {
  const gradedCount = log.length

  // BRANCH 1 — too few graded decisions to call a pattern. Checked FIRST on the total count (before
  // leaks) so a thin session that happens to contain a leak still gets the honest low-sample line
  // rather than crowning noise as a tendency. Distinct from the clean branch (which had the sample).
  if (gradedCount < MIN_GRADED_DECISIONS) {
    return {
      status: 'too-few',
      // No takeaways are attached in this branch (too little sample to crown a pattern), so the copy
      // must NOT promise an observation it doesn't supply — it stays an honest "play more" line rather
      // than a dangling "here's what I noticed" over an empty list. This is the ticket's "no fabricated
      // advice when the signal isn't there": a two-or-three-hand session genuinely has nothing to call.
      headline:
        gradedCount === 0
          ? 'No graded decisions this session yet — play a few hands and I’ll have something to say.'
          : `Too few hands this session to call out a pattern (only ${gradedCount} graded ${
              gradedCount === 1 ? 'decision' : 'decisions'
            }) — play a few more and I’ll have a real read for you.`,
      takeaways: [],
      gradedCount,
    }
  }

  // Group every LEAK by its theme. themeOf returns null for non-leaks, so good/breakEven decisions
  // never feed a theme — only leaks do (the recap is about what to work on). A Map preserves stable
  // first-seen insertion order, which the ranking tiebreak below makes irrelevant but keeps the build
  // deterministic regardless. We reason over per-decision facts here, never population aggregates.
  const byTheme = new Map<RecapThemeKey, GradedSessionDecision[]>()
  for (const entry of log) {
    const theme = themeOf(entry)
    if (theme === null) continue
    const bucket = byTheme.get(theme)
    if (bucket === undefined) byTheme.set(theme, [entry])
    else bucket.push(entry)
  }

  // BRANCH 2 — clean session: enough decisions but zero leaks. A positive, truthful recap; never a
  // manufactured criticism (the ticket's honest-empty handling). Distinct from 'too-few' above.
  if (byTheme.size === 0) {
    return {
      status: 'clean',
      headline: `Solid session — over ${gradedCount} graded decisions, nothing stood out as a leak. Keep it up.`,
      takeaways: [],
      gradedCount,
    }
  }

  // BRANCH 3 — has takeaways. Rank themes by how many decisions the hero LEAKED on them (dominant
  // theme — the one leaked on most — first), with the theme KEY as a deterministic tiebreak so
  // equal-count themes order stably (no reliance on Map order or sort stability). Then cap at
  // MAX_TAKEAWAYS (one or two) so the recap names the dominant theme over noise, not a per-hand dump.
  const ranked = [...byTheme.entries()].sort((a, b) => {
    const countDiff = b[1].length - a[1].length // descending leak count (dominant theme first)
    if (countDiff !== 0) return countDiff
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0 // stable theme-key tiebreak
  })

  const takeaways: RecapTakeaway[] = ranked
    .slice(0, MAX_TAKEAWAYS)
    .map(([theme, entries]): RecapTakeaway => {
      const exemplars = pickExemplars(entries)
      return {
        theme,
        count: entries.length,
        exemplars,
        line: takeawayLine(theme, entries.length, exemplars),
      }
    })

  // The headline leads with the dominant theme by name (plain terms), then the recap lists the
  // takeaways below it. Owned here as the deterministic offline default; an LLM would reword it.
  const dominant = takeaways[0]!
  const more = takeaways.length > 1 ? ` (and ${takeaways.length - 1} more to watch)` : ''
  const headline = `Looking over your ${gradedCount} graded hands tonight, the main thing to work on is ${THEME_PHRASE[dominant.theme]}${more}.`

  return {
    status: 'has-takeaways',
    headline,
    takeaways,
    gradedCount,
  }
}
