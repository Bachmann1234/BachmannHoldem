/**
 * A single playing card rendered as an Ink `<Text>` (ticket 0026).
 *
 * Purely presentational: it takes a `Card` (the engine's opaque 0..51 brand) and renders
 * {@link formatCard}'s two-character label (e.g. `As`, `Th`) coloured by suit. The colour is
 * derived from {@link suitOf} — hearts and diamonds are red, clubs and spades the default
 * terminal colour — rather than string-slicing the label, so the encoding stays the single
 * source of truth. A face-down rendering ({@link HiddenCard}) covers concealed opponent cards.
 *
 * There is no game logic here: the only `@holdem/engine` calls are the pure read helpers
 * `formatCard`/`suitOf`. The reveal *decision* (which cards are face-up) lives one level up in
 * {@link Seat}; this component just draws whichever face it is told to.
 */

import { Text } from 'ink'
import { formatCard, suitOf, type Card as EngineCard } from '@holdem/engine'

/** The face-down glyph used for any concealed card (opponents before showdown). */
export const HIDDEN_CARD = '??'

/** Props for {@link Card}: the single card to render. */
export interface CardProps {
  readonly card: EngineCard
}

/**
 * The Ink colour for a card's suit, or `undefined` for the terminal default. Red suits
 * (hearts/diamonds) read as `'red'`; black suits (clubs/spades) get no colour override so they
 * use whatever the terminal's default foreground is. Derived from {@link suitOf}, never from the
 * formatted string.
 */
export function suitColor(card: EngineCard): 'red' | undefined {
  const suit = suitOf(card)
  return suit === 'h' || suit === 'd' ? 'red' : undefined
}

/** Render one face-up card, coloured by its suit. */
export function Card({ card }: CardProps): React.JSX.Element {
  return <Text color={suitColor(card)}>{formatCard(card)}</Text>
}

/** Render a single face-down card — the concealment used for opponents before showdown. */
export function HiddenCard(): React.JSX.Element {
  return <Text dimColor>{HIDDEN_CARD}</Text>
}

/** Props for {@link CardPair}: a player's two cards, plus whether they are revealed. */
export interface CardPairProps {
  readonly cards: readonly [EngineCard, EngineCard]
  readonly reveal: boolean
}

/**
 * Render a pair of hole cards as a single inline `<Text>` — face-up (each coloured by suit) when
 * `reveal`, two face-down cards otherwise. Composed entirely of nested `<Text>` (no `<Box>`), so a
 * literal separating space is a valid child (a bare string is only illegal directly under a Box).
 */
export function CardPair({ cards, reveal }: CardPairProps): React.JSX.Element {
  if (!reveal) {
    return (
      <Text>
        <HiddenCard /> <HiddenCard />
      </Text>
    )
  }
  return (
    <Text>
      <Card card={cards[0]} /> <Card card={cards[1]} />
    </Text>
  )
}
