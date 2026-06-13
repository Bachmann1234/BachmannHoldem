/**
 * Entry point for `pnpm --filter @holdem/tui dev` (ticket 0025).
 *
 * For this scaffold it builds the initial model (one real hand from `@holdem/engine`), renders a
 * single static snapshot via Ink, and exits cleanly — there is no input loop yet. Rendering one
 * frame and then unmounting is the idiomatic one-shot Ink pattern; `waitUntilExit` resolves once
 * the instance has torn down, so the process ends instead of hanging on the live terminal.
 *
 * Later tickets replace this with the interactive session: `useReducer(reducer, initialModel)`
 * inside the component tree, input handlers dispatching messages, and bots acting between the
 * hero's turns. The scaffold deliberately keeps `dispatch` a no-op.
 */

import { render } from 'ink'
import { App } from './App.js'
import { createInitialModel } from './model.js'

async function main(): Promise<void> {
  const model = createInitialModel()
  // No interaction yet: dispatch is the identity loop. The reducer is exercised by its tests.
  const instance = render(<App model={model} dispatch={() => {}} />)
  // Render the static frame, then tear down so the process exits cleanly rather than hanging.
  instance.unmount()
  await instance.waitUntilExit()
}

void main()
