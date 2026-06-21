/**
 * The shared coach value formatters: how every play client renders the numbers a
 * {@link DecisionVerdict} carries — equity/pot-odds percents ({@link pct}), the signed chip EV
 * ({@link signedChips}), and the human headline for each verdict tag ({@link VERDICT_LABEL}).
 *
 * These were duplicated, byte-for-byte, in `apps/cli/src/table.ts` and
 * `apps/tui/src/components/CoachPanel.tsx`; consolidating them here (ticket 0030) means the coach
 * read can never phrase a verdict one way in the terminal harness and another in the TUI. Pure — no
 * Ink, no Node, no colour: a client wraps these in its own presentation (the CLI in a `── Coach ──`
 * text block, the TUI in colour-coded Ink `<Text>`), but the *value formatting* is identical and
 * lives only here.
 */

import {
  SIZE_PEGS,
  type DecisionVerdict,
  type Intent,
  type PreflopVerdict,
  type SizeBand,
  type SizingRead,
} from '@holdem/coach'

/** Format a `0..1` equity/pot-odds fraction as a one-decimal percent, e.g. `0.625 → "62.5%"`. */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** Format a chip EV as a signed number, e.g. `4 → "+4"`, `-1.5 → "-1.5"`, `0 → "0"`. */
export function signedChips(ev: number): string {
  // Round to one decimal *first* so a near-zero EV renders a bare, unsigned `0` rather than
  // a misleading signed zero (`-0.04 → "0"`, not `"-0"`; also handles JS negative zero).
  const rounded = Math.round(ev * 10) / 10
  if (rounded === 0) return '0'
  // Trim a trailing `.0` so whole-chip EVs read clean (`+4`, not `+4.0`).
  const magnitude = Math.abs(rounded).toFixed(1).replace(/\.0$/, '')
  return rounded < 0 ? `-${magnitude}` : `+${magnitude}`
}

/** The human-readable headline for each {@link DecisionVerdict.verdict} tag. */
export const VERDICT_LABEL: Readonly<Record<DecisionVerdict['verdict'], string>> = {
  good: 'Good: your action agreed with the math.',
  leak: 'Leak: the math pointed the other way.',
  breakEven: 'Break-even: a coin-flip spot; either way is fine.',
}

/**
 * The deterministic **"why" line** for a postflop decision: a single, label-free sentence that
 * states the *reason* behind the verdict by connecting the numbers the verdict already carries —
 * the spot-specific explanation the three metric cards only imply.
 *
 * It is the shared phrasing every play client and the Foundations primer render, for the same reason
 * {@link pct} / {@link signedChips} / {@link VERDICT_LABEL} live here: the coach must never explain a
 * verdict one way at the table and another in a lesson. It does **no** poker math — it reads
 * `equity` / `potOddsThreshold` / `callEv` / `correctDecision` / `verdict` straight off the verdict
 * and formats them. This is the *deterministic* half of "say why"; rich natural-language narration
 * (outs, draws, board texture) is the optional LLM layer ([[0011-llm-coaching]]), not this.
 *
 * Four cases, mirroring {@link coachDecision}'s own branches:
 * - **Unbet pot** (`potOddsThreshold === 0`): no price, so any equity continues — no EV claim. Three
 *   sub-cases, keyed off the verdict's action signals so the sentence matches what the hero *did*:
 *   - `missedValueBet` (ticket 0055 — the hero *checked* an unbet pot while comfortably ahead): adds
 *     the value-bet nudge ("…but with {equity} equity you're ahead — bet for value rather than
 *     checking.").
 *   - `heroBet` (BUG-0009 — the hero *bet/raised* into the unbet pot): describes the value bet, not a
 *     free check, so a graded bet is never mis-narrated as "taking the free card for nothing".
 *   - otherwise (a plain free check): the free-card line.
 *   All clients render this line, so each surfaces once, here, for the terminal, TUI, and PWA alike.
 * - **Break-even** (`verdict === 'breakEven'`): equity sits on the price; the call is a wash.
 * - **Priced continue** (`correctDecision === 'continue'`): equity beats the price, so calling is +EV.
 * - **Priced fold** (`correctDecision === 'fold'`): equity trails the price, so folding is +EV.
 *
 * On a **priced all-in for less than two-or-more live opponents** the verdict carries
 * {@link DecisionVerdict.shortAllIn} (ticket 0092); when present, one tight side-pot-eligibility
 * sentence is appended to the priced line, naming the main pot the hero is actually playing for.
 * It never co-occurs with the free-check branch (a check is not all-in).
 *
 * On a **bet/raise** the verdict carries a graded {@link DecisionVerdict.sizing} read (ticket 0102);
 * when present, one further sentence — its fully-formed, intent-named, peg-vocabulary `why` — is
 * appended after the continue-decision sentence (in-band states the purpose, out-of-band the
 * risk/reward arithmetic), so the size grade rides alongside the continue verdict in the one line every
 * client shares. `null` (a fold/call/check has no size to grade) appends nothing.
 *
 * The sentence is **label-free** (no "Good"/"Leak" prefix) so a client can pair it with its own
 * headline — the play coach's {@link VERDICT_LABEL}, the primer's encouraging copy — without
 * repeating the tag.
 *
 * **Composition (ticket 0103).** The narration is built from two single-sourced pieces so a client
 * that renders the size grade as its *own* structured section never duplicates the sizing sentence:
 * {@link explainContinue} (the continue-decision narration + the short-all-in note) and
 * {@link explainSizing} (just the appended sizing sentence, or `null`). `explainDecision` is exactly
 * their join — its combined output is **byte-identical** to before, so the CLI/TUI (which render this
 * combined string) are untouched; the PWA renders {@link explainContinue} for its coach-note and
 * {@link explainSizing} (or `verdict.sizing.why`) in its structured Sizing section, so the *why*
 * appears once.
 */
