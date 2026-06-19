/**
 * The orientation signal (ticket 0097) — a MINIMAL hook reporting whether the viewport is in
 * landscape or portrait, so {@link Table} can feed the layout owner ({@link tableLayout}) the right
 * coordinate set and set `data-orientation` on the felt for the CSS scaling branch.
 *
 * Deliberately small: it reads `window.matchMedia('(orientation: landscape)')` and subscribes to its
 * `change` event. Robust rotate-transition handling, preserving game state across a rotate, safe-area
 * insets, a11y, and dropping the manifest `orientation: 'portrait'` lock are all ticket 0099 — NOT
 * here. This just answers "which arrangement should the table draw right now".
 *
 * SSR / test guard: jsdom has no real `matchMedia`, and there is no `window` during SSR, so when
 * either is absent we fall back to `'portrait'` (the app's authored default) and skip subscribing.
 */

import { useEffect, useState } from 'react'
import type { Orientation } from './layout.js'

/** The landscape media query — module-level so the string lives in one place. */
const LANDSCAPE_QUERY = '(orientation: landscape)'

/** Read the current orientation once, guarding for environments without `matchMedia`. */
function readOrientation(): Orientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'portrait'
  return window.matchMedia(LANDSCAPE_QUERY).matches ? 'landscape' : 'portrait'
}

/** React to viewport orientation, returning `'portrait' | 'landscape'`. Defaults to `'portrait'`
 * where `matchMedia` is unavailable (SSR / jsdom). */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(readOrientation)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(LANDSCAPE_QUERY)
    const onChange = (): void => setOrientation(mql.matches ? 'landscape' : 'portrait')
    // Sync once on mount in case the orientation changed between the initial read and subscribing.
    onChange()
    // Prefer the modern `change` event, but fall back to the legacy `addListener` for older WebKit
    // (Safari < 14): a rotation-driven PWA must keep updating on the very mobile browsers where
    // `MediaQueryList.addEventListener` is missing — not just report the correct value on first read.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [])

  return orientation
}
