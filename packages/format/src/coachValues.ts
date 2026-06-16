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

import type { DecisionVerdict, PreflopVerdict } from '@holdem/coach'

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
  good: 'Good — your action agreed with the math.',
  leak: 'Leak — the math pointed the other way.',
  breakEven: 'Break-even — a coin-flip spot; either way is fine.',
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
 * The sentence is **label-free** (no "Good"/"Leak" prefix) so a client can pair it with its own
 * headline — the play coach's {@link VERDICT_LABEL}, the primer's encouraging copy — without
 * repeating the tag.
 */
export function explainDecision(verdict: DecisionVerdict): string {
  const equity = pct(verdict.equity)
  // A free check has no price to weigh equity against, so it never talks about a break-even % or EV.
  if (verdict.potOddsThreshold === 0) {
    // Over-passivity nudge (ticket 0055): the check is fine, but with this much equity the hero is
    // ahead and leaving value by not betting — surfaced here so every client gets it for free.
    if (verdict.missedValueBet) {
      return `Taking the free card is fine, but with ${equity} equity you're ahead — bet for value rather than checking.`
    }
    // The hero *did* bet into the unbet pot — describe a value bet, not a free check (BUG-0009): no
    // one had bet, and with this much equity the hero is ahead, so putting chips in is +EV value.
    if (verdict.heroBet) {
      return `No one had bet, so there was no price to call — and with ${equity} equity you're ahead, so betting puts chips in as the favorite. A sound value bet.`
    }
    return `There's no price to call, so taking the free card is automatic — you keep your ${equity} share for nothing.`
  }
  const price = pct(verdict.potOddsThreshold)
  // Break-even: equity is within the tolerance band of the price, so the call is a coin-flip.
  if (verdict.verdict === 'breakEven') {
    return `Your ${equity} equity sits right on the ${price} the call needs — a coin-flip, so continuing and folding are equal in value.`
  }
  // Clear decision: equity is meaningfully above or below the break-even price. `callEv`'s sign is
  // the EV-correct side; report the chip EV of calling either way so the magnitude teaches too.
  const chips = `calling is worth ${signedChips(verdict.callEv)} chips`
  if (verdict.correctDecision === 'continue') {
    return `Your ${equity} equity beats the ${price} the call needs, so continuing is the +EV play — ${chips}.`
  }
  return `Your ${equity} equity falls short of the ${price} the call needs, so folding is the +EV play — ${chips}.`
}

/** Plain-language phrase for a hero's preflop {@link PreflopVerdict.trace} position, for {@link explainPreflop}. */
function positionPhrase(position: PreflopVerdict['trace']['position']): string {
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
    return `It folded around to your big blind and no one raised, so you have nothing to call — checking and taking the free flop is automatic. There's no reason to give up a hand when seeing the next card costs you nothing.`
  }

  // An open (or a fold of one) on an unraised pot — the position-aware opening chart.
  if (trace.mode === 'open') {
    if (advice === 'open') {
      // A trash hand opens ONLY via the steal promotion: folded to the hero in a late/blind seat. The
      // bottom of a steal range is optional, so this is the one open whose fold is fine too.
      if (tier === 'trash') {
        return `It folded around to you in ${where}, so only the blinds are left behind you. From there you can open a wide range — you act last and the blinds fold often, so the position and the steal are the profit, not the cards. This hand is weak but good enough to open here. The bottom of a steal range is optional, though — opening is good, and folding it is fine too.`
      }
      if (tier === 'premium' || tier === 'strong') {
        const strength = tier === 'premium' ? 'a premium holding' : 'a strong hand'
        return `This is ${strength} — strong enough to open and play for value from any seat, including ${where}. You want chips in the middle with it.`
      }
      if (tier === 'playable') {
        return `From ${where} you can open this playable, speculative hand — it flops well and plays nicely with position, so you enter the pot and play it with a plan.`
      }
      // marginal
      return `This is a marginal hand — the thin edge of the chart. From ${where} few players act behind you, so you open it to try to pick up the blinds; from an earlier seat you'd fold it.`
    }
    // A fold on an unraised pot — the chart says this hand is too weak to open from here.
    if (tier === 'playable') {
      return `From ${where} a speculative hand like this is too loose to open — too many players still act behind you. Fold it and wait for a later seat where it plays better.`
    }
    if (tier === 'marginal') {
      return `A marginal hand opens only from late position or the blinds. From ${where} there are too many players left to act behind you, so folding it is right.`
    }
    // trash fold (no steal available here): scoped to THIS spot — never a "makes no money" universal.
    return `This is the unconnected bottom of the chart, and from ${where} there's no steal or price that makes opening it profitable — so folding it here is right.`
  }

  // Facing a raise: a big-blind defend or a cold-call, tightened by the price faced.
  const raise = raisePhrase(trace)
  if (trace.mode === 'bb-defend') {
    if (advice === 'open') {
      // A small raise → wide defend on the discount; a large raise / 3-bet → only value continues.
      if (trace.band === 'small-raise') {
        return `You're in the big blind, so you already posted a blind and you close the action — that discount and last word make ${raise} a fine price to defend with a hand this wide.`
      }
      return `Facing ${raise} from the big blind, only strong hands continue — and this one is strong enough to defend for value even out of position.`
    }
    // BB fold: too weak even for the discounted price, or the price is simply too steep.
    if (trace.band === 'small-raise') {
      return `Even with the big-blind discount, this hand is too weak to defend against ${raise} — fold it.`
    }
    return `Facing ${raise} from the big blind, the price is too steep to defend — only strong, value hands continue here, so fold this one.`
  }
  // cold-call (any non-BB seat continuing vs a raise — no chips in the pot yet).
  if (advice === 'open') {
    if (tier === 'playable') {
      return `In ${where} you're in position against ${raise}, which makes this a fine price for a thin flat — you'll have position on every later street to make up for the speculative hand.`
    }
    const strength = tier === 'premium' ? 'a premium holding' : 'a strong hand'
    return `This is ${strength} — strong enough to call ${raise} and play the pot for value.`
  }
  // cold-call fold.
  return `You have no chips in the pot yet, so calling ${raise} would be a cold-call — and this hand is too weak, or too far out of position, to flat a raise. Fold and wait for a better spot.`
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
