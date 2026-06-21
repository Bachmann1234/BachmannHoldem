/**
 * The **worked-steps** seam — turn a graded {@link Spot} into the ordered steps a player should
 * have walked to derive the right answer, so a miss teaches the *derivation*, not just the verdict.
 *
 * This is the structured companion to grade.ts's one-line `explanation`: where `explanation` states
 * the answer, these steps narrate the path to it — the price arithmetic, the equity (counted from
 * outs on a draw), and the comparison that lands the decision. Every step is built from the **same**
 * deterministic numbers the grader already computed (the coach verdict, `potOdds`, the seeded equity
 * read), so the steps can never disagree with the verdict the result reports — there is no parallel
 * math here, only a re-telling of the grade as a sequence.
 *
 * The equity step is the one with genuinely new work: on a recognised draw it counts outs
 * ({@link countDrawOuts}) and applies the rule of 2 and 4 ({@link outsToEquity}), the table-friendly
 * estimate — framed explicitly as "the quick estimate" next to the coach's precise read, so the
 * rule-of-4 approximation and the seeded Monte-Carlo number never read as a contradiction.
 *
 * Purity: zero I/O, pure functions over the verdict/context the grader hands in.
 */

import { evaluate7, formatCard, HAND_CATEGORY_NAMES, type Card } from '@holdem/engine'
import type { DecisionContext } from '@holdem/bots'
import type { DecisionVerdict, PreflopVerdict, SizingRead } from '@holdem/coach'
import { countDrawOuts, outsToEquity, type DrawRead } from '@holdem/odds'
import { formatBand, pct, positionPhrase, priceComparison, signedChips } from '@holdem/format'
import type { CalculationSpot, HandReadingSpot } from './spot.js'

/**
 * One step of a worked derivation — a short `label` (the move being made: "Price", "Your equity",
 * "Compare") and the `detail` that carries the arithmetic or reasoning. A flat, serialisable pair the
 * UI renders as a numbered list; deliberately no engine state or functions.
 */
export interface WorkedStep {
  /** The short heading for the step, e.g. `"Price"`, `"Your equity"`, `"Compare"`. */
  readonly label: string
  /** The worked detail — the arithmetic, the outs count, or the comparison that lands the decision. */
  readonly detail: string
}

/** Cards still to come from the board length: a flop (3) has two, a turn (4) has one. */
function cardsToCome(boardLength: number): 1 | 2 {
  return boardLength === 3 ? 2 : 1
}

/** The draw on a flop/turn board, or `null` off a recognised draw or a river (no card to come). */
function drawOn(holeCards: readonly [Card, Card], board: readonly Card[]): DrawRead | null {
  if (board.length !== 3 && board.length !== 4) return null
  return countDrawOuts(holeCards, board)
}

/**
 * How far the rule-of-2-and-4 estimate may exceed the coach's range-aware read before we stop
 * presenting it as a clean derivation. The rule counts a draw's *raw* odds to complete, blind to
 * whether the completed hand actually wins — so a **dominated** draw (one that's often behind even
 * when it hits, e.g. against a heavy barreling line) can show 18% raw odds against a true equity of
 * ~1%. Past this gap, the outs estimate is not "the quick estimate" but a *misleading* one, and we
 * reframe it as a reality-check rather than letting two contradictory numbers sit side by side.
 *
 * The guard is **one-directional** on purpose: when the estimate is at or *below* the coach's read
 * (the draw plus overcards/fold equity is worth more than the bare outs suggest), the rule is an
 * honest floor — "≈36% by the rule of 4, a bit more in practice" — so we keep it.
 */
export const OUTS_OVERSTATE_TOLERANCE = 0.08

/**
 * The equity step. On a recognised draw it counts outs and applies the rule of 2 and 4 (×4 on the
 * flop, ×2 on the turn). When that estimate roughly matches (or undershoots) the coach's precise
 * read, it's shown as the derivation with the read alongside; when it badly *overstates* the read —
 * a dominated draw — it's reframed honestly so the two numbers never read as a contradiction
 * ({@link OUTS_OVERSTATE_TOLERANCE}). Off a draw it states the read.
 */
function equityStep(equity: number, draw: DrawRead | null, toCome: 1 | 2): WorkedStep {
  if (draw === null) {
    return {
      label: 'Your equity',
      detail: `Your equity here is about ${pct(equity)} — your share of the pot against the range you're up against.`,
    }
  }
  const mult = toCome === 2 ? 4 : 2
  const approx = outsToEquity(draw.outs, toCome)
  if (approx - equity > OUTS_OVERSTATE_TOLERANCE) {
    // Dominated draw: the raw odds overstate the real equity, so don't present them as the answer.
    return {
      label: 'Your equity',
      detail: `You have a ${draw.label} (${draw.outs} outs, ≈ ${pct(approx)} to get there), but against this betting line it's often behind — your real equity is only about ${pct(equity)}.`,
    }
  }
  return {
    label: 'Your equity',
    detail: `You have a ${draw.label}: ${draw.outs} outs → ${draw.outs} × ${mult} ≈ ${pct(approx)} (the rule of ${mult}). The coach's precise read here is ${pct(equity)}.`,
  }
}

