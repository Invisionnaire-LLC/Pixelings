// One Stream Deck key as a 72×72 RGB image: an agent's Clawd, the overflow
// key, or nothing. Clawd is drawn on a chunky grid, 3 key pixels a sprite
// pixel, so key pixels are scene units.
import { drawDot } from './dots.js'
import { drawGrokBot } from './grokbots.js'
import { sceneBase, sceneMotion } from './scenes.js'
import { ACCESSORIES, BODIES, CLASSIC, HATS } from './wardrobe.js'

export const SIZE = 72
const U = 3

const HAT_BAND = [130, 230, 210]
const WHITE = [235, 235, 235]
const HEAT = [
  [90, [255, 80, 80]],
  [80, [255, 130, 100]],
  [70, [255, 180, 100]],
  [60, [255, 220, 120]],
  [-1, [130, 230, 210]],
]

// Who stands on a key, by the tool his session runs in: Clawd, Claude
// Code's crab, one of the Codex dots (dots.js), Codex's own body-less
// characters, or a Grok bot (grokbots.js) in its own Grok Bot shape.
export const SPECIES = {
  clawd: {
    head: ['..XXXXXXX..', '..XXXXXXX..', '..XXXXXXX..'],
    torso: ['..XXXXXXX..', '..XXXXXXX..', '..XXXXXXX..'],
    legs: ['..X.X.X.X..', '..X...X....'],
    eye: [32, 32, 31],
  },
}

// Asking gets a frame round his key (red, pulsing, with a red wash over his
// scene): the one that needs you. On top, a key flashes for what you chose
// to be told about (a question, a permission, a turn just finished…), each
// in its own style and colour (flashFor, flashOver). Compacting
// washes his scene blue; working shows as his laptop; your move and idle as
// he is.
const FRAME = {
  ask: [235, 55, 55],
}
const OUTLINE = [10, 10, 14]

// A 5×7 pixel font: column bitmaps, bit 0
// the top row, in a 6-pixel cell. Lowercase is drawn as capitals.
export const GLYPHS = {
  0: [0x3e, 0x51, 0x49, 0x45, 0x3e], 1: [0x00, 0x42, 0x7f, 0x40, 0x00], 2: [0x42, 0x61, 0x51, 0x49, 0x46],
  3: [0x21, 0x41, 0x45, 0x4b, 0x31], 4: [0x18, 0x14, 0x12, 0x7f, 0x10], 5: [0x27, 0x45, 0x45, 0x45, 0x39],
  6: [0x3c, 0x4a, 0x49, 0x49, 0x30], 7: [0x01, 0x71, 0x09, 0x05, 0x03], 8: [0x36, 0x49, 0x49, 0x49, 0x36],
  9: [0x06, 0x49, 0x49, 0x29, 0x1e], A: [0x7c, 0x12, 0x11, 0x12, 0x7c], B: [0x7f, 0x49, 0x49, 0x49, 0x36],
  C: [0x3e, 0x41, 0x41, 0x41, 0x22], D: [0x7f, 0x41, 0x41, 0x22, 0x1c], E: [0x7f, 0x49, 0x49, 0x49, 0x41],
  F: [0x7f, 0x09, 0x09, 0x09, 0x01], G: [0x3e, 0x41, 0x49, 0x49, 0x7a], H: [0x7f, 0x08, 0x08, 0x08, 0x7f],
  I: [0x00, 0x41, 0x7f, 0x41, 0x00], J: [0x20, 0x40, 0x41, 0x3f, 0x01], K: [0x7f, 0x08, 0x14, 0x22, 0x41],
  L: [0x7f, 0x40, 0x40, 0x40, 0x40], M: [0x7f, 0x02, 0x0c, 0x02, 0x7f], N: [0x7f, 0x04, 0x08, 0x10, 0x7f],
  O: [0x3e, 0x41, 0x41, 0x41, 0x3e], P: [0x7f, 0x09, 0x09, 0x09, 0x06], Q: [0x3e, 0x41, 0x51, 0x21, 0x5e],
  R: [0x7f, 0x09, 0x19, 0x29, 0x46], S: [0x46, 0x49, 0x49, 0x49, 0x31], T: [0x01, 0x01, 0x7f, 0x01, 0x01],
  U: [0x3f, 0x40, 0x40, 0x40, 0x3f], V: [0x1f, 0x20, 0x40, 0x20, 0x1f], W: [0x3f, 0x40, 0x38, 0x40, 0x3f],
  X: [0x63, 0x14, 0x08, 0x14, 0x63], Y: [0x07, 0x08, 0x70, 0x08, 0x07], Z: [0x61, 0x51, 0x49, 0x45, 0x43],
  '+': [0x08, 0x08, 0x3e, 0x08, 0x08], '?': [0x02, 0x01, 0x51, 0x09, 0x06], '.': [0x00, 0x60, 0x60, 0x00, 0x00],
  '!': [0x00, 0x00, 0x5f, 0x00, 0x00], '_': [0x40, 0x40, 0x40, 0x40, 0x40], '%': [0x23, 0x13, 0x08, 0x64, 0x62],
  ':': [0x00, 0x36, 0x36, 0x00, 0x00], '-': [0x08, 0x08, 0x08, 0x08, 0x08], '/': [0x20, 0x10, 0x08, 0x04, 0x02],
  '(': [0x00, 0x1c, 0x22, 0x41, 0x00], ')': [0x00, 0x41, 0x22, 0x1c, 0x00], '&': [0x36, 0x49, 0x55, 0x22, 0x50],
  '#': [0x14, 0x7f, 0x14, 0x7f, 0x14], "'": [0x00, 0x05, 0x03, 0x00, 0x00], ',': [0x00, 0x50, 0x30, 0x00, 0x00],
}

