/**
 * The **Foundations primer** — the lessons that teach the six concepts the coach assumes (tickets
 * 0042 / 0045 / 0071).
 *
 * This module is *content*, not engine: it is the declarative layer of the learning approach
 * ([../../../docs/LEARNING-APPROACH.md]). The coach narrates a live spot in terms of six mental
 * models — equity, pot odds, the continue rule (equity-vs-price), EV, position, and ranges — and
 * *assumes the player already holds them*. The primer is where the player gets them, taught the way
 * the evidence says they stick: **by retrieval, not by re-reading** (DeDonno 2008). So every lesson
 * is a ~30-second plain-language teach followed by a {@link Spot} the player must *answer* — the
 * retrieval check is the lesson; the prose is just the setup.
 *
 * **Scope discipline (the epic's rule): a primer, not a course.** Still **six concepts** — but seven
 * lessons, because the v2 facing-a-raise lesson (ticket 0071) reuses the `ranges` concept rather than
 * extending the union. Each lesson earns its ~30 seconds; we add a lesson only when a concept has a
 * second, distinct must-teach angle (open-or-fold vs. facing-a-raise), never to pad. Depth lives in
 * the feedback loop — the live coach, the M5 drills, M6 — not in more reading here. We resisted
 * padding this into a textbook.
 *
 * **Coach-true by construction (the cardinal rule).** Wherever the deterministic coach *can* rule, a
 * lesson's spot is graded by the coach, never by a hand-authored answer key — so a future coach
 * retune can never silently desync the primer from the table. The continue-decision concepts
 * (equity, pot odds, equity-vs-price, EV) are {@link CoachSpot}s graded by `coachDecision`; the
 * range/position concepts are {@link PreflopSpot}s graded by `gradePreflop`'s chart. There is **no**
 * {@link DeclarativeSpot} carve-out in this primer: every concept the ticket needs maps onto a coach
 * or chart ruling, including position (see the position lesson note). The coach's equity is a seeded
 * Monte-Carlo read against `COACH_ASSUMED_RANGE`, so each spot's cards/price were *tuned* until the
 * coach returns the verdict the lesson teaches, and `foundations.test.ts` *proves* that verdict for
 * every spot — the test is the guard against desync.
 *
 * **A note on the `concept` tags.** A live continue-verdict rolls pot-odds and EV into the single
 * `'equity-vs-price'` tag (and a free check into `'equity'`) — that is the coach's mapping and we do
 * not fight it. The thing that names *what a lesson teaches* is the {@link Lesson.concept} field,
 * authored here; the underlying coach verdict on each spot may carry a broader tag, which is fine and
 * expected (the test asserts both: the lesson's declared concept, and the spot's coach verdict tag).
 *
 * Purity: pure data + plain strings, no UI/DOM/Node/network, no JSX. Imports only `@holdem/*` and
 * relative. The lesson copy is plain markdown-ish text so it stays framework-agnostic for both shells.
 */

import { parseCards, type Card } from '@holdem/engine'
import type { Lesson } from './lesson.js'
import type { CoachSpot, PreflopSpot } from './spot.js'

/**
 * Tiny authoring helper: parse a two-card string (`"As Ah"`) into the `[Card, Card]` tuple the spot
 * shapes take. Keeps each spot's `holeCards` readable as a poker hand rather than a pair of branded
 * ints, and reuses the real engine parser so a typo'd card fails loudly at import.
 */
function hole(text: string): readonly [Card, Card] {
  const cards = parseCards(text)
  if (cards.length !== 2) {
    throw new RangeError(`foundations hole() needs exactly 2 cards, got "${text}"`)
  }
  return [cards[0]!, cards[1]!]
}

