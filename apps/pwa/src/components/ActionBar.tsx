/**
 * The hero's action controls (ticket 0035) — the DOM analog of the TUI's `ActionBar`, built to the
 * confirmed Playful design's `.actionbar`. It renders the legal moves for the current spot from the
 * engine's {@link LegalActions} and commits a validated engine {@link Action} into the MVU loop.
 *
 * Three columns of buttons: Fold · (Check | Call <amount>) · (Bet | Raise <to-amount>), plus a
 * bet-size control — a slider over the legal `[min, max]` "bet/raise to" totals and `min`/`½`/`pot`/
 * `all-in` quick buttons (ported `applySize`, clamped to `[min, max]`). Between hands it shows the
 * "Deal next hand →" CTA and a quit affordance instead.
 *
 * MVU discipline: this holds NO poker rules. Every button is gated on a `LegalActions` field, so an
 * illegal move is never offered (the engine throws on illegal input); the only side effect is
 * `onAction(...)` / `onNext()` / `onQuit()`. The bet-size buffer is transient *view* state
 * (component-local `useState`); only the committed {@link Action} flows through the reducer. The
 * size math mirrors the prototype's `applySize` exactly (`hero.bet + toCall + frac·pot`, clamped).
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { potTotal, type Action, type HandState, type LegalActions } from '@holdem/engine'

/** Props for {@link ActionBar}. */
export interface ActionBarProps {
  /** The live hand (for pot / hero-committed size math). */
  readonly hand: HandState
  /** The hero's currently legal actions, or `null` when it is not the hero's turn. */
  readonly legal: LegalActions | null
  /** Engine seat the hero occupies this hand (for the hero's current-street committed). */
  readonly heroSeat: number
  /** Whether it is the hero's turn — gates the action controls. */
  readonly isHeroTurn: boolean
  /** Whether the hand is over (between hands) — shows the play-again CTA. */
  readonly handOver: boolean
  /**
   * Whether the session has ended on this (now-complete) hand — the hero is busted or only one
   * player has chips. Shows a single "View summary" CTA instead of play-again, while the completed
   * hand stays on the table for review.
   */
  readonly sessionOver?: boolean
  /** Commit a chosen, already-legal action into the MVU loop. */
  readonly onAction: (action: Action) => void
  /** Deal the next hand (between hands). */
  readonly onNext: () => void
  /** Quit the session to the summary. */
  readonly onQuit: () => void
}

/** A quick-size key for the bet/raise control. */
type SizeKey = 'min' | 'half' | 'pot' | 'allin'

/** The slider's default seed at a fresh decision point: ~⅔ pot, the standard open/c-bet sizing. */
const DEFAULT_BET_FRACTION = 0.66
/** The "½" quick-size button: half the pot, added on top of the call. */
const HALF_POT_FRACTION = 0.5

/** Clamp `v` into the inclusive `[min, max]` range. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/**
 * A self-contained confirm dialog for the live-session "End session" quit, mirroring the overlay
 * conventions of {@link RulesOverlay} / {@link ChartOverlay}: portal to `<body>`, a `chart-scrim` +
 * `chart-modal`, focus moved into the dialog on open, Escape / scrim-click to dismiss, focus
 * restored to the opener on unmount. Confirming runs `onConfirm` (the existing `quit`); every cancel
 * path leaves the session untouched.
 */
function QuitConfirm({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: () => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onCancel])

  return createPortal(
    <>
      <div
        className="chart-scrim"
        onClick={onCancel}
        aria-hidden="true"
        data-testid="quit-confirm-scrim"
      />
      <div
        className="chart-modal"
        role="dialog"
        aria-modal="true"
        aria-label="End session"
        data-testid="quit-confirm-modal"
      >
        <div className="drawer-head">
          <div className="drawer-title">End this session?</div>
          <button
            type="button"
            className="drawer-close"
            onClick={onCancel}
            aria-label="Keep playing"
            data-testid="quit-confirm-close"
          >
            ×
          </button>
        </div>
        <p className="rules-p" style={{ padding: '0 1rem' }}>
          Your table and progress will be lost.
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '0 1rem 1rem',
          }}
        >
          <button
            type="button"
            className="btn"
            ref={cancelRef}
            onClick={onCancel}
            data-testid="quit-confirm-cancel"
          >
            Keep playing
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={onConfirm}
            data-testid="quit-confirm-end"
          >
            End session
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * The action bar. Renders the play-again CTA between hands; a "waiting" placeholder when it is a
 * bot's turn; and the full Fold / Check-Call / Bet-Raise controls (with the bet-size slider + quick
 * buttons) on the hero's turn.
 */