/**
 * Worked steps for a postflop coach decision — price, your equity (outs-derived on a draw), and the
 * comparison that lands the call/fold. Reuses the {@link DecisionVerdict} the grader already computed
 * (equity, pot-odds threshold, chip EV) and the {@link DecisionContext}'s cards for the outs count.
 */
export function coachWorkedSteps(verdict: DecisionVerdict, context: DecisionContext): WorkedStep[] {
  const { pot, toCall, holeCards, board } = context
  const eq = equityStep(verdict.equity, drawOn(holeCards, board), cardsToCome(board.length))

  if (toCall === 0) {
    // Unbet pot — no price to weigh, so the decision turns purely on equity.
    const decision: WorkedStep = verdict.missedValueBet
      ? {
          label: 'So…',
          detail: `Nothing to call and you're well ahead (${pct(verdict.equity)}) — bet for value rather than check.`,
        }
      : { label: 'So…', detail: 'Nothing to call, so checking is free — take the free card.' }
    return [
      {
        label: 'Price',
        detail: `No bet to you (${toCall} to call), so there's no price to pay — the only question is your equity.`,
      },
      eq,
      decision,
    ]
  }

  return [
    {
      label: 'Price',
      detail: `Pot is ${pot} and it's ${toCall} to call → ${toCall} / (${pot} + ${toCall}) = ${pct(verdict.potOddsThreshold)}. You need about ${pct(verdict.potOddsThreshold)} equity to call.`,
    },
    eq,
    {
      // Reuse the shared price-comparison sentence (the SAME one the table and the result's math line
      // show) so the worked steps phrase the call/fold identically — and, crucially, get its
      // `breakEven` branch ("a coin-flip, either way is fine") for free, so a correctly-folded
      // break-even spot is never told "continue". `toCall > 0` here ⇒ `potOddsThreshold > 0`, so
      // `priceComparison` is non-null (it returns null only on a free check). The EV addendum is the
      // one number the comparison line omits.
      label: 'Compare',
      detail: `${priceComparison(verdict)!} EV of calling here ≈ ${signedChips(verdict.callEv)}.`,
    },
  ]
}

/**
 * Worked steps for a preflop chart decision — sort into a tier, read the position-aware chart, and the
 * rationale. The "work" preflop is a chart lookup (a tier sort), not arithmetic, so the steps walk the
 * lookup the {@link PreflopVerdict} already recorded rather than any equity/price math. Reuses the
 * format layer's {@link positionPhrase} so the position wording matches the live coach exactly.
 */
export function preflopWorkedSteps(verdict: PreflopVerdict): WorkedStep[] {
  const { tier, advice, rationale, trace } = verdict
  const facing = trace.facingRaise ? `facing a ${trace.raiseBb}bb raise` : 'on an unraised pot'
  return [
    { label: 'Tier', detail: `Sort your hand into a strength tier — this is a ${tier} holding.` },
    {
      label: 'Chart',
      detail: `From ${positionPhrase(trace.position)}, ${facing}, the chart says ${advice}.`,
    },
    { label: 'Why', detail: rationale },
  ]
}

/**
 * Worked steps for a calculation spot — the arithmetic the spot asks the player to retrieve, broken
 * into setup → total → price for the price quantities, or spot-the-draw → count-outs → equity for the
 * equity quantity. On the equity quantity the derivation forks on whether hero holds a recognised draw:
 * a draw is outs-derived (rule of 2-and-4); a made hand has no such formula, so it reads the betting
 * line — opponents on realistic (and, once money is in, strong) ranges rather than random cards — which
 * is what actually drives the coach's range-aware number.
 */