export function explainDecision(verdict: DecisionVerdict): string {
  // The combined narration is the continue-decision sentence (+ short-all-in note) followed by the
  // sizing sentence, exactly as before — composed from the two single-sourced accessors so the PWA can
  // render the halves separately without the sizing why showing up twice. The join keeps the combined
  // output byte-identical (the sizing note already carried its own leading space).
  const sizing = explainSizing(verdict)
  return explainContinue(verdict) + (sizing ? ` ${sizing}` : '')
}

/**
 * The **continue-decision narration alone** — `explainDecision`'s sentence *without* the appended
 * sizing sentence (ticket 0103). It is the continue verdict's `equity`/`potOddsThreshold`/`callEv`
 * walk-through (plus the short-all-in side-pot note), exactly the prose that always rode in front of
 * the sizing line.
 *
 * Extracted so the PWA coach drawer can render the continue narration in its coach-note while a
 * *separate* structured Sizing section renders {@link explainSizing} / `verdict.sizing.why` — the size
 * grade then appears exactly once. The CLI/TUI keep rendering the combined {@link explainDecision},
 * whose output is unchanged. Pure formatting off the verdict, like the rest of this module.
 */
export function explainContinue(verdict: DecisionVerdict): string {
  const equity = pct(verdict.equity)
  // The short-all-in side-pot eligibility note (ticket 0092): appended to the priced sentence when
  // the action put the hero all-in for less than two-or-more live opponents (a real side pot they
  // can't win). One tight, concrete sentence naming the main pot they're actually playing for. It
  // never co-occurs with a free check (a check is not all-in), so the unbet branch ignores it.
  const sidePotNote = verdict.shortAllIn
    ? ` You're all-in for ${verdict.shortAllIn.allInFor}, so you can only win the ${verdict.shortAllIn.mainPot} main pot — the chips above that form a side pot you're not eligible for.`
    : ''
  // A free check has no price to weigh equity against, so it never talks about a break-even % or EV.
  if (verdict.potOddsThreshold === 0) {
    // Over-passivity nudge (ticket 0055): the check is fine, but with this much equity the hero is
    // ahead and leaving value by not betting — surfaced here so every client gets it for free.
    if (verdict.missedValueBet) {
      return `Taking the free card is fine, but with ${equity} equity you're ahead: bet for value rather than checking.`
    }
    // The hero *did* bet into the unbet pot — describe a value bet, not a free check (BUG-0009): no
    // one had bet, and with this much equity the hero is ahead, so putting chips in is +EV value.
    // An unbet pot can still be a *short all-in* (ticket 0092): if 2+ opponents already went all-in
    // for more on a prior street, the current street is unbet (`toCall === 0`) yet a short open-shove
    // here is all-in for less — so the eligibility note is appended on this branch too, not only the
    // priced ones below. (`missedValueBet`/free-card are checks, never all-in, so `sidePotNote` is
    // empty there.)
    if (verdict.heroBet) {
      return `No one had bet, so there was no price to call, and with ${equity} equity you're ahead, so betting puts chips in as the favorite. A sound value bet.${sidePotNote}`
    }
    return `There's no price to call, so taking the free card is automatic: you keep your ${equity} share for nothing.`
  }
  const price = pct(verdict.potOddsThreshold)
  // Break-even: equity is within the tolerance band of the price, so the call is a coin-flip.
  if (verdict.verdict === 'breakEven') {
    return `Your ${equity} equity sits right on the ${price} the call needs: a coin-flip, so continuing and folding are equal in value.${sidePotNote}`
  }
  // Clear decision: equity is meaningfully above or below the break-even price. `callEv`'s sign is
  // the EV-correct side; report the chip EV of calling either way so the magnitude teaches too.
  const chips = `calling is worth ${signedChips(verdict.callEv)} chips`
  if (verdict.correctDecision === 'continue') {
    return `Your ${equity} equity beats the ${price} the call needs, so continuing is the +EV play: ${chips}.${sidePotNote}`
  }
  return `Your ${equity} equity falls short of the ${price} the call needs, so folding is the +EV play: ${chips}.${sidePotNote}`
}

