/**
 * The end-of-session summary (ticket 0029): shown once the session reaches `'game-over'` — the
 * hero busted, the hero quit, or only one player has chips left.
 *
 * Purely presentational: it reads the stable {@link SessionPlayer} list (final stacks carried by
 * the reducer) and reports who won, who busted, and the hero's final stack. No game logic — the
 * reducer decided the session was over (see `sessionOver`); this just names the outcome.
 */

import { Box, Text } from 'ink'
import { livePlayers, type SessionPlayer } from '../model.js'

/** Props for {@link Summary}: the final stable players and how many hands were played. */
export interface SummaryProps {
  readonly players: readonly SessionPlayer[]
  readonly handNumber: number
}

/** Render the session outcome headline + each player's final stack. */
export function Summary({ players, handNumber }: SummaryProps): React.JSX.Element {
  const hero = players.find((p) => p.isHero)
  const live = livePlayers(players)
  const heroBusted = hero !== undefined && hero.stack === 0
  // The headline: hero busted, hero is the lone survivor (won), or a bot is the lone survivor.
  let headline: string
  if (heroBusted) {
    headline = 'You busted. Better luck next time.'
  } else if (live.length === 1 && live[0]!.isHero) {
    headline = 'You stacked the table. Nice.'
  } else if (live.length === 1) {
    headline = `${live[0]!.label} took the table.`
  } else {
    headline = 'Session over.'
  }

  return (
    <Box flexDirection="column">
      <Text bold>── Session over ──</Text>
      <Text color={heroBusted ? 'red' : 'green'}>{headline}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{`Played ${handNumber} hand${handNumber === 1 ? '' : 's'}.`}</Text>
        {players.map((p) => (
          <Text key={p.id}>
            {`${p.label}: ${p.stack}`}
            {p.stack === 0 ? <Text dimColor>{'  (busted)'}</Text> : null}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press q to quit.</Text>
      </Box>
    </Box>
  )
}
