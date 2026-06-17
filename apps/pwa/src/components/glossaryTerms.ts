/**
 * The shared **hand-strength term registry** (ticket 0064) — the single source of truth for the
 * plain-English poker vocabulary the app leans on (nuts, kicker, dominated, set, suited connector).
 *
 * Both consumers read this one map, so a term can never carry two definitions that drift apart:
 * - the chart's grade explanation ({@link GlossaryText}) renders these ids as tappable links, and
 * - {@link GlossaryOverlay}'s "Hand strength" section is built from this list.
 *
 * Keyed by `@holdem/coach`'s {@link GradeTermId} so the type system guarantees every term an
 * explanation can reference has a definition here (a missing id is a compile error). The coach owns
 * the *vocabulary* (which ids exist); this owns the *on-screen copy*.
 */

import type { GradeTermId } from '@holdem/coach'

/** A glossary term's display heading and its plain-English meaning. */
export interface GlossaryTerm {
  /** The heading as it reads in the glossary, e.g. `"Suited connector"`. */
  readonly term: string
  /** Its plain-English meaning. */
  readonly meaning: string
}

/**
 * Every hand-strength term, keyed by its stable id. `Record<GradeTermId, …>` makes this exhaustive:
 * adding a term to {@link GradeTermId} without copy here fails the build.
 */
export const GLOSSARY_TERMS: Readonly<Record<GradeTermId, GlossaryTerm>> = {
  nuts: {
    term: 'Nuts',
    meaning:
      'The best possible hand right now; nobody can beat it. An ace-high flush, for instance, is the nut flush: no other flush tops it.',
  },
  kicker: {
    term: 'Kicker',
    meaning:
      'Your unused side card. When two players pair the same card, the higher kicker wins, so a weak kicker is what makes a hand like K9 risky.',
  },
  dominated: {
    term: 'Dominated',
    meaning:
      'A hand that looks similar to a stronger one but loses the big pots. K9 is dominated by A9: both pair the nine, but K9 is out-kicked every time.',
  },
  set: {
    term: 'Set',
    meaning:
      'Three of a kind made with a pocket pair: your two matching cards plus a third on the board. Well disguised and very strong; it is what small pairs chase.',
  },
  'suited-connector': {
    term: 'Suited connector',
    meaning:
      'Two cards in a row of the same suit, like 9♥8♥. It rarely makes a big pair but makes straights and flushes: speculative hands that can win a large pot.',
  },
}

/**
 * The terms in display order for the glossary's "Hand strength" section — strongest concept first.
 * A `GradeTermId[]`, so it stays in lock-step with {@link GLOSSARY_TERMS}.
 */
export const HAND_STRENGTH_TERM_ORDER: readonly GradeTermId[] = [
  'nuts',
  'kicker',
  'dominated',
  'set',
  'suited-connector',
]
