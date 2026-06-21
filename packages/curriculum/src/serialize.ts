/**
 * The **drill-spot report** seam — serialise a graded drill {@link Spot} (plus the {@link GradeResult}
 * the player saw) to a human-readable, reproducible JSON blob, and parse it back. The drill counterpart
 * to `@holdem/coach`'s `serializeSpot`: where that captures a *live* coach ruling, this captures a
 * *drill* spot so a learner who spots a wrong-looking verdict or a contradictory worked step can copy it
 * straight into a bug report.
 *
 * **Why this is enough to reproduce.** A drill stores no answer key — `gradeSpot` re-derives everything
 * from the {@link Spot} alone. So the spot *is* the reproducible artifact: a developer parses the blob
 * back ({@link parseDrillSpot}) and re-runs `gradeSpot(spot, chosenIndex)` to get the byte-identical
 * grade, verdict, and worked steps the learner reported — no seed or session state needed.
 *
 * Cards are rendered as the human strings the rest of the app reads (`"Ah"`, `"Td"`) via
 * {@link formatCard}, and parsed back with {@link parseCard}, so the blob is legible *and* round-trips
 * exactly. Pretty-printed at 2-space indent, like `serializeSpot`, for the same reason.
 *
 * Purity: no I/O, no DOM/clipboard (the PWA owns the copy affordance) — just string ⇆ object.
 */

import { formatCard, parseCard, type Card } from '@holdem/engine'
import type { GradeResult } from './grade.js'
import type { Spot } from './spot.js'

/** The document tag, so a parser can reject an unrelated blob pasted by mistake. */
const REPORT_KIND = 'holdem-drill-spot-report'
/** Bumped if the payload shape changes; {@link parseDrillSpot} rejects an unknown version. */
const REPORT_SCHEMA_VERSION = 1

/**
 * The reproducible bug-report payload: the spot the learner saw (cards as readable strings) and the
 * grade they received. `chosenIndex` is mirrored from the grade so a reproduction is turnkey —
 * `gradeSpot(spot, chosenIndex)`. A flat, serialisable record; no engine state.
 */
export interface DrillSpotReport {
  readonly kind: typeof REPORT_KIND
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION
  /** The graded spot, with every {@link Card} field rendered as a human string (`"Ah Td"` → `["Ah","Td"]`). */
  readonly spot: unknown
  /** The grade the player saw — including the `workedSteps` whose wording the report is most often about. */
  readonly grade: GradeResult
}

/** Render the two card-bearing shapes a {@link Spot} can carry into human strings, leaving all else as-is. */
function spotCardsToStrings(spot: Spot): Record<string, unknown> {
  const out: Record<string, unknown> = { ...spot }
  // Top-level cards (preflop / hand-reading carry the holding, hand-reading also the board).
  if ('holeCards' in spot) out.holeCards = spot.holeCards.map(formatCard)
  if ('board' in spot) out.board = spot.board.map(formatCard)
  // Context-borne cards (coach / calculation / sizing keep the deal under `context`).
  if ('context' in spot) {
    out.context = {
      ...spot.context,
      holeCards: spot.context.holeCards.map(formatCard),
      board: spot.context.board.map(formatCard),
    }
  }
  return out
}

/**
 * Serialise a graded drill spot to the pretty-printed JSON bug-report blob. Pass the {@link Spot} the
 * player answered and the {@link GradeResult} `gradeSpot` returned for it; the blob carries both, with
 * cards as readable strings, and round-trips through {@link parseDrillSpot}.
 */
export function serializeDrillSpot(spot: Spot, grade: GradeResult): string {
  const report: DrillSpotReport = {
    kind: REPORT_KIND,
    schemaVersion: REPORT_SCHEMA_VERSION,
    spot: spotCardsToStrings(spot),
    grade,
  }
  return JSON.stringify(report, null, 2)
}

/** Parse a list of card strings back to a fixed hole-card tuple, validating the count. */
function parseHoleCards(value: unknown, where: string): readonly [Card, Card] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`malformed drill report: ${where} must be two cards`)
  }
  return [parseCard(String(value[0])), parseCard(String(value[1]))]
}

/** Parse a list of card strings back to a board (any length the spot used). */
function parseBoard(value: unknown, where: string): readonly Card[] {
  if (!Array.isArray(value)) throw new Error(`malformed drill report: ${where} must be a card list`)
  return value.map((c) => parseCard(String(c)))
}

/**
 * Parse a {@link serializeDrillSpot} blob back to the `(spot, chosenIndex)` a developer re-grades with:
 * `gradeSpot(spot, chosenIndex)` reproduces the reported grade exactly. Rejects a blob that is not a
 * drill-spot report of a known schema version. The card-string fields are parsed back to {@link Card}
 * ints at the same two shapes {@link serializeDrillSpot} rendered.
 *
 * Throws on malformed input (bad JSON, wrong `kind`/`schemaVersion`, or an unparseable card), in the
 * odds/coach `parseSpot` idiom — this is a developer tool, so a clear throw beats a silent partial spot.
 */
export function parseDrillSpot(json: string): { spot: Spot; chosenIndex: number } {
  const parsed: unknown = JSON.parse(json)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('malformed drill report: not an object')
  }
  const report = parsed as Record<string, unknown>
  if (report.kind !== REPORT_KIND) {
    throw new Error(`malformed drill report: kind must be "${REPORT_KIND}"`)
  }
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new Error(`unsupported drill report schema version: ${String(report.schemaVersion)}`)
  }
  if (typeof report.spot !== 'object' || report.spot === null) {
    throw new Error('malformed drill report: missing spot')
  }
  const raw = report.spot as Record<string, unknown>
  const spot: Record<string, unknown> = { ...raw }
  if ('holeCards' in raw) spot.holeCards = parseHoleCards(raw.holeCards, 'spot.holeCards')
  if ('board' in raw) spot.board = parseBoard(raw.board, 'spot.board')
  if ('context' in raw && typeof raw.context === 'object' && raw.context !== null) {
    const ctx = raw.context as Record<string, unknown>
    spot.context = {
      ...ctx,
      holeCards: parseHoleCards(ctx.holeCards, 'spot.context.holeCards'),
      board: parseBoard(ctx.board, 'spot.context.board'),
    }
  }
  const grade = report.grade as Record<string, unknown> | undefined
  const chosenIndex = typeof grade?.chosenIndex === 'number' ? grade.chosenIndex : 0
  return { spot: spot as unknown as Spot, chosenIndex }
}