// Characters a line of `scale` fits across the key.
const fits = scale => Math.floor(SIZE / (6 * scale))

// As many whole words of `str` as fit in `n` characters; one word longer
// than that is cut.
export function fitWords(str, n) {
  return nameLines(str, n, 1)[0] ?? ''
}

// `str` wrapped into at most `max` lines of `n` characters, at whole words;
// a word longer than a line is cut.
export function nameLines(str, n, max = 2) {
  const lines = []
  let line = ''
  for (const word of str.trim().split(/\s+/).filter(Boolean)) {
    const w = word.slice(0, n)
    const next = line ? `${line} ${w}` : w
    if (next.length <= n) {
      line = next
      continue
    }
    lines.push(line)
    if (lines.length === max) return lines
    line = w
  }
  if (line) lines.push(line)
  return lines.slice(0, max)
}

class Key {
  constructor(bg) {
    this.px = new Uint8Array(SIZE * SIZE * 3)
    this.rect(0, 0, SIZE, SIZE, bg)
  }

  blit(px) {
    this.px.set(px)
  }

  // `alpha` 0..1 blends over what is there.
  rect(x, y, w, h, rgb, alpha = 1) {
    const x0 = Math.max(0, Math.round(x))
    const y0 = Math.max(0, Math.round(y))
    const x1 = Math.min(SIZE, Math.round(x + w))
    const y1 = Math.min(SIZE, Math.round(y + h))
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * SIZE + xx) * 3
        for (let c = 0; c < 3; c++) this.px[i + c] = Math.round(this.px[i + c] * (1 - alpha) + rgb[c] * alpha)
      }
    }
  }

  sprite(rows, palette, x, y, alpha) {
    rows.forEach((row, r) => {
      ;[...row].forEach((ch, c) => {
        const rgb = palette[ch]
        if (rgb) this.rect(x + c * U, y + r * U, U, U, rgb, alpha)
      })
    })
  }

  // Centred on `cx`, the glyphs' top row at `top`.
  text(str, cx, top, rgb, scale = 1) {
    const chars = [...fitWords(str.toUpperCase(), fits(scale))]
    const width = chars.length * 6 * scale - scale
    let x = Math.round(cx - width / 2)
    for (const ch of chars) {
      const cols = GLYPHS[ch]
      if (cols) {
        cols.forEach((bits, col) => {
          for (let row = 0; row < 7; row++) {
            if (bits & (1 << row)) this.rect(x + col * scale, top + row * scale, scale, scale, rgb)
          }
        })
      }
      x += 6 * scale
    }
  }
}

