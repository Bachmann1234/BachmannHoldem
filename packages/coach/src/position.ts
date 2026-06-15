/**
 * The preflop **position model** — the coarse, teachable grouping of table seats the opening rule
 * keys off, extracted from `preflop.ts` (ticket 0058) so the chart/advice logic and the seat geometry
 * are separate concerns. It answers one question a learner asks at the table — *how many players act
 * after me when it is folded to me?* — and nothing else: pure seat arithmetic over a
 * {@link DecisionContext}, no range or fold reasoning (that stays in `preflop.ts`).
 *
 * This is a grading-time *advice* input only — it never changes the position-independent strength
 * tiers (`classifyStartingHand` / `PREFLOP_CHART`), which stay a valid strength map for the viewable
 * chart ([[0050-starting-hand-chart-view]]). Purity: zero I/O, no Node/DOM/network, no randomness;
 * imports only `@holdem/bots` (for the {@link DecisionContext} type).
 */

import type { DecisionContext } from '@holdem/bots'

/**
 * The hero's positional bucket — the coarse, teachable grouping of seats the opening rule keys off
 * (ticket 0054). Four buckets, strongest-stealing-leverage last-ish, mirroring how a learner is
 * taught to think about position rather than naming all nine seats:
 *
 * - `early` — UTG and the seat(s) just after the big blind. Many players still act behind you, so
 *   you open the *tightest* range and never open speculative junk.
 * - `middle` — the seats between early and the cutoff. A medium range opens here.
 * - `late` — the cutoff and the button (and the only non-blind seat heads-up). Few/no players act
 *   behind; the widest *open* range and the steal seats.
 * - `small-blind` — the small blind (and the heads-up button, which *is* the small blind). A steal
 *   seat: when it is folded to the SB only the BB is left, so it widens like late position. One of
 *   the {@link WIDENING_POSITIONS}.
 * - `big-blind` — the big blind: the worst seat, always last to act preflop and first to act on
 *   every later street, and it never *opens* an unraised pot (it checks its free option — the
 *   `check` short-circuit in `gradePreflop` handles that). Deliberately **not** a widening seat, so
 *   the BB gets no steal/late widening (the SB↔BB conflation fix). Kept distinct from `small-blind`
 *   precisely so the BB cannot inherit the SB's steal range.
 *
 * A grading-time *advice* input only — it never changes the position-independent strength tiers
 * (`classifyStartingHand` / `PREFLOP_CHART`), which stay a valid strength map for the viewable chart
 * ([[0050-starting-hand-chart-view]]).
 */
export type Position = 'early' | 'middle' | 'late' | 'small-blind' | 'big-blind'

/**
 * How many *early* (UTG-style) seats a full ring has, counting from the first seat to act (the seat
 * just left of the big blind) inward. A *tunable knob*: at this many seats or fewer after the
 * blinds, the hero is in {@link Position} `early` and opens the tightest range. Two models a 6-max
 * UTG + UTG+1 / a full-ring UTG cluster — small enough that the cutoff and button stay `late` at
 * every table size we deal. Everything between early and the cutoff is `middle`.
 */
export const EARLY_SEATS = 2

/**
 * Classify the hero's {@link Position} from pure seat geometry — the button index, seat count, and
 * the hero's seat. No range or fold reasoning here; this is the one positional input the opening
 * rule consults, derived the way a learner derives it: *how many seats act after me when it is
 * folded to me?*
 *
 * **The geometry.** Preflop the button acts last of the non-blind seats, then the blinds. We measure
 * each seat by its distance *back* from the button — `offset = (buttonIndex - seat) mod numPlayers`:
 * the button is offset `0`, the cutoff `1`, and so on, with the small blind the highest offset
 * (`numPlayers - 1`) and the big blind next (`numPlayers - 2`).
 *
 * - **Heads-up** (`numPlayers === 2`) is special: there are only two seats, the button (who is also
 *   the small blind) and the big blind. The button is {@link Position} `late` (in position, the steal
 *   seat); the big blind is `big-blind` (out of position, not a steal seat).
 * - The **small blind** is `small-blind` (a widening/steal seat); the **big blind** is `big-blind`
 *   (the worst seat, never a steal opener) — kept distinct so only the SB widens.
 * - The **button and cutoff** (offsets 0 and 1) are {@link Position} `late`.
 * - The **first {@link EARLY_SEATS}** non-blind seats to act (UTG, just left of the BB) are
 *   {@link Position} `early`.
 * - Everything else is {@link Position} `middle`.
 */
export function classifyPosition(ctx: DecisionContext): Position {
  const { seat, buttonIndex, numPlayers } = ctx
  const sb = (buttonIndex + 1) % numPlayers
  const bb = (buttonIndex + 2) % numPlayers

  // Heads-up: button(=SB) is in position/late, the other seat is the BB (out of position).
  if (numPlayers === 2) return seat === buttonIndex ? 'late' : 'big-blind'

  // The blinds are distinct buckets: the SB widens like a steal seat, the BB never does.
  if (seat === sb) return 'small-blind'
  if (seat === bb) return 'big-blind'

  // Distance back from the button: button = 0 (late), cutoff = 1 (late).
  const offset = (buttonIndex - seat + numPlayers) % numPlayers
  if (offset <= 1) return 'late'

  // The first EARLY_SEATS non-blind seats to act sit just left of the big blind. The seat just left
  // of the BB has the *largest* offset among non-blind seats (it acts first, farthest from the
  // button), so the early cluster is the top of the offset range below the blinds.
  const firstToActOffset = numPlayers - 3 // the seat left of the BB (UTG): offset = numPlayers-3
  if (offset >= firstToActOffset - (EARLY_SEATS - 1)) return 'early'

  return 'middle'
}

/**
 * The positional buckets that open a *wider* range than early/middle — the steal/late seats. The
 * cutoff and button ({@link Position} `late`, including the heads-up button) and the **small blind**
 * (`small-blind`, where a fold-around leaves only the BB to get through) open wide. The **big blind**
 * is deliberately excluded: it is the worst seat and never opens an unraised pot (it checks its free
 * option), so it gets no steal/late widening. Used by `adviceFor` to decide when the `marginal`
 * tier opens and the `STEAL_OPEN_RANGE` widening applies — a single named set so "does this seat get
 * to widen?" is one membership test.
 */
export const WIDENING_POSITIONS: ReadonlySet<Position> = new Set<Position>(['late', 'small-blind'])

/**
 * Is the hero acting *in position* — last to act on the later streets? True only in {@link Position}
 * `late` (the cutoff or button; heads-up only the button — see {@link classifyPosition}). The single
 * "do I have position?" predicate the facing-raise defend standard rests on (a thin flat of a
 * speculative hand needs position; out of position it is a cold-call leak). Named so the one
 * `position === 'late'` check lives in the position model rather than inline in the advice logic.
 */
export function isInPosition(position: Position): boolean {
  return position === 'late'
}
