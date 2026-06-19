/**
 * The felt centre (ticket 0034): the pot total, the community board, and the street tag — plus the
 * showdown / fold-win {@link ResultBanner} once the hand completes. The DOM analog of the TUI's
 * `Board` + `Result`, recreating the design's `.center`.
 *
 * Purely presentational: the pot comes from the engine's pure {@link potTotal}; the board cards are
 * the engine's `board`; the result reads `payouts` / `showdownHands` / `endReason`. The only engine
 * calls are the read-only `potTotal` / `isComplete` / `describeHand`.
 */

import {
  describeHand,
  handWinners,
  isComplete,
  potTotal,
  type HandState,
  type Pot,
} from '@holdem/engine'
import { Card } from './Card.js'
import { CENTER, type Orientation } from './layout.js'

/** Props for {@link Center}. */
export interface CenterProps {
  readonly hand: HandState
  /** Engine seat the hero occupies — drives the win/lose colour on the banner. */
  readonly heroSeat: number
  /** Display name for an engine seat (`You`, `Mia`) — names the winner on the result banner. */
  readonly seatLabel: (seat: number) => string
  /**
   * The pot/board anchor `[x%, y%]` for the active orientation (ticket 0097), handed down by the
   * layout owner via {@link Table}. Defaults to the portrait {@link CENTER} so existing callers and
   * tests render exactly as before.
   */
  readonly center?: readonly [number, number]
  /**
   * The felt orientation for the active arrangement (ticket 0097/0098). Selects the showdown-lift
   * band the completed block is tuned against — portrait stacks seats up a tall arc, landscape spreads
   * them along a short-wide arc, so the lift that keeps the downward banner off the seats differs.
   * Defaults to `'portrait'` so existing callers and tests render exactly as before.
   */
  readonly orientation?: Orientation
  /**
   * How many of `hand.board`'s cards to actually render — the all-in runout reveal (ticket 0093)
   * passes a sub-count to withhold not-yet-"seen" streets, stepping it up on timers in {@link App}.
   * Defaults to the full board so every non-runout caller renders exactly as before.
   */
  readonly revealBoardCount?: number
  /**
   * Whether to show the result banner. Withheld during the all-in runout (ticket 0093) so the result
   * doesn't spoil the board sweat, then flipped true at the end. Defaults to `isComplete(hand)` so
   * every non-runout caller renders exactly as before.
   */
  readonly showResult?: boolean
}

/** Human-readable street label, e.g. `preflop` → `Preflop`. */
function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1)
}

/**
 * Pod labels for a multi-pot tray (ticket 0090). The engine produces `hand.pots` main-first, so
 * index 0 is always the main pot. With a single side pot we call it "Side"; with several we
 * abbreviate to "S1", "S2", … so three pods still hold their width on a 320px felt. Purely
 * presentational — the amounts come straight from each `pot.amount`.
 */
function podLabel(index: number, potCount: number): string {
  if (index === 0) return 'Main'
  if (potCount === 2) return 'Side'
  return `S${index}`
}

/**
 * Base single-pot showdown lift (felt %) keyed by orientation × seat band — the magic deltas the
 * long {@link completeRise} doc-comment derives, lifted into one labelled table so the two arms
 * aren't duplicated control flow and the "portrait is byte-identical" invariant is visible at a
 * glance. Positive = LIFT, negative = DROP. Bands: `low` = ≤4-max (opponents in the upper arc, no
 * lower seats), `high5` = 5-max, `high6` = 6-max. PORTRAIT values are FROZEN at the pre-0098 numbers.
 */
const RISE_BASE = {
  portrait: { low: -6, high5: 6, high6: 4 },
  landscape: { low: -6, high5: 4, high6: 1 },
} as const

/** Extra MAGNITUDE a multi-pot attribution grid adds over the single-pot base (the grid is taller). */
const MULTI_POT_LIFT = 2