/**
 * The **sizing sentence alone** — just the graded {@link SizingRead.why} the verdict carries when the
 * action was a bet/raise, or `null` when there is no size to grade (a fold/call/check, ticket 0103).
 *
 * It is the half of {@link explainDecision} that the CLI/TUI render *inline* (after the continue
 * sentence) and the PWA renders in its own structured Sizing section — single-sourced here so the same
 * `why` is never phrased two ways and, in the drawer, never duplicated (the drawer renders
 * {@link explainContinue} for its coach-note and this for its Sizing section). The `why` is already a
 * fully-formed, label-free, intent-named, peg-vocabulary sentence (it states the purpose in-band and
 * the risk/reward arithmetic out-of-band — never a fabricated optimal number or a solver claim); this
 * accessor only surfaces it, doing no formatting of its own.
 */
export function explainSizing(verdict: DecisionVerdict): string | null {
  return verdict.sizing ? verdict.sizing.why : null
}

/**
 * The smallest→largest peg words {@link formatBand} renders a pot-fraction band in — the *display*
 * spelling of the {@link SIZE_PEGS} vocabulary the bet-sizing lesson teaches ("½", "¾", "pot"). Keyed
 * by the peg's pot fraction so the word and the math come from the one {@link SIZE_PEGS} table and can
 * never drift: change a peg's fraction in the coach and the band words follow.
 */
const PEG_WORD: ReadonlyArray<{ readonly fraction: number; readonly word: string }> = [
  { fraction: SIZE_PEGS.quarter.fraction, word: '¼' },
  { fraction: SIZE_PEGS.third.fraction, word: '⅓' },
  { fraction: SIZE_PEGS.half.fraction, word: '½' },
  { fraction: SIZE_PEGS.threeQuarter.fraction, word: '¾' },
  { fraction: SIZE_PEGS.pot.fraction, word: 'pot' },
]

/** The peg word for a pot fraction — the nearest {@link SIZE_PEGS} peg's display spelling. */
function pegWord(fraction: number): string {
  let best = PEG_WORD[0]!
  for (const peg of PEG_WORD) {
    if (Math.abs(peg.fraction - fraction) < Math.abs(best.fraction - fraction)) best = peg
  }
  return best.word
}

/**
 * The **single bet-size button label** for a candidate pot fraction (ticket 0105) — the peg-vocabulary
 * spelling a "pick the bet size" drill shows on each size button. Single-sourced from the SAME
 * {@link SIZE_PEGS}-keyed {@link PEG_WORD} table {@link formatBand} renders bands with, so a drill's size
 * label and the coach's band words can never drift.
 *
 * Two shapes:
 * - **Within the standard sizes** (`fraction <= 1`, a ¼/⅓/½/¾/pot bet) → the nearest peg word with the
 *   `"pot"` unit, e.g. `"½ pot"`, `"¾ pot"`, `"pot"` (the full-pot peg is its own word, no trailing unit).
 * - **An overbet** (`fraction > 1`, e.g. a 1.5×-pot bet) → the multiple of the pot, e.g. `"1.5× pot"`,
 *   because no standard peg names a size above the pot and rounding it to `"pot"` would mislabel it.
 *
 * Pure formatting off the peg vocabulary — it picks a word, it computes no sizing math.
 */
