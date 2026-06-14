/**
 * `@holdem/session` — the pure, framework-agnostic MVU session core both play clients (the Ink TUI
 * and the PWA) consume. It owns the single source of truth — the immutable {@link Model} — and the
 * pure {@link reducer} that advances it: the session state machine (seat compaction, button
 * rotation, bust handling) plus the deterministic coach-grading wiring. It holds no UI: no Ink,
 * React, DOM, or Node — the per-hand deck shuffle and the bots' decisions stay in the shell.
 */

export * from './model.js'
export * from './reducer.js'
