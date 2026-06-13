---
id: 0030
title: Slim the CLI to a headless scriptable harness
type: chore
status: todo
milestone: M3.5
priority: medium
created: 2026-06-13
---

## Context

With the TUI ([[0024-tui-ink-client]]) now the play experience, demote `apps/cli` from an
interactive readline client to a thin **non-interactive, scriptable engine harness**. The goal is
to keep the cheap value the CLI has as a development/smoke-test tool — drive the real engine with a
scripted sequence of moves and print a deterministic transcript — without maintaining a second
full interactive play UI. The real correctness gate stays the `vitest` suite; this is a convenience
driver.

## Acceptance criteria

- [ ] `pnpm play` launches the **TUI** (`apps/tui`). The slimmed `apps/cli` runs non-interactively
      under its own script (e.g. `pnpm sim` / `pnpm play:headless`): given a seed and/or a scripted
      list of hero actions, it plays a hand against a bot and prints a plain transcript
      (state + actions + coach verdicts), then exits.
- [ ] The interactive readline loop (`LineReader`, the `question`/`prompt` plumbing) is removed;
      whatever pure helpers remain useful (the `parseAction` grammar, percent/EV formatting) are
      kept or moved to a shared home rather than duplicated with the TUI. No dead code left behind.
- [ ] README and `docs/ROADMAP.md` updated so `pnpm play` → TUI and the CLI's new headless role is
      documented accurately. `pnpm verify` green; the CLI's remaining pure helpers stay tested.

## Notes

Depends on [[0029-tui-session-loop]] (the TUI must be the real play experience before the CLI is
demoted). This is the realisation of the milestone decision to **keep a sliver of the CLI** rather
than delete it: scriptable, deterministic, greppable — handy for manual engine smoke-tests and for
reproducing a specific line. Don't let coaching rendering diverge between the two apps; share the
verdict-formatting conventions. Update the CLI `package.json` description to match its new role.