export function heatColor(pct) {
  return HEAT.find(([over]) => pct > over)[1]
}

// What he wears on his face and body, in key pixels from his body's
// top-left (x, y): his eyes are 3 pixels square at x+9 and x+21, y+6.
const WEAR = {
  glasses(key, x, y, c, alpha) {
    for (const ex of [x + 9, x + 21]) {
      key.rect(ex - 1, y + 5, 5, 1, c, alpha)
      key.rect(ex - 1, y + 9, 5, 1, c, alpha)
      key.rect(ex - 1, y + 5, 1, 5, c, alpha)
      key.rect(ex + 3, y + 5, 1, 5, c, alpha)
    }
    key.rect(x + 12, y + 6, 9, 1, c, alpha)
    key.rect(x + 6, y + 6, 2, 1, c, alpha)
    key.rect(x + 25, y + 6, 2, 1, c, alpha)
  },
  sunglasses(key, x, y, c, alpha) {
    for (const ex of [x + 9, x + 21]) {
      key.rect(ex - 1, y + 5, 5, 4, c, alpha)
      key.rect(ex, y + 6, 1, 1, [235, 235, 235], 0.6 * alpha)
    }
    key.rect(x + 12, y + 6, 9, 1, c, alpha)
  },
  bowtie(key, x, y, c, alpha) {
    key.rect(x + 11, y + 10, 4, 5, c, alpha)
    key.rect(x + 18, y + 10, 4, 5, c, alpha)
    key.rect(x + 15, y + 11, 3, 3, c.map(v => Math.round(v * 0.7)), alpha)
  },
  scarf(key, x, y, c, alpha) {
    key.rect(x + 6, y + 9, 21, 3, c, alpha)
    key.rect(x + 20, y + 12, 3, 6, c, alpha)
  },
  blush(key, x, y, c, alpha) {
    key.rect(x + 6, y + 8, 3, 1, c, 0.85 * alpha)
    key.rect(x + 24, y + 8, 3, 1, c, 0.85 * alpha)
  },
  moustache(key, x, y, c, alpha) {
    key.rect(x + 11, y + 9, 11, 2, c, alpha)
    key.rect(x + 9, y + 10, 3, 2, c, alpha)
    key.rect(x + 21, y + 10, 3, 2, c, alpha)
  },
}

// Clawd in `look` (see wardrobe.js) with his body's top-left at x, y (the
// hat above it). `pose`: eyes ('open' | 'down' | 'closed'), lookDx, armDy
// [left, right], alpha.
function clawd(key, x, y0, look, now, { eyes = 'open', lookDx = 0, armDy = [0, 0], alpha = 1, solid = null, atLaptop = false } = {}) {
  // A Codex dot stands where Clawd's feet would; no arms to wave, so a
  // waving or tapping pose is a little hop.
  if (look.species === 'codex') {
    const hop = armDy[0] < armDy[1] ? 2 : 0
    drawDot(key, look.dot, x + 16.5, y0 + 24, { eyes, lookDx, hop, atLaptop, alpha, solid })
    return
  }
  // A Grok bot stands and hops the same way.
  if (look.species === 'grokbot') {
    const hop = armDy[0] < armDy[1] ? 2 : 0
    drawGrokBot(key, look, x + 16.5, y0 + 24, { eyes, lookDx, hop, atLaptop, alpha, solid })
    return
  }
  const kind = SPECIES[look.species] ?? SPECIES.clawd
  const y = y0
  const body = solid ?? BODIES[look.body] ?? BODIES[0]
  const parts = { X: body }
  const hat = HATS[look.hat] ?? HATS.tophat
  const set = hat.colors[look.hatColors] ?? hat.colors[0]
  const colors = solid ? Object.fromEntries(Object.keys(set).map(k => [k, solid])) : set
  const rows = hat.spin && Math.floor(now / 120) % 2 ? hat.spin : hat.rows
  key.sprite(kind.head, parts, x, y, alpha)
  key.sprite(rows, colors, x, y - 4 * U, alpha)

  const wear = WEAR[look.accessory]
  const wearColor = solid ?? (ACCESSORIES[look.accessory] ?? [])[look.accColor ?? 0] ?? [0, 0, 0]
  if (look.accessory !== 'sunglasses' && !solid) {
    const shape = { open: [0, 3], down: [1, 2], closed: [2, 1] }[eyes]
    for (const col of [3, 7]) key.rect(x + col * U + lookDx, y + 2 * U + shape[0], U, shape[1], kind.eye, alpha)
  }
  key.sprite(kind.torso, parts, x, y + 3 * U, alpha)
  key.rect(x, y + 3 * U + armDy[0], 2 * U, U, body, alpha)
  key.rect(x + 9 * U, y + 3 * U + armDy[1], 2 * U, U, body, alpha)
  key.sprite(kind.legs, parts, x, y + 6 * U, alpha)
  if (wear) wear(key, x, y, wearColor, alpha)
}