export function sizingPegLabel(fraction: number): string {
  // An overbet has no standard peg — name it as a multiple of the pot rather than rounding it to "pot".
  if (fraction > 1) return `${bbNum(fraction)}× pot`
  // A standard size: the nearest peg word. "pot" is its own word; a fraction peg carries the "pot" unit.
  const word = pegWord(fraction)
  return word === 'pot' ? 'pot' : `${word} pot`
}

/** A big-blind amount with the trailing `.0` trimmed (`2 → "2"`, `2.5 → "2.5"`) — the `bb` unit is added once. */
function bbNum(amount: number): string {
  return (Math.round(amount * 10) / 10).toString()
}

/**
 * The recommended {@link SizeBand}, rendered in the bet-sizing lesson's peg vocabulary (ticket 0103) —
 * the band the coach drawer (and, later, the ActionBar) shows beside the size grade. Always a *band*,
 * never a single number, matching the no-solver-authority rule the band itself was built under.
 *
 * Three shapes, single-sourcing the peg words from {@link SIZE_PEGS} so the drawer and the lesson never
 * drift:
 * - **size-agnostic** (an overcall — you *match* the bet, you pick no number) → `"any reasonable size"`.
 * - **preflop opens / 3-bets** (sized natively in big blinds, `bbLo`/`bbHi` set) → e.g. `"2–2.5bb"`.
 * - **postflop pot-fraction bands** → the peg words, e.g. `"½–¾ pot"`, `"¾–pot"`. When both ends map to
 *   the same peg the word is not repeated (`"pot"`).
 */
export function formatBand(band: SizeBand): string {
  // Size-agnostic (the overcall): there is no single band to anchor, so say so rather than render the
  // widened placeholder as if it were a real recommendation.
  if (band.sizeAgnostic) return 'any reasonable size'
  // Preflop opens / 3-bets are sized in big blinds, not pot fraction — the `bb` unit rides on the high
  // end only, so the band reads "2–2.5bb" (the lesson's spelling), not "2bb–2.5bb".
  if (band.bbLo !== null && band.bbHi !== null) {
    return band.bbLo === band.bbHi
      ? `${bbNum(band.bbHi)}bb`
      : `${bbNum(band.bbLo)}–${bbNum(band.bbHi)}bb`
  }
  // Postflop pot-fraction band: render in the peg words. The high end carries the "pot" unit; a band
  // that collapses to one peg ("pot"–"pot") shows the single word.
  const lo = band.lo ?? 0
  const hi = band.hi ?? 0
  const loWord = pegWord(lo)
  const hiWord = pegWord(hi)
  if (loWord === hiWord) return hiWord === 'pot' ? 'pot' : `${hiWord} pot`
  // "pot" is its own word (no trailing "pot"); a fraction peg pairs with the "pot" unit on the high end.
  return hiWord === 'pot' ? `${loWord}–pot` : `${loWord}–${hiWord} pot`
}

/**
 * The **purpose / pot-odds-price sublabel** for an ActionBar quick-size peg (ticket 0104) — the small
 * line under the `min` / `½` / `pot` / `all-in` buttons that gives each peg its *meaning* in the
 * bet-sizing lesson's vocabulary, so the buttons teach rather than just set a number.
 *
 * The `½` and `pot` pegs carry the **pot-odds price they lay** the caller, single-sourced from
 * {@link SIZE_PEGS} (½ ≈ 25%, pot ≈ 33%) so the felt and the lesson never quote a different number;
 * `min` and `all-in` carry a short **purpose word** (the min-raise is the cheap re-open; all-in is the
 * commit) since neither is a fixed pot fraction. Returns `null` for a peg with no sublabel.
 *
 * Pure formatting off the peg vocabulary — the price math lives in {@link SIZE_PEGS} (the coach), this
 * only renders it. Kept compact (`"lays 25%"`, `"commit"`) so the sublabels never clip on a narrow phone.
 */
