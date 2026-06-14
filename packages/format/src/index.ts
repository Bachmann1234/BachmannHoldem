/**
 * `@holdem/format` — the pure presentation helpers shared by the play clients (the headless CLI
 * harness and the Ink TUI). It owns the genuinely-shared, framework-agnostic formatting so the two
 * clients can never diverge on it: the action-input grammar and the coach value formatters. It does
 * no poker math — that all lives in the engine/odds/coach packages — and pulls in `@holdem/engine`
 * and `@holdem/coach` for *types* only.
 */

export * from './action.js'
export * from './coachValues.js'
