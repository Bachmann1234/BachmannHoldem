import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'

// Flat config as a plain array (ESLint 9/10). We deliberately avoid the `tseslint.config()` helper —
// its variadic signature is deprecated, and we have no `extends` keys that would need it.
export default [
  // Don't lint build output, deps, coverage, or the vendored design handoff bundles under
  // docs/design (external claude.ai/design prototypes — reference artefacts kept verbatim, not our
  // source; the real shell lives in apps/pwa).
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', 'docs/design/**'] },

  // Base JS + TypeScript recommended rules (syntactic — no type-aware pass yet, keeps it fast).
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // The two React shells (Ink TUI + DOM PWA) carry hand-tuned `useEffect` deps. Enforce the hooks
  // rules ONLY here — the pure `packages/*` are framework-agnostic and have no hooks to check. We
  // opt into just `rules-of-hooks` and `exhaustive-deps` (both errors, so a future edit that breaks
  // a narrowed-deps invariant fails CI); the deliberately-narrowed effects carry scoped disables.
  {
    files: ['apps/tui/**/*.{ts,tsx}', 'apps/pwa/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Turn off stylistic rules that Prettier owns. Must come last.
  prettier,
]
