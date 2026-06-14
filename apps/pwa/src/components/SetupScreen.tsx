/**
 * The table-setup screen (ticket 0035) — the DOM analog of the TUI's `SetupScreen`. Touch UI that
 * edits the shared {@link SetupState} the reducer owns: a seat-count stepper (2–6) and one preset
 * cycler per opponent seat (TAG / LAG / Rock / Station), plus a Deal CTA that starts the first hand.
 *
 * Purely a view over the model: every edit dispatches a reducer {@link Msg} (`set-seats` /
 * `cycle-opponent`) — exactly the messages the TUI setup `useInput` dispatched — and the CTA calls
 * the shell's `beginHand()`. No poker logic, no local selection state; the reducer is the single
 * source of truth, this just renders it and forwards intent.
 */

import { BOT_LABELS, MAX_SEATS, MIN_SEATS, type Msg, type SetupState } from '@holdem/session'

/** Props for {@link SetupScreen}. */
export interface SetupScreenProps {
  /** The current setup selection the reducer holds. */
  readonly setup: SetupState
  /** Dispatch a reducer message (seat-count / opponent-preset edits). */
  readonly dispatch: (msg: Msg) => void
  /** Deal the first hand (shell-owned: shuffles a deck and dispatches `start-hand`). */
  readonly onStart: () => void
}

/** Render the setup form: a seat-count stepper, one preset cycler per opponent, and a Deal CTA. */
export function SetupScreen({ setup, dispatch, onStart }: SetupScreenProps): React.JSX.Element {
  const setSeats = (seats: number): void => {
    if (seats >= MIN_SEATS && seats <= MAX_SEATS) dispatch({ type: 'set-seats', seats })
  }

  return (
    <div className="app" data-testid="setup">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <div className="brand-name">Bachmann Hold&apos;em</div>
            <div className="brand-sub">TABLE SETUP</div>
          </div>
        </div>
      </div>

      <div className="setup">
        <div className="setup-head">
          <div className="setup-title">Set up your table</div>
          <div className="setup-sub">Pick how many seats and who you&apos;re up against.</div>
        </div>

        <div className="setup-card">
          <div className="setup-row">
            <div className="setup-label">
              Seats
              <span className="hint">heads-up … 6-max</span>
            </div>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Fewer seats"
                disabled={setup.seats <= MIN_SEATS}
                onClick={() => setSeats(setup.seats - 1)}
              >
                −
              </button>
              <span className="stepper-value" data-testid="seat-count">
                {setup.seats}
              </span>
              <button
                type="button"
                className="stepper-btn"
                aria-label="More seats"
                disabled={setup.seats >= MAX_SEATS}
                onClick={() => setSeats(setup.seats + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="setup-card">
          {setup.opponents.map((kind, i) => (
            <div className="setup-row" key={i}>
              <div className="setup-label">{`Seat ${i + 1}`}</div>
              <button
                type="button"
                className="preset-pill"
                data-testid={`opponent-${i}`}
                aria-label={`Seat ${i + 1} opponent: ${BOT_LABELS[kind]} (tap to change)`}
                onClick={() => dispatch({ type: 'cycle-opponent', opponentIndex: i, direction: 1 })}
              >
                {BOT_LABELS[kind]}
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn next-cta setup-cta" onClick={onStart}>
          Deal in →
        </button>
      </div>
    </div>
  )
}
