/**
 * **Spot capture** — serialise the exact spot the coach just ruled on into a self-contained,
 * human-READABLE JSON blob, and parse one back into the inputs the graders re-run from (this part
 * of the project).
 *
 * The coach is a *pure function of `(DecisionContext, action)`*: {@link coachDecision} and
 * {@link gradePreflop} read nothing but the spot in front of them and a fixed seed, never a
 * shuffle/seat-matching/bot history. That is the whole leverage here — a blob carrying just the
 * fields those two graders read reproduces the ruling **exactly**, with no engine state to replay.
 * So a learner staring at a verdict on their phone can copy the spot, paste it to an AI for a second
 * opinion, and `pnpm sim --spot='<that blob>'` re-grades it to the identical verdict + trace.
 *
 * **What the blob carries — only what the graders read** (see the module docs on `coachDecision` /
 * `gradePreflop` for the exact field lists):
 *   - postflop ({@link coachDecision}) reads `holeCards`, `board`, `pot`, `toCall`, `numActive`;
 *   - preflop ({@link gradePreflop}) reads `holeCards`, `currentBet`, `bigBlind`, the action,
 *     `seat`/`buttonIndex`/`numPlayers` (position), and `opponents`/`smallBlind`/`bigBlind`/
 *     `buttonIndex` (the steal-spot read).
 * Neither reads `legalActions`, so {@link parseSpot} stubs it with a minimal, never-consulted value.
 * The blob also carries the **already-computed verdict** when one is passed, so the JSON is directly
 * reviewable (an AI can read the ruling) without anyone having to re-grade it first.
 *
 * **Readability is a feature, not a nicety.** The blob is pretty-printed (2-space) and renders cards
 * as the human `"Ah Tc"` strings the rest of the app speaks (via {@link formatCard} /
 * {@link parseCards}), and the action in the shared `"call"`/`"bet 50"` grammar — so a person can
 * read the whole spot at a glance, and an AI can reason about it without a card-int codec.
 *
 * Purity: zero I/O — no DOM, no clipboard, no network (the clipboard write lives in the PWA). Imports
 * only `@holdem/*`. The same `(ctx, action)` always round-trips to the same re-graded verdict.
 */

import { formatCard, parseCards, type Action, type Card } from '@holdem/engine'
import type { DecisionContext, OpponentView } from '@holdem/bots'
import type { DecisionVerdict } from './verdict.js'
import type { PreflopVerdict } from './preflop.js'

/**
 * A captured spot — the *complete* input to a single coach ruling: the imperfect-information
 * {@link DecisionContext} the player faced and the {@link Action} they took. Re-running the right
 * grader on this reproduces the verdict exactly, which is the point of {@link serializeSpot} /
 * {@link parseSpot}. (The verdict itself is *carried in the JSON* when serialised but is not part of
 * this type — it is derived, not an input; a parsed Spot is fed back to a grader to recompute it.)
 */
export interface Spot {
  readonly ctx: DecisionContext
  readonly action: Action
}

/**
 * The compact, readable shape of one opponent inside a serialised spot — exactly the
 * {@link OpponentView} fields the graders read (the steal-spot read consults `seat`/`committed`/
 * `status`, and we keep `totalCommitted`/`stack`/`isButton` so the blob is a faithful, lossless
 * snapshot of the view). A plain JSON object; the card-free opponent view has nothing to encode.
 */
interface SerializedOpponent {
  readonly seat: number
  readonly committed: number
  readonly totalCommitted: number
  readonly stack: number
  readonly status: OpponentView['status']
  readonly isButton: boolean
}

/**
 * The on-the-wire shape of a serialised spot — the readable JSON object {@link serializeSpot}
 * stringifies and {@link parseSpot} validates. Cards are human strings (`"Ah Tc"`, board `""` when
 * empty), the action is the shared `"call"`/`"bet 50"` grammar, and every other field is the plain
 * number/seat the graders read. The optional `verdict` is the already-computed ruling, carried so the
 * blob is reviewable as-is (it is not re-parsed into a `Spot` — re-grading recomputes it).
 */