export function ActionBar({
  hand,
  legal,
  heroSeat,
  isHeroTurn,
  handOver,
  sessionOver = false,
  onAction,
  onNext,
  onQuit,
}: ActionBarProps): React.JSX.Element {
  // The bet/raise "to" total the slider/quick-buttons select — transient view state.
  const [betTo, setBetTo] = useState(0)
  const [sizeKey, setSizeKey] = useState<SizeKey | null>(null)
  // Whether the live-session quit-confirm modal is open — local view state, no reducer involvement.
  const [confirmQuit, setConfirmQuit] = useState(false)

  // The aggressive option for this spot: raising (facing a bet) or opening a bet (no bet to call).
  const sizing = legal?.raise ?? legal?.bet ?? null
  const isRaise = legal?.raise !== null && legal?.raise !== undefined
  const sizeMin = sizing?.min ?? 0
  const sizeMax = sizing?.max ?? 0

  const toCall = legal?.call?.amount ?? 0
  const heroCommitted = hand.players[heroSeat]?.committed ?? 0
  const pot = potTotal(hand)

  // Re-seed the slider whenever the hero faces a fresh spot: a ~⅔-pot default, clamped to legal.
  // Keyed off the engine state that defines a new decision (street + who's to act + the bet level).
  // The deps are DELIBERATELY narrowed to those four fields — re-seeding on every `pot`/`sizeMin`
  // change would stomp the value mid-edit while the hero drags the slider. (street, toAct,
  // currentBet) uniquely identify a new hero decision point, which is exactly when we want a reseed.
  useEffect(() => {
    if (!isHeroTurn || sizing === null) return
    const start = clamp(Math.round(pot * DEFAULT_BET_FRACTION), sizeMin, sizeMax)
    setBetTo(start)
    setSizeKey(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reseed only at a new decision point, never mid-drag (see above)
  }, [isHeroTurn, hand.street, hand.toAct, hand.currentBet])

  const applySize = (key: SizeKey): void => {
    if (sizing === null) return
    let to: number
    if (key === 'min') to = sizeMin
    else if (key === 'half') to = heroCommitted + toCall + Math.round(pot * HALF_POT_FRACTION)
    else if (key === 'pot') to = heroCommitted + toCall + pot
    else to = sizeMax
    setBetTo(clamp(to, sizeMin, sizeMax))
    setSizeKey(key)
  }

  // --- Session over: the completed final hand is on the table for review; one CTA to the summary --
  if (sessionOver) {
    return (
      <div className="actionbar" data-testid="actionbar">
        <div className="actions">
          <button type="button" className="btn next-cta" onClick={onQuit}>
            View summary →
          </button>
        </div>
      </div>
    )
  }

  // --- Between hands: the play-again CTA + quit -------------------------------------------------
  // "End session" here is a live-session quit (the save is discarded with no undo), so it opens a
  // confirm modal rather than quitting on the first tap. The session-over "View summary →" path
  // above returns earlier and is unaffected — it stays one-tap.
  if (handOver) {
    return (
      <div className="actionbar" data-testid="actionbar">
        <div className="actions">
          <button type="button" className="btn next-cta" onClick={onNext}>
            Deal next hand →
          </button>
          <button type="button" className="btn quit-cta" onClick={() => setConfirmQuit(true)}>
            End session
          </button>
        </div>
        {confirmQuit ? (
          <QuitConfirm onConfirm={onQuit} onCancel={() => setConfirmQuit(false)} />
        ) : null}
      </div>
    )
  }

  // --- A bot is thinking (or the hand is mid-resolution) ---------------------------------------
  if (!isHeroTurn || legal === null) {
    return (
      <div className="actionbar" data-testid="actionbar">
        <div className="actions">
          <button type="button" className="btn call" disabled style={{ gridColumn: '1 / -1' }}>
            Waiting…
          </button>
        </div>
      </div>
    )
  }

  // --- The hero's turn: the full controls ------------------------------------------------------
  const value = clamp(betTo, sizeMin, sizeMax)
  const raiseLabel = isRaise ? 'Raise to' : 'Bet'
  const canAggress = sizing !== null

  const commitAggressive = (): void => {
    if (sizing === null) return
    const amount = clamp(value, sizeMin, sizeMax)
    onAction(isRaise ? { type: 'raise', amount } : { type: 'bet', amount })
  }

  return (
    <div className="actionbar" data-testid="actionbar">
      {canAggress ? (
        <div className="bet-row">
          <div className="bet-amount" data-testid="bet-to">
            {value} <span>to</span>
          </div>
          <input
            className="slider"
            type="range"
            aria-label="Bet size"
            min={sizeMin}
            max={sizeMax}
            value={value}
            onChange={(e) => {
              setBetTo(Number(e.target.value))
              setSizeKey(null)
            }}
          />
          <div className="sizes">
            {isRaise ? (
              <button
                type="button"
                className={'size-btn' + (sizeKey === 'min' ? ' active' : '')}
                onClick={() => applySize('min')}
              >
                min
              </button>
            ) : null}
            <button
              type="button"
              className={'size-btn' + (sizeKey === 'half' ? ' active' : '')}
              onClick={() => applySize('half')}
            >
              ½
            </button>
            <button
              type="button"
              className={'size-btn' + (sizeKey === 'pot' ? ' active' : '')}
              onClick={() => applySize('pot')}
            >
              pot
            </button>
            <button
              type="button"
              className={'size-btn' + (sizeKey === 'allin' ? ' active' : '')}
              onClick={() => applySize('allin')}
            >
              all-in
            </button>
          </div>
        </div>
      ) : null}

      <div className="actions">
        <button
          type="button"
          className="btn fold"
          disabled={!legal.fold}
          onClick={() => onAction({ type: 'fold' })}
        >
          Fold
        </button>

        {legal.check ? (
          <button type="button" className="btn call" onClick={() => onAction({ type: 'check' })}>
            Check
          </button>
        ) : (
          <button
            type="button"
            className="btn call"
            disabled={legal.call === null}
            onClick={() => onAction({ type: 'call' })}
          >
            Call<small>{toCall}</small>
          </button>
        )}

        {canAggress ? (
          <button type="button" className="btn raise" onClick={commitAggressive}>
            {raiseLabel}
            <small>{value}</small>
          </button>
        ) : (
          <button type="button" className="btn raise" disabled>
            {raiseLabel}
          </button>
        )}
      </div>
    </div>
  )
}
