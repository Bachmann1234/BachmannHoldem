/**
 * Renders an `@holdem/coach` explanation — a list of {@link ExplanationSegment}s — as text with the
 * poker terms it names turned into tappable links (ticket 0064). Plain-string segments render as
 * text; a `{ text, term }` segment renders as an inline button that asks the host to open the
 * glossary at that term (the chosen "tap → glossary, scrolled to the entry" UX).
 *
 * A plain CSS `title` tooltip is deliberately not used: this is a touch PWA and hover never fires on
 * a phone (the same reason the chart has a tap-to-decode caption). So every term is a real,
 * focusable button.
 *
 * Presentational and self-contained: the term ids it emits to `onTermClick` are the
 * {@link GLOSSARY_TERMS} keys, so the link and the glossary entry it opens always match.
 */

import type { ExplanationSegment, GradeTermId } from '@holdem/coach'

/** Props for {@link GlossaryText}. */
export interface GlossaryTextProps {
  /** The explanation to render (from `@holdem/coach`'s `explainGrade`). */
  readonly segments: readonly ExplanationSegment[]
  /** Called with the term id when a learner taps a linked term — the host opens the glossary there. */
  readonly onTermClick: (term: GradeTermId) => void
}

/** Render explanation segments as prose with glossary-linked terms. */
export function GlossaryText({ segments, onTermClick }: GlossaryTextProps): React.JSX.Element {
  return (
    <>
      {segments.map((segment, i) =>
        typeof segment === 'string' ? (
          <span key={i}>{segment}</span>
        ) : (
          <button
            type="button"
            key={i}
            className="glossary-link"
            onClick={() => onTermClick(segment.term)}
            data-testid={`glossary-link-${segment.term}`}
          >
            {segment.text}
          </button>
        ),
      )}
    </>
  )
}
