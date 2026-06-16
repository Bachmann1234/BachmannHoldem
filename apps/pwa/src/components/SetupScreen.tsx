/**
 * The table-setup screen (ticket 0035) — the DOM analog of the TUI's `SetupScreen`. Touch UI that
 * edits the shared {@link SetupState} the reducer owns: a seat-count stepper (2–6) and — since the
 * felt assigns names to seats randomly per session — a *count* per archetype (how many TAG / LAG /
 * Rock / Station) rather than a per-seat preset, plus a Randomize reroll and a Deal CTA.
 *
 * Purely a view over the model: every edit dispatches a reducer {@link Msg} (`set-seats` /
 * `adjust-mix` / `set-opponents`) and the CTA calls the shell's `beginHand()`. No poker logic, no
 * local selection state; the reducer is the single source of truth, this just renders it and
 * forwards intent. `randomOpponents` is the one impure call (the dice roll), kept in the handler.
 */

import {
  BIG_BLIND,
  BOT_BLURBS,
  BOT_KINDS,
  BOT_LABELS,
  countsByKind,
  depthBbForStack,
  MAX_SEATS,
  MIN_SEATS,
  randomOpponents,
  SMALL_BLIND,
  STACK_DEPTH_PRESETS_BB,
  STARTING_STACK,
  stackForDepthBb,
  type Msg,
  type SetupState,
} from '@holdem/session'
import { TabBar } from './TabBar.js'
import type { Tab } from './TabBar.js'

/** Props for {@link SetupScreen}. */
export interface SetupScreenProps {
  /** The current setup selection the reducer holds. */
  readonly setup: SetupState
  /** Dispatch a reducer message (seat-count / opponent-preset edits). */
  readonly dispatch: (msg: Msg) => void
  /** Deal the first hand (shell-owned: shuffles a deck and dispatches `start-hand`). */
  readonly onStart: () => void
  /** Navigate to another top-level tab — the setup screen is a lobby surface, so it shows the tab bar. */
  readonly onNavigate: (tab: Tab) => void
}

/**
 * Render the setup form: a seat-count stepper, one preset cycler per opponent, a Deal CTA, and — at
 * its base — the top-level {@link TabBar} (this is a lobby surface, so Learn is one tap away from
 * boot). The tab bar is *not* shown once a hand is live (that surface is immersive).
 */
export function SetupScreen({
  setup,
  dispatch,
  onStart,
  onNavigate,
}: SetupScreenProps): React.JSX.Element {
  const setSeats = (seats: number): void => {
    if (seats >= MIN_SEATS && seats <= MAX_SEATS) dispatch({ type: 'set-seats', seats })
  }

  const counts = countsByKind(setup.opponents)
  const total = setup.seats - 1 // the mix always sums to this (one bot per non-hero seat)
  // The chosen starting stack (chips). Always set by `createInitialModel`, but `SetupState` keeps it
  // optional for older literals, so fall back to the deep default when reading it for the UI.
  const startingStack = setup.startingStack ?? STARTING_STACK

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
          <div className="setup-row">
            <div className="setup-label">
              Stack
              <span className="hint">
                {depthBbForStack(startingStack)}bb deep · blinds {SMALL_BLIND}/{BIG_BLIND} · shorter
                = faster games
              </span>
            </div>
            <div className="sizes" role="group" aria-label="Starting stack depth">
              {STACK_DEPTH_PRESETS_BB.map((bb) => {
                const chips = stackForDepthBb(bb)
                const selected = chips === startingStack
                return (
                  <button
                    key={bb}
                    type="button"
                    className={'size-btn' + (selected ? ' active' : '')}
                    data-testid={`stack-${bb}`}
                    aria-pressed={selected}
                    aria-label={`${bb} big blinds deep`}
                    onClick={() => dispatch({ type: 'set-stack', startingStack: chips })}
                  >
                    {bb}bb
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="setup-card">
          <div className="setup-row">
            <div className="setup-label">
              Opponents
              <span className="hint">{total === 1 ? '1 opponent' : `${total} opponents`}</span>
            </div>
            <button
              type="button"
              className="preset-pill"
              data-testid="randomize"
              aria-label="Randomize the opponent mix"
              onClick={() => dispatch({ type: 'set-opponents', opponents: randomOpponents(total) })}
            >
              🎲 Randomize
            </button>
          </div>

          {BOT_KINDS.map((kind) => (
            <div className="setup-row" key={kind}>
              <div className="setup-label">
                {BOT_LABELS[kind]}
                <span className="hint">{BOT_BLURBS[kind]}</span>
              </div>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`Fewer ${BOT_LABELS[kind]}`}
                  disabled={counts[kind] === 0}
                  onClick={() => dispatch({ type: 'adjust-mix', kind, delta: -1 })}
                >
                  −
                </button>
                <span className="stepper-value" data-testid={`mix-${kind}`}>
                  {counts[kind]}
                </span>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label={`More ${BOT_LABELS[kind]}`}
                  disabled={counts[kind] === total}
                  onClick={() => dispatch({ type: 'adjust-mix', kind, delta: 1 })}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="btn next-cta setup-cta" onClick={onStart}>
          Deal in →
        </button>
      </div>

      <TabBar active="play" onNavigate={onNavigate} />
    </div>
  )
}
