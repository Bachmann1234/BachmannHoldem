/**
 * The **poker rules** reference content (the "go over the rules" section) — the prerequisites the
 * Foundations primer assumes a learner already knows. The primer's lessons teach the *mental models
 * the coach grades with* (equity, pot odds, EV, position, ranges); they do not teach what a flush beats,
 * how a hand plays from preflop to showdown, what the blinds are, or how you make a hand out of seven
 * cards. This module is that missing ground floor.
 *
 * Reference, not retrieval: unlike a {@link Lesson} (graded spots), the rules are pure expository
 * reading rendered by {@link RulesOverlay} — a sibling to the chart and shorthand glossary overlays.
 * The content is plain data here so it stays separated from presentation and is unit-testable.
 *
 * **Engine-sourced where it can drift.** The hand-ranking ladder's category names are read from
 * `@holdem/engine`'s {@link HAND_CATEGORY_NAMES} (indexed by {@link HandCategory}), so the names the
 * reference shows are byte-for-byte the ones the evaluator uses — the rules can never disagree with
 * the engine that actually decides showdowns. Example hands are parsed with the engine's
 * {@link parseCards}, so they are real {@link Card}s the {@link Card} component renders, not faked
 * glyphs.
 *
 * Copy follows the learner-tone conventions: plain English, no em dashes, and no false universals
 * (rules that are genuinely absolute — a flush always beats a straight — stay absolute; strategy-ish
 * asides stay hedged).
 */

import { HandCategory, HAND_CATEGORY_NAMES, parseCards, type Card } from '@holdem/engine'

/** One rung on the hand-ranking ladder: its name, a one-line plain description, and an example hand. */
export interface HandRank {
  /** The category name, sourced from the engine so it cannot drift from how showdowns are decided. */
  readonly name: string
  /** A one-line, plain-English description of what the hand is. */
  readonly blurb: string
  /** A real five-card example, parsed by the engine, rendered as faces by the `Card` component. */
  readonly example: readonly Card[]
}

/**
 * The ten rungs, strongest first. The Royal Flush is the one rung with no engine category of its own
 * (the evaluator treats it as the Ace-high {@link HandCategory.StraightFlush}), so it is named here;
 * every other rung's name is read from {@link HAND_CATEGORY_NAMES} so the ladder stays engine-true.
 */
const HAND_RANKS: readonly HandRank[] = [
  {
    name: 'Royal Flush',
    blurb: 'Ten through Ace, all the same suit. The best hand there is.',
    example: parseCards('Ah Kh Qh Jh Th'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.StraightFlush],
    blurb: 'Five cards in a row, all the same suit.',
    example: parseCards('9c 8c 7c 6c 5c'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.FourOfAKind],
    blurb: 'All four cards of one rank. Also called quads.',
    example: parseCards('Qs Qh Qd Qc 7d'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.FullHouse],
    blurb: 'Three of one rank plus a pair of another.',
    example: parseCards('Ks Kh Kd 9s 9c'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.Flush],
    blurb: 'Five cards of the same suit, in any order.',
    example: parseCards('As Js 9s 6s 3s'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.Straight],
    blurb: 'Five cards in a row of mixed suits.',
    example: parseCards('9d 8s 7h 6c 5d'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.ThreeOfAKind],
    blurb: 'Three cards of the same rank. Also called trips or a set.',
    example: parseCards('8s 8h 8d Kc 4d'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.TwoPair],
    blurb: 'Two cards of one rank and two of another.',
    example: parseCards('Js Jh 4s 4d Ah'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.Pair],
    blurb: 'Two cards of the same rank.',
    example: parseCards('Ts Th 9c 5d 2s'),
  },
  {
    name: HAND_CATEGORY_NAMES[HandCategory.HighCard],
    blurb: 'No pair, no better. Your highest card plays.',
    example: parseCards('As Qd 9h 6c 2s'),
  },
]

/** One block of a rules topic — the discriminated shapes {@link RulesOverlay} knows how to render. */
export type RulesBlock =
  /** A plain paragraph of prose. */
  | { readonly kind: 'p'; readonly text: string }
  /** An ordered list of labelled points (a flow like the streets, or the named seats). */
  | {
      readonly kind: 'steps'
      readonly items: readonly { readonly label: string; readonly text: string }[]
    }
  /** The hand-ranking ladder — rendered with example card faces, strongest first. */
  | { readonly kind: 'ranks'; readonly items: readonly HandRank[] }