export function calculationWorkedSteps(spot: CalculationSpot, value: number): WorkedStep[] {
  const { pot, toCall, holeCards, board, numActive } = spot.context
  const total = pot + toCall
  switch (spot.quantity) {
    case 'pot-odds':
      return [
        { label: 'Setup', detail: `It's ${toCall} to call into a ${pot} pot.` },
        {
          label: 'Total',
          detail: `If you call, you're playing for ${pot} + ${toCall} = ${total}.`,
        },
        {
          label: 'Price',
          detail: `${toCall} / ${total} = ${pct(value)} — that's the price you're getting.`,
        },
      ]
    case 'required-equity':
      return [
        { label: 'Setup', detail: `It's ${toCall} to call into a ${pot} pot.` },
        {
          label: 'Total',
          detail: `If you call, you're playing for ${pot} + ${toCall} = ${total}.`,
        },
        {
          label: 'Required equity',
          detail: `${toCall} / ${total} = ${pct(value)} — you need about ${pct(value)} equity to break even on the call.`,
        },
      ]
    case 'equity': {
      const draw = drawOn(holeCards, board)
      if (draw === null) {
        // No draw to count, so the rule of 2-and-4 has nothing to apply to — a made hand's equity is
        // simply how often it's still best at showdown, and that turns on the *range* the opponents hold,
        // not a random two cards. So the derivation reads the betting line: money already in means strong
        // ranges (top pairs, better pairs, sets) against which a marginal made hand is usually behind; an
        // unbet pot still means realistic holdings, not random. We deliberately do NOT anchor to an even
        // 1/numActive split: that is a *random-field* number, and against a random field a made hand is
        // ABOVE its fair share — the opposite of the point here — so stating it would mislead. The split is
        // used only as a quiet cutoff for the marginal/strong wording, never shown.
        const made = HAND_CATEGORY_NAMES[evaluate7([...holeCards, ...board]).category]
        const madeLower = made.toLowerCase()
        const opponents = numActive - 1
        const them = opponents === 1 ? 'opponent' : 'opponents'
        const range =
          toCall > 0
            ? `There's ${toCall} to call into ${pot}, so your ${opponents} ${them} have money in — assume strong ranges (top pairs, better pairs, sets), not random cards.`
            : `Your ${opponents} ${them} still hold realistic ranges, not random cards — weigh your ${madeLower} against the hands they'd actually play.`
        const verdict =
          value < 1 / numActive
            ? ` — a marginal ${madeLower} is usually behind one of them`
            : " — you're ahead of their ranges"
        return [
          {
            label: 'Made hand',
            detail: `No draw here — you have ${made}, so your equity is just how often that's still best at showdown.`,
          },
          { label: 'The range', detail: range },
          { label: 'Equity', detail: `Against that, your share is about ${pct(value)}${verdict}.` },
        ]
      }
      const toCome = cardsToCome(board.length)
      const mult = toCome === 2 ? 4 : 2
      const approx = outsToEquity(draw.outs, toCome)
      if (approx - value > OUTS_OVERSTATE_TOLERANCE) {
        // Dominated draw: the raw odds overstate the real equity (e.g. a flush that's often behind).
        return [
          {
            label: 'Spot the draw',
            detail: `You're on a ${draw.label} — about ${pct(approx)} to complete it.`,
          },
          {
            label: 'Reality check',
            detail: `But against this line the draw is often behind, so the raw odds overstate your share.`,
          },
          { label: 'Equity', detail: `Your real equity here is about ${pct(value)}.` },
        ]
      }
      return [
        { label: 'Spot the draw', detail: `You're on a ${draw.label}.` },
        {
          label: 'Count outs',
          detail: `${draw.outs} cards complete it → ${draw.outs} × ${mult} ≈ ${pct(approx)} (the rule of ${mult}).`,
        },
        {
          label: 'Equity',
          detail: `Your equity here is about ${pct(value)} — the outs estimate is in the right ballpark.`,
        },
      ]
    }
  }
}

/**
 * Worked steps for a hand-reading spot — your cards, the board, and the best five-card hand they make.
 * The "work" is reading the board, so the steps lay out the inputs and name the made hand the evaluator
 * derived (passed in as `answer`).
 */
export function handReadingWorkedSteps(spot: HandReadingSpot, answer: string): WorkedStep[] {
  return [
    { label: 'Your cards', detail: spot.holeCards.map(formatCard).join(' ') },
    { label: 'The board', detail: spot.board.map(formatCard).join(' ') },
    { label: 'Best hand', detail: `The best five-card hand these make is ${answer}.` },
  ]
}

/**
 * Worked steps for a sizing spot — the pot, the coach's recommended band, and the purpose `why`. The
 * `read` is the *chosen* size's {@link SizingRead}; its `band` is the recommended band (constant for the
 * spot) and its `why` is the live coach's explanation of the player's own pick.
 */
export function sizingWorkedSteps(read: SizingRead, pot: number): WorkedStep[] {
  return [
    { label: 'Pot', detail: `The pot is ${pot}.` },
    { label: 'Band', detail: `The coach's recommended size here is ${formatBand(read.band)}.` },
    { label: 'Why', detail: read.why },
  ]
}
