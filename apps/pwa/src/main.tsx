/**
 * Entry point for `pnpm --filter @holdem/pwa dev` / the built PWA (ticket 0033).
 *
 * Mounts the React root and registers the auto-updating service worker. `registerSW({ immediate:
 * true })` (from `vite-plugin-pwa`'s virtual module) wires up the precache so a second load works
 * offline; with `registerType: 'autoUpdate'` a fresh build silently takes over on the next visit.
 * This is the DOM analog of the TUI's `render(<Root/>)` bootstrap.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App.js'

registerSW({ immediate: true })

const container = document.getElementById('root')
if (container === null) throw new Error('Root container #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
