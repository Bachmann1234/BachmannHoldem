/**
 * The interactive action bar (ticket 0027): the hero's legal-move menu plus the `useInput` hook
 * that turns keystrokes into a dispatched engine `Action`.
 *
 * This is the one place Ink's `useInput` lives, and it is deliberately *thin*: every grammar and
 * legality decision is delegated to the pure {@link interpretKey} / {@link parseAction} in
 * `src/input.ts`, and the only side effect is `dispatch({ type: 'apply-action', action })`. So the
 * component holds no poker rules — it shows the legal menu, keeps a transient component-local
 * amount-entry buffer, and forwards committed actions into the MVU loop.
 *
 * `useInput` is active *only* when it is the hero's turn (`isHeroTurn`); when a bot is to act or the
 * hand is complete the bar disables input (Ink's `isActive` option) so stray keys are inert. An
 * illegal or garbled keystroke is shown as a gentle hint and never dispatched — the engine therefore
 * never receives an illegal move (which it throws on).
 */

import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { Action, LegalActions } from '@holdem/engine'
import { interpretKey, renderLegal } from '../input.js'

/** Props for {@link ActionBar}. */
export interface ActionBarProps {
  /** The hero's currently legal actions (from `legalActions(hand)`), or `null` if not their turn. */
  readonly legal: LegalActions | null
  /** Whether it is the hero's turn — gates `useInput` so bot turns and showdown ignore keys. */
  readonly isHeroTurn: boolean
  /**
   * Whether the terminal supports raw-mode input (a TTY). `useInput` throws if registered active
   * without raw mode, so a non-interactive (piped) run passes `false` and the bar never listens.
   * Defaults to `true` for the common interactive case.
   */
  readonly inputSupported?: boolean
  /** Commit a chosen, already-legal action into the MVU loop. */
  readonly onAction: (action: Action) => void
}

/**
 * The action bar. Renders the legal menu and the in-progress amount buffer / last hint, and wires
 * `useInput` to the pure key interpreter. The bet-amount digit buffer is transient *view* state
 * (component-local `useState`); only the committed {@link Action} flows through the reducer.
 */
export function ActionBar({
  legal,
  isHeroTurn,
  inputSupported = true,
  onAction,
}: ActionBarProps): React.JSX.Element {
  const [buffer, setBuffer] = useState('')
  const [hint, setHint] = useState('')

  useInput(
    (input, key) => {
      if (!legal) return
      const result = interpretKey(buffer, input, key, legal)
      switch (result.kind) {
        case 'buffer':
          setBuffer(result.buffer)
          setHint('')
          break
        case 'action':
          setBuffer('')
          setHint('')
          onAction(result.action)
          break
        case 'error':
          setBuffer('')
          setHint(result.message)
          break
        case 'ignore':
          break
      }
    },
    // Only listen while it is the hero's turn AND raw mode is available; otherwise stray keys are
    // inert (bot turns / showdown) and a non-TTY run never tries to enter raw mode.
    { isActive: isHeroTurn && legal !== null && inputSupported },
  )

  if (!isHeroTurn || !legal) {
    return (
      <Box>
        <Text dimColor>Waiting…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text>{renderLegal(legal)}</Text>
      <Box>
        <Text>{'> '}</Text>
        <Text>{buffer}</Text>
        {hint ? <Text color="yellow">{`  ${hint}`}</Text> : null}
      </Box>
    </Box>
  )
}
