// The Codex dots: Codex's own characters, soft body-less shapes with a
// signature look each. A Codex agent on the deck is one of them (Claude
// Code's are Clawd). Pixel renditions on Pixelings' 3-pixel grid; their
// faces and things are drawn at full key resolution. No Node imports: the
// control page draws them too.
const C = 3

const INK = [20, 20, 24]
const WHITE = [245, 245, 245]

// Each dot: its shape (X its colour), its colour, where its eyes sit (for
// peeking over a laptop) and what makes it itself, drawn by `face`.
export const DOTS = {
  cloud: {
    name: 'Cloud',
    color: [72, 150, 235],
    rows: [
      '....XXX......',
      '..XXXXXX.XX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '..XXX..XXXX..',
    ],
    eyeY: 14,
    // A black beret, worn to one side, and two dot eyes.
    top(r) {
      const beret = [48, 48, 58]
      r(3, -1, 21, 3, beret)
      r(1, 1, 24, 2, beret)
      r(12, -4, 3, 3, beret)
      r(6, -1, 9, 1, [80, 80, 92])
    },
    face(r, eyes, dx, dy) {
      for (const ex of [14, 24]) {
        if (eyes === 'closed') r(ex + dx - 1, 16 + dy, 4, 1, INK)
        else r(ex + dx, 13 + dy, 3, 4, INK)
      }
    },
  },
  triangle: {
    name: 'Triangle',
    color: [245, 200, 40],
    rows: [
      '......X......',
      '.....XXX.....',
      '.....XXX.....',
      '....XXXXX....',
      '...XXXXXXX...',
      '...XXXXXXX...',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
    ],
    eyeY: 17,
    // Round glasses over closed, smiling eyes, and a bow tie.
    face(r, eyes, dx, dy, ring) {
      for (const cx of [14, 25]) {
        ring(cx + dx, 17 + dy, 4)
        r(cx + dx - 2, 18 + dy, 1, 1, INK)
        r(cx + dx - 1, 19 + dy, 3, 1, INK)
        r(cx + dx + 2, 18 + dy, 1, 1, INK)
      }
      r(18 + dx, 16 + dy, 4, 1, INK)
      bowTie(r, 19.5, 25)
    },
  },
  frog: {
    name: 'Frog',
    color: [175, 230, 60],
    rows: [
      '.XXX.....XXX.',
      'XXXXX...XXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      'XXXXXXXXXXXXX',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '..XXXXXXXXX..',
    ],
    eyeY: 5,
    // Big googly eyes up top, and a bow tie.
    face(r, eyes, dx, dy, ring, disc, color) {
      for (const cx of [7, 32]) {
        disc(cx, 5, 4, WHITE)
        if (eyes === 'closed') disc(cx, 5, 4, color)
        else r(cx - 1 + Math.sign(dx) * 2, 4 + dy, 3, 3, INK)
      }
      bowTie(r, 19.5, 20)
    },
  },
  heart: {
    name: 'Heart',
    color: [220, 60, 200],
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
    eyeY: 12,
    // Round sunglasses.
    face(r, eyes, dx, dy, ring, disc) {
      for (const cx of [13, 26]) {
        disc(cx + dx, 12 + dy, 4, INK)
        r(cx + dx - 2, 10 + dy, 1, 1, [120, 120, 130])
      }
      r(16 + dx, 11 + dy, 7, 1, INK)
    },
  },
  stack: {
    name: 'Stack',
    color: [150, 110, 225],
    rows: [
      '..XXXXX..',
      '.XXXXXXX.',
      '.XXXXXXX.',
      '..XXXXX..',
      '.XXXXXXX.',
      'XXXXXXXXX',
      'XXXXXXXXX',
      'XXXXXXXXX',
      '.XXXXXXX.',
      '..XXXXX..',
    ],
    eyeY: 19,
    // Two balls, a little yellow flower on top, dot eyes on the lower one.
    top(r) {
      const y = [250, 210, 60]
      r(10, -6, 3, 3, y)
      r(14, -6, 3, 3, y)
      r(12, -8, 3, 3, y)
      r(12, -4, 3, 3, y)
      r(13, -5, 1, 1, [230, 140, 30])
    },
    face(r, eyes, dx, dy) {
      for (const ex of [9, 16]) {
        if (eyes === 'closed') r(ex + dx - 1, 21 + dy, 4, 1, INK)
        else r(ex + dx, 18 + dy, 2, 4, INK)
      }
    },
  },
}

function bowTie(r, cx, y) {
  r(cx - 6, y, 4, 4, INK)
  r(cx + 2, y, 4, 4, INK)
  r(cx - 2, y + 1, 4, 2, INK)
}

export const DOT_NAMES = Object.keys(DOTS)

// Draws dot `name` with its bottom centred on (cx, bottom) in key pixels,
// through `key` (rect(x, y, w, h, rgb, alpha) and sprite()). `pose`: eyes
// ('open' | 'down' | 'closed'), lookDx, hop (pixels up), atLaptop (raised
// so his eyes clear a laptop's lid at y 33), alpha, and solid (a colour:
// the silhouette only, for the outline).
export function drawDot(key, name, cx, bottom, { eyes = 'open', lookDx = 0, hop = 0, atLaptop = false, alpha = 1, solid = null } = {}) {
  const d = DOTS[name] ?? DOTS.cloud
  const w = d.rows[0].length * C
  const h = d.rows.length * C
  const x = Math.round(cx - w / 2)
  let y = bottom - h - hop
  if (atLaptop) y = Math.max(10, Math.min(y, 27 - d.eyeY))
  const color = solid ?? d.color
  const r = (rx, ry, rw, rh, rgb) => key.rect(x + rx, y + ry, rw, rh, solid ?? rgb, alpha)
  if (d.top) d.top(r)
  d.rows.forEach((row, ry) => {
    ;[...row].forEach((ch, rx) => {
      if (ch === 'X') key.rect(x + rx * C, y + ry * C, C, C, color, alpha)
    })
  })
  if (solid) return
  const disc = (dcx, dcy, rad, rgb) => {
    for (let yy = -rad; yy <= rad; yy++) {
      const half = Math.floor(Math.sqrt(rad * rad - yy * yy) + 0.3)
      r(dcx - half, dcy + yy, half * 2 + 1, 1, rgb)
    }
  }
  const ring = (rcx, rcy, rad) => {
    disc(rcx, rcy, rad, INK)
    disc(rcx, rcy, rad - 1, d.color)
  }
  const dx = Math.round(lookDx / 2)
  const dy = eyes === 'down' ? 1 : 0
  d.face(r, eyes, dx, dy, ring, disc, d.color)
}
