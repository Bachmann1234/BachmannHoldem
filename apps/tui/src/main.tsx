/**
 * Entry point for `pnpm --filter @holdem/tui dev` (tickets 0025 / 0027).
 *
 * Mounts the interactive {@link Root}: a live MVU loop where the hero plays one hand against the
 * bots through the on-screen action bar. `render(<Root/>)` keeps the app mounted and
 * `waitUntilExit()` resolves once `Root` calls `useApp().exit()` — which happens when the hero
 * presses `q` or the single hand completes. The multi-hand session (stacks carry, button rotates,
 * play-again) is ticket 0029.
 */

import process from 'node:process'
import { render } from 'ink'
import { Root } from './Root.js'

async function main(): Promise<void> {
  const instance = render(<Root />)
  await instance.waitUntilExit()
  // The app has fully torn down (the frame is flushed and the terminal restored) by the time
  // `waitUntilExit` resolves. On a real TTY, Ink can leave the raw-mode input stream resumed and
  // referenced, which keeps Node's event loop alive and would otherwise hang the process after the
  // hand ends. We have nothing left to do, so exit explicitly — satisfying the "must not hang"
  // requirement without depending on every listener having been unref'd.
  process.exit(0)
}

void main()
