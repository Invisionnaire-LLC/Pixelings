// The Grok bots: a Grok Bot bot on the deck is its own avatar, the shape and
// colour it has in the Grok Bot app (Claude Code's are Clawd, Codex's the
// Codex dots). Pixel renditions on Pixelings' 3-pixel grid, with the app's
// two capsule eyes drawn at full key resolution. No Node imports: the
// control page draws them too.
const C = 3

const INK = [20, 20, 24]
const WHITE = [245, 245, 245]

// Grok Bot's avatar colours (its picker's own values). Black is lifted a
// little so it still shows on a dark scene, and gets white eyes.
export const GROK_COLORS = {
  black: [40, 40, 46],
  brown: [147, 100, 57],
  red: [255, 38, 60],
  orange: [255, 103, 0],
  yellow: [255, 152, 0],
  green: [0, 201, 114],
  cyan: [0, 188, 166],
  blue: [16, 132, 254],
  violet: [145, 89, 254],
  magenta: [255, 48, 155],
  gray: [119, 119, 119],
}

// Each shape (X its colour) and where its eyes sit: their top in key
// pixels, and their centre if not a little right of the middle, where the
// app puts them. `top` draws anything above.
export const GROK_SHAPES = {
  blob: {
    rows: [
      '...XXXXXX....',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXXX',
      '..XXXXXXXXXX.',
      '....XXXXXX...',
    ],
    eyeY: 10,
  },
  pebble: {
    rows: [
      '....XXXXX....',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '....XXXXX....',
    ],
    eyeY: 9,
    eyeX: 24,
  },
  bean: {
    rows: [
      '..XXXX.......',
      '.XXXXXXX.....',
      'XXXXXXXXXX...',
      'XXXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXXX',
      '..XXXXXXXXXX.',
      '....XXXXXX...',
    ],
    eyeY: 10,
    eyeX: 22,
  },
  egg: {
    rows: [
      '....XXX....',
      '..XXXXXXX..',
      '.XXXXXXXXX.',
      '.XXXXXXXXX.',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      '.XXXXXXXXX.',
      '..XXXXXXX..',
    ],
    eyeY: 11,
  },
  squircle: {
    rows: [
      '.XXXXXXXXX.',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      '.XXXXXXXXX.',
    ],
    eyeY: 9,
  },
  tablet: {
    rows: [
      '.......XXXX..',
      '...XXXXXXXXX.',
      '.XXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXX....',
    ],
    eyeY: 5,
    eyeX: 25,
  },
  capsule: {
    rows: [
      '..XXXXX..',
      '.XXXXXXX.',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
    ],
    eyeY: 10,
  },
  cylinder: {
    rows: [
      '..XXXXXXX..',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      '..XXXXXXX..',
    ],
    eyeY: 9,
    // Its lid, a shade lighter.
    top(r, color) {
      r(6, 0, 21, 3, color.map(v => Math.min(255, v + 40)))
    },
  },
  hex: {
    rows: [
      '...XXXXXXX...',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '...XXXXXXX...',
    ],
    eyeY: 9,
    eyeX: 22,
  },
  gem: {
    rows: [
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '...XXXXXXX...',
      '....XXXXX....',
      '.....XXX.....',
      '......X......',
    ],
    eyeY: 4,
  },
  crystal: {
    rows: [
      '....X....',
      '...XXX...',
      '..XXXXX..',
      '.XXXXXXX.',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
    ],
    eyeY: 14,
  },
  wedge: {
    rows: [
      '......XX.....',
      '.....XXXX....',
      '.....XXXXX...',
      '....XXXXXXX..',
      '....XXXXXXXX.',
      '...XXXXXXXXX.',
      '..XXXXXXXXXXX',
      '.XXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
    ],
    eyeY: 12,
    eyeX: 24,
  },
  shield: {
    rows: [
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      '.XXXXXXXXX.',
      '..XXXXXXX..',
      '...XXXXX...',
      '....XXX....',
    ],
    eyeY: 5,
  },
  dome: {
    rows: [
      '....XXXXX....',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
    ],
    eyeY: 9,
  },
  arch: {
    rows: [
      '....XXXXX....',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXX.....XXXX',
      'XXXX.....XXXX',
    ],
    eyeY: 8,
  },
  cloud: {
    rows: [
      '....XXX......',
      '..XXXXXX.XX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
    ],
    eyeY: 10,
  },
  teardrop: {
    rows: [
      '...XX........',
      '...XXXX......',
      '..XXXXXXX....',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '....XXXXX....',
    ],
    eyeY: 14,
    eyeX: 24,
  },
  leaf: {
    rows: [
      '........XXXXX',
      '.....XXXXXXXX',
      '...XXXXXXXXXX',
      '..XXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXX.',
      'XXXXXXXXXXX..',
      'XXXXXXXXX....',
      'XXXXXX.......',
    ],
    eyeY: 11,
  },
  square: {
    rows: [
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
      'XXXXXXXXXXX',
    ],
    eyeY: 9,
  },
  sparkle: {
    rows: [
      '......X......',
      '.....XXX.....',
      '....XXXXX....',
      '..XXXXXXXXX..',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '..XXXXXXXXX..',
      '....XXXXX....',
      '.....XXX.....',
      '......X......',
    ],
    eyeY: 11,
  },
  clover: {
    rows: [
      '...XXX.XXX...',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '...XXX.XXX...',
    ],
    eyeY: 12,
  },
  flower: {
    rows: [
      '.....XXX.....',
      '....XXXXX....',
      '.XX.XXXXX.XX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '.XXXXX.XXXXX.',
      '.XXXX...XXXX.',
      '..XX.....XX..',
    ],
    eyeY: 9,
  },
  heart: {
    rows: [
      '.XXX.....XXX.',
      'XXXXX...XXXXX',
      'XXXXXX.XXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '...XXXXXXX...',
      '....XXXXX....',
      '.....XXX.....',
    ],
    eyeY: 8,
  },
  house: {
    rows: [
      '......X......',
      '.....XXX.....',
      '....XXXXX....',
      '...XXXXXXX...',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
    ],
    eyeY: 16,
  },
  star: {
    rows: [
      '......X......',
      '.....XXX.....',
      '.....XXX.....',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      '.XXXX...XXXX.',
      'XXX.......XXX',
    ],
    eyeY: 10,
  },
  pumpkin: {
    rows: [
      '..XXX.X.XXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXX.X.XXX..',
    ],
    eyeY: 9,
    // A green stem.
    top(r) {
      r(18, -5, 3, 5, [60, 140, 50])
      r(21, -5, 3, 2, [60, 140, 50])
    },
  },
}