/**
 * How far (in felt %) to lift (+) or drop (−) the centre block when the result banner appears (see
 * {@link Center}), by seat count AND orientation. The banner stacks below the board, so the
 * vertically-centred pot+board+banner block must move to keep that downward growth off whichever
 * seats are nearby — and which seats are nearby, hence which way to move, differs by both seat count
 * (upper-arc vs lower-wing opponents) and orientation (a tall-narrow portrait felt vs a short-wide
 * landscape one). The caller does `top = cy - completeRise(...)`, so a POSITIVE return LIFTS the
 * block (board rides up, banner room opens below) and a NEGATIVE return DROPS it.
 *
 * KEPT after the 0096 uniform-scale refactor — and it stays in felt **percent**, not pixels, so it
 * is NOT a `%`-over-px hack like the old `WAGER_DROP_PX`. It encodes a genuine ARRANGEMENT fact:
 * uniform scale doesn't change which way to move the banner, only fixes the pre-0096 small-phone
 * caveat (the block was a constant pixel height on a felt that shrank, so on ~320px phones no lift
 * cleared it; it now scales WITH the felt, so its height is a constant FRACTION at every size and
 * these percentage lifts hold across the supported range).
 *
 * PORTRAIT (the `RISE_BASE.portrait` row) is FROZEN at its pre-0098 values so portrait is byte-identical:
 *  - ≤4-max: every opponent flanks or sits ABOVE the board (the 3/4-max upper arc at y≈22–31), so
 *    the block DROPS into the open felt down to the hero (y≈81); lifting it would drive the board up
 *    into those seats (the original showdown collision). −6, or −8 for the taller multi-pot grid.
 *  - 5/6-max: lower wings sit BELOW the board (y≈63–65), so the block LIFTS to clear the banner off
 *    them. 6-max wings sit lower AND its top seats higher, so it lifts a touch less (+4) than 5-max
 *    (+6) to avoid driving the board into the top row. Multi-pot adds +2 for the taller grid.
 *
 * LANDSCAPE (ticket 0098) — re-derived against the wide-arc {@link LANDSCAPE_SEAT_LAYOUTS} (board at
 * y=46; ≤4-max opponents in the upper arc y≈12–26, no lower seats; 5/6-max upper sides at y≈18–20
 * plus a 6-max top-centre at y=13, and LOWER WINGS at y=61; hero at y=86). Reference felt height
 * 430px, so 1 design-`--u` ≈ 0.23 felt-%; the pot+board+single-banner block is ≈ 35% of that felt,
 * half-extent ≈ ±17.7% from `top`, with the board centred on `top`.
 *  - ≤4-max: like portrait, DROP into the open lower felt — opponents are all in the upper arc and
 *    there are no lower seats, so the downward banner lands in the felt between the board and the
 *    hero. −6/−8 clears it: at −6, top=52 → board ≈ 52 (far below the y≈12–13 top seats) and the
 *    banner bottom ≈ 70 (clear of the hero at 86); −8 gives the taller multi-pot grid the same margin.
 *  - 5/6-max: only a GENTLE lift. Crucially, the NARROW single-pot banner (x≈38–62) clears the
 *    far-edge wings (x≤7/≥93, growing inward only to ~x30/70) HORIZONTALLY at any y — so the wings do
 *    NOT bind it, and the block must not be over-lifted. The binding constraint is the TOP: 6-max
 *    seats a top-centre opponent at (x=50, y=13) directly above the board, so a hard lift drove the
 *    pot label INTO its pill (~felt 23%) — the bug visual-verification caught. So 6-max lifts only +1
 *    (top=45, pot label clears the top seat), while 5-max — whose top is open (uppers at x=22/78) —
 *    rides a touch higher at +4 (top=42). Multi-pot lifts +2 more, AND the wide attribution grid is
 *    both line-capped (see {@link maxPotLines}) and narrowed in landscape (styles.css
 *    `.felt[data-orientation='landscape'] .result-banner--pots` → 60%) so the WIDE grid — which,
 *    unlike the narrow single banner, would otherwise reach the wings — stays in the central band.
 *
 * Pot-aware (ticket 0091): a multi-pot showdown renders the taller per-pot attribution grid, so it
 * needs a touch *more* lift/drop. `potCount` defaults to 1 so the single-pot (and live, pre-showdown)
 * path returns the base value unchanged.
 */
function completeRise(seatCount: number, orientation: Orientation, potCount = 1): number {
  const band = seatCount < 5 ? 'low' : seatCount >= 6 ? 'high6' : 'high5'
  const base = RISE_BASE[orientation][band]
  // A multi-pot showdown renders the taller attribution grid, so push it the SAME direction (away
  // from the nearby seats) a touch more — i.e. increase the magnitude, not the signed value:
  // `Math.sign(base) * MULTI_POT_LIFT` adds for a lift (+base) and subtracts for a drop (−base).
  return potCount > 1 ? base + Math.sign(base) * MULTI_POT_LIFT : base
}

