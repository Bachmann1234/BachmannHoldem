/**
 * The minimal PWA root (ticket 0033) — design-agnostic plumbing that proves the shared
 * `@holdem/session` reducer drives the DOM, the toolchain end of the TUI's MVU loop.
 *
 * It owns the {@link Model} via `useReducer(reducer, …, createInitialModel)` and, on mount, dispatches
 * a single `start-hand` with a freshly shuffled deck (the only non-pure input the shell supplies —
 * all game logic stays in the reducer). It then renders the resulting model READ-ONLY: the phase,
 * the hand number, and the hero's hole cards + board as plain text. No table layout, no interaction
 * — those land in the design-led M4 tickets (0034+).
 */

import { useEffect, useReducer } from 'react'
import { formatCard, type Card } from '@holdem/engine'
import { createInitialModel, reducer, shuffledDeck } from '@holdem/session'

function cardsText(cards: readonly Card[]): string {
  return cards.length === 0 ? '—' : cards.map(formatCard).join(' ')
}

export function App(): React.JSX.Element {
  const [model, dispatch] = useReducer(reducer, undefined, () => createInitialModel())

  // Deal one hand on mount. The reducer (pure) does all the work; the shell only supplies the
  // shuffled deck. The dispatch is safe to double-fire: `startHand` is a no-op outside the 'setup'
  // phase, so React 19 StrictMode's double-invoke (both passes see phase 'setup' and dispatch)
  // cannot deal twice — the second 'start-hand' lands on phase 'playing' and is ignored. The
  // `=== 'setup'` check just skips the redundant post-deal re-run once the phase flips.
  useEffect(() => {
    if (model.phase === 'setup') {
      dispatch({ type: 'start-hand', deck: shuffledDeck() })
    }
  }, [model.phase])

  const hand = model.hand
  const heroCards = hand !== null ? hand.players[model.heroSeat]?.holeCards : undefined

  return (
    <main
      style={{
        maxWidth: 460,
        margin: '0 auto',
        padding: '2rem 1rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ color: '#3ddc84', fontSize: '1.25rem' }}>Bachmann Hold&apos;em</h1>
      <p>
        PWA scaffold — the shared session reducer drives this DOM. Visuals land in a later ticket.
      </p>
      <dl>
        <dt>Phase</dt>
        <dd data-testid="phase">{model.phase}</dd>
        <dt>Hand</dt>
        <dd data-testid="hand-number">{model.handNumber}</dd>
        <dt>Hero hole cards</dt>
        <dd data-testid="hero-cards">{heroCards !== undefined ? cardsText(heroCards) : '—'}</dd>
        <dt>Board</dt>
        <dd data-testid="board">{hand !== null ? cardsText(hand.board) : '—'}</dd>
      </dl>
    </main>
  )
}
