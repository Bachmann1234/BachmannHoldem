/**
 * The table-setup screen (ticket 0029): choose the number of seats (heads-up through 6-max) and
 * each opponent seat's `@holdem/bots` preset, then press Enter to play.
 *
 * Purely presentational: it renders the {@link SetupState} the reducer holds and shows the
 * controls. All edits flow through the reducer (`set-seats` / `cycle-opponent`) — the `useInput`
 * that captures the keystrokes lives in {@link Root} (gated to `phase === 'setup'`), so this
 * component holds no input wiring and no selection state of its own. Colour is via Ink `color`
 * props; component tests strip ANSI and assert on the rendered text.
 */

import { Box, Text } from 'ink'
import { BOT_LABELS, type SetupState } from '@holdem/session'

/** Props for {@link SetupScreen}: the current selection and which control row is highlighted. */
export interface SetupScreenProps {
  readonly setup: SetupState
  /**
   * Which control row is focused: `0` is the seat-count row, `1..opponents.length` are the
   * opponent rows. Drives the `›` cursor so the hero can see what ↑/↓ will move and ←/→ will edit.
   */
  readonly cursor: number
}

/** Render the setup form: a title, the seat-count row, one row per opponent seat, and the hints. */
export function SetupScreen({ setup, cursor }: SetupScreenProps): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold>Bachmann Hold'em: Table setup</Text>
      <Box marginTop={1} flexDirection="column">
        <Row focused={cursor === 0}>
          <Text>Seats: </Text>
          <Text bold>{setup.seats}</Text>
          <Text dimColor>{`  (heads-up … 6-max)`}</Text>
        </Row>
        {setup.opponents.map((kind, i) => (
          <Row key={i} focused={cursor === i + 1}>
            <Text>{`Seat ${i + 1}: `}</Text>
            <Text bold color="cyan">
              {BOT_LABELS[kind]}
            </Text>
          </Row>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>↑/↓ choose a row · ←/→ change it · Enter to play · q to quit</Text>
      </Box>
    </Box>
  )
}

/** One control row, with a `›` cursor when focused. */
function Row({
  focused,
  children,
}: {
  readonly focused: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <Box>
      <Box width={2}>
        <Text color="green">{focused ? '›' : ' '}</Text>
      </Box>
      {children}
    </Box>
  )
}