// Clawd with a one-pixel dark outline, so he stands out on any scene.
function outlined(key, x, y, look, now, pose = {}) {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ])
    clawd(key, x + dx, y + dy, look, now, { ...pose, solid: OUTLINE })
  clawd(key, x, y, look, now, pose)
}

// His scene, moving on his own clock.
function scene(key, me, t) {
  key.blit(sceneBase(me.scene, me.sceneSeed))
  sceneMotion(me.scene, me.sceneSeed, t, (x, y, w, h, rgb, a) => key.rect(x, y, w, h, rgb, a))
}

function frame(key, rgb, alpha = 1, w = 3) {
  key.rect(0, 0, SIZE, w, rgb, alpha)
  key.rect(0, SIZE - w, SIZE, w, rgb, alpha)
  key.rect(0, w, w, SIZE - 2 * w, rgb, alpha)
  key.rect(SIZE - w, w, w, SIZE - 2 * w, rgb, alpha)
}

// The context window over his hat, in the fire's colours.
function contextBar(key, pct, now) {
  const w = 44
  const x = (SIZE - w) / 2
  // Ablaze, it flickers between the two hottest colours.
  const color = heat(pct) >= 4 && now % 700 >= 350 ? [255, 130, 100] : heatColor(pct)
  key.rect(x, 3, w, 4, [45, 45, 50])
  key.rect(x, 3, Math.max(1, Math.round((w * Math.min(100, pct)) / 100)), 4, color)
}

// ---- Smoke and fire ----

// The heat of a context figure: 0 cool, 1 smoking, 2 a small fire, 3 a
// bigger one, 4 ablaze.
export function heat(pct) {
  if (typeof pct !== 'number') return 0
  return pct >= 90 ? 4 : pct >= 80 ? 3 : pct >= 70 ? 2 : pct >= 60 ? 1 : 0
}

// Three flickering frames of one flame: r its edge, o its middle, y its core.
const FLAME = [
  ['..r..', '..rr.', '.ror.', '.rorr', 'royor', 'ryyyr', '.ryr.'],
  ['.r...', '.rr..', '.ror.', 'rroor', 'royor', 'ryyor', '.ryr.'],
  ['...r.', '..r..', '.rro.', 'roor.', 'royyr', 'royyr', '.ryr.'],
]
const FIRE = { r: [230, 60, 30], o: [255, 140, 30], y: [255, 225, 100] }
// Light, so it shows on the keys' dark scenes.
const SMOKE = [190, 190, 195]
const SMOKE_DARK = [135, 135, 140]
const STEAM = [225, 228, 235]
const EMBER = [255, 200, 80]
const FLICKER_MS = 110
const SMOKE_MS = 2600
const DOUSE_MS = 2500
const loop = (now, period, phase = 0) => ((now + phase) % period) / period