/** One topic in the rules reference: a short tab label, a heading, a lead-in, and ordered blocks. */
export interface RulesTopic {
  /** Stable id for the jump tab and test hooks. */
  readonly id: string
  /** The short label on the jump-tab strip. */
  readonly tab: string
  /** The section heading. */
  readonly title: string
  /** A one-line lead-in under the heading. */
  readonly intro: string
  /** The ordered content blocks. */
  readonly blocks: readonly RulesBlock[]
}

/**
 * The four rules topics, in reading order. Hand rankings come first because every later topic (who
 * wins at showdown, why position matters) leans on knowing which hand beats which.
 */
export const RULES_TOPICS: readonly RulesTopic[] = [
  {
    id: 'rankings',
    tab: 'Rankings',
    title: 'Hand rankings',
    intro: 'Every hand is five cards. Higher on this ladder beats lower, every time.',
    blocks: [
      {
        kind: 'p',
        text: 'Texas Hold’em uses the standard poker ladder. When two hands reach showdown, the one higher on this list wins. If both make the same kind of hand, the higher cards in it break the tie.',
      },
      { kind: 'ranks', items: HAND_RANKS },
      {
        kind: 'p',
        text: 'Suits never rank against each other: a flush in spades and a flush in hearts are equal until you compare their card values.',
      },
    ],
  },
  {
    id: 'flow',
    tab: 'The hand',
    title: 'How a hand plays out',
    intro: 'Four betting rounds, dealt one stage at a time, then a showdown.',
    blocks: [
      {
        kind: 'p',
        text: 'You are dealt two private cards. Five shared community cards then arrive in stages, with a round of betting after each stage. You build your best five-card hand from your two cards and the five on the board.',
      },
      {
        kind: 'steps',
        items: [
          {
            label: 'Preflop',
            text: 'You have your two hole cards and nothing is on the board yet. The first round of betting happens.',
          },
          {
            label: 'Flop',
            text: 'Three community cards are dealt face up at once. Another round of betting.',
          },
          {
            label: 'Turn',
            text: 'A fourth community card is dealt. Another round of betting.',
          },
          {
            label: 'River',
            text: 'The fifth and final community card is dealt. The last round of betting.',
          },
          {
            label: 'Showdown',
            text: 'If two or more players remain, hands are revealed and the best five-card hand wins the pot.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'On your turn you choose one action. If no one has bet, you can check (pass with no chips) or bet. If someone has bet, you can fold (give up the hand), call (match the bet), or raise (put in more). A hand ends early the moment everyone but one player folds.',
      },
    ],
  },
  {
    id: 'position',
    tab: 'Blinds & position',
    title: 'Blinds and position',
    intro: 'Forced bets start the pot, and where you sit decides when you act.',
    blocks: [
      {
        kind: 'p',
        text: 'Each hand, two players post forced bets called blinds so there is always something to play for. A dealer button marks who is "on the button," and it moves one seat to the left after every hand, so everyone takes a turn in each position.',
      },
      {
        kind: 'steps',
        items: [
          {
            label: 'Button (BTN)',
            text: 'The dealer marker. After the flop this player acts last, which is the best seat at the table.',
          },
          {
            label: 'Small blind (SB)',
            text: 'The seat to the button’s left. Posts the smaller forced bet before the cards are dealt.',
          },
          {
            label: 'Big blind (BB)',
            text: 'Next seat along. Posts the larger forced bet, and acts last in the preflop round.',
          },
        ],
      },
      {
        kind: 'p',
        text: 'Acting later is an edge: you see what everyone else does before you decide. That is why seats near the button are called late position and the first players to act are called early position. The Position lesson builds on this idea.',
      },
    ],
  },
  {
    id: 'showdown',
    tab: 'Showdown',
    title: 'Making your hand and showdown',
    intro: 'Your best five out of seven, and how the pot is awarded.',
    blocks: [
      {
        kind: 'p',
        text: 'At the river you can see seven cards: your two hole cards and the five community cards. Your hand is the best five-card combination you can make from those seven. The other two cards simply do not count.',
      },
      {
        kind: 'p',
        text: 'You are free to use both hole cards, one, or even none of them. If the five community cards already make the best hand for everyone, the players left split the pot evenly.',
      },
      {
        kind: 'p',
        text: 'When betting on the river is done and more than one player remains, it is showdown. The last player to bet or raise shows first, then the rest reveal or fold. The highest hand on the rankings ladder takes the pot, and equal hands chop it.',
      },
    ],
  },
]
