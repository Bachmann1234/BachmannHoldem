---
id: 0035
title: PWA play loop — setup, action controls, bot turns, session
type: feature
status: todo
milestone: M4
priority: high
created: 2026-06-13
---

## Context

Make the table playable: the interactive shell that holds the shared model in `useReducer` and
drives a full multiway session — a table-setup screen, hero action controls, the bot-turn effect
loop, play-again/quit, and an end-of-session summary. This is the DOM analog of the TUI's `Root`
([[0029-tui-session-loop]]) and `ActionBar`/`SetupScreen`/`Summary` components: same MVU discipline,
same two non-pure concerns kept in the shell (the per-hand deck **shuffle** and the **bots'
decisions**), only the render/input layer is DOM instead of Ink.

Design-sensitive: the action controls and setup are touch UI built to the **confirmed** direction in
`docs/design/m4-pwa/` — the `.actionbar` (bet slider + min/½/pot/all-in size buttons + Fold /
Check-Call / Bet-Raise + "Deal next hand →" CTA) in `styles.css`/`app.jsx`. The prototype gated table
size behind a "Players" tweak; we ship a **real setup screen** editing the session `SetupState`
instead. Ignore the prototype's betting engine — drive everything through the shared reducer.

## Acceptance criteria

- [ ] A setup screen (touch controls) edits the shared `SetupState` (seat count 2–6, a bot preset per
      opponent) and starts the first hand — dispatching the same `set-seats` / `cycle-opponent` /
      `start-hand` messages the reducer already owns.
- [ ] Hero action controls render the legal actions for the current spot (`legalActions`) — fold /
      check / call / bet / raise with a bet-size control honouring min/max — and dispatch validated
      `apply-action` messages. Active only on the hero's turn.
- [ ] The bot-turn effect routes the acting seat → its stable player → that player's persistent
      `Opponent` (one instance per id in a ref, as in `Root`), dispatching one decision per state;
      several bots act between hero turns. Deck shuffle (`shuffledDeck`) and bot PRNGs stay in the
      shell — the reducer stays pure.
- [ ] Between-hands play-again / quit, and a session summary at `game-over`. A full hand is playable
      end-to-end on a phone. `pnpm verify` green (component tests for the controls + a smoke test of
      a scripted session via injected decks/bots, mirroring `Root.test`).

## Notes

Port `Root.tsx`'s structure faithfully — the bot effect, the deck queue ref, the phase-gated input,
the self-exit-equivalent end state — adapting Ink `useInput` to DOM event handlers. Keep ALL session
logic in the shared reducer; the shell only supplies RNG + bot instances + rendering. Equity for the
coach stays synchronous as in the TUI; wiring the Web Worker offload (`equityAsync` + a Vite
`new Worker(new URL('…/equityWorker.js', import.meta.url))` factory) is in scope **only if** a heavy
spot janks the main thread — otherwise note it as a deferred optimisation. Depends on
[[0034-pwa-table-view]]; coach panel is [[0036-pwa-coach-panel]]. **Design-gated.**
