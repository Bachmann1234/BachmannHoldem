/**
 * A single playing card rendered as DOM (ticket 0034) — the browser analog of the TUI's
 * `Card`, recreating the design's **classic** four-color card from `docs/design/m4-pwa`.
 *
 * Purely presentational: it takes a `Card` (the engine's opaque 0..51 brand) and renders the
 * classic face — corner rank+suit (top-left + 180°-rotated bottom-right) and a centre pip — in the
 * four-color deck. Colour and glyph are both derived from {@link suitOf} (the suit LETTER), never
 * from a raw suit index: our `SUITS = ['c','d','h','s']` does NOT line up with the design's
 * spade-first ordering, so mapping by index would mis-colour every card.
 *
 * A face-down {@link HiddenCard} covers concealed opponent cards. The reveal *decision* (which
 * cards are face-up) lives one level up in {@link Seat}; this component just draws the face it's
 * told to. The only engine calls are the pure read helpers `rankOf` / `suitOf`.
 */

import { rankOf, suitOf, type Card as EngineCard, type Suit } from '@holdem/engine'

/** Card render size — hero hole cards `lg`, board `md`, opponent holes `sm` (per the CSS). */
export type CardSize = 'sm' | 'md' | 'lg'

/** Map our suit LETTER to the design's CSS suit class (drives the four-color ink). */
export const SUIT_CLASS: Readonly<Record<Suit, string>> = {
  c: 'suit-club', // green
  d: 'suit-diamond', // blue
  h: 'suit-heart', // red
  s: 'suit-spade', // black
}

/** Map our suit LETTER to its glyph. */
export const SUIT_GLYPH: Readonly<Record<Suit, string>> = {
  c: '♣', // ♣
  d: '♦', // ♦
  h: '♥', // ♥
  s: '♠', // ♠
}

/** Props for {@link Card}. */
export interface CardProps {
  readonly card: EngineCard
  readonly size?: CardSize
  /** Highlight as part of the winning hand at showdown. */
  readonly winning?: boolean
  /** Dim/muck a folded player's card. */
  readonly muck?: boolean
}

/** Render one face-up card in the classic four-color style. */
export function Card({ card, size = 'md', winning, muck }: CardProps): React.JSX.Element {
  const suit = suitOf(card)
  const rank = rankOf(card)
  // On a real card face the ten reads "10", not the "T" notation shorthand (`T` stays in hand
  // notation / the coach text, e.g. "T9s"). Only the displayed label changes; `data-card` keeps the
  // canonical single-char rank so tests/selectors are stable.
  const label = rank === 'T' ? '10' : rank
  const glyph = SUIT_GLYPH[suit]
  const cls = [
    'card',
    SUIT_CLASS[suit],
    size,
    'cs-classic',
    winning ? 'winning' : '',
    muck ? 'muck' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} data-testid="card" data-card={`${rank}${suit}`}>
      <div className="corner tl">
        <span className="r">{label}</span>
        <span className="s">{glyph}</span>
      </div>
      <div className="pip">{glyph}</div>
      <div className="corner br">
        <span className="r">{label}</span>
        <span className="s">{glyph}</span>
      </div>
    </div>
  )
}

/** Props for {@link HiddenCard}: a face-down card. */
export interface HiddenCardProps {
  readonly size?: CardSize
  /** Dim/muck a folded player's face-down card. */
  readonly muck?: boolean
}

/** Render a single face-down card — the concealment used for opponents before showdown. */
export function HiddenCard({ size = 'md', muck }: HiddenCardProps): React.JSX.Element {
  const cls = ['card', 'back', size, muck ? 'muck' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} data-testid="card-back">
      <div className="back-mark">{'♣'}</div>
    </div>
  )
}

/** Props for {@link CardPair}: a player's two hole cards and whether they are revealed. */
export interface CardPairProps {
  readonly cards: readonly [EngineCard, EngineCard]
  readonly reveal: boolean
  readonly size?: CardSize
  /** Folded player — render the cards mucked (dimmed). */
  readonly muck?: boolean
  /** Highlight both cards as winning at showdown. */
  readonly winning?: boolean
}

/** Render a pair of hole cards — face-up (each four-color) when `reveal`, else face-down. */
export function CardPair({
  cards,
  reveal,
  size = 'md',
  muck,
  winning,
}: CardPairProps): React.JSX.Element {
  return (
    <div className="pseat-cards">
      {reveal ? (
        cards.map((card, i) => (
          <Card key={i} card={card} size={size} muck={muck} winning={winning} />
        ))
      ) : (
        <>
          <HiddenCard size={size} muck={muck} />
          <HiddenCard size={size} muck={muck} />
        </>
      )}
    </div>
  )
}
