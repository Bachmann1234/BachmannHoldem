import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Don't lint build output, deps, or coverage.
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**'] },

  // Base JS + TypeScript recommended rules (syntactic — no type-aware pass yet, keeps it fast).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Plain Node scripts (build-time tooling, e.g. the PWA icon generator) run on Node, not in a
  // browser/test program, so give them the Node globals they use (`Buffer`, `console`, `process`).
  {
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { Buffer: 'readonly', console: 'readonly', process: 'readonly' },
    },
  },

  // Turn off stylistic rules that Prettier owns. Must come last.
  prettier,
)