export function pegPurposeLabel(peg: 'min' | 'half' | 'pot' | 'allin'): string | null {
  switch (peg) {
    // The pot-odds price each value peg lays the caller, quoted from the single-sourced lesson pegs so
    // the felt's sublabel and the lesson's "½-pot ≈ 25%" can never drift. Rounded to a whole percent
    // (not `pct`'s one-decimal) to stay compact under a narrow-phone peg button.
    case 'half':
      return `lays ${Math.round(SIZE_PEGS.half.price * 100)}%`
    case 'pot':
      return `lays ${Math.round(SIZE_PEGS.pot.price * 100)}%`
    // The min-raise is the cheapest legal re-open; all-in commits the stack. Neither is a pot fraction,
    // so they carry a purpose word instead of a price.
    case 'min':
      return 're-open'
    case 'allin':
      return 'commit'
  }
}

/** The display word for a sizing {@link Intent} — the *job* the bet is doing (ticket 0103). */
export const INTENT_LABEL: Readonly<Record<Intent, string>> = {
  value: 'Value',
  bluff: 'Bluff',
  protection: 'Protection',
  steal: 'Steal',
}

/** The display word for a sizing grade — the size verdict, distinct from the continue {@link VERDICT_LABEL}. */
export const SIZE_GRADE_LABEL: Readonly<Record<SizingRead['verdict'], string>> = {
  good: 'Good size',
  'too-big': 'Too big',
  'too-small': 'Too small',
}

/**
 * The **at-a-glance price-comparison line** for a priced postflop decision — the terse "show the math"
 * counterpart to {@link explainDecision}'s prose: the equity the hero *had* set against the equity the
 * call *needed*, and the one-word reason that gap makes the play (ticket 0079). Where
 * {@link explainDecision} narrates a full sentence, this is the scannable "needed 33%, had ~28% —
 * that's why it's a fold" the drill result surfaces to scaffold the number the player should have
 * produced.
 *
 * It lives here, beside {@link explainDecision}, for the same reason the rest of this module is shared:
 * a drill and the live table must phrase a verdict's math identically, so the comparison is built once
 * from the {@link DecisionVerdict}'s own `equity` / `potOddsThreshold` and run through {@link pct} — it
 * does **no** poker math, recomputes nothing, and is byte-identical wherever it renders.
 *
 * **It is the close-vs-clear distinction.** The whole point of the line is that a `breakEven` spot and
 * an obvious fold are *not* the same teaching moment:
 * - **Break-even** (`verdict === 'breakEven'`) → equity sits *on* the price; says so plainly ("a
 *   coin-flip — folding and calling are equally fine"), so a player is never told a wash was a mistake.
 * - **Clear continue** (`correctDecision === 'continue'`) → "had {equity}, needed {price} — clear of
 *   the price, so continuing is the play."
 * - **Clear fold** (`correctDecision === 'fold'`) → "had {equity}, needed {price} — short of the
 *   price, so it's a fold."
 *
 * Returns `null` on a **free check** (`potOddsThreshold === 0`): there is no price to compare equity
 * against, so there is no comparison to draw — the caller renders {@link explainDecision}'s free-card
 * line instead. Label-free, like {@link explainDecision}, so a client pairs it with its own headline.
 */
export function priceComparison(verdict: DecisionVerdict): string | null {
  // No price to call ⇒ nothing to compare equity against. The caller's free-check copy covers it.
  if (verdict.potOddsThreshold === 0) return null
  const equity = pct(verdict.equity)
  const price = pct(verdict.potOddsThreshold)
  // Break-even: equity is within the coach's tolerance band of the price — a wash, not a mistake. The
  // honest read is "either way is fine", so a close spot is never scolded like a clear leak.
  if (verdict.verdict === 'breakEven') {
    return `You had ${equity} equity and the call needed ${price}: they're level, so it's a coin-flip: folding and calling are equally fine.`
  }
  // Clear decision: the gap between equity and the price is what decides it. Name which side, so the
  // line scaffolds the exact "needed X, had Y — that's why" comparison the player should have made.
  if (verdict.correctDecision === 'continue') {
    return `You had ${equity} equity and the call needed ${price}: comfortably clear of the price, so continuing is the play.`
  }
  return `You had ${equity} equity but the call needed ${price}: short of the price, so it's a fold.`
}

/** Plain-language phrase for a hero's preflop {@link PreflopVerdict.trace} position, for {@link explainPreflop}. */
export function positionPhrase(position: PreflopVerdict['trace']['position']): string {
  switch (position) {
    case 'early':
      return 'early position'
    case 'middle':
      return 'middle position'
    case 'late':
      return 'late position (the cutoff or button)'
    case 'small-blind':
      return 'the small blind'
    case 'big-blind':
      return 'the big blind'
  }
}

