import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The TUI app (ticket 0024) is the repo's first React/JSX. Component tests there use the
  // react-jsx automatic runtime, so esbuild must transform JSX with that runtime (its default
  // is the classic runtime, which would break `jsx: 'react-jsx'` sources).
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.tsx',
    ],
    // A few correctness oracles are deliberately exhaustive — the full C(52,5) hand-frequency
    // sweep and the multi-seed bot loops run in ~1s locally. But CI runs them under v8 coverage
    // instrumentation on a 2-core runner with every test file contending, which is several times
    // slower, so the stock 5s per-test timeout trips them. Raise the global floor well past that;
    // the single heaviest spot (exact preflop enumeration) sets its own larger timeout inline.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // The pure, correctness-critical packages every later milestone trusts — the engine
      // (rules + evaluator) and odds (the deterministic equity/EV math we own) — are gated
      // here. The CLI (`apps/cli`) is a thin readline harness whose shell is intentionally
      // untested, and the UI shells to come are covered by their own tooling — gating on
      // them would only force a meaningless floor.
      include: [
        'packages/engine/src/**',
        'packages/odds/src/**',
        'packages/bots/src/**',
        'packages/coach/src/**',
      ],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'html'],
      // Floors a few points below current actuals: catches a real regression without
      // flaking on trivial additions. Raise these as coverage climbs.
      thresholds: {
        statements: 93,
        branches: 85,
        functions: 97,
        lines: 95,
      },
    },
  },
})