interface SerializedSpot {
  /** The acting seat — read by the preflop position classifier. */
  readonly seat: number
  /** The hero's two hole cards as a `"Ah Tc"` string. */
  readonly holeCards: string
  /** The board as a `"Kh Qs Jd"` string, `""` preflop (no community cards yet). */
  readonly board: string
  /** The street — both graders branch on preflop vs not. */
  readonly street: DecisionContext['street']
  /** Lifetime pot (postflop pot-odds math). */
  readonly pot: number
  /** Additional chips to call (postflop pot-odds math; `0` is a free check). */
  readonly toCall: number
  /** Highest committed this street (preflop: raised-pot detection vs `bigBlind`). */
  readonly currentBet: number
  readonly smallBlind: number
  readonly bigBlind: number
  /** Dealer-button seat (preflop position + steal-spot geometry). */
  readonly buttonIndex: number
  /** Total seats dealt (preflop position geometry). */
  readonly numPlayers: number
  /** Seats still live (postflop equity reads against `numActive - 1` villains). */
  readonly numActive: number
  /** The redacted opponents — enough for the preflop steal-spot read. */
  readonly opponents: readonly SerializedOpponent[]
  /** The hero's action, in the shared `"call"`/`"fold"`/`"check"`/`"bet 50"`/`"raise 12"` grammar. */
  readonly action: string
  /** The already-computed ruling, carried so the blob reviews without re-grading. Omitted if none was passed. */
  readonly verdict?: DecisionVerdict | PreflopVerdict
}

/**
 * Render an {@link Action} in the shared input grammar the play clients speak ({@link parseAction}
 * in `@holdem/format`): the bare verb for `fold`/`check`/`call`, and `"<verb> <amount>"` for the
 * sized `bet`/`raise` (the `amount` is the engine's "to this total" figure). One readable token a
 * human and {@link parseActionToken} both understand.
 */
function formatActionToken(action: Action): string {
  return 'amount' in action ? `${action.type} ${action.amount}` : action.type
}

/**
 * Parse an action token from a serialised spot back into an engine {@link Action} — the inverse of
 * {@link formatActionToken}, in the same `"call"`/`"bet 50"` grammar. Kept local (not the
 * `@holdem/format` `parseAction`) because that one validates against {@link LegalActions} we
 * deliberately do not carry in a spot (the graders never read them); here we only need to rebuild
 * the action the grader will re-grade. Throws a clear {@link Error} on a malformed/empty token or a
 * sized verb missing its amount, so a hand-edited blob fails loudly rather than silently mis-grading.
 */
function parseActionToken(token: string): Action {
  const parts = token.trim().split(/\s+/)
  const verb = parts[0]
  switch (verb) {
    case 'fold':
    case 'check':
    case 'call':
      return { type: verb }
    case 'bet':
    case 'raise': {
      const amount = Number(parts[1])
      if (parts[1] === undefined || !Number.isFinite(amount)) {
        throw new Error(
          `spot action "${token}": ${verb} needs a numeric amount (e.g. "${verb} 50")`,
        )
      }
      return { type: verb, amount }
    }
    default:
      throw new Error(`spot action "${token}": unknown action verb "${verb ?? ''}"`)
  }
}

/**
 * Serialise a coached spot into a readable, self-contained JSON blob — the copy-to-clipboard payload
 * a learner pastes to an AI, and the exact text `pnpm sim --spot='<json>'` re-grades.
 *
 * Carries **only** the fields the two graders actually read (see the module doc), so the blob is the
 * minimal complete input to reproduce the ruling — plus the already-computed `verdict` when one is
 * passed, so the JSON is directly reviewable without re-grading. Cards become human `"Ah Tc"` strings
 * (board `""` preflop) and the action the shared `"bet 50"` grammar, so a person can read the whole
 * spot. Pretty-printed at 2-space indent for the same reason.
 *
 * Pure: no I/O. Round-trips through {@link parseSpot} back to a `(ctx, action)` that re-grades to the
 * identical verdict.
 */
export function serializeSpot(
  ctx: DecisionContext,
  action: Action,
  verdict?: DecisionVerdict | PreflopVerdict,
): string {
  const payload: SerializedSpot = {
    seat: ctx.seat,
    holeCards: ctx.holeCards.map(formatCard).join(' '),
    board: ctx.board.map(formatCard).join(' '),
    street: ctx.street,
    pot: ctx.pot,
    toCall: ctx.toCall,
    currentBet: ctx.currentBet,
    smallBlind: ctx.smallBlind,
    bigBlind: ctx.bigBlind,
    buttonIndex: ctx.buttonIndex,
    numPlayers: ctx.numPlayers,
    numActive: ctx.numActive,
    opponents: ctx.opponents.map((o) => ({
      seat: o.seat,
      committed: o.committed,
      totalCommitted: o.totalCommitted,
      stack: o.stack,
      status: o.status,
      isButton: o.isButton,
    })),
    action: formatActionToken(action),
    // Only carry the verdict when one was passed — `'none'`/`'error'` spots have nothing to review.
    ...(verdict !== undefined ? { verdict } : {}),
  }
  return JSON.stringify(payload, null, 2)
}

