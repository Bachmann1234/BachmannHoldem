# App icons

The app icon is a tilted **playing-card back** in the app's Playful palette (dark `#0d0f13`, accent
green `#3ddc84`) with the brand **"B"** medallion — matching the in-app topbar logo.

Two SVG sources are the source of truth:

- [`icon.svg`](icon.svg) — the full, rich icon (deck depth + drop shadow). Used for the PWA install /
  maskable icons, the iOS `apple-touch-icon`, and as the vector manifest icon.
- [`../favicon.svg`](../favicon.svg) — a bolder, zoomed single-card variant on a dark rounded tile,
  so it stays legible at browser-tab / favicon sizes (and on light tabs).

## Regenerating the raster PNGs

The PNGs are rasterized from the SVGs **in a browser** (so the medallion's system-font "B" renders
correctly — headless SVG libraries often lack the font). Render each SVG at the exact pixel size and
save:

| File                   | Source        | Size                             |
| ---------------------- | ------------- | -------------------------------- |
| `icons/icon-192.png`   | `icon.svg`    | 192×192                          |
| `icons/icon-512.png`   | `icon.svg`    | 512×512 (also the maskable icon) |
| `apple-touch-icon.png` | `icon.svg`    | 180×180                          |
| `favicon-32.png`       | `favicon.svg` | 32×32                            |

Edit the SVGs to change the artwork, then re-render those four PNGs at the sizes above.
