/**
 * The PWA root (ticket 0034) — now renders the design-led, mobile-first poker table.
 *
 * It owns the {@link Model} via `useReducer(reducer, …, createInitialModel)` and, on mount, deals a
 * single hand (`start-hand` with a freshly shuffled deck — the only non-pure input the shell
 * supplies; all game logic stays in the reducer). It then renders that hand through the
 * presentational {@link Table}. **No interaction yet** — the setup screen, action bar, play loop,
 * and coach drawer land in later tickets (0035/0036); this ticket is the visual table only.
 *
 * The app root carries the design's attribute switches `data-dir="playful"` / `data-deck="four"`
 * (the locked direction + four-color deck) so the ported `styles.css` resolves the right tokens.
 */

import { useEffect, useReducer } from 'react'
import { createInitialModel, reducer, shuffledDeck, type Model } from '@holdem/session'
import { Table } from './components/Table.js'
import './styles.css'

/** Resolve an engine seat to its session display label via `seatToId` → `players`. */
function seatLabelFor(model: Model, seat: number): string {
  const id = model.seatToId[seat]
  const player = id === undefined ? undefined : model.players.find((p) => p.id === id)
  return player?.label ?? `Seat ${seat}`
}

export function App(): React.JSX.Element {
  const [model, dispatch] = useReducer(reducer, undefined, () => createInitialModel())

  // Deal one hand on mount. The reducer (pure) does all the work; the shell only supplies the
  // shuffled deck. Safe to double-fire under React StrictMode: `start-hand` is a no-op outside the
  // 'setup' phase, so the second pass (phase already 'playing') is ignored.
  useEffect(() => {
    if (model.phase === 'setup') {
      dispatch({ type: 'start-hand', deck: shuffledDeck() })
    }
  }, [model.phase])

  const hand = model.hand

  return (
    <div className="room" data-dir="playful" data-deck="four">
      {hand === null ? (
        <div className="app" data-testid="dealing">
          <div className="topbar">
            <div className="brand">
              <div className="brand-mark">B</div>
              <div>
                <div className="brand-name">Bachmann Hold&apos;em</div>
                <div className="brand-sub">DEALING…</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Table
          hand={hand}
          heroSeat={model.heroSeat}
          handNumber={model.handNumber}
          seatLabel={(seat) => seatLabelFor(model, seat)}
        />
      )}
    </div>
  )
}
