/**
 * The root Ink component (tickets 0025 / 0026 / 0029).
 *
 * Purely presentational — it takes the {@link Model} and *reads* it to render the rich, coloured
 * N-seat {@link Table}: the street header, board, pot, every seat (with marks and the hero's hole
 * cards), and — once the hand completes — the showdown / result, plus the live {@link CoachPanel}.
 * There is **zero** game logic here: all rules live in `@holdem/engine`, the model is advanced only
 * by the pure reducer, and phase routing (setup / summary) lives in {@link Root}.
 *
 * This component renders the *play* phases (`'playing'` / `'hand-over'`), so it assumes a live hand
 * (`model.hand !== null`). Everything is derived generically from `hand.players`, so a heads-up
 * table and a 6-max table render through the same component with no special-casing.
 */

import { Box, Text } from 'ink'
import type { Model } from './model.js'
import type { Dispatch } from './reducer.js'
import { Table } from './components/Table.js'
import { CoachPanel } from './components/CoachPanel.js'

/** Props for {@link App}: the model to render and the dispatch the loop uses. */
export interface AppProps {
  readonly model: Model
  /** Accepted so the input-driven components can wire the loop without a signature change. */
  readonly dispatch: Dispatch
}

/** The play view: the session header, the live table, and the coach panel for the current model. */
export function App({ model }: AppProps): React.JSX.Element {
  const { hand, heroSeat, coach, handNumber } = model
  // Defensive: App renders only the play phases, where a hand is always live. If a caller renders
  // it without one, show a placeholder rather than crash.
  if (hand === null) {
    return <Text>Dealing…</Text>
  }
  return (
    <Box flexDirection="column">
      <Text bold>{`Bachmann Hold'em — TUI   (hand ${handNumber})`}</Text>
      <Box marginTop={1}>
        <Table hand={hand} heroSeat={heroSeat} />
      </Box>
      {/* The live coach read of the hero's last decision, below the table, updating in place as
          the hand progresses (ticket 0028). It renders stored model state only — no math here. */}
      <Box marginTop={1}>
        <CoachPanel coach={coach} />
      </Box>
    </Box>
  )
}
