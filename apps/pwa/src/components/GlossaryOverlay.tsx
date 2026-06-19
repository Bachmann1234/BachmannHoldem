/**
 * The **poker-shorthand glossary** overlay — a one-stop decode for the terse notation the app uses
 * everywhere a learner meets it: the starting-hand chart cells (`JTo`), the coach drawer's "your hand"
 * highlight, the seat tags on the felt (`BTN`/`SB`/`BB`), and the card faces. The chart's tap-to-decode
 * caption answers "what is *this* hand"; this answers "what does the *notation* mean" once, for the
 * whole system. Past pure notation it also defines the spoken poker vocabulary a learner meets in the
 * lessons but not the rules: a "Draws and the board" section (flush draw, overcard, made hand, …) and
 * a closing "Talking about hands" section for the analytical words a hand review or the coach leans on
 * (hero, villain, range, GTO) — so the words are decoded in the same place as the symbols.
 *
 * **The beginner number-sense cheat-sheet (ticket 0081).** Because number sense is the beginner's whole
 * value prop (see [../../docs/LEARNING-APPROACH.md]), the overlay grows past a pure decode into a
 * cheat-sheet: a "Number sense" vocabulary section (equity, pot odds, EV, outs, break-even) and two
 * quick-reference TABLES — the pot-odds → required-equity pegs (quarter/half/pot bet → the equity a call
 * needs) and the rule-of-2-and-4 (outs → flop/turn equity). The table numbers are DERIVED from
 * `@holdem/odds` at module load (see {@link ./cheatSheet}), never hand-typed, so they cannot drift from
 * the coach's pricing or the calculation drills' grading. This is the reference the calc drills (0077) and
 * the coach point a struggling learner at.
 *
 * Presentational only and self-contained: a centred modal over its own scrim, opened from the Learn
 * header next to the chart link. The hand-class examples are read through `@holdem/coach`'s
 * {@link describeHandClass}, so the glossary can never disagree with the chart caption it explains.
 * Accessibility mirrors {@link ChartOverlay}: a labelled `role="dialog"`, focus moved to the close
 * button on open, Escape to close, focus restored to the opener.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { describeHandClass, type GradeTermId } from '@holdem/coach'
import { GLOSSARY_TERMS, HAND_STRENGTH_TERM_ORDER } from './glossaryTerms.js'
import { NUMBER_SENSE_TERMS, OUTS_PEGS, POT_ODDS_PEGS } from './cheatSheet.js'

/** One decoded term: the shorthand as written, and what it means in plain English. */
interface GlossaryEntry {
  /** The shorthand token exactly as it appears in the UI, e.g. `"AKs"`, `"BTN"`, `"A♥"`. */
  readonly term: string
  /** Its plain-English meaning. */
  readonly meaning: string
  /**
   * The stable term id, for the hand-strength concepts a chart explanation can link to. Set only on
   * the "Hand strength" entries so {@link GlossaryOverlay}'s `focusTerm` can scroll to and highlight
   * the right row when a learner taps an inline term; the notation entries have no id.
   */
  readonly id?: GradeTermId
}

/** A titled group of related shorthand, with an optional one-line lead-in. */
interface GlossarySection {
  readonly title: string
  readonly intro?: string
  readonly entries: readonly GlossaryEntry[]
}

/**
 * The glossary content. Hand-class meanings come from {@link describeHandClass} so they stay in lock-step
 * with the chart's decode caption; the rest is the notation the live table and lessons render.
 */
