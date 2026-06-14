---
id: 0039
title: Share the TUI/PWA shell glue (personality map, bot factory, legality guard)
type: chore
status: todo
milestone: M4
priority: medium
created: 2026-06-14
---

## Context

M4 correctly extracted the MVU model+reducer into `@holdem/session` so both shells share one brain
([[0032-session-core-package]]) — but a thin layer of shell glue is still copy-pasted, byte-for-byte,
between the Ink TUI and the React PWA:

- `PERSONALITY_BY_KIND` (the `BotKind` → `@holdem/bots` `Personality` map)
- `defaultMakeBot` (build a per-player `Opponent` from the preset)
- `actionIsLegal` (the defensive "never feed the engine an illegal bot action" guard)

in `apps/tui/src/Root.tsx` (≈61-72, 272-287) and `apps/pwa/src/App.tsx` (≈75-86, 355-370). This is
the exact "share, don't re-port" principle the milestone was built on — duplicated, these can
silently diverge (e.g. a tweaked personality mapping landing in only one shell). Surfaced by the M4
milestone review.

## Acceptance criteria

- [ ] `PERSONALITY_BY_KIND` and `actionIsLegal` are exported from a shared pure module (`@holdem/session`
      is the natural home — it already owns `BotKind` and depends on `@holdem/bots`/`@holdem/engine`)
      and consumed by BOTH `apps/tui/src/Root.tsx` and `apps/pwa/src/App.tsx`; the duplicate copies
      are removed.
- [ ] `defaultMakeBot` (or a shared `makeBot(player, seed)` factory) is shared too, or documented as
      intentionally shell-local if the RNG seeding must differ.
- [ ] No behaviour change in either shell; `@holdem/session` stays pure (no UI/DOM/Node). `pnpm verify`
      green, coverage thresholds held.

## Notes

Keep the shared helpers pure and unit-test `actionIsLegal` against `LegalActions` in the session
package (it's load-bearing — it's the last guard before the engine throws). Don't pull anything
React/Ink-shaped into `@holdem/session`. Builds on [[0032-session-core-package]].
