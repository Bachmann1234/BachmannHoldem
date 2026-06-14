import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The PWA's Vite build (tickets 0033–0038). Deploy target is Cloudflare Pages, served at the ROOT
// of a `*.pages.dev` origin (ticket 0038), so `base: '/'` is the correct absolute path: the service
// worker then registers at `/sw.js` with scope `/`, controlling the whole origin, and the manifest
// `start_url`/`scope` are likewise root. (`vite preview` also serves at root, so local preview
// matches production.)
export default defineConfig({
  base: '/',
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
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          // Vector copy for crisp rendering at any size where the platform supports it.
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      // Precache the built app shell (html/js/css + icons) so a second visit works fully offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
    }),
  ],
})
