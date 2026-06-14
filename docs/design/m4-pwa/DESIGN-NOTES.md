# M4 PWA — design reference & locked direction

Source: a Claude Design (claude.ai/design) handoff bundle the user produced before starting the
frontend. The full artefacts are preserved alongside this file:

- [`styles.css`](styles.css) — the design system + table/coach/action-bar layout. **The source of
  truth for palette, typography, spacing, radii, and component CSS.** Recreate this faithfully.
- [`app.jsx`](app.jsx) — the prototype's component structure + **seat-layout geometry**. Use it for
  _layout/markup structure_ only — see the engine caveat below.
- [`poker-table.html`](poker-table.html) — the shell (fonts, root mount).
- [`design-chat.md`](design-chat.md) — the user↔designer transcript; **where the intent lives.**

> **Critical caveat — ignore the prototype's poker brain.** `app.jsx`/`engine.js` ship a throwaway
> poker engine (its own deck, evaluator, betting state machine, Monte-Carlo equity, pot-odds bot,
> side pots). **We use none of it.** The real game runs on the already-tested `@holdem/engine` /
> `@holdem/odds` / `@holdem/bots` / `@holdem/coach` packages, driven by the shared `@holdem/session`
> reducer ([[0032-session-core-package]]). The design is a **visual + interaction** reference only:
> recreate the look and the flow, wire it to our packages.

## Locked direction (from the transcript)

The user iterated and explicitly landed on:

- **Visual style: Playful** (warm felt glow, rounded, accent-forward) — _not_ Editorial. (The CSS
  ships both as `[data-dir]`; default to `playful`.)
- **Accent: green** `#3ddc84` (`--accent: oklch(0.82 0.16 158)`), accent-ink `#06120c`.
- **Coach tone: encouraging** (the warm copy variant — see `TONE_COPY.encouraging` in `app.jsx`).
- **Table size: 2–6 max** (hero + up to 5 bots). Oval felt with seats positioned by count.
- **Coach is on-demand** — a corner **FAB** that opens a **bottom drawer**, _not_ an always-on
  panel. After the hero acts, the FAB shows a quiet ✓ / ! / · dot instead of nagging.
- **Four-color deck on by default** (♠ black, ♥ red, ♦ blue, ♣ green) — a genuine learning aid.
- **Card style: classic** default (corner rank+suit, center pip, authentic 180°-rotated bottom-right
  index); `modern` and `minimal` are alternates the CSS already supports.

Dark-first throughout (`--bg: #0d0f13`). Phone-first, `max-width: 460px` app column, responsive up to
tablet/desktop. Fonts: **Hanken Grotesk** (UI/display), **JetBrains Mono** (numbers/mono),
_Instrument Serif_ only in the unused Editorial direction.

## Component map (design → our build)

| Design piece (`app.jsx` / `styles.css`)                                                    | Maps to                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top bar: brand, `HAND # · N-MAX NL`, bank chip                                             | PWA header; hand # + seat count from the `Model`                                                                                                                           |
| `.felt` + `SEAT_LAYOUTS[count]` seat coords                                                | [[0034-pwa-table-view]] table/seat geometry (reuse the `%` coordinate tables)                                                                                              |
| `.center` pot + `.board` cards + `ResultBanner`                                            | [[0034-pwa-table-view]] (board/pot/showdown from `HandState`)                                                                                                              |
| `.pseat` (avatar, stack, BTN/SB/BB postag, acting ring, fold dim, action-flash)            | [[0034-pwa-table-view]] seat, derived from `hand.players`                                                                                                                  |
| `CardView` (classic/modern/minimal × four-color)                                           | [[0034-pwa-table-view]] `Card` component                                                                                                                                   |
| `.actionbar` (bet slider, min/½/pot/all-in, Fold/Check-Call/Bet-Raise, "Deal next hand →") | [[0035-pwa-play-loop]] action controls, gated to `legalActions`                                                                                                            |
| Setup (prototype used a "Players" tweak)                                                   | [[0035-pwa-play-loop]] real setup screen editing `SetupState` (seats + per-opp preset)                                                                                     |
| `coach-fab` + `CoachDrawer` (live read / verdict, metrics, equity bar)                     | [[0036-pwa-coach-panel]] on-demand drawer over `CoachResult`                                                                                                               |
| Tweaks panel (Players/cards/dir/accent/tone)                                               | **Design-tool harness — do NOT ship.** Bake the locked defaults in. (Card-style / four-color toggles MAY become a small settings affordance, but are not required for M4.) |

## Behaviour deltas to honour (design prototype ≠ our engine)

- **Bust = out, no auto-rebuy.** The prototype auto-rebuys a busted player to `START`; the designer
  explicitly flagged this as the user's call. Our `@holdem/session` already does **bust = out** with
  a session summary (`sessionOver`). Keep our real behaviour; the table just renders it.
- **Blinds/stacks.** Prototype uses SB/BB 5/10, stacks 1000. Our session uses 1/2 and 200
  (`@holdem/session` constants). Use **ours**; the design is unit-agnostic.
- **Bot names/seats.** Prototype names bots Mira/Chip/… Our session labels seats by preset
  (`Seat 1 (TAG)`). Either is fine cosmetically — match our `SessionPlayer.label` unless the user
  wants flavour names.
- **Live pre-decision coach read.** The drawer's "Live read · your turn" mode shows equity / pot
  odds / EV / a recommendation **before** the hero acts. Our `CoachResult` grades a chosen action
  **after** the fact (capture-before-apply). **Decided (2026-06-14): post-action verdict only for
  M4** — the pre-action read is deferred to a later `@holdem/coach` ticket. See
  [[0036-pwa-coach-panel]].
- **Encouraging copy.** The verdict prose tone is a UI concern; `@holdem/coach` yields the
  structured `DecisionVerdict`, the encouraging wording wraps it (a small formatter — keep it shared
  in `@holdem/format` if it touches numbers, else PWA-local).
