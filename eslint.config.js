import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// Flat config as a plain array (ESLint 9/10). We deliberately avoid the `tseslint.config()` helper —
// its variadic signature is deprecated, and we have no `extends` keys that would need it.
export default [
  // Don't lint build output, deps, or coverage.
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**'] },

  // Base JS + TypeScript recommended rules (syntactic — no type-aware pass yet, keeps it fast).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Turn off stylistic rules that Prettier owns. Must come last.
  prettier,
]
