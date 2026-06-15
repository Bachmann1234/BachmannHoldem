/**
 * The preflop **rationale builders** — the plain-language wording the coach attaches to a graded
 * preflop decision, extracted from `preflop.ts` (ticket 0058) so the *strings a learner reads* are a
 * separate concern from the *advice logic that decides them*. Pure string rendering off facts the
 * grade already computed (tier, position, the open/fold call, the raise size) — no poker math, no
 * I/O, no randomness.
 *
 * The cardinal rule these enforce (ticket 0056): **a rationale always follows the advice actually
 * given and asserts no false universal.** {@link TIER_RATIONALE} is a pure *strength* descriptor that
 * makes no open/fold claim; {@link openFoldRationale} turns the position-relative *advice* into a line
 * that can never contradict the verdict above it.
 *
 * Imports are type-only from `preflop.ts` ({@link PreflopTier} / {@link PreflopAdvice}) and
 * `position.ts` ({@link Position}) — erased at compile, so there is no runtime import cycle even
 * though `preflop.ts` imports these builders back as values.
 */

import type { Position } from './position.js'
import type { PreflopAdvice, PreflopTier } from './preflop.js'

/**
 * One short, human-readable line per tier describing **how strong the holding is** — the
 * *strength classification*, so the verdict teaches a principle a learner can carry to the next
 * hand (per [LEARNING-APPROACH.md]). Returned verbatim as the `StartingHandVerdict.rationale`
 * (the strength read), and used as the *open*-path label by the position-aware `gradePreflop`
 * (via {@link openFoldRationale}).
 *
 * **No false universals (ticket 0056).** These describe *strength*, not absolute advice the
 * position/action-aware grader can contradict. In particular `trash` does **not** say "it makes no
 * money over time" — a hand like K7o is `trash` on this single strength map yet a profitable button /
 * blind / heads-up *steal* (the `STEAL_OPEN_RANGE` promotion, 0054), so "never makes money" would be
 * a confidently-wrong absolute. It is described as the long unconnected/unsuited tail instead. The
 * premium/strong open lines are honest at every position (those tiers open everywhere), so they keep
 * their open phrasing; the position/seat-relative advice that *can* contradict the tier label
 * (marginal opens vs. early folds, trash steals vs. early folds, facing-raise defends) is produced at
 * grade time by {@link openFoldRationale} / `facingRaiseAdvice`, never asserted as a universal here.
 */
export const TIER_RATIONALE: Readonly<Record<PreflopTier, string>> = {
  premium: 'Premium holding — always raise; you want chips in.',
  strong: 'Strong value hand — open and bet for value.',
  playable: 'Playable speculative hand — flops well and plays nicely in position.',
  marginal: 'Marginal hand — the thin edge of the chart: offsuit broadways and suited gappers.',
  trash: 'Trash — the long tail of unconnected, unsuited hands.',
}

/**
 * A self-consistent open/fold rationale for the **unraised** path, built from the position-aware
 * `advice` actually given so the line **always follows the verdict and asserts no false universal**
 * (ticket 0056 completes the pass 0054 began). The {@link TIER_RATIONALE} constant is now a pure
 * *strength* descriptor — it deliberately makes no absolute open/fold claim — so this function is the
 * single place the position-relative *advice* wording is produced, covering **every**
 * `(tier, position, advice)` combination:
 *
 * - **Opens.** `premium`/`strong` open from every seat, so their strength label already reads as an
 *   open and stands. `playable`/`marginal` open only from a non-early / widening seat, so the open
 *   path names that — "open it from here" — rather than the bare strength label (the `marginal` strength
 *   line carries no advice, and its old static label asserted the false "fold to pressure" absolute
 *   0056 flags). A `trash` hand only opens via the `STEAL_OPEN_RANGE` promotion (a genuine steal:
 *   folded to the hero on the button / small blind / HU button), so it gets the steal line — never the
 *   old "fold; it makes no money over time" absolute.
 * - **Folds.** A tier that folds gets a *position-relative* fold line that never claims the hand never
 *   makes money: `playable` is "too loose to open from early position", `marginal` opens only later,
 *   and — the 0056 fix — a `trash` fold is split by `canStealLater` (whether the hand is in the
 *   `STEAL_OPEN_RANGE`): a steal-range hand (e.g. K7o) folding here is "a steal when folded to
 *   you in a late/blind seat — just not this spot"; the never-open tail (72o, 32o…) is simply "the
 *   unconnected bottom of the chart; fold it". Neither claims "it makes no money over time", and —
 *   the symmetric trap — neither claims the never-open tail "opens later".
 *
 * The result: no emitted line contradicts the verdict, and none asserts a universal the
 * position-aware grader would itself break — in *either* direction (a `trash` steal it would open, a
 * `marginal` hand it would open late, or a junk hand it would open *nowhere*).
 *
 * `canStealLater` is whether the holding is a `STEAL_OPEN_RANGE` hand (so a `trash` *fold* can
 * honestly say it opens as a steal elsewhere); it only affects the trash-fold wording.
 */
export function openFoldRationale(
  tier: PreflopTier,
  position: Position,
  advice: PreflopAdvice,
  canStealLater: boolean,
): string {
  if (advice === 'open') {
    // A trash open is always the steal-range promotion (the only way trash opens an unraised pot).
    if (tier === 'trash') {
      return 'A wide steal spot — folded to you in late position / the small blind / the heads-up button; open this profitably and take it down.'
    }
    // Marginal/playable open only from non-early/widening seats — phrase it as the open it is, with no
    // "fold to pressure" absolute (their strength labels carry no advice).
    if (tier === 'marginal') {
      return 'Marginal hand — open it from late position / the small blind to pick up the blinds.'
    }
    if (tier === 'playable') {
      return 'Playable speculative hand — open it from here and play it with a plan.'
    }
    // premium/strong: the strength label already reads as an open from every seat.
    return TIER_RATIONALE[tier]
  }
  // Fold paths: a position-relative fold line that never asserts the hand never makes money.
  if (tier === 'playable' && position === 'early') {
    return 'Playable speculative hand — too loose to open from early position; fold and wait for a later seat.'
  }
  if (tier === 'marginal') {
    return 'Marginal hand — open only in late position / the small blind; fold from earlier seats.'
  }
  if (tier === 'trash') {
    // 0056: never assert a universal — in EITHER direction. A steal-range trash hand (e.g. K7o)
    // genuinely opens when it is folded to the hero in a late/blind seat, so when one of those is
    // folding here, say so. But the never-open tail (72o, 32o…) opens NOWHERE, so claiming it "opens
    // later" would be the same false absolute inverted (and there is no "later seat" than the button);
    // it just folds. `canStealLater` distinguishes the two.
    return canStealLater
      ? 'Trash on the strength chart, but a profitable steal when it is folded to you in a late or blind seat — just not this spot.'
      : 'Trash — the unconnected bottom of the chart; fold it.'
  }
  // Any other fold (none in normal flow) falls back to the tier's strength label.
  return TIER_RATIONALE[tier]
}

/**
 * Format a raise size in big blinds as a short `"a 6x raise"` label for the rationale strings. Takes
 * the already-rounded whole-multiple `raiseBb` `gradePreflop` computes — the price gates and this
 * label share that single rounded integer, so the size a learner reads can never contradict the
 * regime the hand was graded in (e.g. a 4.6x raise reads "5x" *and* is graded in the large band, not
 * the small one). Pure string formatting.
 */
export function formatRaiseSize(raiseBb: number): string {
  return `a ${raiseBb}x raise`
}
