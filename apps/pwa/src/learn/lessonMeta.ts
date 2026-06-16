/**
 * The presentation-metadata seam for the Learn path (ticket 0046).
 *
 * `@holdem/curriculum`'s {@link Lesson} is deliberately *content-only* — `{ id, title, concept,
 * explanation, spots }`. The path/recap UI wants two presentational extras that have no place in the
 * pure package: a one-line `subtitle` shown beside the title, and a one-line `teaser` describing the
 * concept on the node. Those display strings live here, in the shell, keyed by the lesson's stable
 * `id`, so the package stays framework-agnostic and the copy stays a UI concern.
 *
 * The strings are the verbatim design copy: `subtitle` from the design bundle's `curriculum.js`, and
 * `teaser` from `screens.jsx`'s `TEASER` map (concept → one-liner). The lesson *number* is purely
 * positional — its index + 1 in `FOUNDATIONS` — so it is not stored here; {@link learnLessons} stamps
 * it on while zipping the content with its meta.
 */

import { FOUNDATIONS, type Lesson } from '@holdem/curriculum'

/** The presentational extras for one lesson — display-only copy the pure package does not carry. */
export interface LessonMeta {
  /** A short qualifier shown after the title (e.g. "your share of the pot"). */
  readonly subtitle: string
  /** A one-line description of the concept, shown on the path node and the recap. */
  readonly teaser: string
  /**
   * The single take-home rule for this lesson, surfaced as the `.teach-rule` callout in the read
   * view. Only the continue-rule lesson carries one in the design; others omit it. Display-only copy,
   * so it lives here in the shell rather than in the pure curriculum package.
   */
  readonly rule?: string
  /**
   * The strength tiers, strongest first — only the ranges lesson carries them. Rendered as the
   * `.teach-tiers` breakdown in the read view so the lesson actually *names* each tier, gives example
   * hands, and says what puts a hand there (the gap the user flagged). Display-only copy, same home as
   * {@link rule}; the pure curriculum package stays content-only.
   */
  readonly tiers?: readonly TierCopy[]
}

/** One strength tier's display copy for the ranges lesson's read-view breakdown. */
export interface TierCopy {
  /** The tier name, e.g. "Premium". */
  readonly name: string
  /** A few representative hands, e.g. "AA-QQ, AK". */
  readonly hands: string
  /** What puts a hand in this tier and how to play it — one short line. */
  readonly why: string
}

/** Per-lesson display copy, keyed by `Lesson.id` (verbatim from the design bundle). */
const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  'foundations-equity': {
    subtitle: 'your share of the pot',
    teaser: 'Your share of the pot, right now.',
  },
  'foundations-pot-odds': {
    subtitle: 'the price of a call',
    teaser: 'The break-even price of a call.',
  },
  'foundations-equity-vs-price': {
    subtitle: 'equity vs price',
    teaser: 'Continue when equity beats the price.',
    rule: "Continue when your equity beats the price; fold when it doesn't.",
  },
  'foundations-ev': {
    subtitle: 'counting the decision in chips',
    teaser: 'The same decision, counted in chips.',
  },
  'foundations-position': {
    subtitle: 'acting later is an edge',
    teaser: 'Acting later lets you play more hands.',
  },
  'foundations-facing-a-raise': {
    subtitle: 'call, fold, or 3-bet',
    teaser: 'Someone raised — call, fold, or 3-bet?',
  },
  'foundations-draws': {
    subtitle: 'calling a little light',
    teaser: 'Draws can call light — implied odds.',
  },
  'foundations-ranges': {
    subtitle: 'think in strength tiers',
    teaser: 'Sort hands into strength tiers.',
    tiers: [
      {
        name: 'Premium',
        hands: 'AA, KK, QQ, AK',
        why: 'The biggest pairs and ace-king. Raise from any seat and play a big pot.',
      },
      {
        name: 'Strong',
        hands: 'JJ-TT, AQ, AJs, KQs',
        why: 'High pairs and big broadway cards that flop top pairs and dominate weaker holdings. A clear open from almost anywhere.',
      },
      {
        name: 'Playable',
        hands: 'small pairs (22-99), suited aces, suited connectors (98s)',
        why: 'Open in most seats, best in position. They miss often but make the sets, straights, and flushes that win big pots cheaply.',
      },
      {
        name: 'Marginal',
        hands: 'KJo, QTo, weak suited kings (K9s)',
        why: 'Playable only from late position, where acting last covers their weakness. Fold them up front.',
      },
      {
        name: 'Trash',
        hands: '72o, J4o, most offsuit junk',
        why: 'Too low and too disconnected to win often enough. Fold every time, no matter the seat.',
      },
    ],
  },
}