// Where it burns: on his laptop's lid while he works, else
// round his feet. Each spot is a flame's base centre and its size (key
// pixels a flame pixel); `puffs` are where smoke rises and which way it
// drifts; `embers` the span they rise from.
const BURN = {
  laptop: {
    flames: [[], [], [[45, 33, 1]], [[28, 33, 1], [37, 33, 1], [45, 33, 1]], [[28, 33, 1], [37, 33, 1], [46, 33, 1], [14, 47, 2], [59, 47, 2], [8, 52, 1], [65, 52, 1], [21, 52, 1]]],
    puffs: [[44, 7], [27, -7], [47, 10], [24, -10], [42, 4]],
    puffY: 31,
    embers: [26, 22],
  },
  feet: {
    flames: [[], [], [[58, 48, 1]], [[14, 48, 1], [58, 48, 1], [36, 52, 1]], [[14, 48, 2], [58, 48, 2], [7, 52, 1], [65, 52, 1], [36, 52, 1]]],
    puffs: [[56, 6], [16, -6], [59, 9], [13, -9], [54, 3]],
    puffY: 42,
    embers: [12, 48],
  },
}

function flame(key, bx, by, size, t, i, alpha) {
  const frame = FLAME[Math.min(2, Math.floor(loop(t, FLICKER_MS * 3, i * 137) * 3))]
  const x = bx - (5 * size) / 2
  const y = by - 7 * size
  frame.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (FIRE[ch]) key.rect(x + c * size, y + r * size, size, size, FIRE[ch], alpha)
    })
  })
}

// Smoke, flames and embers for `level` at `where`; while compacting
// (`dousedAgo` since it began) the flames die down and sink and steam
// rises, as when Clawd puts his laptop out.
function fire(key, level, t, where, dousedAgo = null) {
  if (level <= 0) return
  const spot = BURN[where]
  const doused = dousedAgo !== null

  if (level >= 4 && !doused) {
    const flicker = [0.6, 1, 0.7, 0.95][Math.floor(loop(t, 700) * 4)]
    key.rect(0, 14, SIZE, 40, [255, 140, 30], 0.07 * flicker)
  }

  const p = doused ? Math.min(1, dousedAgo / DOUSE_MS) : 0
  if (p < 1) {
    spot.flames[level].forEach(([bx, by, size], i) => flame(key, bx, by + 5 * p, size, t, i, 1 - p))
    const embers = level >= 4 ? 6 : level >= 3 ? 3 : 0
    for (let i = 0; i < embers; i++) {
      const e = loop(t, 1600, (i * 1600) / embers)
      const ex = spot.embers[0] + ((i * 37) % spot.embers[1]) + (i % 2 === 0 ? 4 : -4) * e
      key.rect(ex, spot.puffY - 20 * e, 1.5, 1.5, EMBER, (e < 0.5 ? 1 : 2 - 2 * e) * (1 - p))
    }
  }

  // Puffs rising and drifting outward, more and darker as it heats.
  const tint = doused ? STEAM : level >= 3 ? SMOKE_DARK : SMOKE
  const count = doused ? 4 : Math.min(5, level + 1)
  const size = level >= 3 || doused ? 6 : 5
  for (let i = 0; i < count; i++) {
    const e = loop(t, SMOKE_MS, (i * SMOKE_MS) / count)
    const [px, dx] = spot.puffs[i]
    const a = e < 0.2 ? (e / 0.2) * 0.9 : 0.9 * (1 - (e - 0.2) / 0.8)
    key.rect(px + dx * e, spot.puffY - 20 * e, size, size, tint, a)
  }
}

// A key flashes, once every beat (its speed), every such key together: the
// whole key (screen), a fade in and out (pulse), or a border (frame); in
// one of FLASH_COLORS.
const FLASH_MS = 1000
export const FLASH_STYLES = ['screen', 'pulse', 'frame']
export const FLASH_COLORS = {
  white: [255, 255, 255],
  yellow: [255, 214, 60],
  teal: HAT_BAND,
  red: [235, 55, 55],
  blue: [70, 140, 255],
  pink: [255, 110, 190],
}
// Each style's own option (STYLE_OPTION): how strong the whole key or the
// fade is (a share of the most it goes to), how thick the border is (key
// pixels); and for every style, its beat (ms).
export const FLASH_OPTIONS = {
  strength: { light: 0.5, medium: 0.75, strong: 1 },
  size: { thin: 3, medium: 7, thick: 10 },
  speed: { slow: 2000, normal: 1000, fast: 500 },
}
export const STYLE_OPTION = { screen: 'strength', pulse: 'strength', frame: 'size' }
const OPTIONS = { strength: 'strong', size: 'medium', speed: 'normal' }

