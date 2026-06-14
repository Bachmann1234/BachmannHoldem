# M4.5 Foundations primer — design notes & locked direction

Companion to the M4 bundle (`m4-pwa/DESIGN-NOTES.md`). This is the design pass the
[brief](../m4.5-foundations-primer-brief.md) requested: a **visual + interaction** spec for the
"Learn the fundamentals" path, decided up front. Tickets
[`0046`](../../../tickets/0046-pwa-learn-nav.md) →
[`0047`](../../../tickets/0047-pwa-lesson-player.md) →
[`0048`](../../../tickets/0048-pwa-lesson-progress.md) wire these mockups to `@holdem/curriculum`.

## Artefacts in this bundle

- **`Foundations Primer.html`** — the deliverable. A design canvas with: a **playable** interactive
  prototype of the whole loop, the three **§5.1 navigation** patterns, the **§5.2 learn-path** states,
  and every **§5.3 lesson-player** state (read / ask×2 / graded-right / graded-leak / preflop / end).
  Open it and pan; double-click any artboard to focus it (←/→/Esc).
- **`primer.css`** — all NEW component CSS, in the existing token system. Extends `styles.css`; new
  classes slot beside the `.verdict` / `.metric` / `.drawer` family. **No forked palette or fonts.**
- **`styles.css`** — the locked M4 system, copied verbatim (source of truth; do not edit here).
- **`curriculum.js`** — a faithful port of `@holdem/curriculum/src/foundations.ts` (lesson copy,
  prompts, choices, correct answers) + a `gradeSpot` that mirrors `grade.ts` + `@holdem/format`. Used
  only to drive the mockup; **the build renders the real package, not this.**
- **`components.jsx` / `screens.jsx` / `primer-app.jsx` / `canvas.jsx`** — the prototype source
  (markup/layout reference, same status as M4's `app.jsx`).

> **Same engine caveat as M4.** The throwaway grader in `curriculum.js` is a design fixture. The
> shipped app renders `@holdem/curriculum`'s `gradeSpot` output (`coachDecision` / `gradePreflop`).
> The displayed equity / EV are the engine's real tuned reference values (the spots were tuned until
> the coach returns the verdict the lesson teaches — `foundations.test.ts` pins them); price is exact
> arithmetic. Wire to live values; don't hard-code these.

---

## Locked direction

Carried forward from M4 **exactly** — the primer is an extension, not a new app:

- **Playful**, dark-first (`--bg #0d0f13`, surfaces `#161922`/`#1d212c`), rounded
  (`--radius-panel: 24px`), accent-forward. Phone-first, **460px** app column.
- **Accent green** `oklch(0.82 0.16 158)` (`#3ddc84`), `--accent-ink #06120c`.
- **Verdict palette** `--good` / `--bad` with `-soft` fills; **four-colour deck** (♠ black, ♥ red,
  ♦ blue, ♣ green) — the same learning aid as the table.
- **Hanken Grotesk** (UI/display) + **JetBrains Mono** (numbers).
- **Encouraging tone.** The deterministic `DecisionVerdict` is wrapped in warm copy — "Nice — that's
  exactly right." / "Close one — not quite." Never "WRONG"; a leak always shows the correct line and
  a "you'll catch it next time" framing.

---

## §5 open questions — decisions & rationale

### 5.1 Navigation → **Bottom tab bar (Play / Learn / Drills)** ✦ recommended
Three patterns are mocked (canvas section *Navigation*); we recommend **A, the persistent bottom tab
bar**. Rationale: it is phone-native, keeps Learn one tap from anywhere (the brief's core need — there
is no nav today), and it is the only pattern that scales to the **third destination (Drills, M5)**
without a redesign — Drills ships now as a visible-but-locked `Soon` tab, so the information
architecture is already correct. B (home hub) adds a navigation layer to every session; C (play-first
+ dismissable Learn rail) is the least disruptive to today's boot-into-setup but buries Learn and
doesn't scale. **Boot still lands on Play**; the tab bar just makes Learn reachable.

### 5.2 List vs. path → **light game-like vertical path**
A vertical path with medallion nodes on an accent spine: **done ✓** (filled), **current** (ringed,
gently pulsing, carries the *Start/Resume here* tag), **locked** (dim, lock glyph). The spine fills
with accent up to the current node. It reads as progress at a glance and makes the sequential nature
of the curriculum legible, while staying *light* — six nodes, no mascots, no XP. A header progress
meter (`n / 6`) and a sticky **Resume** CTA make "pick up where you left off" a single tap.

