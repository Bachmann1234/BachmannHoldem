# Design foundations primer brief

_Started 2026-06-14 20:46 UTC_

---

## User

Please read docs/design/m4.5-foundations-primer-brief.md  in the attached repo for the design brief

## Assistant

_[tool: local_read]_

I've read the brief. This is a design pass for the "Foundations primer" — extending the existing M4 PWA design system. Let me explore the locked design system before doing anything else.

_[tool: local_ls]_

I see the M4 PWA design bundle. Let me read all the key source files.

_[tool: local_read]_

_[tool: local_read]_

Let me read the rest of styles.css (the metric/eq-bar/coach-note components) and the app.jsx for component structure.

_[tool: local_read]_

Now let me read the app.jsx to understand the component structure, especially the CoachDrawer, Card, and verdict components.

_[tool: local_read]_

Let me check the HTML shell for font loading and mount structure.

_[tool: local_read]_

I have a deep understanding of the locked M4 design system. Let me check if the actual curriculum lesson data exists in the repo so I render real copy.

_[tool: local_grep]_

_[tool: local_ls]_

The actual curriculum data exists. This is the source of truth for the lesson copy. Let me read it in full.

_[tool: local_read]_

I have the real lesson data. Let me check the spot/lesson types and the coach verdict to understand the graded-result data shape and feedback strings.

_[tool: local_ls]_

_[tool: local_read]_

Now let me read the grade.ts and the coach verdict module to understand the graded-result shape (verdict kind, metrics, explanation strings) so my graded states use real engine output.

_[tool: local_read]_

I need the actual graded numbers (equity, pot-odds, EV) for each spot. The test file proves them. Let me read it plus the verdict/format helpers.

_[tool: local_read]_

Let me check the verdict.ts for VERDICT_LABEL, the rationale strings (preflop), and the format helpers. These give me the exact graded-result copy.

_[tool: grep]_

_[tool: local_grep]_

_[tool: local_grep]_

_[tool: local_read]_

_[tool: local_read]_

I need the preflop chart rationale strings for the position/ranges graded results. Let me find them.

_[tool: local_grep]_

_[tool: local_read]_

_[tool: local_read]_

I now have the complete picture: the locked M4 design system (tokens, components, the coach drawer family), and — crucially — the **real curriculum data** in `packages/curriculum/src/foundations.ts`, with the actual lesson copy, prompts, choices, correct answers, and the exact graded-result strings the engine produces. I won't invent any of it.

The brief explicitly delegates the §5 open questions to me ("please decide and note your rationale"), and the Interactive-prototype skill is attached. Before I build, a few focused forks genuinely benefit from your steer — everything else I'll decide and document.

_[tool: questions_v2]_

## User

Questions timed out; go with defaults

## Assistant



## User

ask the questions again

## Assistant

I'll ask again — the form should appear in your preview pane now.

_[tool: questions_v2]_

## User

Questions answered:
- deliverable_form: One clickable interactive prototype (the real lesson loop you can play through) + annotations
- nav_pattern: Explore a few options
- list_vs_path: Game-like vertical path/map (Duolingo-ish, kept light)
- result_layout: A slimmer lesson-specific result that still feels related
- variation_appetite: Give 2-3 variations of the open questions, side by side, to pick from
- lesson_scope: Two representative lessons (one postflop coach-graded, one preflop chart-graded) wired; rest shown as states

## Assistant

Answers received. Here's my read:

- **Clickable interactive prototype** of the real loop + annotations
- **Nav: explore a few options** → I'll show 2–3 patterns side by side
- **Learn = game-like vertical path** (kept light)
- **Result = slimmer, sibling-to-coach-drawer** (not the full metric treatment)
- **2–3 variations** of the open questions, side by side
- **Two lessons fully wired**: the Continue Rule (postflop, coach-graded) + Position (preflop, chart-graded) — the two grading modes; rest as states

Let me lay out the plan and start pulling in the locked system.

_[tool: update_todos]_

_[tool: local_copy_to_project]_

_[tool: copy_starter_component]_

Let me read the design canvas source to understand its API precisely.

_[tool: read_file]_

The design canvas API is clear. Now I have everything: the locked tokens, the coach-drawer component family, and the real curriculum data + graded-result strings. Let me commit to the system and build.