export const GROK_SHAPE_NAMES = Object.keys(GROK_SHAPES)

// What Grok Bot shows for a bot that never picked a shape or colour: one
// chosen from its id, the way the app's bot list chooses it, so the deck
// matches.
const DEFAULT_SHAPES = ['blob', 'pebble', 'squircle', 'tablet', 'wedge', 'hex', 'cloud', 'teardrop']
const DEFAULT_COLORS = ['brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray']

function fnv(s) {
  let t = 2166136261
  for (let i = 0; i < s.length; i++) t = Math.imul(t ^ s.charCodeAt(i), 16777619)
  return t >>> 0
}

function shapeHash(id) {
  let t = fnv(id) | 0
  t = Math.imul(t ^ (t >>> 16), 73244475)
  t = Math.imul(t ^ (t >>> 13), 3266489909)
  return (t ^ (t >>> 16)) >>> 0
}

function colorRoll(id) {
  const t = (fnv(id) + 1831565813) | 0
  let e = Math.imul(t ^ (t >>> 15), 1 | t)
  e = (e + Math.imul(e ^ (e >>> 7), 61 | e)) ^ e
  return ((e ^ (e >>> 14)) >>> 0) / 4294967296
}

// A bot's { shape, color }: its own when it has them, else the app's
// choice for its id.
export function grokLook(id, shape, color) {
  return {
    shape: Object.hasOwn(GROK_SHAPES, shape ?? '') ? shape : DEFAULT_SHAPES[shapeHash(String(id)) % DEFAULT_SHAPES.length],
    color: Object.hasOwn(GROK_COLORS, color ?? '') ? color : DEFAULT_COLORS[Math.floor(colorRoll(String(id)) * DEFAULT_COLORS.length)],
  }
}

// Draws Grok bot `look` ({ shape, color }) with its bottom centred on (cx,
// bottom) in key pixels, through `key` (rect(x, y, w, h, rgb, alpha)). The
// same `pose` as a Codex dot (dots.js): eyes, lookDx, hop, atLaptop,
// alpha, solid.
export function drawGrokBot(key, look, cx, bottom, { eyes = 'open', lookDx = 0, hop = 0, atLaptop = false, alpha = 1, solid = null } = {}) {
  const s = GROK_SHAPES[look?.shape] ?? GROK_SHAPES.blob
  const color = solid ?? GROK_COLORS[look?.color] ?? GROK_COLORS.black
  const w = s.rows[0].length * C
  const h = s.rows.length * C
  const x = Math.round(cx - w / 2)
  let y = bottom - h - hop
  if (atLaptop) y = Math.max(10, Math.min(y, 27 - s.eyeY))
  const r = (rx, ry, rw, rh, rgb) => key.rect(x + rx, y + ry, rw, rh, solid ?? rgb, alpha)
  if (s.top) s.top(r, color)
  s.rows.forEach((row, ry) => {
    ;[...row].forEach((ch, rx) => {
      if (ch === 'X') key.rect(x + rx * C, y + ry * C, C, C, color, alpha)
    })
  })
  if (solid) return
  // The app's face: two small capsule eyes close together, up and to the
  // right (white on black), looking about and down at a laptop.
  const ink = look?.color === 'black' || !GROK_COLORS[look?.color] ? WHITE : INK
  const mid = s.eyeX ?? Math.round(w * 0.6)
  const dx = Math.round(lookDx / 2)
  const dy = eyes === 'down' ? 1 : 0
  for (const ex of [mid - 4, mid + 2]) {
    if (eyes === 'closed') r(ex + dx, s.eyeY + 4, 3, 1, ink)
    else {
      r(ex + dx + 1, s.eyeY + dy, 1, 7, ink)
      r(ex + dx, s.eyeY + dy + 1, 3, 5, ink)
    }
  }
}
