// The app's pictures, drawn from Clawd himself: the menu bar icon (his
// silhouette, black on clear, which macOS tints for a light or dark menu
// bar) and the app icon (Clawd on his night scene, in a rounded square).
import { encodePng, upscale } from './png.js'
import { renderPortrait, SIZE } from './render.js'

// Hat (with a gap where the band is), head (eyes as holes), arms and body,
// legs: 11 by 12 sprite pixels.
const SILHOUETTE = [
  '...XXXXX...',
  '...XXXXX...',
  '...........',
  '.XXXXXXXXX.',
  '..XXXXXXX..',
  '..XXXXXXX..',
  '..X.XXX.X..',
  'XXXXXXXXXXX',
  '..XXXXXXX..',
  '..XXXXXXX..',
  '..X.X.X.X..',
  '..X...X....',
]

// The menu bar icon as an RGBA PNG, `scale` pixels a sprite pixel (3 at
// 2x is 16.5 by 18 points).
export function trayPng(scale = 3) {
  const w = SILHOUETTE[0].length * scale
  const h = SILHOUETTE.length * scale
  const px = new Uint8Array(w * h * 4)
  SILHOUETTE.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch !== 'X') return
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) px[((r * scale + y) * w + c * scale + x) * 4 + 3] = 255
      }
    })
  })
  return { png: encodePng(px, w, h, 4), width: w, height: h }
}

// Clawd in colour, for the Windows tray (which shows icons as they are, no
// text beside them): `size` pixels square, with a red dot in the corner
// when someone is asking. H hat, B band, X body, E eye.
const COLOR_SPRITE = [
  '...HHHHH...',
  '...HHHHH...',
  '...BBBBB...',
  '.HHHHHHHHH.',
  '..XXXXXXX..',
  '..XXXXXXX..',
  '..XEXXXEX..',
  'XXXXXXXXXXX',
  '..XXXXXXX..',
  '..XXXXXXX..',
  '..X.X.X.X..',
  '..X...X....',
]
const SPRITE_COLORS = { H: [95, 95, 105], B: [130, 230, 210], X: [217, 119, 87], E: [32, 32, 31] }

export function trayColorPng(asking = false, size = 32) {
  const k = Math.floor(size / COLOR_SPRITE.length)
  const ox = Math.floor((size - COLOR_SPRITE[0].length * k) / 2)
  const oy = Math.floor((size - COLOR_SPRITE.length * k) / 2)
  const px = new Uint8Array(size * size * 4)
  const set = (x, y, rgb) => px.set([...rgb, 255], (y * size + x) * 4)
  COLOR_SPRITE.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      const rgb = SPRITE_COLORS[ch]
      if (!rgb) return
      for (let y = 0; y < k; y++) for (let x = 0; x < k; x++) set(ox + c * k + x, oy + r * k + y, rgb)
    })
  })
  if (asking) {
    const d = Math.round(size * 0.34)
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = x - (d - 1) / 2
        const dy = y - (d - 1) / 2
        if (dx * dx + dy * dy <= (d / 2) * (d / 2)) set(size - d + x, y, [235, 55, 55])
      }
    }
  }
  return encodePng(px, size, size, 4)
}

// The app icon: `size` square (1024 for the .icns), Clawd's portrait on his
// scene, scaled by whole pixels, in a rounded square with a margin.
export function appIconPng(size = 1024) {
  return encodePng(appIconRgba(size), size, size, 4)
}

// The same as RGBA pixels.
export function appIconRgba(size = 1024) {
  const k = Math.floor((size * 0.8) / SIZE)
  const inner = SIZE * k
  const off = Math.floor((size - inner) / 2)
  // A second in, so his eyes are open.
  const art = upscale(renderPortrait({}, 1000), SIZE, SIZE, k)
  const radius = inner * 0.22
  const px = new Uint8Array(size * size * 4)
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      // Outside the rounded corners stays clear.
      const cx = x < radius ? radius - x : x > inner - radius ? x - (inner - radius) : 0
      const cy = y < radius ? radius - y : y > inner - radius ? y - (inner - radius) : 0
      if (cx * cx + cy * cy > radius * radius) continue
      const s = (y * inner + x) * 3
      const d = ((off + y) * size + off + x) * 4
      px[d] = art[s]
      px[d + 1] = art[s + 1]
      px[d + 2] = art[s + 2]
      px[d + 3] = 255
    }
  }
  return px
}