/**
 * The raise the hero faced, as a short phrase — `"a 3x raise"`, or `"a 9x raise (a 3-bet)"` when the
 * band is a 3-bet. Reads the already-rounded `raiseBb` and the `band` straight off the trace, the
 * same pair the coach's own `facingRaiseAdvice` rationale labels with, so the size named in the
 * explanation can never disagree with the regime the hand was graded against.
 */
function raisePhrase(trace: PreflopVerdict['trace']): string {
  return `a ${trace.raiseBb}x raise${trace.band === '3bet' ? ' (a 3-bet)' : ''}`
}

/**
 * The deterministic **"why" line** for a *preflop* decision — the chart-side counterpart to
 * {@link explainDecision}. A single, label-free, beginner-readable explanation that says *why* the
 * starting-hand chart ruled the way it did, following **situation → principle → this hand → nuance**,
 * built entirely from the {@link PreflopVerdict} and its {@link PreflopVerdict.trace} (no equity, no
 * Monte-Carlo, no I/O — exactly the facts the grade already computed). Preflop had only the terse
 * tier/advice `rationale`; this is the equivalent of the postflop `explainDecision` walk-through, so a
 * learner sees teachable reasoning, not just a confident verdict (ticket 0060).
 *
 * It is the shared phrasing every play client renders, for the same reason the rest of this module is
 * shared: the coach must never explain a ruling one way at the table and another in a lesson. It
 * branches on `trace.mode` — the rule the grade fired — then on the {@link PreflopVerdict.advice} and
 * the raise-size `band`, so it covers every preflop path:
 *
 * - **`'bb-option'`** — the big blind's free check on an unraised pot: nothing to call, so taking the
 *   flop is automatic (no open/fold lesson applies when continuing is free).
 * - **`'open'`** — the position-aware opening chart on an unraised pot. An *open* names the strength
 *   and the position that justify it; the steal-promotion open (a `trash` hand folded to the hero in a
 *   late/blind seat) adds the **optional-steal nuance** — opening is good, *folding is fine too* — the
 *   honest reading now that a steal fold grades `breakEven`, not a leak (the paired 0060 grade fix). A
 *   *fold* gets a position-relative reason the hand is too weak to open from here.
 * - **`'bb-defend'`** — a big blind defending a raise: the posted-blind discount and closing the
 *   action widen the defend vs a small raise; vs a large raise / 3-bet only value continues.
 * - **`'cold-call'`** — any other seat continuing vs a raise with no chips yet in: value tiers call,
 *   a speculative hand needs position for a thin flat, and everything else is a cold-call to fold.
 *
 * **Label-free**, like {@link explainDecision}: it carries no `Good`/`Leak` tag, so a client pairs it
 * with its own {@link VERDICT_LABEL} headline without repeating the verdict. Pure and deterministic —
 * string rendering off the verdict/trace, nothing more (rich conversational narration is the optional
 * LLM layer, not this).
 */
