/**
 * The **poker-shorthand glossary** overlay — a one-stop decode for the terse notation the app uses
 * everywhere a learner meets it: the starting-hand chart cells (`JTo`), the coach drawer's "your hand"
 * highlight, the seat tags on the felt (`BTN`/`SB`/`BB`), and the card faces. The chart's tap-to-decode
 * caption answers "what is *this* hand"; this answers "what does the *notation* mean" once, for the
 * whole system.
 *
 * Presentational only and self-contained: a centred modal over its own scrim, opened from the Learn
 * header next to the chart link. The hand-class examples are read through `@holdem/coach`'s
 * {@link describeHandClass}, so the glossary can never disagree with the chart caption it explains.
 * Accessibility mirrors {@link ChartOverlay}: a labelled `role="dialog"`, focus moved to the close
 * button on open, Escape to close, focus restored to the opener.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { describeHandClass } from '@holdem/coach'

/** One decoded term: the shorthand as written, and what it means in plain English. */
interface GlossaryEntry {
  /** The shorthand token exactly as it appears in the UI, e.g. `"AKs"`, `"BTN"`, `"A♥"`. */
  readonly term: string
  /** Its plain-English meaning. */
  readonly meaning: string
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
      { term: 'Trash', meaning: 'Folds — makes no money over time.' },
    ],
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
]

/** Props for {@link GlossaryOverlay}. */
export interface GlossaryOverlayProps {
  /** Dismiss the overlay. */
  readonly onClose: () => void
}

/** Render the poker-shorthand glossary as a centred modal over a scrim. */
export function GlossaryOverlay({ onClose }: GlossaryOverlayProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

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

        <p className="chart-note">
          The terse notation the chart, coach, and table use — decoded once, in plain English.
        </p>

        <div className="glossary" data-testid="glossary-body">
          {SECTIONS.map((section) => (
            <section className="glossary-section" key={section.title}>
              <h3 className="glossary-title">{section.title}</h3>
              {section.intro ? <p className="glossary-intro">{section.intro}</p> : null}
              <dl className="glossary-list">
                {section.entries.map((entry) => (
                  <div className="glossary-row" key={entry.term}>
                    <dt className="glossary-term">{entry.term}</dt>
                    <dd className="glossary-meaning">{entry.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