### 5.3 Coach-graded result → **slim, sibling-to-the-coach-drawer**
The graded result is a **slide-up drawer** reusing the table's `.drawer` / `.verdict` /
`.verdict-badge` / `.eq-bar` — so a graded lesson check and a graded hand are unmistakably siblings —
but with a **slim inline metric row** (`.metric-inline` ×3: equity / pot-odds price / EV-of-call)
instead of the full 3-card `.metrics` grid. Preflop (chart-graded) checks drop the metric row
entirely and show just badge + headline + the chart rationale, exactly like the coach drawer's
preflop mode. A free-check (the equity lesson) shows equity only, price/EV as `—`.

### 5.4 Progress + resume
On-device only (no accounts). Completion state lives on each path node; the **current node** is the
resume point (ringed + pulsing + tag), mirrored by the sticky bottom **Resume · {lesson}** CTA. The
header meter shows `n / 6`. (Prototype persists to `localStorage['primer-progress-v1']`; the build
uses ticket 0048's on-device store.)

### 5.5 End-of-primer hand-off
A warm, restrained celebration: a medal, "You've got the fundamentals.", a **recap** of all six ideas
(checked, with concept tags), then the hand-off — a primary **Play a hand →** CTA and a forward nod to
**Drills — coming soon (M5)**. No confetti storm; encouraging, not loud.

---

## The lesson loop

```
[Read · the ~30s teach]  →  [Ask · prompt + cards/seat + 2 answer buttons]
   → player picks  →  [Graded · drawer: ✓/! + encouraging headline + the line + (postflop) metrics]
   → Next check / Back to path / Finish
```

- **Postflop (coach-graded)** spots render a mini-felt: pot, board + hero hand in the four-colour
  deck (reuse the table's card), and a *To call* chip. Answers: **Call / Fold**.
- **Preflop (chart-graded)** spots render a mini **seat ring** (hero highlighted, button marked) +
  hero hand. Answers: **Open (raise) / Fold**. No equity/EV — chart rationale only.
- The chosen answer locks; the **correct** choice lights green, a wrong pick lights red, then the
  drawer slides up over it.

---

## Design → build component map

| Design piece (this bundle) | Maps to | Ticket |
| --- | --- | --- |
| `TabBar` (Play / Learn / Drills, Drills locked) | top-level PWA nav shell | [0046](../../../tickets/0046-pwa-learn-nav.md) |
| `HubHome` / `PlayRailHome` | alternates — **not shipped** (kept for the record) | 0046 |
| `LearnPath` (spine, medallion `.node-row` done/current/locked, `.progress-meter`, `.resume-cta`) | the Learn lesson list/map over `FOUNDATIONS` + on-device progress | [0046](../../../tickets/0046-pwa-learn-nav.md) / [0048](../../../tickets/0048-pwa-lesson-progress.md) |
| `ReadView` (`.teach`, `.teach-rule`, `.lesson-steps`, `.concept-tag`) | lesson teach state; copy from `Lesson.explanation` | [0047](../../../tickets/0047-pwa-lesson-player.md) |
| `AskView` + `SpotView` (`.spot-felt` postflop / `.spot-pre` + `SeatRing` preflop, `.answer` buttons) | the check; renders a `Spot`'s prompt/choices, cards via the table's `Card` | [0047](../../../tickets/0047-pwa-lesson-player.md) |
| `ResultSheet` (`.drawer` + `.verdict` + slim `.metric-inline` row + `.eq-bar`) | graded result over `GradeResult` / `SpotVerdict`; encouraging formatter wraps it | [0047](../../../tickets/0047-pwa-lesson-player.md) |
| `EndOfPrimer` (`.endprimer`, `.recap`, CTA) | completion + hand-off to Play (and Drills nod) | [0047](../../../tickets/0047-pwa-lesson-player.md) / [0048](../../../tickets/0048-pwa-lesson-progress.md) |
| `curriculum.js` `gradeSpot` + `pct`/`signedChips` | **do not ship** — render `@holdem/curriculum` `gradeSpot` + `@holdem/format` | 0047 |
| Encouraging headline copy (`HEAD_RIGHT`/`HEAD_WRONG`, "math points to …") | a small PWA-local (or `@holdem/format`) formatter over the verdict | 0047 |

## Behaviour deltas to honour

- **Numbers are live, not stored.** Display equity / pot-odds / EV come from `@holdem/coach` at
  render; the figures in `curriculum.js` are reference values for the mockup only.
- **Tone wraps the verdict.** `@holdem/coach` yields the structured verdict + `concept`; the warm
  wording is a UI concern. Keep the verdict math in the engine, the encouragement in the formatter.
- **Free check & preflop have no EV cards.** The equity lesson (free check) shows equity only;
  position/ranges (chart-graded) show rationale only — match the coach drawer's preflop mode.
- **Sequential + resume.** Lessons unlock in order; the current node is the single resume point.