export function explainPreflop(verdict: PreflopVerdict): string {
  const { trace, tier, advice } = verdict
  const where = positionPhrase(trace.position)

  // The big blind's free option on an unraised pot — nothing to call, so the open/fold chart does
  // not apply: taking the flop for free is automatic.
  if (trace.mode === 'bb-option') {
    return `It folded around to your big blind and no one raised, so you have nothing to call: checking and taking the free flop is automatic. There's no reason to give up a hand when seeing the next card costs you nothing.`
  }

  // An open (or a fold of one) on an unraised pot — the position-aware opening chart.
  if (trace.mode === 'open') {
    if (advice === 'open') {
      // A trash hand opens ONLY via the steal promotion: folded to the hero in a late/blind seat. The
      // bottom of a steal range is optional, so this is the one open whose fold is fine too.
      if (tier === 'trash') {
        return `It folded around to you in ${where}, so only the blinds are left behind you. From there you can open a wide range: you act last and the blinds fold often, so the position and the steal are the profit, not the cards. This hand is weak but good enough to open here. The bottom of a steal range is optional, though: opening is good, and folding it is fine too.`
      }
      if (tier === 'premium' || tier === 'strong') {
        const strength = tier === 'premium' ? 'a premium holding' : 'a strong hand'
        return `This is ${strength}: strong enough to open and play for value from any seat, including ${where}. You want chips in the middle with it.`
      }
      if (tier === 'playable') {
        return `From ${where} you can open this playable, speculative hand: it flops well and plays nicely with position, so you enter the pot and play it with a plan.`
      }
      // marginal
      return `This is a marginal hand, the thin edge of the chart. From ${where} few players act behind you, so you open it to try to pick up the blinds; from an earlier seat you'd fold it.`
    }
    // A fold on an unraised pot — the chart says this hand is too weak to open from here.
    if (tier === 'playable') {
      return `From ${where} a speculative hand like this is too loose to open: too many players still act behind you. Fold it and wait for a later seat where it plays better.`
    }
    if (tier === 'marginal') {
      return `A marginal hand opens only from late position or the blinds. From ${where} there are too many players left to act behind you, so folding it is right.`
    }
    // trash fold (no steal available here): scoped to THIS spot — never a "makes no money" universal.
    return `This is the unconnected bottom of the chart, and from ${where} there's no steal or price that makes opening it profitable, so folding it here is right.`
  }

  // Facing a raise: a big-blind defend or a cold-call, tightened by the price faced.
  const raise = raisePhrase(trace)
  if (trace.mode === 'bb-defend') {
    if (advice === 'open') {
      // A small raise → wide defend on the discount; a large raise / 3-bet → only value continues.
      if (trace.band === 'small-raise') {
        return `You're in the big blind, so you already posted a blind and you close the action: that discount and last word make ${raise} a fine price to defend with a hand this wide.`
      }
      return `Facing ${raise} from the big blind, only strong hands continue, and this one is strong enough to defend for value even out of position.`
    }
    // BB fold: too weak even for the discounted price, or the price is simply too steep.
    if (trace.band === 'small-raise') {
      return `Even with the big-blind discount, this hand is too weak to defend against ${raise}: fold it.`
    }
    return `Facing ${raise} from the big blind, the price is too steep to defend: only strong, value hands continue here, so fold this one.`
  }
  // cold-call (any non-BB seat continuing vs a raise — no chips in the pot yet).
  if (advice === 'open') {
    if (tier === 'playable') {
      return `In ${where} you're in position against ${raise}, which makes this a fine price for a thin flat: you'll have position on every later street to make up for the speculative hand.`
    }
    const strength = tier === 'premium' ? 'a premium holding' : 'a strong hand'
    return `This is ${strength}: strong enough to call ${raise} and play the pot for value.`
  }
  // cold-call fold.
  return `You have no chips in the pot yet, so calling ${raise} would be a cold-call, and this hand is too weak, or too far out of position, to flat a raise. Fold and wait for a better spot.`
}

/**
 * The EV-row metric for a verdict — the `{ label, value }` pair every client prints at the top of a
 * postflop coach block — with the **label corrected for spots that have nothing to call** (ticket
 * 0055).
 *
 * {@link DecisionVerdict.callEv} is `evOfCall(...)`, the chip EV of *calling* relative to folding.
 * On a priced spot (a real call/raise) that is exactly what it is, so the label is `EV(call)`. But
 * on a **free check or a bet** there is nothing to call: with `callAmount === 0` the EV-of-call math
 * collapses to `equity × pot` — the hero's *pot-equity* (their chip share of the pot), not the EV of
 * any call. The number was always correct; only the `EV(call)` label misled about what it measures.
 * So when `potOddsThreshold === 0` (the coach's own "no price to call" signal — `potOdds(0, pot)`),
 * we relabel it `Pot equity`. The **value is unchanged** in both cases — only the label moves — so
 * the three renderers stay byte-identical and the chip number a player learns to read never shifts.
 *
 * A raise into a bet (a priced spot, `toCall > 0`) keeps `EV(call)`: there *is* a call to compare
 * against, so the EV-of-call framing is the honest one.
 *
 * Pure formatting, like the rest of this module: it reads the label off `potOddsThreshold` and runs
 * the value through {@link signedChips}, so the terminal, the TUI, and the PWA's EV card all derive
 * the same label/value from one place and can never diverge.
 */
export function evMetric(verdict: DecisionVerdict): {
  readonly label: string
  readonly value: string
} {
  // potOddsThreshold === 0 is exactly potOdds(0, pot) — nothing to call (a free check or a bet),
  // where callEv is really equity×pot (pot-equity), not the EV of a call. Relabel, keep the value.
  const label = verdict.potOddsThreshold === 0 ? 'Pot equity' : 'EV(call)'
  return { label, value: signedChips(verdict.callEv) }
}