// What a key can flash for, the first that applies winning: asking a
// question, asking permission, a turn just finished (its first
// FINISHED_MS), waiting on you (your move), compacting, the context nearly
// full (CONTEXT_PCT or more). Each is on or off, in its own style, colour
// and options; only questions flash until changed.
export const FLASH_EVENTS = ['question', 'permission', 'finished', 'waiting', 'compacting', 'context']
export const FLASH_EVENT_NAMES = {
  question: 'Asking a question',
  permission: 'Asking permission',
  finished: 'Just finished',
  waiting: 'Waiting for you',
  compacting: 'Compacting',
  context: 'Context nearly full',
}
export const DEFAULT_FLASHES = {
  question: { on: true, style: 'screen', color: 'white', ...OPTIONS },
  permission: { on: false, style: 'screen', color: 'yellow', ...OPTIONS },
  finished: { on: false, style: 'pulse', color: 'teal', ...OPTIONS },
  waiting: { on: false, style: 'frame', color: 'pink', ...OPTIONS },
  compacting: { on: false, style: 'pulse', color: 'blue', ...OPTIONS },
  context: { on: false, style: 'frame', color: 'red', ...OPTIONS },
}
const FINISHED_MS = 10_000
const CONTEXT_PCT = 90

const FLASH_WHEN = {
  question: a => a.kind === 'ask' && a.ask === 'question',
  permission: a => a.kind === 'ask' && a.ask !== 'question',
  finished: (a, now) => a.kind === 'done' && now - (a.since ?? 0) < FINISHED_MS,
  waiting: a => a.kind === 'done',
  compacting: a => a.kind === 'compacting',
  context: a => typeof a.pct === 'number' && a.pct >= CONTEXT_PCT,
}

// The flashes that are on, as the renderer takes them: { event: { style,
// color, strength, size, speed } }.
export function enabledFlashes(settings) {
  return Object.fromEntries(
    FLASH_EVENTS.filter(e => settings?.[e]?.on).map(e => {
      const { style, color, strength, size, speed } = settings[e]
      return [e, { style, color, strength, size, speed }]
    }),
  )
}

// How `agent`'s key flashes now ({ style, color, … }), or null.
export function flashFor(agent, now, flash) {
  const event = FLASH_EVENTS.find(e => flash?.[e] && FLASH_WHEN[e](agent, now))
  return event ? flash[event] : null
}

// Over everything else on the key: what is under it shows through a little.
function flashOver(key, { style, color, strength, size, speed }, now) {
  const rgb = FLASH_COLORS[color] ?? FLASH_COLORS.white
  const beat = FLASH_OPTIONS.speed[speed] ?? FLASH_MS
  const phase = (now % beat) / beat
  const share = FLASH_OPTIONS.strength[strength] ?? 1
  if (style === 'pulse') key.rect(0, 0, SIZE, SIZE, rgb, 0.8 * share * (0.5 - 0.5 * Math.cos(phase * 2 * Math.PI)))
  else if (phase < 0.5) {
    if (style === 'frame') frame(key, rgb, 1, FLASH_OPTIONS.size[size] ?? FLASH_OPTIONS.size.medium)
    else key.rect(0, 0, SIZE, SIZE, rgb, 0.85 * share)
  }
}