/** The two answer buttons every continue-decision spot offers, in a fixed order: continue, then fold. */
const CALL = { label: 'Call', action: { type: 'call' } } as const
const CHECK = { label: 'Check', action: { type: 'check' } } as const
const FOLD = { label: 'Fold', action: { type: 'fold' } } as const
const OPEN = { label: 'Open (raise)', action: { type: 'raise', amount: 6 } } as const
/**
 * A 3-bet (re-raise) answer button for the facing-a-raise lesson. NB to the grader a 3-bet and a Call
 * are *both* non-fold "continue" actions, so `gradePreflop` rules them identically — the coach cannot
 * distinguish call from 3-bet (see the facing-a-raise lesson note). It is offered as a teaching choice
 * (and explained in the copy), but the *graded* point stays continue-vs-fold.
 *
 * The `amount` is grading-inert: `gradePreflop` reads only `action.type` (`'raise'` here = a non-fold
 * continue), never the size, so the figure is not anchored to any number in the copy and any raise
 * amount would grade identically. It is kept as a plausible 3-bet sizing purely for shape.
 */
const THREE_BET = { label: '3-bet (re-raise)', action: { type: 'raise', amount: 24 } } as const

// ---------------------------------------------------------------------------------------------------
// 1. equity — your share of the pot.
// ---------------------------------------------------------------------------------------------------
//
// Taught with a FREE CHECK CoachSpot: with no price to pay, the only question is "how good is my
// hand?" — which is exactly equity in isolation. The coach tags a free check (`toCall === 0`) as the
// `'equity'` concept, so this spot grades to the very idea the lesson names. The hero holds a flush
// draw plus two overcards on a flop — a big-equity holding (~59% vs a medium range) — and checking it
// back for free is plainly correct (folding a free card would be the leak). Proven in the test.

/** equity spot: a strong draw checked for free — the `'equity'` concept, check is correct. */
const EQUITY_SPOT: CoachSpot = {
  kind: 'coach',
  prompt:
    'You hold A♥K♥ on Q♥7♥2♣, a flush draw plus two overcards. It checks to you and continuing ' +
    'is FREE (nothing to call). Check or fold?',
  choices: [CHECK, FOLD],
  context: {
    holeCards: hole('Ah Kh'),
    board: parseCards('Qh 7h 2c'),
    pot: 100,
    toCall: 0,
    numActive: 2,
  },
}

