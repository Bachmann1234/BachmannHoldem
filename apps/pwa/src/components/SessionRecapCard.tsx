/**
 * The end-of-session recap card (ticket 0110) — the visible payoff of the M9 epic
 * ([[0107-end-of-session-coach-synthesis]]). When a play session ends, the coach looks back over the
 * hands just played and gives **one synthesized read** — _"looking over your hands tonight, here's the
 * thing to work on"_ — anchored to the specific spots that earned it. This component renders that read
 * on the `game-over` screen, beside the standings, so it reads as the same coach voice that graded the
 * hands live.
 *
 * **Pure render of an owned structure — NO synthesis here.** All the analysis is done in
 * `@holdem/coach`'s `synthesizeSession` ([[0109-coach-session-synthesis]]); the App computes the
 * {@link SessionRecap} and hands it in. This component only lays out the owned structure: the
 * deterministic top-level `headline` and each takeaway's deterministic `line` — which already names its
 * anchored exemplar hands inline ("…in hands #7 and #14"), so rendering the line renders the anchors.
 * It computes nothing — no equity, pot-odds, EV, or copy — it renders the `line`s the recap already
 * carries. (Mirrors {@link CoachDrawer}'s "presentational only" discipline.) The structured
 * `takeaway.exemplars` stay on the recap as data for other consumers (a future narration layer); this
 * screen does not re-render them as separate chips because the line already states the same hands.
 *
 * **Three honest branches, distinct visual treatments** (the `SessionRecap.status` discriminant):
 * - `'has-takeaways'` — the leak / `!` treatment ("what to work on"): the headline, then each
 *   prioritized takeaway with its `line` and the hand-anchored exemplars.
 * - `'clean'` — the good / `✓` treatment: the positive headline, never a manufactured criticism.
 * - `'too-few'` — the neutral / `~` treatment: the honest low-sample headline, no takeaways.
 *
 * It reuses the live coach surface's visual language (the `.verdict` badge + headline block, the
 * good/leak/neutral tone classes, the `.coach-note` copy idiom) so the recap reads as the same coach,
 * not a new screen — only the small set of `recap-*` classes that have no coach analog are new.
 *
 * **Works fully offline, zero config** — it renders the deterministic `line`s only; the optional LLM
 * narration ([[0011-llm-coaching]]) is out of scope. The seam is clean: this takes a `SessionRecap` and
 * renders its lines, so a future narration layer can pass reworded lines through the same shape with no
 * restructuring.
 */

import type { SessionRecap } from '@holdem/coach'

/** The tone class + badge glyph for one recap status — reuses the live coach's good/leak/neutral
 * visual language ({@link CoachDrawer}'s `verdictTone`) so the recap reads as the same coach voice. */
function statusTone(status: SessionRecap['status']): {
  readonly cls: string
  readonly badge: string
} {
  switch (status) {
    // The thing to work on — the live coach's leak treatment.
    case 'has-takeaways':
      return { cls: 'leak', badge: '!' }
    // A clean session — the live coach's good treatment; never a manufactured criticism.
    case 'clean':
      return { cls: 'good', badge: '✓' }
    // Too few hands to call a pattern — the neutral treatment, honest about the thin sample.
    case 'too-few':
      return { cls: 'neutral', badge: '~' }
  }
}

/** Props for {@link SessionRecapCard}. */
export interface SessionRecapCardProps {
  /**
   * The structured end-of-session synthesis to render — already folded by `@holdem/coach`'s
   * `synthesizeSession` (the App computes it from `model.gradedDecisions`). This component renders its
   * owned `headline` / takeaway `line`s / exemplar `line`s verbatim and adds no logic of its own.
   */
  readonly recap: SessionRecap
}

/**
 * Render the {@link SessionRecap} as a coach-voiced card on the `game-over` screen. Presentational
 * only: it switches on `recap.status` for the tone and lays out the recap's own deterministic lines.
 */
export function SessionRecapCard({ recap }: SessionRecapCardProps): React.JSX.Element {
  const tone = statusTone(recap.status)
  return (
    <div className="recap" data-testid="session-recap" data-status={recap.status}>
      <div className={`verdict ${tone.cls}`} data-testid="recap-verdict">
        <div className="verdict-badge">{tone.badge}</div>
        <div className="verdict-body">
          <h4>Coach&apos;s session read</h4>
          <p data-testid="recap-headline">{recap.headline}</p>
        </div>
      </div>

      {recap.takeaways.length > 0 ? (
        <div className="recap-takeaways" data-testid="recap-takeaways">
          {recap.takeaways.map((takeaway) => (
            <div className="recap-takeaway" key={takeaway.theme} data-testid="recap-takeaway">
              {/* The deterministic line already names the anchored hands inline (see file doc), so
                  there are no separate exemplar chips to repeat them. */}
              <div className="recap-takeaway-line">{takeaway.line}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