function agentKey(agent, now, flash) {
  // His kind follows the tool his session runs in.
  const species = agent.tool === 'codex' || agent.tool === 'grokbot' ? agent.tool : (agent.look?.species ?? 'clawd')
  const me = { ...CLASSIC, ...agent.look, species }
  // His own clock: nobody blinks, taps or hops in step.
  const t = now + (me.phase ?? 0)
  const key = new Key([0, 0, 0])
  scene(key, me, t)
  // A slow pulse when he asks, so it reads from across the desk.
  const pulse = 0.5 + 0.5 * Math.sin((now / 1200) * 2 * Math.PI)
  if (agent.kind === 'ask') key.rect(0, 0, SIZE, SIZE, [190, 25, 25], 0.2 + 0.3 * pulse)
  if (agent.kind === 'compacting') key.rect(0, 0, SIZE, SIZE, [20, 40, 130], 0.4)
  if (typeof agent.pct === 'number') contextBar(key, agent.pct, now)
  const x = Math.round((SIZE - 11 * U) / 2)
  const y = 22
  const blink = t % me.blinkMs < 160
  const glance = (t % 7000 < 1200 ? -2 : 0) + (t % 7000 >= 3500 && t % 7000 < 4700 ? 2 : 0)
  switch (agent.kind) {
    case 'working': {
      const tap = Math.floor(t / me.tapMs) % 2
      const pose = { eyes: blink ? 'closed' : 'down', armDy: tap ? [-2, 0] : [0, -2], atLaptop: true }
      let dx = 0
      let dy = 0
      if (me.work === 'bob') dy = Math.floor(t / (me.tapMs * 4)) % 2
      if (me.work === 'lean') {
        dx = Math.floor(t / 2500) % 2
        if (t % 9000 < 900) pose.eyes = 'open'
      }
      outlined(key, x + dx, y + dy, me, t, pose)
      // His laptop, from behind, as on the desk.
      key.rect(x + 4, 33, 25, 13, [70, 70, 82])
      key.rect(x + 15, 38, 3, 3, HAT_BAND, 0.7)
      key.rect(x, 46, 33, 2, [110, 110, 120])
      break
    }
    case 'ask': {
      const wave = Math.floor(t / 300) % 2
      outlined(key, x, y, me, t, { armDy: wave ? [-2 * U, 0] : [0, -2 * U] })
      break
    }
    case 'done': {
      const pose = { eyes: blink ? 'closed' : 'open' }
      let dy = Math.floor(t / 1500) % 2
      if (me.done === 'wave' && t % 4000 < 1500) pose.armDy = [0, Math.floor(t / 250) % 2 ? -2 * U : -U]
      if (me.done === 'look') pose.lookDx = glance
      if (me.done === 'bounce') dy = t % 2000 < 300 ? -3 : 0
      outlined(key, x, y + dy, me, t, pose)
      break
    }
    case 'compacting':
      outlined(key, x, y, me, t, { eyes: 'closed', armDy: [-U, -U] })
      break
    default: {
      const pose = { eyes: blink ? 'closed' : 'open' }
      let dx = 0
      let dy = 0
      if (me.idle === 'glance') pose.lookDx = glance
      if (me.idle === 'hop') dy = t % 5000 < 250 ? -4 : 0
      if (me.idle === 'sway') dx = Math.floor(t / 1200) % 2 ? 1 : -1
      if (me.idle === 'nod' && t % 6000 < 2000) {
        pose.eyes = 'down'
        dy = 1
      }
      outlined(key, x + dx, y + dy, me, t, pose)
    }
  }

  // The laptop smokes, then burns, as his context fills (round his feet
  // when he is not at it); compacting puts it out.
  const level = heat(agent.pct)
  if (agent.kind === 'compacting') fire(key, Math.max(level, 1), t, 'feet', Math.max(0, now - (agent.since ?? now)))
  else fire(key, level, t, agent.kind === 'working' ? 'laptop' : 'feet')

  if (TICKING.has(agent.kind)) tickingStrip(key, keyLabel(agent), t)
  else nameStrip(key, keyLabel(agent))

  const color = FRAME[agent.kind]
  if (color) frame(key, color, agent.kind === 'ask' ? 0.55 + 0.45 * pulse : 1)
  if (agent.kind === 'ask' && Math.floor(now / 600) % 2 === 0) {
    key.text('!', 62, 13, OUTLINE, 2)
    key.text('!', 61, 12, WHITE, 2)
  }
  const flashing = flashFor(agent, now, flash)
  if (flashing) flashOver(key, flashing, now)
  return key
}

// What he is doing, in words: an asking key says what it asks for. The
// rest are at it a while, so their dots tick on (tickingStrip).
const DOING = {
  ask: { permission: 'PERMISSION', question: 'QUESTION', other: 'ASKING' },
  done: 'WAITING',
  working: 'WORKING',
  compacting: 'COMPACTING',
}
const TICKING = new Set(['done', 'working', 'compacting'])