/** A safe fallback so a newly-authored lesson without copy still renders (empty extras, never throws). */
const EMPTY_META: LessonMeta = { subtitle: '', teaser: '' }

/** Look up a lesson's presentational extras by id; falls back to empty copy if none is registered. */
export function lessonMeta(lesson: Lesson): LessonMeta {
  return LESSON_META[lesson.id] ?? EMPTY_META
}

/**
 * The **head** of a lesson title — the concept name before the colon (`"Equity: your share of the
 * pot"` → `"Equity"`). The bit after the colon is the {@link LessonMeta.subtitle}, shown separately,
 * so a view that renders `head · subtitle` (the path) or `head` over `subtitle` (the read view) never
 * repeats the qualifier. Returns the whole title unchanged when there is no colon.
 */
export function lessonHead(lesson: Lesson): string {
  return lesson.title.split(':')[0] ?? lesson.title
}

/** A lesson zipped with its display copy and its 1-based position — what the Learn path renders over. */
export interface LearnLesson {
  /** The pure content lesson from `@holdem/curriculum`. */
  readonly lesson: Lesson
  /** Its 1-based number on the path (index + 1 in `FOUNDATIONS`). */
  readonly n: number
  /** The shell-owned display copy for this lesson. */
  readonly meta: LessonMeta
}

/**
 * The `FOUNDATIONS` sequence zipped with each lesson's number and presentation copy — the single list
 * the Learn path/recap iterate. Built once at module load (the curriculum is static).
 */
export const learnLessons: readonly LearnLesson[] = FOUNDATIONS.map((lesson, i) => ({
  lesson,
  n: i + 1,
  meta: lessonMeta(lesson),
}))

/** A position label + subtitle for a preflop spot's seat ring — presentation copy derived from geometry. */
export interface PositionLabel {
  /** The headline position name, e.g. "Button" / "Under the gun". */
  readonly label: string
  /** A short qualifier, e.g. "you act last". */
  readonly sub: string
}

/**
 * Derive a human position label for a preflop spot from its seat geometry — the display copy the
 * design's fixtures hand-wrote as `posLabel`/`posSub`, recreated here so it stays in step with the
 * pure {@link PreflopSpot}'s `seat`/`buttonIndex`/`numPlayers` (the package carries no display copy).
 *
 * The chart's own late-position test is "on the button or the cutoff" (`buttonIndex - 1`), so we name
 * those two seats explicitly and bucket the rest by where they sit in the betting order: first to act
 * is under the gun, the seat just before the button is the cutoff, and the small/big blinds sit after
 * the button. The subtitle leans on the same idea the position lesson teaches — acting later is the edge.
 */
export function positionLabel(
  seat: number,
  buttonIndex: number,
  numPlayers: number,
): PositionLabel {
  const cutoff = (buttonIndex - 1 + numPlayers) % numPlayers
  // Seats from the seat immediately after the button (UTG) round to the button, in betting order.
  const seatsFromUtg = (seat - (buttonIndex + 1) + numPlayers) % numPlayers
  if (seat === buttonIndex) return { label: 'Button', sub: 'you act last' }
  if (seat === cutoff) return { label: 'Cutoff', sub: 'late position' }
  if (seatsFromUtg === 0) return { label: 'Under the gun', sub: 'first to act' }
  return { label: 'Early position', sub: `${numPlayers - 1} players act after you` }
}