const SECTIONS: readonly GlossarySection[] = [
  {
    title: 'Starting hands',
    intro: 'How two cards are written. The higher rank comes first; T means Ten.',
    entries: [
      { term: 'AA', meaning: `${describeHandClass('AA')}: two cards of the same rank` },
      { term: 'AKs', meaning: `${describeHandClass('AKs')}, same suit ("s")` },
      { term: 'JTo', meaning: `${describeHandClass('JTo')}, different suits ("o")` },
    ],
  },
  {
    title: 'Strength tiers',
    intro: 'The colour buckets on the chart, strongest to weakest.',
    entries: [
      { term: 'Premium', meaning: 'The best hands; always raise.' },
      { term: 'Strong', meaning: 'Clear value; open and bet.' },
      { term: 'Playable', meaning: 'Speculative; open in position with a plan.' },
      { term: 'Marginal', meaning: 'Thin: open only late; fold to pressure.' },
      // Hedged, not "makes no money over time" — a trash hand like K7o steals fine from the button
      // (the coach's no-false-universal rule, ticket 0056).
      { term: 'Trash', meaning: 'Usually a fold, though the very bottom can still steal late.' },
    ],
  },
  {
    title: 'Hand strength',
    intro: 'The words behind a hand’s grade: why two similar hands can rate worlds apart.',
    // Built from the shared term registry so these definitions are byte-for-byte the ones the chart's
    // grade explanation links to (ticket 0064).
    entries: HAND_STRENGTH_TERM_ORDER.map((id) => ({
      id,
      term: GLOSSARY_TERMS[id].term,
      meaning: GLOSSARY_TERMS[id].meaning,
    })),
  },
  {
    // The beginner number-sense vocabulary (ticket 0081): the words behind the cheat-sheet tables below.
    title: 'Number sense',
    intro:
      'The math words a beginner lives by, and the cheat-sheet tables below put numbers on them.',
    entries: NUMBER_SENSE_TERMS.map((t) => ({ term: t.term, meaning: t.meaning })),
  },
  {
    title: 'Draws and the board',
    intro:
      'Whether your hand is already complete or still needs a card, and how it ranks against the board.',
    entries: [
      {
        term: 'Made hand',
        meaning:
          'A hand that is already complete: a pair or better that can win at showdown with no more help. The opposite of a draw.',
      },
      {
        term: 'Flush draw',
        meaning:
          'Four cards of one suit, one short of a flush. With the turn and river still to come you complete it about 35% of the time: a strong, common draw.',
      },
      {
        term: 'Gutshot',
        meaning:
          'An inside straight draw: four to a straight, but you need one specific middle rank, like 9-8-7-5 waiting on a 6. Only four cards complete it, so it is the weakest straight draw.',
      },
      {
        term: 'Open-ended',
        meaning:
          'A straight draw open at both ends, like 8-7-6-5: a 9 or a 4 makes it. Eight cards complete it, twice as many as a gutshot.',
      },
      {
        term: 'Overcard',
        meaning:
          'A card higher than every card on the board. Holding A-Q on a 9-7-2 flop, both your cards are overcards: unpaired, but still live to make the top pair.',
      },
      {
        term: 'Top pair',
        meaning:
          'Pairing the highest card on the board with one of your cards: a solid, everyday made hand. Its strength rides on your kicker.',
      },
      {
        term: 'Overpair',
        meaning:
          'A pocket pair higher than every board card, like QQ on a 9-7-2 flop. It beats any top pair the board can make.',
      },
      {
        term: 'Underpair',
        meaning:
          'A pocket pair lower than the top board card, like 99 on an A-7-2 flop. Anyone holding that ace already has you beat.',
      },
    ],
  },
  {
    // The side-pot vocabulary (ticket 0092): the words behind the coach's short-all-in note, so a
    // learner who meets "main pot" / "side pot" at the table has the definition in the same place.
    title: 'Pots',
    intro: 'When someone is all-in for less than others, the pot splits in two.',
    entries: [
      {
        term: 'Main pot',
        meaning:
          'The pot every still-live player contests, capped at the shortest all-in stack. If you are all-in for 20 against two players, the main pot is the chips matched up to your 20 — the most you can win.',
      },
      {
        term: 'Side pot',
        meaning:
          'The chips bet above a short all-in, contested only by the players who could cover it. If you are all-in for less, you cannot win the side pot no matter how strong your hand.',
      },
    ],
  },
  {
    title: 'Table positions',
    intro: 'The tags beside the seats. Position decides how early you must act.',
    entries: [
      { term: 'BTN', meaning: 'Button: the dealer; acts last after the flop (best seat).' },
      { term: 'SB', meaning: 'Small blind: a forced bet to the button’s left.' },
      { term: 'BB', meaning: 'Big blind: the larger forced bet; acts last preflop.' },
    ],
  },
  {
    title: 'Cards',
    intro: 'A card is a rank plus a suit.',
    entries: [
      { term: '♠ ♥ ♦ ♣', meaning: 'Spades, hearts, diamonds, clubs.' },
      { term: 'A K Q J T', meaning: 'Ace, King, Queen, Jack, Ten, then 9 down to 2.' },
      { term: 'A♥', meaning: 'The Ace of hearts (rank, then suit).' },
    ],
  },
  {
    title: 'Talking about hands',
    intro: 'The words players use to discuss a hand, in reviews, forums, and the coach.',
    entries: [
      {
        term: 'Hero',
        meaning:
          'You: the player whose decision is under the microscope. When a hand is reviewed, the hero is the one you follow.',
      },
      {
        term: 'Villain',
        meaning:
          'Your opponent. Not an insult, just the neutral name for the player whose hand you have to reason about.',
      },
      {
        term: 'Range',
        meaning:
          'Every hand someone could be holding right now, not one exact pair of cards. You play the odds against a whole range.',
      },
      {
        term: 'GTO',
        meaning:
          'Game-theory optimal: a balanced, unexploitable baseline strategy. The "textbook" play to measure yourself against.',
      },
    ],
  },
]

