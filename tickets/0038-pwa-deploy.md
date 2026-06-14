---
id: 0038
title: Deploy the PWA to free static hosting over HTTPS
type: feature
status: done
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

- [x] The PWA builds to static assets and deploys to free static hosting over HTTPS — **Cloudflare
      Pages** (chosen for the simpler root `base` and the free `*.pages.dev` HTTPS origin), with Vite
      `base: '/'` so assets + the service worker resolve at the origin root (verified locally under
      `vite preview`: index/JS/`sw.js`/`manifest.webmanifest` all 200).
- [x] An automated deploy: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) publishes
      `apps/pwa`'s build on push to `main` via `wrangler pages deploy`, running `pnpm verify` first so
      only a green tree ships.
- [ ] **Verified installable on Android from the deployed URL** — _pending owner action_: needs the
      one-time Cloudflare setup (create the `bachmann-holdem` Pages project + add the
      `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repo secrets), then the first deploy. Steps are
      in the README "Deploy" section. The build/manifest/SW are install-ready; only the live check
      remains, and it can't run from CI without the owner's account.
- [x] `README.md` documents the deploy target, the URL, and how to release; `pnpm verify` green.

## Notes

This is the only ticket that touches infra/CI rather than app code. Keep secrets out of the repo
(use the hosting provider's CI integration / repo settings). If GitHub Pages, mind the project
sub-path `base`; if Cloudflare Pages, the root `base` is simpler — call the trade-off out in the
doc. Confirm the deployed PWA passes an installability check (Lighthouse PWA / browser install
prompt). Depends on the app being feature-complete — schedule last. Closes [[0008-pwa-app-shell]].

**Outcome:** Cloudflare Pages chosen. Deploy automation + root `base` + manifest/SW + README all
landed and verified locally. The single remaining acceptance item (live Android install check) is
gated on the owner's one-time Cloudflare account setup (project + secrets) and the first deploy — it
cannot run from CI without the owner's credentials. Ticket marked `done` on the engineering
deliverables with that one box left honestly unchecked as the owner follow-up.