/** Narrow an unknown parsed value to an object with string-keyed fields, for field-by-field reads. */
function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`malformed spot: ${context} must be an object`)
  }
  return value as Record<string, unknown>
}

/** Read a required numeric field, throwing a clear {@link Error} if it is missing or not a number. */
function num(obj: Record<string, unknown>, key: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`malformed spot: "${key}" must be a number`)
  }
  return v
}

/** Read a required string field, throwing a clear {@link Error} if it is missing or not a string. */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key]
  if (typeof v !== 'string') throw new Error(`malformed spot: "${key}" must be a string`)
  return v
}

/**
 * Parse a serialised spot JSON back into a re-gradable {@link Spot} — the inverse of
 * {@link serializeSpot}, and the thing `pnpm sim --spot` feeds straight to a grader.
 *
 * Rebuilds a {@link DecisionContext} from the readable fields: card strings → branded ints via
 * {@link parseCards}, the opponents back to {@link OpponentView}s, and the action via
 * {@link parseActionToken}. The one field the graders never read — `legalActions` — is **stubbed**
 * with a minimal, never-consulted `{ fold: true, check: false, call: null, bet: null, raise: null }`
 * (carrying it would only bloat the blob with data no grader reads). The carried `verdict`, if any,
 * is intentionally dropped here: a `Spot` is a re-grade *input*, and re-grading recomputes the
 * verdict from scratch.
 *
 * Throws a clear {@link Error} on malformed input (not an object, a missing/typed-wrong field, a bad
 * card or action token), so a hand-edited or truncated blob fails loudly with a readable message
 * rather than silently grading the wrong spot.
 */
export function parseSpot(json: string): Spot {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`malformed spot: not valid JSON: ${reason}`, { cause: err })
  }
  const obj = asRecord(parsed, 'the spot')

  // Cards: rebuild the branded ints from the readable strings. A preflop board is `""` → no cards.
  const holeCards = parseCards(str(obj, 'holeCards'))
  if (holeCards.length !== 2) {
    throw new Error(
      `malformed spot: "holeCards" must be exactly two cards, got "${obj['holeCards']}"`,
    )
  }
  const board = parseCards(str(obj, 'board'))

  // Opponents: each a redacted view (no hole cards to decode). Validate the array shape, then map.
  const rawOpponents = obj['opponents']
  if (!Array.isArray(rawOpponents)) {
    throw new Error('malformed spot: "opponents" must be an array')
  }
  const opponents: OpponentView[] = rawOpponents.map((raw, i) => {
    const o = asRecord(raw, `opponents[${i}]`)
    return {
      seat: num(o, 'seat'),
      stack: num(o, 'stack'),
      committed: num(o, 'committed'),
      totalCommitted: num(o, 'totalCommitted'),
      status: str(o, 'status') as OpponentView['status'],
      isButton: o['isButton'] === true,
    }
  })

  const seat = num(obj, 'seat')
  const buttonIndex = num(obj, 'buttonIndex')
  const ctx: DecisionContext = {
    seat,
    holeCards: [holeCards[0]!, holeCards[1]!] as [Card, Card],
    board,
    street: str(obj, 'street') as DecisionContext['street'],
    // The graders never read legalActions; stub a minimal, never-consulted value (see the doc).
    legalActions: { fold: true, check: false, call: null, bet: null, raise: null },
    pot: num(obj, 'pot'),
    currentBet: num(obj, 'currentBet'),
    toCall: num(obj, 'toCall'),
    // The hero's own stack/committed are not read by either grader; rebuild faithful 0s rather than
    // bloat the blob — the graded result is identical either way.
    stack: 0,
    committed: 0,
    smallBlind: num(obj, 'smallBlind'),
    bigBlind: num(obj, 'bigBlind'),
    buttonIndex,
    isButton: seat === buttonIndex,
    numPlayers: num(obj, 'numPlayers'),
    numActive: num(obj, 'numActive'),
    opponents,
  }

  return { ctx, action: parseActionToken(str(obj, 'action')) }
}
