/**
 * The **poker rules** reference overlay — the "go over the rules" section: the ground floor the
 * Foundations primer assumes a learner already stands on (hand rankings, how a hand plays from
 * preflop to showdown, blinds and position, and how you make a hand out of seven cards).
 *
 * It is a sibling of {@link ChartOverlay} and {@link GlossaryOverlay}: a self-contained, centred modal
 * over its own scrim, opened from the Learn screen. Unlike the lesson player it is pure *reference*
 * reading, not graded retrieval, so there are no spots — just the {@link RULES_TOPICS} content,
 * rendered block by block. A sticky jump-tab strip lets a learner hop straight to a topic in the long
 * scroll; the hand-ranking ladder renders real example hands through the shared {@link Card}.
 *
 * Accessibility mirrors the sibling overlays: a labelled `role="dialog"`, focus moved to the close
 * button on open, Escape to close, focus restored to the opener on unmount.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RULES_TOPICS, type RulesBlock } from './rulesContent.js'
import { Card } from './Card.js'

/** Props for {@link RulesOverlay}. */
export interface RulesOverlayProps {
  /** Dismiss the overlay. */
  readonly onClose: () => void
}

/** Render one content block — a paragraph, a labelled step list, or the hand-ranking ladder. */
function Block({ block }: { readonly block: RulesBlock }): React.JSX.Element {
  if (block.kind === 'p') {
    return <p className="rules-p">{block.text}</p>
  }
  if (block.kind === 'steps') {
    return (
      <ol className="rules-steps">
        {block.items.map((item) => (
          <li className="rules-step" key={item.label}>
            <span className="rs-label">{item.label}</span>
            <span className="rs-text">{item.text}</span>
          </li>
        ))}
      </ol>
    )
  }
  // The hand-ranking ladder: strongest first, each rung with its name, blurb, and example card faces.
  return (
    <ol className="rules-ranks">
      {block.items.map((rank, i) => (
        <li className="rules-rank" key={rank.name} data-testid={`rank-${i}`}>
          <span className="rr-n">{i + 1}</span>
          <div className="rr-body">
            <div className="rr-name">{rank.name}</div>
            <div className="rr-blurb">{rank.blurb}</div>
          </div>
          <div className="rr-cards">
            {rank.example.map((card, j) => (
              <Card key={j} card={card} size="sm" />
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Render the poker-rules reference as a centred modal over a scrim. */
export function RulesOverlay({ onClose }: RulesOverlayProps): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Focus management (mirrors ChartOverlay/GlossaryOverlay): focus the close button on open, Escape
  // closes, restore focus to the opener on unmount. The overlay mounts only while open.
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

  // Jump to a topic within the scroll. Guarded — jsdom (tests) does not implement scrollIntoView.
  const jumpTo = (id: string): void => {
    document.getElementById(`rules-topic-${id}`)?.scrollIntoView?.({ behavior: 'smooth' })
  }

  // Portal to <body> so the overlay escapes any transformed ancestor and centres on the viewport
  // (same reasoning as ChartOverlay / GlossaryOverlay).
  return createPortal(
    <>
      <div className="chart-scrim" onClick={onClose} aria-hidden="true" data-testid="rules-scrim" />
      <div
        className="chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Poker rules"
        data-testid="rules-modal"
      >
        <div className="drawer-head">
          <div className="drawer-title">Poker rules</div>
          <button
            type="button"
            className="drawer-close"
            ref={closeRef}
            onClick={onClose}
            aria-label="Close rules"
            data-testid="rules-close"
          >
            ×
          </button>
        </div>

        <div className="rules-tabs" data-testid="rules-tabs">
          {RULES_TOPICS.map((topic) => (
            <button
              type="button"
              className="rules-tab"
              key={topic.id}
              onClick={() => jumpTo(topic.id)}
              data-testid={`rules-tab-${topic.id}`}
            >
              {topic.tab}
            </button>
          ))}
        </div>

        <div className="rules" data-testid="rules-body">
          {RULES_TOPICS.map((topic) => (
            <section className="rules-section" id={`rules-topic-${topic.id}`} key={topic.id}>
              <h3 className="rules-title">{topic.title}</h3>
              <p className="rules-intro">{topic.intro}</p>
              {topic.blocks.map((block, i) => (
                <Block block={block} key={i} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