**System for the primer (extension, not a new app):** dark-first playful — `--bg #0d0f13`, accent green, `--radius-panel: 24px`, Hanken Grotesk + JetBrains Mono. The graded result is a **slide-up drawer reusing the `.drawer`/`.verdict` family** (sibling to the table's coach drawer) but with a **slim inline metric row** instead of the big 3-card grid. Encouraging tone wraps the deterministic verdict. Learn = a light vertical path/map. Nav = 3 explored patterns.

Let me start with the real curriculum data ported into plain JS.

_[tool: write_file]_

Now `primer.css` — new components in the locked token system, slotting beside `.verdict`/`.metric`/`.drawer`.

_[tool: write_file]_

Now the shared primitives — `components.jsx` (Card, icons, status bar, seat ring, metric bits). I'll export everything to `window` for cross-script use.

_[tool: write_file]_

Now the screens — `screens.jsx`. These are controlled presentational components reused by both the interactive app and the static state artboards.

_[tool: write_file]_

Now the stateful interactive app — `primer-app.jsx` — orchestrating the full loop, plus the two alternate nav screens (hub, play-rail) for the §5.1 comparison.

_[tool: write_file]_

Now the canvas composition and HTML shell. First `canvas.jsx` — lays out the interactive phone plus all the static state frames and nav variations.

_[tool: write_file]_

Now the HTML shell — fonts, React/Babel pinned, all scripts in order, `data-dir="playful"` on body.

_[tool: write_file]_

Let me render and check it loads cleanly.

_[tool: show_html]_

I'll proceed with the screenshot to verify before handing off.

_[tool: show_html]_

Canvas background renders but no artboards — likely a script error or the viewport is panned away. Let me check logs.

_[tool: get_webview_logs]_

Found it: spots don't carry a `concept` field (it's on the lesson). I'll propagate it at load time.

_[tool: str_replace_edit]_

_[tool: show_html]_

It works. The interactive path looks polished. One nit: the "Resume here" tag wraps. Let me fix that and verify the other sections render. First the CSS fix:

_[tool: str_replace_edit]_

Now let me drive the interactive loop to verify read → ask → graded, and check the other sections.

_[tool: multi_screenshot]_

The full loop works — read, ask (four-color cards rendering correctly), and the graded drawer with the slim metric row. Two text nits to fix: the drawer title's `\u00b7` printed literally (bare JSX text isn't an escape), and the concept tag wraps. Let me fix both.

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now let me verify the static frames (nav, path, player states) render. I'll zoom the canvas out to see the whole composition.

_[tool: eval_js]_

_[tool: show_html]_

The viewport restore is fighting the host. Let me drive the canvas zoom directly via its message handler, then screenshot.

_[tool: eval_js]_

_[tool: screenshot]_

Structure is sound — interactive phone, then Nav A/B/C. Let me pan down to inspect the nav row, learn-path states, and player states. I'll set the world transform directly.

_[tool: eval_js]_

_[tool: screenshot]_

Nav and path sections look great. Let me check the lesson-player states section (including the graded drawers).

_[tool: eval_js]_

_[tool: screenshot]_

All 8 player states render correctly — read, ask (postflop), graded right/leak with the slim metric drawer, ask (preflop with seat ring), graded preflop right/leak (no metrics), and end-of-primer at the edge. Let me confirm the end-of-primer frame.

_[tool: eval_js]_

_[tool: screenshot]_

_[tool: eval_js]_

_[tool: screenshot]_

The end-of-primer hand-off reads beautifully, and the preflop leak shows the warm "Close one — not quite. The math points to Fold." tone. One tiny fix — the recap names shouldn't wrap. Then I'll write the design notes.

_[tool: str_replace_edit]_

_[tool: eval_js]_

I'll set it to a clean default instead of removing.

_[tool: eval_js]_

Now the design-notes deliverable — the locked §5 decisions + the design→build component map, in the same shape as the M4 bundle.

_[tool: write_file]_

Let me update todos and snip the resolved exploration context.

_[tool: update_todos]_

_[tool: snip]_

Everything's built and verified visually. Handing off with a clean load + background verification.

The Foundations primer design bundle is done — built as one design canvas in `m4.5-foundations/`:

- **▶ Interactive prototype** — the whole loop plays for real, data-driven from a faithful port of `@holdem/curriculum`: tab nav → learn path → read → ask → graded → next, all six lessons gradeable, progress persists, ↻ restarts.
- **§5.1 Navigation** — three patterns side by side; I recommend the **bottom tab bar** (scales to Drills/M5, keeps Learn one tap away).
- **§5.2 Learn path** — a light game-like vertical path (done ✓ / pulsing-current / locked + resume), shown fresh / in-progress / complete.
- **§5.3 Lesson player** — every state: read, ask (postflop felt + four-colour cards / preflop seat ring), graded-right, graded-leak, preflop graded, and end-of-primer.
- The graded result is a **slide-up drawer reusing the coach-drawer family** with a slim inline metric row — siblings to the table, exactly as asked.

`DESIGN-NOTES.md` captures the locked §5 decisions + the design→build component map; `primer.css` holds the new components in the existing token system (no forked palette/fonts).

Two things to flag for the build: the displayed equity/EV are the engine's real **reference** values for the mockup — wire them to live `@holdem/coach` reads — and the encouraging headline wording is a UI formatter that wraps the deterministic verdict.

_[tool: done]_

Clean load, verifier forked. The deliverable is in `m4.5-foundations/` — open **Foundations Primer.html** and pan around (double-click any phone to focus it, ←/→/Esc to step through). The interactive phone in the top section is fully playable.

