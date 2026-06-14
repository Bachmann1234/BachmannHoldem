/**
 * Public surface of the TUI app — the pure, testable MVU core (ticket 0025).
 *
 * Re-exports only the model, reducer, and the pure input mapper (and their types), which carry no
 * Ink/JSX dependency and can therefore be unit-tested with a plain `.test.ts` file (no JSX transform
 * needed). The Ink components and the `main` entry point are intentionally *not* re-exported here —
 * they are the I/O shell, exercised via `ink-testing-library`.
 */

export * from '@holdem/session'
export * from './input.js'
