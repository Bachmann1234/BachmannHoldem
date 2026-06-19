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
import { CENTER } from './layout.js'

/** Props for {@link Center}. */
export interface CenterProps {
  readonly hand: HandState
  /** Engine seat the hero occupies — drives the win/lose colour on the banner. */
  readonly heroSeat: number
  /** Display name for an engine seat (`You`, `Mia`) — names the winner on the result banner. */
  readonly seatLabel: (seat: number) => string
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
 * How far (in felt %) to lift the centre block when the result banner appears (see {@link Center}),
 * by seat count. The banner stacks below the board, so lifting keeps it off the *bottom* seats — the
 * 5/6-max lower wings (y≈63–65), whose cards the un-lifted banner clips on a narrow phone. A 6-max
 * table seats those wings slightly lower AND its top seats slightly higher (tighter head-room), so
 * it lifts a touch less than a 5-max to avoid driving the board up into the top row. Counts with no
 * bottom seats (≤ 4: opponents flank or sit above the board) just get the 5-max value cosmetically.
 *
 * Note: on the shortest phones (~320×680) the pot+board+banner block is tall enough that no lift
 * fully clears the wings without crowding the top seats; these values clear the common small sizes
 * (≥360-wide) and reduce — not eliminate — the overlap at 320. A fuller fix needs a more compact
 * showdown banner.
 *
 * Pot-aware (ticket 0091): a multi-pot showdown renders the taller per-pot attribution grid, so it
 * needs a touch *more* lift to keep that taller banner clear of the bottom wings. `potCount` defaults
 * to 1 so the single-pot (and live, pre-showdown) path returns TODAY'S EXACT value unchanged — only a
 * `potCount > 1` showdown adds the extra +2.
 */
function completeRise(seatCount: number, potCount = 1): number {
  // ≤4-max has NO bottom seats — every opponent flanks or sits ABOVE the board (the 3/4-max upper
  // arc at y≈22–31). Adding the banner below the board already rides the vertically-centred block
  // *up* toward those seats; lifting it further drove the board into them (the showdown collision).
  // So drop the block instead: there's open felt all the way down to the hero (y≈81), and the
  // downward-growing banner lands in it. A multi-pot banner is taller, so drop a touch more.
  if (seatCount < 5) return potCount > 1 ? -8 : -6
  const base = seatCount >= 6 ? 4 : 6
  return potCount > 1 ? base + 2 : base
}

/** Render the pot, board (or a pre-flop street tag), and the result banner once complete. */
export function Center({
  hand,
  heroSeat,
  seatLabel,
  revealBoardCount = hand.board.length,
  showResult = isComplete(hand),
}: CenterProps): React.JSX.Element {
  const complete = isComplete(hand)
  const [cx, cy] = CENTER
  // The all-in runout (ticket 0093) reveals the board street by street: render only the cards the
  // player has "seen" so far. Non-runout callers omit `revealBoardCount`, so this is the full board.
  const shownBoard = hand.board.slice(0, revealBoardCount)
  // On a completed hand the result banner stacks *below* the board; since the whole block is
  // vertically centred, that would push it down toward the bottom seats while leaving a gap up top.
  // Lift the block so the pot/board ride higher and the banner has room below — balanced either way.
  const top = complete ? cy - completeRise(hand.players.length, hand.pots.length) : cy
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
            {potTotal(hand)}
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
      {showResult && <ResultBanner hand={hand} heroSeat={heroSeat} seatLabel={seatLabel} />}
    </div>
  )
}

/** Props for {@link ResultBanner}: a completed hand, the hero seat, and the seat-name lookup. */
export interface ResultBannerProps {
  readonly hand: HandState
  readonly heroSeat: number
  /** Display name for an engine seat — names a non-hero winner (`Mia wins`). */
  readonly seatLabel: (seat: number) => string
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

/** Most `.pot-line` rows the attribution banner renders before collapsing the tail (ticket 0094). */
const MAX_POT_LINES = 4

/**
 * Which pot indices the attribution banner shows when there are many pots (ticket 0094). A
 * maximally-laddered all-in (main + up to 4 side pots at 6-max) would otherwise grow the banner
 * downward into the hero seat, so past {@link MAX_POT_LINES} we show only some rows and collapse the
 * rest into a `+N more` tail. The main pot (0) and **every pot the hero won** are never collapsed —
 * the hero must always see what they took; the remaining slots fill with the earliest pots, and the
 * result stays in engine (main-first) order. Returns all indices when at or under the cap.
 */
function visiblePotIndices(pots: readonly Pot[], heroSeat: number): number[] {
  if (pots.length <= MAX_POT_LINES) return pots.map((_, i) => i)
  const shown = new Set<number>([0])
  pots.forEach((pot, i) => {
    if (pot.winningSeats.includes(heroSeat)) shown.add(i)
  })
  for (let i = 0; i < pots.length && shown.size < MAX_POT_LINES; i++) shown.add(i)
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
}: ResultBannerProps): React.JSX.Element | null {
  if (!isComplete(hand)) return null

  // Multi-pot showdown: attribute each pot to its own winner(s). Multi-pot only arises at an all-in
  // showdown, so `showdownHands[winnerSeat]` is present — we still guard the description defensively.
  if (hand.pots.length > 1) {
    // The hero's win/lose colour reflects winning ANY pot — scooping isn't required to read as a win.
    // Carried on the banner as a `win`/`lose` modifier (mirroring the single-pot `.who`); each
    // `.pot-line` then independently colours only the pots the hero actually took.
    const heroWon = hand.pots.some((pot) => pot.winningSeats.includes(heroSeat))
    // Cap the rows so a deeply-laddered all-in can't grow the banner into the hero seat (ticket 0094):
    // show at most MAX_POT_LINES pots + a single `+N more` tail; main + every hero-won pot stay.
    const shownIndices = visiblePotIndices(hand.pots, heroSeat)
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
