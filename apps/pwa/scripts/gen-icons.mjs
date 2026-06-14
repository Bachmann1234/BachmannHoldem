/**
 * Generate the PWA app icons (ticket 0033) — a green "B" mark on the dark M4 background, at 192 and
 * 512 px. Placeholder art: real iconography is a later design ticket. We write valid PNGs with only
 * Node built-ins (no native image deps in the toolchain), so this can be re-run deterministically.
 *
 *   node apps/pwa/scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const BG = [0x0d, 0x0f, 0x13] // #0d0f13
const FG = [0x3d, 0xdc, 0x84] // #3ddc84

// A 5x7 bitmap of the letter "B" (1 = ink). Scaled up to fill ~60% of the icon, centred.
const GLYPH = [
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
  [1, 0, 0, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0],
]
const GW = 5
const GH = 7

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  // Glyph occupies ~60% of the canvas, centred.
  const cell = Math.floor((size * 0.6) / GH)
  const glyphW = cell * GW
  const glyphH = cell * GH
  const ox = Math.floor((size - glyphW) / 2)
  const oy = Math.floor((size - glyphH) / 2)

  // Raw image: each row prefixed with a filter byte (0 = none), 3 bytes/pixel (RGB).
  const stride = 1 + size * 3
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      let px = BG
      const gx = Math.floor((x - ox) / cell)
      const gy = Math.floor((y - oy) / cell)
      if (gx >= 0 && gx < GW && gy >= 0 && gy < GH && GLYPH[gy][gx] === 1) px = FG
      const off = y * stride + 1 + x * 3
      raw[off] = px[0]
      raw[off + 1] = px[1]
      raw[off + 2] = px[2]
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), makePng(size))
  console.log(`wrote icons/icon-${size}.png`)
}
