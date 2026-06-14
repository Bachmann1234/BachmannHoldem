---
id: 0038
title: Deploy the PWA to free static hosting over HTTPS
type: feature
status: todo
milestone: M4
priority: medium
created: 2026-06-13
---

## Context

The last epic acceptance criterion: the installable PWA must actually be reachable — deployed as
static files to free hosting, served over HTTPS (a PWA service worker + install prompt require a
secure origin). This closes M4: the app is something you can open on a phone and add to the home
screen.

## Acceptance criteria

- [ ] The PWA builds to static assets and deploys to free static hosting over HTTPS (GitHub Pages or
      Cloudflare Pages — pick one and document why), with Vite's `base` set correctly for the
      hosting path so assets and the service worker resolve.
- [ ] An automated deploy: a CI workflow (or documented one-command deploy) publishes `apps/pwa`'s
      build on push to the default branch. The build step runs `pnpm verify` first so only a green
      tree ships.
- [ ] Verified installable on Android from the deployed URL: manifest + service worker served over
      HTTPS, "Add to Home screen" works, and a second visit loads offline.
- [ ] `README.md` documents the deploy target, the URL, and how to release; `pnpm verify` green.

## Notes

This is the only ticket that touches infra/CI rather than app code. Keep secrets out of the repo
(use the hosting provider's CI integration / repo settings). If GitHub Pages, mind the project
sub-path `base`; if Cloudflare Pages, the root `base` is simpler — call the trade-off out in the
doc. Confirm the deployed PWA passes an installability check (Lighthouse PWA / browser install
prompt). Depends on the app being feature-complete — schedule last. Closes [[0008-pwa-app-shell]].