/** Render the pot, board (or a pre-flop street tag), and the result banner once complete. */
export function Center({
  hand,
  heroSeat,
  seatLabel,
  center = CENTER,
  orientation = 'portrait',
  revealBoardCount = hand.board.length,
  showResult = isComplete(hand),
}: CenterProps): React.JSX.Element {
  const complete = isComplete(hand)
  const [cx, cy] = center
  // The all-in runout (ticket 0093) reveals the board street by street: render only the cards the
  // player has "seen" so far. Non-runout callers omit `revealBoardCount`, so this is the full board.
  const shownBoard = hand.board.slice(0, revealBoardCount)
  // On a completed hand the result banner stacks *below* the board; since the whole block is
  // vertically centred, that would push it down toward the bottom seats while leaving a gap up top.
  // Lift the block so the pot/board ride higher and the banner has room below — balanced either way.
  const top = complete ? cy - completeRise(hand.players.length, orientation, hand.pots.length) : cy
  return (
    <div className="center" style={{ left: `${cx}%`, top: `${top}%` }}>
      {hand.pots.length > 1 ? (
        // Multi-pot all-in (ticket 0090): one labelled pod per pot so a short stack can see which
        // pot they're actually contesting. A horizontal tray (not stacked rows) keeps the block
        // height-flat during play — see the `completeRise` note about narrow phones. Amounts read
        // straight from `hand.pots`; they sum to `potTotal(hand)`.
        <div className="pot-tray" data-testid="pot-tray">
          {hand.pots.map((pot, i) => (
            <div
              key={i}
              className={`pot-pod${i === 0 ? '' : ' side'}`}
              data-testid={`pot-pod-${i}`}
            >
              <div className="pot-label">{podLabel(i, hand.pots.length)}</div>
              <div className="pot-amt">
                <span className="disc" />
                {pot.amount}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pot">
          <div className="pot-label">Pot</div>
          <div className="pot-amt" data-testid="pot">
            <span className="disc" />
            {/* On a completed hand the pot is what was actually contested — read it from `hand.pots`
                (the same source as the result banner) so a returned uncalled bet is excluded. During
                play `pots` is empty, so fall back to `potTotal` (which correctly counts live bets). */}
            {complete ? hand.pots.reduce((sum, pot) => sum + pot.amount, 0) : potTotal(hand)}
          </div>
        </div>
      )}
      <div className="board" data-testid="board">
        {shownBoard.length === 0 ? (
          <div className="street-tag">
            {complete ? '' : `${streetLabel(hand.street)} · ${hand.smallBlind}/${hand.bigBlind}`}
          </div>
        ) : (
          shownBoard.map((card) => <Card key={card} card={card} size="md" />)
        )}
      </div>
      {showResult && (
        <ResultBanner
          hand={hand}
          heroSeat={heroSeat}
          seatLabel={seatLabel}
          orientation={orientation}
        />
      )}
    </div>
  )
}

/** Props for {@link ResultBanner}: a completed hand, the hero seat, and the seat-name lookup. */
export interface ResultBannerProps {
  readonly hand: HandState
  readonly heroSeat: number
  /** Display name for an engine seat — names a non-hero winner (`Mia wins`). */
  readonly seatLabel: (seat: number) => string
  /**
   * The felt orientation (ticket 0098) — selects the attribution-grid line cap. The short-wide
   * landscape felt has far less vertical room below the board (the lower wings sit at y≈61), so its
   * grid collapses to fewer rows than portrait before the `+N more` tail. Defaults to `'portrait'`.
   */
  readonly orientation?: Orientation
}

/**
 * Tag label (col 1) for a per-pot attribution line (ticket 0091): `MAIN`, then `SIDE` for a lone
 * side pot or `SIDE 1` / `SIDE 2` … when several layer. The uppercase showdown sibling of
 * {@link podLabel}'s live tray tag — mono caps so the grid's first column holds a fixed width.
 */
function potTag(index: number, potCount: number): string {
  if (index === 0) return 'MAIN'
  if (potCount === 2) return 'SIDE'
  return `SIDE ${index}`
}

/**
 * Most `.pot-line` rows the attribution banner renders before collapsing the tail (ticket 0094),
 * by orientation (ticket 0098). PORTRAIT keeps the original 4: a tall felt has room for main + 3
 * sides below the board before the grid would reach the hero. LANDSCAPE caps at 2 (main + 1 side):
 * the short-wide felt's lower wings sit at y≈61, so the showdown lift can only open ≈1–2 attribution
 * rows' worth of headroom above them before the board itself would collide the upper seats — past
 * that the grid must collapse into the `+N more` tail. The main pot and every hero-won pot are still
 * force-shown (see {@link visiblePotIndices}), so the cap only bounds the *non-essential* rows.
 */
function maxPotLines(orientation: Orientation): number {
  return orientation === 'landscape' ? 2 : 4
}

/**
 * Which pot indices the attribution banner shows when there are many pots (ticket 0094). A
 * maximally-laddered all-in (main + up to 4 side pots at 6-max) would otherwise grow the banner
 * downward into the hero seat (or — in landscape — the lower wings), so past the orientation's
 * {@link maxPotLines} cap we show only some rows and collapse the rest into a `+N more` tail. The
 * main pot (0) and **every pot the hero won** are never collapsed — the hero must always see what
 * they took; the remaining slots fill with the earliest pots, and the result stays in engine
 * (main-first) order. Returns all indices when at or under the cap.
 */
function visiblePotIndices(pots: readonly Pot[], heroSeat: number, cap: number): number[] {
  if (pots.length <= cap) return pots.map((_, i) => i)
  const shown = new Set<number>([0])
  pots.forEach((pot, i) => {
    if (pot.winningSeats.includes(heroSeat)) shown.add(i)
  })
  for (let i = 0; i < pots.length && shown.size < cap; i++) shown.add(i)
  return [...shown].sort((a, b) => a - b)
}

/**
 * The showdown / fold-win banner for a completed hand: who won, for how much, and (at a showdown)
 * the winning hand description.
 *
 * A SINGLE-pot hand keeps the original two-line who/what layout. A MULTI-pot all-in renders a
 * compact per-pot attribution grid (ticket 0091): one `.pot-line` per pot — tag · winner+hand ·
 * amount — reading `pot.winningSeats` (the *truth* of who won each pot, not `payouts > 0` and not
 * the top-level `handWinners`, so a returned uncalled bet never reads as a win — BUG-0002) and
 * `pot.amount`. No game logic.
 */
export function ResultBanner({
  hand,
  heroSeat,
  seatLabel,
  orientation = 'portrait',
}: ResultBannerProps): React.JSX.Element | null {
  if (!isComplete(hand)) return null

  // Multi-pot showdown: attribute each pot to its own winner(s). Multi-pot only arises at an all-in
  // showdown, so `showdownHands[winnerSeat]` is present — we still guard the description defensively.
  if (hand.pots.length > 1) {
    // The hero's win/lose colour reflects winning ANY pot — scooping isn't required to read as a win.
    // Carried on the banner as a `win`/`lose` modifier (mirroring the single-pot `.who`); each
    // `.pot-line` then independently colours only the pots the hero actually took.
    const heroWon = hand.pots.some((pot) => pot.winningSeats.includes(heroSeat))
    // Cap the rows so a deeply-laddered all-in can't grow the banner into the hero seat — or, in
    // landscape, the lower wings (ticket 0094/0098): show at most `maxPotLines(orientation)` pots + a
    // single `+N more` tail; main + every hero-won pot stay.
    const shownIndices = visiblePotIndices(hand.pots, heroSeat, maxPotLines(orientation))
    const hiddenCount = hand.pots.length - shownIndices.length
    return (
      <div
        className={`result-banner result-banner--pots ${heroWon ? 'win' : 'lose'}`}
        data-testid="result-banner"
      >
        {shownIndices.map((i) => {
          const pot = hand.pots[i]!
          const heroWonPot = pot.winningSeats.includes(heroSeat)
          const names = pot.winningSeats
            .map((s) => (s === heroSeat ? 'You' : seatLabel(s)))
            .join(' + ')
          // The winning hand description: for a split it's the shared board/hand, so the first
          // winner's value reads for all. Guarded in case a pot somehow lacks a showdown value.
          const hv =
            pot.winningSeats[0] !== undefined ? hand.showdownHands[pot.winningSeats[0]] : undefined
          return (
            <div
              key={i}
              className={`pot-line${heroWonPot ? ' win' : ''}`}
              data-testid={`pot-line-${i}`}
            >
              <span className="pot-line-tag">{potTag(i, hand.pots.length)}</span>
              <span className="pot-line-who">
                <strong>{names}</strong>
                {hv ? <span className="pot-line-hand"> {describeHand(hv)}</span> : null}
              </span>
              <span className="pot-line-amt">{pot.amount}</span>
            </div>
          )
        })}
        {hiddenCount > 0 ? (
          <div className="pot-line pot-line--more" data-testid="pot-line-more">
            +{hiddenCount} more
          </div>
        ) : null}
      </div>
    )
  }

  // Single pot: the winner(s) the engine actually awarded the pot to. Reading `handWinners`
  // (not `payouts > 0`) keeps a returned uncalled bet from counting as a win (BUG-0002).
  const winners = handWinners(hand)
  const top = winners[0]
  if (top === undefined) return null

  const heroWon = winners.includes(heroSeat)
  const split = winners.length > 1
  const amount = hand.pots.reduce((sum, pot) => sum + pot.amount, 0)

  let who: string
  if (split) who = 'Split pot'
  else if (top === heroSeat) who = 'You win'
  else who = `${seatLabel(top)} wins`

  let what: string
  if (hand.endReason === 'fold') {
    what = `Everyone else folded · ${amount}`
  } else {
    const hv = hand.showdownHands[top]
    what = `${hv ? describeHand(hv) : ''} · ${amount}`
  }

  return (
    <div className="result-banner" data-testid="result-banner">
      <div className={`who ${heroWon ? 'win' : 'lose'}`}>{who}</div>
      <div className="what">{what}</div>
    </div>
  )
}
