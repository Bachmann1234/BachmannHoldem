/**
 * The **poker-shorthand glossary** overlay — a one-stop decode for the terse notation the app uses
 * everywhere a learner meets it: the starting-hand chart cells (`JTo`), the coach drawer's "your hand"
 * highlight, the seat tags on the felt (`BTN`/`SB`/`BB`), and the card faces. The chart's tap-to-decode
 * caption answers "what is *this* hand"; this answers "what does the *notation* mean" once, for the
 * whole system. A closing "Talking about hands" section goes past pure notation to the analytical
 * vocabulary a learner meets the moment they read a hand review or the coach's reasoning — hero,
 * villain, range, GTO — so the words are decoded in the same place as the symbols.
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
      { term: 'AA', meaning: `${describeHandClass('AA')} — two cards of the same rank` },
      { term: 'AKs', meaning: `${describeHandClass('AKs')} — same suit ("s")` },
      { term: 'JTo', meaning: `${describeHandClass('JTo')} — different suits ("o")` },
    ],
  },
  {
    title: 'Strength tiers',
    intro: 'The colour buckets on the chart — strongest to weakest.',
    entries: [
      { term: 'Premium', meaning: 'The best hands — always raise.' },
      { term: 'Strong', meaning: 'Clear value — open and bet.' },
      { term: 'Playable', meaning: 'Speculative — open in position with a plan.' },
      { term: 'Marginal', meaning: 'Thin — open only late; fold to pressure.' },
      // Hedged, not "makes no money over time" — a trash hand like K7o steals fine from the button
      // (the coach's no-false-universal rule, ticket 0056).
      { term: 'Trash', meaning: 'Usually a fold — though the very bottom can still steal late.' },
    ],
  },
  {
    title: 'Hand strength',
    intro: 'The words behind a hand’s grade — why two similar hands can rate worlds apart.',
    // Built from the shared term registry so these definitions are byte-for-byte the ones the chart's
    // grade explanation links to (ticket 0064).
    entries: HAND_STRENGTH_TERM_ORDER.map((id) => ({
      id,
      term: GLOSSARY_TERMS[id].term,
      meaning: GLOSSARY_TERMS[id].meaning,
    })),
  },
  {
    title: 'Table positions',
    intro: 'The tags beside the seats. Position decides how early you must act.',
    entries: [
      { term: 'BTN', meaning: 'Button — the dealer; acts last after the flop (best seat).' },
      { term: 'SB', meaning: 'Small blind — a forced bet to the button’s left.' },
      { term: 'BB', meaning: 'Big blind — the larger forced bet; acts last preflop.' },
    ],
  },
  {
    title: 'Cards',
    intro: 'A card is a rank plus a suit.',
    entries: [
      { term: '♠ ♥ ♦ ♣', meaning: 'Spades, hearts, diamonds, clubs.' },
      { term: 'A K Q J T', meaning: 'Ace, King, Queen, Jack, Ten — then 9 down to 2.' },
      { term: 'A♥', meaning: 'The Ace of hearts (rank, then suit).' },
    ],
  },
  {
    title: 'Talking about hands',
    intro: 'The words players use to discuss a hand — in reviews, forums, and the coach.',
    entries: [
      {
        term: 'Hero',
        meaning:
          'You — the player whose decision is under the microscope. When a hand is reviewed, the hero is the one you follow.',
      },
      {
        term: 'Villain',
        meaning:
          'Your opponent. Not an insult — just the neutral name for the player whose hand you have to reason about.',
      },
      {
        term: 'Range',
        meaning:
          'Every hand someone could be holding right now, not one exact pair of cards. You play the odds against a whole range.',
      },
      {
        term: 'GTO',
        meaning:
          'Game-theory optimal — a balanced, unexploitable baseline strategy. The "textbook" play to measure yourself against.',
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
        </div>
      </div>
    </>,
    document.body,
  )
}
