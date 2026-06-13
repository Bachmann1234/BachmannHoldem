import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // The engine is the load-bearing correctness asset every later milestone trusts,
      // so the coverage gate is scoped to it. The CLI (`apps/cli`) is a thin readline
      // harness whose shell is intentionally untested, and the UI shells to come are
      // covered by their own tooling — gating on them would only force a meaningless floor.
      include: ['packages/engine/src/**'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      reporter: ['text', 'html'],
      // Floors a few points below current actuals: catches a real regression without
      // flaking on trivial additions. Raise these as coverage climbs.
      thresholds: {
        statements: 93,
        branches: 86,
        functions: 97,
        lines: 95,
      },
    },
  },
})