/** Props for {@link GlossaryOverlay}. */
export interface GlossaryOverlayProps {
  /** Dismiss the overlay. */
  readonly onClose: () => void
  /**
   * Open scrolled to and highlighting a specific hand-strength term — set when the chart's grade
   * explanation deep-links into the glossary (ticket 0064). Omitted when opened from the Learn
   * header, where the glossary opens at the top as before.
   */
  readonly focusTerm?: GradeTermId
}

/** Render the poker-shorthand glossary as a centred modal over a scrim. */
export function GlossaryOverlay({ onClose, focusTerm }: GlossaryOverlayProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)
  const focusRowRef = useRef<HTMLDivElement>(null)
  // The term to highlight — seeded from `focusTerm` and cleared once a learner taps elsewhere, so the
  // ring is a transient "here it is", not a permanent decoration.
  const [highlighted, setHighlighted] = useState<GradeTermId | undefined>(focusTerm)

  // Focus management (mirrors ChartOverlay): focus the close button on open, Escape closes, restore
  // focus to the opener on unmount. The overlay mounts only while open, so this runs once per open.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  // Deep-link: when opened on a term, scroll its row into view. Focus stays on the close button (the
  // a11y contract above), so this only nudges the term into sight; `aria-current` marks it for
  // assistive tech. `scrollIntoView` is guarded — jsdom (tests) doesn't implement it.
  useEffect(() => {
    if (focusTerm) focusRowRef.current?.scrollIntoView?.({ block: 'center' })
  }, [focusTerm])

  // Portal to <body> so the overlay escapes any transformed ancestor and centres on the viewport
  // (same reasoning as ChartOverlay / BUG-0006).
  return createPortal(
    <>
      <div
        className="chart-scrim"
        onClick={onClose}
        aria-hidden="true"
        data-testid="glossary-scrim"
      />
      <div
        className="chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Poker shorthand"
        data-testid="glossary-modal"
      >
        <div className="drawer-head">
          <div className="drawer-title">Poker shorthand</div>
          <button
            type="button"
            className="drawer-close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close glossary"
            data-testid="glossary-close"
          >
            ×
          </button>
        </div>

        <div className="glossary" data-testid="glossary-body">
          {SECTIONS.map((section) => (
            <section className="glossary-section" key={section.title}>
              <h3 className="glossary-title">{section.title}</h3>
              {section.intro ? <p className="glossary-intro">{section.intro}</p> : null}
              <dl className="glossary-list">
                {section.entries.map((entry) => {
                  const isFocused = entry.id !== undefined && entry.id === highlighted
                  return (
                    <div
                      className={`glossary-row${isFocused ? ' is-focused' : ''}`}
                      key={entry.term}
                      ref={
                        entry.id !== undefined && entry.id === focusTerm ? focusRowRef : undefined
                      }
                      aria-current={isFocused ? 'true' : undefined}
                      data-term-id={entry.id}
                      onClick={() => setHighlighted(undefined)}
                    >
                      <dt className="glossary-term">{entry.term}</dt>
                      <dd className="glossary-meaning">{entry.meaning}</dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          ))}

          {/* The pot-odds → required-equity quick-reference — every value DERIVED from @holdem/odds. */}
          <section className="glossary-section" data-testid="cheatsheet-pot-odds">
            <h3 className="glossary-title">Pot odds → equity</h3>
            <p className="glossary-intro">
              The equity a call needs to break even, by bet size. Above it, calling makes money over
              time; below it, fold.
            </p>
            <table className="glossary-table">
              <thead>
                <tr>
                  <th scope="col">Villain bets</th>
                  <th scope="col">You need</th>
                </tr>
              </thead>
              <tbody>
                {POT_ODDS_PEGS.map((peg) => (
                  <tr key={peg.bet} data-testid={`peg-${peg.fraction.toFixed(3)}`}>
                    <td>{peg.bet}</td>
                    <td>{peg.requiredEquity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* The rule-of-2-and-4 — outs → flop/turn equity, every value DERIVED from outsToEquity. */}
          <section className="glossary-section" data-testid="cheatsheet-outs">
            <h3 className="glossary-title">Rule of 2 and 4</h3>
            <p className="glossary-intro">
              Turn your outs into equity: ×4 on the flop (two cards to come), ×2 on the turn (one
              card). Roughly right, close enough to decide.
            </p>
            <table className="glossary-table">
              <thead>
                <tr>
                  <th scope="col">Draw</th>
                  <th scope="col">Outs</th>
                  <th scope="col">Flop</th>
                  <th scope="col">Turn</th>
                </tr>
              </thead>
              <tbody>
                {OUTS_PEGS.map((peg) => (
                  <tr key={peg.outs} data-testid={`outs-${peg.outs}`}>
                    <td>{peg.draw}</td>
                    <td>{peg.outs}</td>
                    <td>{peg.flop}</td>
                    <td>{peg.turn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>,
    document.body,
  )
}
