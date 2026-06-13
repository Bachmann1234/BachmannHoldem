import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The pure, correctness-critical packages every later milestone trusts — the engine
      // (rules + evaluator) and odds (the deterministic equity/EV math we own) — are gated
      // here. The CLI (`apps/cli`) is a thin readline harness whose shell is intentionally
      // untested, and the UI shells to come are covered by their own tooling — gating on
      // them would only force a meaningless floor.
      include: ['packages/engine/src/**', 'packages/odds/src/**', 'packages/bots/src/**'],
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
