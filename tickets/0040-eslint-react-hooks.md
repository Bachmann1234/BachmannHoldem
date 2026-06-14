---
id: 0040
title: Add eslint-plugin-react-hooks to enforce effect deps in the React shells
type: task
status: done
milestone: M4
priority: medium
created: 2026-06-14
---

## Context

The repo now has two React shells — `apps/tui` (Ink) and `apps/pwa` (DOM) — with several
hand-tuned `useEffect` dependency arrays that are correct but **unenforced**: the bot-turn effect,
the ActionBar bet-slider re-seed (`apps/pwa/src/components/ActionBar.tsx` even carries a comment
noting "this repo has no `eslint-plugin-react-hooks`, so this invariant is not lint-enforced"), the
coach-drawer focus effect, and the history-recording effect. `eslint.config.js` has no
`eslint-plugin-react-hooks`, so neither `rules-of-hooks` nor `exhaustive-deps` runs. A future refactor
could silently break a narrowed-deps invariant with no lint signal. Surfaced by the M4 milestone
review.

## Acceptance criteria

- [x] `eslint-plugin-react-hooks` is added and wired into `eslint.config.js`, scoped to the React app
      sources (`apps/tui`, `apps/pwa`) — the pure packages are not React and need not run it.
- [x] `rules-of-hooks` passes clean. For each `exhaustive-deps` warning, EITHER fix the deps OR add a
      scoped `eslint-disable-next-line react-hooks/exhaustive-deps` with a one-line rationale (the
      deliberately-narrowed effects — the ActionBar re-seed and the bot-turn effect — are intentional;
      annotate, don't widen them in a way that changes behaviour).
- [x] `pnpm verify` (which runs `eslint .`) stays green with the rule active.

## Notes

The narrowed deps are correct (e.g. the ActionBar re-seed keys on `street`/`toAct`/`currentBet` so it
doesn't stomp the slider mid-drag) — the point is to make the invariant explicit and catch the NEXT
edit, not to "fix" working code. Confirm the plugin's flat-config (ESLint 10) usage at install time.
Surfaced by the M4 milestone review.