// The words under him: what he is doing, or, idle, his name (the first
// words of the session's title that fit one line: "Pixel deck multi-agent
// dashboard" is PIXEL DECK).
export function keyLabel(agent) {
  const doing = DOING[agent.kind]
  if (agent.kind === 'ask') return doing[agent.ask] ?? doing.other
  return doing ?? agent.title
}

// `title` on a darker strip with a shadow, so it reads on any scene.
function nameStrip(key, title) {
  const name = fitWords((title ?? '').toUpperCase(), fits(1))
  key.rect(0, 52, SIZE, 15, [0, 0, 0], 0.5)
  key.text(name, SIZE / 2 + 1, 57, OUTLINE)
  key.text(name, SIZE / 2, 56, WHITE)
}

// `word` on the same strip with its dots coming one at a time, none, ".",
// "..", "...", and round again; the word holds still while they do. The
// dots are smaller than the font's, so COMPACTING... still fits.
const TICK_MS = 400
function tickingStrip(key, word, t) {
  const dots = Math.floor(t / TICK_MS) % 4
  const w = word.length * 6 - 1
  const x0 = Math.round((SIZE - (w + 2 + 10)) / 2)
  key.rect(0, 52, SIZE, 15, [0, 0, 0], 0.5)
  key.text(word, x0 + w / 2 + 1, 57, OUTLINE)
  key.text(word, x0 + w / 2, 56, WHITE)
  for (let i = 0; i < dots; i++) {
    const x = x0 + w + 2 + i * 4
    key.rect(x + 1, 62, 2, 2, OUTLINE)
    key.rect(x, 61, 2, 2, WHITE)
  }
}

// A background on its own, named: the README's picture of them all.
export function renderScene(name, seed, now, title) {
  const key = new Key([0, 0, 0])
  scene(key, { scene: name, sceneSeed: seed }, now)
  nameStrip(key, title)
  return key.px
}

// The last key when there are more agents than keys.
function moreKey(slot) {
  const key = new Key(slot.asking > 0 ? [110, 15, 15] : [22, 22, 28])
  key.text(`+${slot.more}`, SIZE / 2, 12, WHITE, 3)
  key.text(slot.asking > 0 ? `${slot.asking} ASK` : 'MORE', SIZE / 2, 44, slot.asking > 0 ? [255, 220, 120] : HAT_BAND)
  key.text(`${slot.page + 1}/${slot.pages}`, SIZE / 2, 58, [120, 120, 120])
  return key
}

// Just him, centred, in `look`, on his scene or on plain `bg`: the control
// page's pictures, the app icon and the exported stickers. He is outlined on
// his scene, and on `bg` when `outline` says so.
export function renderPortrait(look, now = 0, bg = null, outline = !bg) {
  const key = new Key(bg ?? [0, 0, 0])
  const me = { ...CLASSIC, ...look }
  const t = now + (me.phase ?? 0)
  if (!bg) scene(key, me, t)
  const pose = { eyes: t % me.blinkMs < 160 ? 'closed' : 'open' }
  if (outline) outlined(key, Math.round((SIZE - 11 * U) / 2), 30, me, t, pose)
  else clawd(key, Math.round((SIZE - 11 * U) / 2), 30, me, t, pose)
  return key.px
}

// The key's pixels for `slot` (an agent, an overflow slot, or null) at
// `now`; `pressed` rings it in white for a moment. `flash`: the flashes
// that are on (enabledFlashes), questions only unless given.
export function renderKey(slot, now, { pressed = false, flash = enabledFlashes(DEFAULT_FLASHES) } = {}) {
  const key = slot == null ? new Key([0, 0, 0]) : 'more' in slot ? moreKey(slot) : agentKey(slot, now, flash)
  if (pressed) {
    key.rect(0, 0, SIZE, 3, WHITE)
    key.rect(0, SIZE - 3, SIZE, 3, WHITE)
    key.rect(0, 0, 3, SIZE, WHITE)
    key.rect(SIZE - 3, 0, 3, SIZE, WHITE)
  }
  return key.px
}