const EQUITY_LESSON: Lesson = {
  id: 'foundations-equity',
  title: 'Equity: your share of the pot',
  concept: 'equity',
  explanation:
    'Equity is your share of the pot right now: the fraction of the time your hand wins if every ' +
    'card came out with no more betting. A coin-flip is 50% equity; a monster is 90%+; total air is ' +
    'near 0%. You estimate it, you do not calculate it: count your outs (cards that make your hand) ' +
    'and use the rule of 2 and 4. Times 2 for your rough chance to hit on the next card, times 4 ' +
    'with two cards still to come. Nine flush-draw outs is about 18% by the turn, 36% by the river. ' +
    'You work it out slowly now so you can recognize it instantly at the table. It says nothing about ' +
    'price yet, just how good your hand is. When continuing is free, equity is the whole story: any ' +
    'equity beats folding, so you always take the free card.',
  spots: [EQUITY_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 2. pot odds — the break-even price a call needs.
// ---------------------------------------------------------------------------------------------------
//
// CoachSpot where the PRICE is the lesson. The hero has a marginal holding (QJ on an A-K-5 board)
// and faces a steep price: 75 to call into a 100 pot, so the call must win ~43% to break even. That
// 75-into-25 bet is a ~3x-pot overbet, which the line-aware coach (ticket 0052) reads against the
// tightest 'ultraTight' value range — QJ is only ~17% there (down from the old static-'medium' ~26%
// read). Either way equity is well short of the price (43%), so the coach rules the call a leak and
// folding correct — a clean demonstration that the price, not the cards alone, decides. Proven in
// the test (eq < threshold, fold correct, call leak).

/** pot-odds spot: a marginal hand at too steep a price — fold is correct, call is the leak. */
const POT_ODDS_SPOT: CoachSpot = {
  kind: 'coach',
  prompt:
    'You hold Q♠J♦ on A♣K♦5♥. Your opponent bets, bringing the pot to 100, and you must call 75, ' +
    'a price of 75 / (100 + 75) ≈ 43% to break even. Your gutshot and two overcards are worth more ' +
    'in a vacuum, but a bet this big (a ~3x-pot overbet) usually means a strong, narrow range — and ' +
    'against that tight a range the coach reads your hand at only ~17%. Call or fold?',
  choices: [CALL, FOLD],
  context: {
    holeCards: hole('Qs Jd'),
    board: parseCards('Ac Kd 5h'),
    pot: 100,
    toCall: 75,
    numActive: 2,
  },
}

const POT_ODDS_LESSON: Lesson = {
  id: 'foundations-pot-odds',
  title: 'Pot odds: the price of a call',
  concept: 'pot-odds',
  explanation:
    'Pot odds turn the bet into a price: the equity a call needs just to break even. The rule is ' +
    'simple. Divide what you must call by the total pot after you call. Face a half-pot bet, call 50 ' +
    'into a pot that becomes 200, and your price is 50 / 200 = 25%; face a full-pot bet, call 100 ' +
    'into a pot that becomes 300, and your price is 100 / 300 ≈ 33%. You will not divide for long: ' +
    'bet sizes cluster, so memorize the pegs. A third-pot bet is about 20%, a half-pot about 25%, a ' +
    'full-pot about 33%. Recognize the size and the price comes for free. The bigger the bet relative ' +
    'to the pot, the higher the price, and the more equity you need to continue.',
  spots: [POT_ODDS_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 3. equity-vs-price — the continue rule (call when equity beats the price).
// ---------------------------------------------------------------------------------------------------
//
// The headline CoachSpot: put the two ideas together. Top set (AA on an A-K-7 flop, ~96% equity) at a
// cheap price (10 into a 100 pot, ~9% break-even). Equity crushes the price, so the coach blesses the
// call and folding is the leak. This is the literal `'equity-vs-price'` concept the coach stamps on
// every priced continue. Proven in the test.

/** equity-vs-price spot: equity far exceeds the price — call is correct, fold is the leak. */
const CONTINUE_RULE_SPOT: CoachSpot = {
  kind: 'coach',
  prompt:
    'You hold A♠A♥ on A♣K♦7♥, top set. Your opponent bets, bringing the pot to 100, and you must ' +
    'call just 10, a price of only ~9%. Your hand is worth ~96%. Call or fold?',
  choices: [CALL, FOLD],
  context: {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 10,
    numActive: 2,
  },
}

const CONTINUE_RULE_LESSON: Lesson = {
  id: 'foundations-equity-vs-price',
  title: 'The continue rule: equity vs price',
  concept: 'equity-vs-price',
  explanation:
    'Here is the one rule that drives every call-or-fold decision: continue when your equity beats ' +
    'the price, fold when it does not. Equity is how good your hand is; the price is the pot odds the ' +
    'bet sets. Worth 40% and the price is 30%? Continue. You have more than you are paying for. ' +
    'Worth 20% and the price is 33%? Fold. One caveat: this compares your equity RIGHT NOW, which is ' +
    'the right test for a made hand at showdown value. A draw can continue a little light — at a price ' +
    'a bit worse than its current equity — because it wins extra bets the times it hits (implied ' +
    'odds); the draws lesson covers that. For everything else postflop, this single comparison is the ' +
    'whole game.',
  spots: [CONTINUE_RULE_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 4. ev — break-even / expected value of a decision.
// ---------------------------------------------------------------------------------------------------
//
// EV is the same continue decision viewed in CHIPS rather than a yes/no: not just *whether* a call is
// right but *how much* it is worth over the long run. Two CoachSpots make the sign concrete:
//   - a clearly +EV continue (top set, call 50 into a 100 pot — callEv ≈ +95 chips), call correct; and
//   - a clearly −EV continue (air, call a 100 overbet into a 150 pot — callEv ≈ −90 chips), fold
//     correct, call the leak.
// Both are coach-graded (concept 'equity-vs-price' on the priced verdict; the lesson teaches 'ev').
// The explanation the engine builds even reports the chip EV, so the lesson narrates the very number.
// Proven in the test (callEv sign on each).

/** ev spot A: a +EV continue — calling gains chips, so call is correct, fold is the leak. */
const EV_GOOD_SPOT: CoachSpot = {
  kind: 'coach',
  prompt:
    'You hold A♠A♥ on A♣K♦7♥, top set. Your opponent bets, bringing the pot to 100, and you must ' +
    'call 50. Calling risks 50 to win a pot where you are a huge favourite. Over the long run, does ' +
    'calling MAKE or LOSE chips? Call or fold?',
  choices: [CALL, FOLD],
  context: {
    holeCards: hole('As Ah'),
    board: parseCards('Ac Kd 7h'),
    pot: 100,
    toCall: 50,
    numActive: 2,
  },
}

/** ev spot B: a −EV continue — calling loses chips, so fold is correct, call is the leak. */
const EV_BAD_SPOT: CoachSpot = {
  kind: 'coach',
  prompt:
    'You hold 2♣3♦ on A♠K♦Q♥, total air. There is 50 in the pot and your opponent overbets to ' +
    '150 total, so you must call 100 to chase a hand you almost never win. Over the long run, does ' +
    'calling MAKE or LOSE chips? Call or fold?',
  choices: [CALL, FOLD],
  context: {
    holeCards: hole('2c 3d'),
    board: parseCards('As Kd Qh'),
    // The pot already includes villain's 100 overbet (50 + 100), matching the coach's pot accounting.
    pot: 150,
    toCall: 100,
    numActive: 2,
  },
}

const EV_LESSON: Lesson = {
  id: 'foundations-ev',
  title: 'EV: counting the decision in chips',
  concept: 'ev',
  explanation:
    'Expected value (EV) is the continue rule measured in chips instead of yes/no: the average ' +
    'chips a decision makes or loses if you faced it again and again. A call with more equity than ' +
    'the price has positive EV: it makes chips long-term, even on the hands it loses. A call with ' +
    'less equity than the price has negative EV: it bleeds chips, even on the hands it wins. You ' +
    'are not playing this one hand; you are playing the decision a thousand times. Take the +EV side.',
  spots: [EV_GOOD_SPOT, EV_BAD_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 5. position — acting later is an edge.
// ---------------------------------------------------------------------------------------------------
//
// The coach rules on position across the whole opening range now (gradePreflop -> adviceFor is
// position-aware: each tier consults the hero's classifyPosition bucket — e.g. the MARGINAL tier opens
// only in late/steal seats and folds in early position). This lesson leans on the clearest case: a
// genuine coach-graded PreflopSpot pair on the SAME marginal hand (KJo), contrasting the button (late:
// open is correct) against UTG (early: fold is correct). No declarative carve-out is needed — the
// chart itself encodes "acting later lets you play more hands." Proven in the test (KJo button open ==
// good, KJo UTG fold == good, and the opposite actions == leak).

/** position spot A: KJo on the button — late position, so opening is correct (open is good). */
const POSITION_BUTTON_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt: 'It folds to you on the BUTTON (you act last after the flop) with K♣J♦. Open or fold?',
  choices: [OPEN, FOLD],
  holeCards: hole('Kc Jd'),
  seat: 1,
  buttonIndex: 1,
  numPlayers: 6,
}

/** position spot B: the same KJo under the gun — early position, so folding is correct (fold is good). */
const POSITION_UTG_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt:
    'Same hand, K♣J♦, but now you are UNDER THE GUN (first to act, with five players still behind ' +
    'you to act after the flop). Open or fold?',
  choices: [OPEN, FOLD],
  holeCards: hole('Kc Jd'),
  // Seat 0 is UTG only when the button is at seat 3 (sb=4, bb=5, UTG=button+3=0) — the seat just left
  // of the big blind, first to act. (0054 corrected the position classifier so the SB/BB are no
  // longer mislabelled as "not late"; this spot's geometry now genuinely puts the hero UTG.)
  seat: 0,
  buttonIndex: 3,
  numPlayers: 6,
}

const POSITION_LESSON: Lesson = {
  id: 'foundations-position',
  title: 'Position: acting later is an edge',
  concept: 'position',
  explanation:
    'Position is your seat relative to the action. Acting LAST after the flop is a real edge: you ' +
    'see what everyone does before you decide, so you bluff more, value-bet more, and control the ' +
    'pot size. The button acts last every street, the best seat at the table. The practical upshot: ' +
    'you can profitably play MORE hands in late position than in early position. The same borderline ' +
    'hand that is an open on the button is a fold under the gun.',
  spots: [POSITION_BUTTON_SPOT, POSITION_UTG_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 6. ranges — think in the set of hands / starting-hand strength tiers.
// ---------------------------------------------------------------------------------------------------
//
// PreflopSpots graded by the chart, which IS the ranges idea: it sorts a holding into a strength tier
// and gives open/fold guidance. Two spots bracket the chart: a premium hand (AA — always open, fold
// is the leak) and a trash hand (72o, the worst holding — always fold, open is the leak). Both are
// position-independent (premium and trash do not depend on the seat), so they teach tier strength,
// cleanly. The coach tags both `'ranges'`. Proven in the test.

/** ranges spot A: AA, a premium hand — opening is correct, folding is the leak. */
const RANGES_PREMIUM_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt: 'You are dealt A♠A♥. Open or fold?',
  choices: [OPEN, FOLD],
  holeCards: hole('As Ah'),
  seat: 1,
  buttonIndex: 1,
  numPlayers: 6,
}

/** ranges spot B: 72o, the bottom tier — folding is correct, opening is the leak. */
const RANGES_TRASH_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt: 'You are dealt 7♣2♦. Open or fold?',
  choices: [OPEN, FOLD],
  holeCards: hole('7c 2d'),
  seat: 0,
  buttonIndex: 5,
  numPlayers: 6,
}

const RANGES_LESSON: Lesson = {
  id: 'foundations-ranges',
  title: 'Ranges: think in strength tiers',
  concept: 'ranges',
  explanation:
    "You never know an opponent's exact two cards, so you reason about their RANGE: the whole set of " +
    'hands they could hold. (Poker calls you the "hero" and the opponent the "villain" — neutral ' +
    'names for whose decision is being studied.) The same lens sorts your own starting hands. Group ' +
    'every hand into a strength tier and let the tier, not a hunch about this one hand, decide whether ' +
    'you play. Three things set the tiers apart: high cards (an ace beats a king), pairs (a made hand ' +
    'before any community card), and whether your two cards are suited and connected enough to make ' +
    'flushes and straights. A starting-hand chart is just these tiers written down. The tiers, ' +
    'strongest first:',
  spots: [RANGES_PREMIUM_SPOT, RANGES_TRASH_SPOT],
}

// ---------------------------------------------------------------------------------------------------
// 7. facing a preflop raise — call / fold / 3-bet against a single raiser (concept: ranges).
// ---------------------------------------------------------------------------------------------------
//
// The most common real decision, and the inverse of the open-or-fold the position/ranges lessons
// teach: someone has already raised — do I call, fold, or re-raise? Graded by the *raise-aware*
// `gradePreflop` (ticket 0053), NOT an answer key: a faced raise narrows the continue range, and the
// chart's defend standard (`facingRaiseAdvice`) tightens it by price and seat. This is the first
// PreflopSpot to set `facingRaiseBb`, which threads the raise into the synthesised context so
// `gradePreflop` sees `currentBet > bigBlind` and takes its defend path (`trace.facingRaise === true`).
//
// Two coach-true spots bracket the decision:
//   - A speculative hand (76s, the `playable` tier) in early position — out of position — facing a LARGE 6 BB raise.
//     At ≥ LARGE_RAISE_MIN_BB the price collapses the range to value only (strong+), so the chart
//     folds 76s: fold is correct, calling is the leak. (concept 'ranges'.)
//   - A marginal hand (KJo, the `marginal` tier) in the BIG BLIND facing a SMALL 3 BB raise. Below
//     LARGE_RAISE_MIN_BB the big blind *defends* wide (BUG-0007) — the posted-blind discount + closing
//     the action justify continuing down to `marginal` — so the chart says continue: calling is
//     correct, folding is the leak. Since the coach grades any non-fold as "continue", a Call and a
//     3-bet grade identically here; the graded teaching point is continue-vs-fold.
// Both grade through the facing-raise path; `foundations.test.ts` proves the coach's actual ruling.

/** facing-a-raise spot A: 76s in early position vs a large 6 BB raise — the chart folds it; fold correct, call leak. */
const FACING_RAISE_FOLD_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt:
    'You are in EARLY POSITION (out of position, most of the table still to act behind you) with ' +
    '7♥6♥, a suited connector. The player under the gun raises big, to 6 big blinds, before it gets ' +
    'to you. A raise this large usually means a strong, narrow range — and your speculative hand ' +
    'plays badly out of position for a steep price. Call or fold?',
  choices: [CALL, FOLD],
  holeCards: hole('7h 6h'),
  // Early position at a 6-max table: button at seat 3 ⇒ sb=4, bb=5, UTG=0, hero in seat 1 (UTG+1).
  // The under-the-gun player (seat 0) opens before the hero; the cutoff (seat 2) and button (seat 3)
  // are still to act behind. classifyPosition buckets seat 1 'early', so the hero is out of position
  // facing the raise — and the grade is position-independent on the large-raise band anyway
  // (facingRaiseAdvice collapses to value-only regardless of seat ≥ LARGE_RAISE_MIN_BB).
  seat: 1,
  buttonIndex: 3,
  numPlayers: 6,
  // A large raise (≥ LARGE_RAISE_MIN_BB = 5, below the 3-bet band): value-only continues, so 76s folds.
  facingRaiseBb: 6,
}

/** facing-a-raise spot B: KJo defending the big blind vs a small 3 BB raise — continue correct, fold leak. */
const FACING_RAISE_DEFEND_SPOT: PreflopSpot = {
  kind: 'preflop',
  prompt:
    'You are in the BIG BLIND with K♣J♦. It folds to a late player who makes a small raise, to 3 ' +
    'big blinds. You already posted the big blind, so you get a discount to call and you close the ' +
    'action. Folding, calling, and 3-betting (re-raising) are all on the table. Call, fold, or 3-bet?',
  choices: [CALL, FOLD, THREE_BET],
  holeCards: hole('Kc Jd'),
  // The big blind at a 6-max table: button at seat 3 ⇒ bb = (3+2) mod 6 = 5. classifyPosition buckets
  // seat 5 'big-blind', so the wide BB-defend standard applies.
  seat: 5,
  buttonIndex: 3,
  numPlayers: 6,
  // A small raise (below LARGE_RAISE_MIN_BB = 5): the big blind defends down to the marginal tier.
  facingRaiseBb: 3,
}

const FACING_RAISE_LESSON: Lesson = {
  id: 'foundations-facing-a-raise',
  title: 'Facing a raise: call, fold, or 3-bet',
  concept: 'ranges',
  explanation:
    'Often you are not first to act — someone has already raised, and your choice is call, fold, or ' +
    '3-bet (a 3-bet is simply a re-raise: you raise their raise). A raise is a strength signal: it ' +
    'narrows what you should continue with far below the hands you would open yourself, because now ' +
    'you must beat a hand that already wanted chips in. Two things steer the call: the raise size and ' +
    'your position. A small raise is a cheap price, so continue wider; a big raise is expensive and ' +
    'means a stronger range, so fold all but your best hands. Acting last (in position) lets you ' +
    'continue a bit wider. Rules of thumb: fold speculative junk to a big raise out of position; ' +
    'flat your good-but-not-great hands at the right price; and 3-bet your premiums (big pairs, A-K) ' +
    'to build the pot and take the lead. One special seat: in the big blind you already posted a ' +
    'blind, so you defend wider against a small raise.',
  spots: [FACING_RAISE_FOLD_SPOT, FACING_RAISE_DEFEND_SPOT],
}

/**
 * The Foundations primer — the original six concept lessons (equity → pot odds → the continue rule
 * that combines them → EV (the same rule in chips) → position → ranges) plus the v2 facing-a-raise
 * lesson appended here (ticket 0071). The final canonical ordering is ticket 0075's job; for now we
 * append. The lesson player walks this front-to-back; M5 drills and both shells reuse it. Every spot
 * is coach- or chart-graded (no declarative carve-out), so the primer can never silently disagree
 * with the live coach — `foundations.test.ts` proves each spot's verdict.
 */
export const FOUNDATIONS: readonly Lesson[] = [
  EQUITY_LESSON,
  POT_ODDS_LESSON,
  CONTINUE_RULE_LESSON,
  EV_LESSON,
  POSITION_LESSON,
  RANGES_LESSON,
  FACING_RAISE_LESSON,
]
