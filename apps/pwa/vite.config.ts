import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// First Vite/DOM-React app in the repo (ticket 0033). Design-agnostic scaffold: prove the
// toolchain, the model→DOM wiring, and the PWA install/offline plumbing. Table visuals land in
// later M4 tickets.
//
// `base: './'` keeps the built asset URLs relative so `vite preview` (and a future static deploy)
// resolve them without a hardcoded subpath — deploy-path tuning (e.g. a GitHub-Pages prefix) is a
// later ticket.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // Auto-update the service worker: a new build silently takes over on the next load, so the
      // installed PWA stays current without a manual "update available" prompt.
      registerType: 'autoUpdate',
      // Emit the manifest as `manifest.webmanifest` and link it from the precached app shell.
      manifest: {
        name: "Bachmann Hold'em",
        short_name: "Hold'em",
        description: "Texas Hold'em training — play vs bots with a deterministic odds coach.",
        // Locked M4 palette (docs/design/m4-pwa/DESIGN-NOTES.md): dark bg, accent green.
        theme_color: '#0d0f13',
        background_color: '#0d0f13',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // Precache the built app shell (html/js/css + icons) so a second visit works fully offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
