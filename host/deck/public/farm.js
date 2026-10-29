// The farm page, full screen on its own display (main.js opens it there):
// the farm, the office or the mall drawn in pixels, a world pixel to SCALE
// screen pixels, and every agent's Pixeling in it, drawn by the deck's own
// code (renderFigure). Tap one to open his session, drag him out of the way,
// or right-click him to dismiss him; tap the way in (the barn door, the lift, the mall's doors)
// for a new agent, or the corner's name for the next place. Who goes where is farm.js's.
//
// As the Desktop (?desktop=back, main.js opens it in a see-through window
// along the bottom of a screen) it is only the Pixelings, walking along
// the bottom with nothing behind them. The window lets clicks through to
// what is under it, except while the mouse is over one of them. Unless
// they are kept on top, that window is among your windows, and those
// asking you something show instead in a second one over every window
// (?desktop=front), standing where they stood, until they don't.
import { ARRIVE_MS, atDoor, desktopLayout, Farm, FARM_H, farmLayout, farmRandom, FEET, LEAVE_MS, SCENES } from '/lib/farm.js'
import { DESKTOP_SIZES, desktopGrowth } from '/lib/mode.js'
import { fitWords, GLYPHS, heat, heatColor, keyLabel, renderFigure, SIZE } from '/lib/render.js'

const canvas = document.getElementById('farm')
const g = canvas.getContext('2d')
const FRAME_MS = 33
// ?hour=22 holds the sky at that hour (to see the farm at night), and
// ?scene=mall shows that place whatever is chosen.
const PARAMS = new URLSearchParams(location.search)
const HOUR = PARAMS.get('hour')
const SCENE = PARAMS.get('scene')
const DESKTOP = PARAMS.has('desktop')
const FRONT = PARAMS.get('desktop') === 'front'
if (DESKTOP) document.documentElement.style.background = document.body.style.background = 'transparent'

let scale = 1
// Screen pixels to a world pixel in the canvas itself: the Desktop draws
// at the screen's own, so one grown a little bigger stays sharp.
let res = 1
let L = null
let farm = null
let state = { agents: [] }
// The field without what moves, drawn again as the sky changes.
const bg = document.createElement('canvas')
let bgKey = ''
// Taps, shown a moment: { x, y, at, word }.
const taps = []

const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rect = (ctx, x, y, w, h, c, a = 1) => {
  ctx.fillStyle = rgba(c, a)
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}
const oval = (ctx, cx, cy, rx, ry, c, a = 1) => {
  for (let y = -ry; y <= ry; y++) {
    const half = rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2))
    rect(ctx, cx - half, cy + y, half * 2, 1, c, a)
  }
}
// The same number every time for n (and the world's seed): 0 to 1.
const hash = n => {
  const v = Math.sin(n * 127.1 + L.seed * 311.7) * 43758.5453
  return v - Math.floor(v)
}
const BLACK = [0, 0, 0]
const WHITE = [255, 255, 255]
const NIGHT = [10, 16, 52]

// `str` in the deck's pixel font, centred on cx, a world pixel a font pixel.
function text(ctx, str, cx, top, c, a = 1) {
  const chars = [...str.toUpperCase()]
  let x = Math.round(cx - (chars.length * 6 - 1) / 2)
  ctx.fillStyle = rgba(c, a)
  for (const ch of chars) {
    ;(GLYPHS[ch] ?? []).forEach((bits, col) => {
      for (let row = 0; row < 7; row++) if (bits & (1 << row)) ctx.fillRect(x + col, top + row, 1, 1)
    })
    x += 6
  }
}

// ---- The sky through the day ----

const SKIES = {
  night: { top: [8, 12, 34], low: [30, 40, 82], tint: 0.5 },
  dawn: { top: [70, 88, 160], low: [250, 172, 122], tint: 0.15 },
  day: { top: [86, 158, 230], low: [182, 222, 246], tint: 0 },
  dusk: { top: [62, 60, 132], low: [246, 142, 102], tint: 0.22 },
}
const DAY = [
  [0, 'night'],
  [5.5, 'night'],
  [6.5, 'dawn'],
  [8, 'day'],
  [17.5, 'day'],
  [19, 'dusk'],
  [20.5, 'night'],
  [24, 'night'],
]

// The sky at `date`'s hour, from the keyframes either side of it.
function skyAt(date) {
  const h = HOUR !== null && Number(HOUR) >= 0 && Number(HOUR) < 24 ? Number(HOUR) : date.getHours() + date.getMinutes() / 60
  const i = DAY.findIndex(([at], k) => h >= at && h < DAY[k + 1][0])
  const [a, an] = DAY[i]
  const [b, bn] = DAY[i + 1]
  const t = (h - a) / (b - a)
  const A = SKIES[an]
  const B = SKIES[bn]
  return { hour: h, top: lerp(A.top, B.top, t), low: lerp(A.low, B.low, t), tint: A.tint + (B.tint - A.tint) * t }
}

// ---- The farm, drawn once for each sky ----

// The sign over the way in: a new agent.
function sign(ctx, d, ink = [84, 34, 28]) {
  rect(ctx, d.x + d.w / 2 - 18, d.y - 13, 36, 10, [222, 190, 128])
  rect(ctx, d.x + d.w / 2 - 18, d.y - 4, 36, 1, [150, 116, 78])
  text(ctx, '+ NEW', d.x + d.w / 2, d.y - 12, ink)
}

function paintFarm(ctx, sky) {
  const { w, h, horizon, ground, barn, crops, pond, trees } = L
  const r = farmRandom(L)
  for (let y = 0; y < horizon; y++) rect(ctx, 0, y, w, 1, lerp(sky.top, sky.low, y / horizon))

  // Stars, as it darkens.
  if (sky.tint > 0.2) {
    for (let i = 0; i < 90; i++) rect(ctx, r() * w, r() * (horizon - 20), 1, 1, [255, 255, 235], ((sky.tint - 0.2) / 0.3) * (0.4 + 0.6 * r()))
  } else for (let i = 0; i < 180; i++) r()

  // The sun crosses from six to half past seven; the moon the rest.
  const day = (sky.hour - 6) / 13.5
  const sun = day >= 0 && day <= 1
  const p = sun ? day : ((sky.hour + 24 - 19.5) % 24) / 10.5
  const bx = w * (0.08 + 0.84 * p)
  const by = horizon - Math.sin(p * Math.PI) * (horizon - 16)
  if (sun) {
    rect(ctx, bx - 9, by - 9, 18, 18, [255, 236, 150], 0.25)
    rect(ctx, bx - 7, by - 6, 14, 12, [255, 226, 120])
    rect(ctx, bx - 6, by - 7, 12, 14, [255, 226, 120])
  } else {
    rect(ctx, bx - 8, by - 8, 16, 16, [236, 236, 220], 0.12)
    rect(ctx, bx - 6, by - 5, 12, 10, [236, 236, 220])
    rect(ctx, bx - 5, by - 6, 10, 12, [236, 236, 220])
    rect(ctx, bx - 3, by - 3, 3, 3, [200, 200, 186])
    rect(ctx, bx + 2, by + 1, 2, 2, [200, 200, 186])
  }

  // Two rows of hills.
  const far = lerp(sky.low, [80, 120, 104], 0.6)
  const near = lerp(sky.low, [70, 132, 72], 0.75)
  for (let x = 0; x < w; x++) {
    const fy = horizon - 20 - 9 * Math.sin(x / 41 + 1.3) - 5 * Math.sin(x / 17)
    rect(ctx, x, fy, 1, horizon - fy, far)
    const ny = horizon - 7 - 5 * Math.sin(x / 29 + 4) - 2 * Math.sin(x / 9)
    rect(ctx, x, ny, 1, horizon - ny, near)
  }

  // The grass, lighter toward the hills, with tufts and flowers.
  for (let y = horizon; y < h; y++) rect(ctx, 0, y, w, 1, lerp([128, 186, 84], [78, 146, 58], (y - horizon) / (h - horizon)))
  for (let i = 0; i < w * 1.4; i++) {
    const x = r() * w
    const y = horizon + 2 + r() * (h - horizon)
    rect(ctx, x, y, 1, 2, r() < 0.5 ? [62, 120, 48] : [150, 204, 100], 0.8)
  }
  const FLOWERS = [
    [255, 240, 120],
    [255, 255, 255],
    [255, 140, 180],
    [170, 150, 255],
  ]
  for (let i = 0; i < w / 6; i++) {
    const x = r() * w
    const y = ground.top - 8 + r() * (h - ground.top)
    const c = FLOWERS[Math.floor(r() * FLOWERS.length)]
    const inPond = ((x - pond.cx) / (pond.rx + 6)) ** 2 + ((y - pond.cy) / (pond.ry + 6)) ** 2 < 1
    const inCrops = x > crops.x - 6 && x < crops.x + crops.w + 6 && y > crops.y - 6 && y < crops.y + crops.rows * crops.gap
    if (!inPond && !inCrops) {
      rect(ctx, x, y + 1, 1, 2, [60, 120, 48])
      rect(ctx, x - 1, y, 3, 1, c)
      rect(ctx, x, y - 1, 1, 3, c)
    }
  }

  // The fence along the back.
  const wood = [150, 108, 66]
  const dark = [104, 72, 44]
  for (let x = 4; x < w; x += 18) {
    if (x > barn.x - 6 && x < barn.x + barn.w + 4) continue
    rect(ctx, x, horizon - 2, 3, 14, wood)
    rect(ctx, x + 2, horizon - 2, 1, 14, dark)
  }
  for (const dy of [2, 7]) {
    for (let x = 0; x < w; x++) if (!(x > barn.x - 6 && x < barn.x + barn.w + 6)) rect(ctx, x, horizon + dy, 1, 2, x % 18 < 3 ? dark : wood)
  }

  // A dirt path from the barn door down to the front.
  for (let y = barn.base; y < h; y++) {
    const t = (y - barn.base) / (h - barn.base)
    const cx = barn.door.x + 12 + Math.sin(t * 3) * 26 + t * 30
    const half = 8 + t * 6
    rect(ctx, cx - half, y, half * 2, 1, [182, 146, 100])
    if (r() < 0.5) rect(ctx, cx - half + r() * half * 2, y, 1, 1, [150, 116, 78])
  }

  // The crop field: rows of soil, and what grows in them.
  for (let i = 0; i < crops.rows; i++) {
    const y = crops.y + i * crops.gap
    rect(ctx, crops.x, y, crops.w, 6, [116, 80, 50])
    rect(ctx, crops.x, y + 4, crops.w, 2, [92, 62, 38])
    for (let x = crops.x + 4; x < crops.x + crops.w - 2; x += 9) {
      const kind = (i + Math.floor(x / 9)) % 5
      if (kind === 4 && i % 2) {
        rect(ctx, x - 2, y - 1, 6, 5, [236, 132, 40])
        rect(ctx, x, y - 3, 2, 2, [70, 140, 50])
      } else {
        rect(ctx, x, y - 4, 1, 5, [64, 140, 54])
        rect(ctx, x - 2, y - 3, 2, 2, [92, 176, 68])
        rect(ctx, x + 1, y - 5, 2, 2, [92, 176, 68])
        if (kind === 2) rect(ctx, x - 1, y + 1, 3, 2, [236, 120, 40])
      }
    }
  }

  // The pond, with reeds.
  for (let y = -pond.ry; y <= pond.ry; y++) {
    const half = pond.rx * Math.sqrt(1 - (y / pond.ry) ** 2)
    rect(ctx, pond.cx - half, pond.cy + y, half * 2, 1, [104, 168, 220])
    const inner = Math.max(0, half - 4)
    rect(ctx, pond.cx - inner, pond.cy + y, inner * 2, 1, y < -pond.ry + 3 ? [104, 168, 220] : [58, 118, 186])
  }
  for (const [fx, n] of [
    [-0.95, 4],
    [0.9, 5],
    [0.6, 3],
  ]) {
    const x = pond.cx + pond.rx * fx
    for (let k = 0; k < n; k++) {
      rect(ctx, x + k * 2, pond.cy - 4 - (k % 2) * 3, 1, 9 + (k % 2) * 3, [70, 130, 52])
      if (k % 2) rect(ctx, x + k * 2, pond.cy - 8 - (k % 2) * 3, 1, 3, [120, 80, 50])
    }
  }

  // The trees.
  for (const t of trees) {
    const s = t.size
    rect(ctx, t.x - 4 * s, t.base - 24 * s, 8 * s, 24 * s, [112, 76, 44])
    rect(ctx, t.x + 2 * s, t.base - 24 * s, 2 * s, 24 * s, [88, 58, 34])
    for (const [dx, dy, rr, c] of [
      [0, -40, 20, [52, 120, 56]],
      [-16, -30, 14, [52, 120, 56]],
      [16, -30, 14, [52, 120, 56]],
      [-6, -46, 12, [76, 150, 66]],
      [10, -40, 10, [76, 150, 66]],
    ]) {
      const R = rr * s
      for (let y = -R; y <= R; y++) {
        const half = R * Math.sqrt(1 - (y / R) ** 2)
        rect(ctx, t.x + dx * s - half, t.base + dy * s + y, half * 2, 1, c)
      }
    }
    for (let i = 0; i < 6; i++) rect(ctx, t.x - 20 * s + r() * 40 * s, t.base - 56 * s + r() * 30 * s, 2, 2, [236, 70, 60])
  }

  // The barn.
  const top = barn.base - barn.h
  const wall = barn.base - 40
  rect(ctx, barn.x, wall, barn.w, 40, [176, 52, 44])
  for (let x = barn.x + 6; x < barn.x + barn.w; x += 8) rect(ctx, x, wall, 1, 40, [146, 40, 34])
  for (let y = 0; y < barn.h - 40; y++) {
    const half = (barn.w / 2 + 6) * Math.min(1, (y + 6) / (barn.h - 40))
    rect(ctx, barn.x + barn.w / 2 - half, top + y, half * 2, 1, y < 2 ? [236, 236, 230] : [124, 36, 32])
  }
  rect(ctx, barn.x - 6, wall - 2, barn.w + 12, 3, [236, 236, 230])
  rect(ctx, barn.x + barn.w / 2 - 6, top + 8, 12, 9, [70, 30, 26])
  rect(ctx, barn.x + barn.w / 2 - 6, top + 12, 12, 1, [236, 236, 230])
  const d = barn.door
  rect(ctx, d.x - 2, d.y - 2, d.w + 4, d.h + 2, [236, 236, 230])
  rect(ctx, d.x, d.y, d.w, d.h, [84, 34, 28])
  for (let i = 0; i < d.h; i++) {
    rect(ctx, d.x + (i * d.w) / d.h, d.y + i, 2, 1, [236, 236, 230])
    rect(ctx, d.x + d.w - 2 - (i * d.w) / d.h, d.y + i, 2, 1, [236, 236, 230])
  }
  for (const wx of [barn.x + 8, barn.x + barn.w - 20]) {
    rect(ctx, wx - 1, wall + 9, 14, 12, [236, 236, 230])
    rect(ctx, wx, wall + 10, 12, 10, [60, 40, 36])
  }

  // Darker toward night; the barn's windows lit.
  if (sky.tint > 0) rect(ctx, 0, 0, w, h, [10, 16, 52], sky.tint)
  if (sky.tint > 0.2) {
    for (const wx of [barn.x + 8, barn.x + barn.w - 20]) rect(ctx, wx, wall + 10, 12, 10, [255, 214, 120], Math.min(1, sky.tint * 2))
  }

  sign(ctx, d)
}

// ---- The office, drawn once for each sky ----

// The city through a window at x, y, ww by hh: the sky, and buildings
// whose windows light up at night. The same city in every window.
function city(ctx, x, y, ww, hh, sky) {
  for (let k = 0; k < hh; k++) rect(ctx, x, y + k, ww, 1, lerp(sky.top, sky.low, k / hh))
  for (let i = x; i < x + ww; i++) {
    const n = Math.floor(i / 14)
    const bh = Math.round(hh * (0.3 + 0.55 * hash(n)))
    rect(ctx, i, y + hh - bh, 1, bh, lerp(sky.low, [64, 74, 96], 0.55 + 0.3 * hash(n + 0.5)))
    if (sky.tint > 0.2 && i % 3 === 1 && i % 14 > 1 && i % 14 < 13) {
      for (let k = y + hh - bh + 3; k < y + hh - 2; k += 4) if (hash(i * 7.3 + k) < 0.45) rect(ctx, i, k, 1, 2, [255, 220, 130], Math.min(1, sky.tint * 1.6))
    }
  }
}

const BOOKS = [
  [196, 64, 56],
  [60, 110, 180],
  [230, 190, 80],
  [70, 150, 100],
  [150, 90, 170],
  [236, 236, 226],
]

// Along the office's back wall, standing at x on the floor at b.
const WALL_ART = {
  coffee(ctx, x, b) {
    rect(ctx, x - 24, b - 26, 48, 26, [150, 108, 76])
    rect(ctx, x - 26, b - 28, 52, 3, [96, 74, 62])
    rect(ctx, x - 22, b - 22, 20, 19, [132, 94, 66])
    rect(ctx, x + 2, b - 22, 20, 19, [132, 94, 66])
    rect(ctx, x - 4, b - 14, 1, 3, [230, 210, 170])
    rect(ctx, x + 3, b - 14, 1, 3, [230, 210, 170])
    rect(ctx, x - 9, b - 48, 18, 20, [58, 58, 64])
    rect(ctx, x - 7, b - 46, 14, 5, [96, 96, 104])
    rect(ctx, x + 4, b - 45, 2, 2, [240, 70, 60])
    rect(ctx, x - 3, b - 39, 6, 3, [30, 30, 34])
    rect(ctx, x - 3, b - 33, 6, 5, [245, 245, 240])
    rect(ctx, x + 14, b - 33, 5, 5, [220, 80, 70])
    rect(ctx, x + 19, b - 32, 1, 3, [220, 80, 70])
    rect(ctx, x - 20, b - 33, 5, 5, [80, 140, 210])
    rect(ctx, x - 21, b - 32, 1, 3, [80, 140, 210])
  },
  cooler(ctx, x, b) {
    rect(ctx, x - 7, b - 26, 14, 26, [232, 232, 236])
    rect(ctx, x - 7, b - 2, 14, 2, [190, 190, 196])
    rect(ctx, x - 3, b - 20, 2, 3, [80, 120, 220])
    rect(ctx, x + 1, b - 20, 2, 3, [220, 70, 60])
    rect(ctx, x - 6, b - 42, 12, 16, [150, 206, 242])
    rect(ctx, x - 5, b - 44, 10, 2, [150, 206, 242])
    rect(ctx, x - 2, b - 46, 4, 2, [120, 180, 230])
    rect(ctx, x - 4, b - 40, 2, 12, [214, 238, 252], 0.8)
  },
  desk(ctx, x, b) {
    rect(ctx, x - 20, b - 17, 3, 17, [110, 110, 116])
    rect(ctx, x + 17, b - 17, 3, 17, [110, 110, 116])
    rect(ctx, x - 7, b - 13, 14, 9, [60, 60, 72])
    rect(ctx, x - 1, b - 4, 2, 4, [60, 60, 72])
    rect(ctx, x - 22, b - 20, 44, 3, [176, 134, 92])
    rect(ctx, x - 22, b - 17, 44, 1, [130, 96, 64])
    rect(ctx, x - 12, b - 38, 24, 16, [40, 40, 46])
    rect(ctx, x - 10, b - 36, 20, 12, [60, 110, 170])
    for (let i = 0; i < 4; i++) rect(ctx, x - 8 + (i % 2) * 2, b - 34 + i * 3, 4 + ((i * 5 + x) % 9), 1, [200, 230, 255], 0.8)
    rect(ctx, x - 2, b - 22, 4, 2, [40, 40, 46])
    rect(ctx, x + 14, b - 25, 4, 5, [245, 245, 240])
  },
  plant(ctx, x, b) {
    for (const [dx, dy, rr, c] of [
      [-7, -20, 6, [60, 136, 64]],
      [7, -21, 6, [60, 136, 64]],
      [0, -26, 8, [60, 136, 64]],
      [-3, -34, 6, [92, 170, 80]],
      [4, -31, 5, [92, 170, 80]],
    ]) {
      oval(ctx, x + dx, b + dy, rr * 0.8, rr, c)
    }
    rect(ctx, x - 7, b - 12, 14, 12, [196, 104, 64])
    rect(ctx, x - 8, b - 13, 16, 3, [170, 86, 52])
  },
  vending(ctx, x, b) {
    rect(ctx, x - 16, b - 60, 32, 60, [196, 52, 52])
    rect(ctx, x - 16, b - 60, 32, 2, [230, 90, 80])
    rect(ctx, x - 13, b - 56, 20, 40, [40, 44, 56])
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) rect(ctx, x - 12 + c * 6, b - 54 + r * 10, 4, 6, BOOKS[(r * 3 + c) % BOOKS.length])
      rect(ctx, x - 13, b - 47 + r * 10, 20, 1, [120, 120, 130])
    }
    rect(ctx, x + 9, b - 54, 5, 12, [230, 230, 236])
    for (let k = 0; k < 3; k++) rect(ctx, x + 10, b - 52 + k * 3, 3, 1, [90, 90, 100])
    rect(ctx, x - 13, b - 12, 20, 6, [24, 24, 30])
  },
  shelf(ctx, x, b) {
    rect(ctx, x - 22, b - 66, 44, 66, [128, 88, 58])
    for (let k = 0; k < 4; k++) {
      const y = b - 62 + k * 16
      rect(ctx, x - 19, y, 38, 13, [80, 54, 36])
      for (let bx = x - 18; bx < x + 17; ) {
        const bw = Math.min(x + 18 - bx, 2 + Math.floor(hash(bx + k * 31) * 3))
        const bh = 8 + Math.floor(hash(bx * 3 + k) * 5)
        rect(ctx, bx, y + 13 - bh, bw, bh, BOOKS[Math.floor(hash(bx * 5 + k) * BOOKS.length)])
        bx += bw + (hash(bx + k * 7) < 0.15 ? 3 : 0)
      }
      rect(ctx, x - 20, y + 13, 40, 2, [150, 108, 72])
    }
  },
  printer(ctx, x, b) {
    rect(ctx, x - 16, b - 20, 32, 20, [150, 154, 160])
    rect(ctx, x - 14, b - 12, 28, 1, [120, 124, 130])
    rect(ctx, x - 14, b - 32, 28, 12, [216, 218, 222])
    rect(ctx, x - 10, b - 35, 20, 3, [250, 250, 250])
    rect(ctx, x - 10, b - 25, 20, 2, [60, 60, 66])
    rect(ctx, x + 8, b - 30, 3, 2, [80, 220, 120])
  },
}

function paintOffice(ctx, sky) {
  const { w, h, wallBase, door, board } = L
  const clock = L.wall.find(t => t.kind === 'coffee')
  rect(ctx, 0, 0, w, wallBase, [222, 214, 198])
  rect(ctx, 0, 0, w, 6, [186, 178, 164])
  for (let x = 40; x < w; x += 110) {
    rect(ctx, x - 4, 6, 42, 8, [255, 250, 220], 0.15)
    rect(ctx, x, 6, 34, 2, [255, 252, 230])
  }
  // Windows on the city, where nothing hangs on the wall.
  const keep = [
    [door.x - 24, door.x + door.w + 24],
    [board.x - 8, board.x + board.w + 8],
    [clock.x - 14, clock.x + 14],
  ]
  for (let x = door.x + door.w + 30; x + 58 < w - 6; x += 76) {
    if (keep.some(([a, b]) => x + 60 > a && x - 2 < b)) continue
    rect(ctx, x - 2, 14, 62, 52, [244, 244, 240])
    city(ctx, x, 16, 58, 48, sky)
    rect(ctx, x + 28, 16, 2, 48, [244, 244, 240])
    rect(ctx, x - 3, 66, 64, 3, [200, 196, 186])
  }
  // Panelling, and the skirting board.
  rect(ctx, 0, wallBase - 24, w, 24, [186, 160, 128])
  rect(ctx, 0, wallBase - 25, w, 2, [150, 124, 96])
  for (let x = 6; x < w; x += 24) rect(ctx, x, wallBase - 21, 1, 17, [166, 140, 110])
  rect(ctx, 0, wallBase - 3, w, 3, [112, 90, 70])
  // A wooden floor.
  for (let y = wallBase; y < h; y++) rect(ctx, 0, y, w, 1, lerp([200, 156, 108], [166, 120, 80], (y - wallBase) / (h - wallBase)))
  for (let row = 0, y = wallBase + 9; y < h; row++, y += 9) {
    rect(ctx, 0, y, w, 1, [146, 104, 68], 0.55)
    for (let x = (row * 37) % 90; x < w; x += 90) rect(ctx, x, y - 8, 1, 8, [146, 104, 68], 0.45)
  }
  // The rug under the couch.
  const couch = L.things.find(t => t.kind === 'couch')
  rect(ctx, couch.x - 54, couch.base - 6, 108, 26, [150, 64, 60])
  rect(ctx, couch.x - 50, couch.base - 3, 100, 20, [210, 168, 100])
  rect(ctx, couch.x - 48, couch.base - 1, 96, 16, [150, 64, 60])
  for (let k = -40; k <= 40; k += 16) {
    rect(ctx, couch.x + k - 1, couch.base + 3, 3, 8, [210, 168, 100])
    rect(ctx, couch.x + k - 3, couch.base + 6, 7, 2, [210, 168, 100])
  }
  // A whiteboard: the plan, and a chart going up.
  rect(ctx, board.x - 1, 22, board.w + 2, 34, [150, 150, 156])
  rect(ctx, board.x, 23, board.w, 32, [250, 250, 250])
  for (let i = 0; i < 4; i++) rect(ctx, board.x + 4, 27 + i * 5, 10 + Math.floor(hash(i + 3) * 16), 1, i === 0 ? [200, 60, 60] : [60, 90, 190])
  for (let i = 0; i < 4; i++) rect(ctx, board.x + 36 + i * 4, 50 - (i + 1) * 5, 3, (i + 1) * 5, [60, 160, 90])
  rect(ctx, board.x + 4, 56, board.w - 8, 2, [150, 150, 156])
  // The lift.
  const d = door
  rect(ctx, d.x - 4, d.y - 4, d.w + 8, d.h + 4, [140, 146, 154])
  rect(ctx, d.x, d.y, d.w, d.h, [190, 196, 204])
  rect(ctx, d.x + d.w / 2 - 1, d.y, 2, d.h, [120, 126, 134])
  rect(ctx, d.x + 3, d.y + 2, 2, d.h - 4, [222, 228, 234])
  rect(ctx, d.x + d.w / 2 + 3, d.y + 2, 2, d.h - 4, [222, 228, 234])
  rect(ctx, d.x + d.w + 7, d.y + 24, 4, 9, [96, 96, 104])
  rect(ctx, d.x + d.w + 8, d.y + 26, 2, 2, [255, 200, 90])
  rect(ctx, d.x + d.w + 8, d.y + 30, 2, 2, [255, 200, 90])
  for (const t of L.wall) WALL_ART[t.kind](ctx, t.x, L.ground.top - 1)
  if (sky.tint > 0) rect(ctx, 0, 0, w, h, NIGHT, sky.tint * 0.3)
  sign(ctx, d, [60, 60, 70])
}

// ---- The mall, drawn once for each sky ----

const SHOP_COLORS = {
  TOYS: [226, 76, 66],
  SHOES: [70, 130, 210],
  ARCADE: [120, 60, 180],
  BOOKS: [60, 140, 90],
  PETS: [240, 150, 50],
  CANDY: [236, 110, 170],
  PIZZA: [204, 70, 46],
  MUSIC: [52, 52, 74],
  TECH: [40, 150, 190],
  HATS: [150, 110, 70],
}

// What is in a shop's window at x, y, ww by hh.
const GOODS = {
  TOYS(ctx, x, y, ww, hh) {
    rect(ctx, x, y + 24, ww, 2, [200, 200, 206])
    for (let i = 0; i < 4; i++) rect(ctx, x + 4 + i * 13, y + 14, 8, 10, BOOKS[i])
    for (let i = 0; i < 3; i++) oval(ctx, x + 10 + i * 18, y + hh - 8, 5, 5, BOOKS[(i + 2) % 6])
    oval(ctx, x + ww - 9, y + hh - 16, 6, 7, [176, 120, 70])
    oval(ctx, x + ww - 9, y + hh - 26, 5, 4, [176, 120, 70])
  },
  SHOES(ctx, x, y, ww, hh) {
    for (let r = 0; r < 3; r++) {
      const sy = y + 14 + r * 13
      rect(ctx, x, sy + 4, ww, 1, [200, 200, 206])
      for (let i = 0; i < 4; i++) {
        const c = BOOKS[(r + i * 2) % 6]
        rect(ctx, x + 3 + i * 14, sy, 9, 4, c)
        rect(ctx, x + 3 + i * 14, sy - 3, 4, 3, c)
        rect(ctx, x + 3 + i * 14, sy + 3, 9, 1, [245, 245, 245])
      }
    }
  },
  ARCADE(ctx, x, y, ww, hh) {
    rect(ctx, x, y, ww, hh, [36, 26, 60])
    for (let i = 0; i < 3; i++) {
      const cx = x + 4 + i * 18
      rect(ctx, cx, y + 12, 14, hh - 12, BOOKS[(i * 2 + 1) % 6])
      rect(ctx, cx + 3, y + 16, 8, 8, [20, 20, 30])
      rect(ctx, cx + 2, y + 28, 10, 3, [30, 30, 40])
    }
  },
  BOOKS(ctx, x, y, ww, hh) {
    for (let r = 0; r < 3; r++) {
      const sy = y + 6 + r * 15
      for (let bx = x + 2; bx < x + ww - 3; ) {
        const bw = 2 + Math.floor(hash(bx + r * 13) * 3)
        const bh = 8 + Math.floor(hash(bx * 3 + r) * 5)
        rect(ctx, bx, sy + 12 - bh, bw, bh, BOOKS[Math.floor(hash(bx * 5 + r) * 6)])
        bx += bw
      }
      rect(ctx, x, sy + 12, ww, 2, [150, 108, 72])
    }
  },
  PETS(ctx, x, y, ww, hh) {
    rect(ctx, x + 4, y + 14, 30, 20, [90, 170, 220])
    rect(ctx, x + 4, y + 30, 30, 4, [210, 190, 130])
    for (const [fx, fy] of [[10, 20], [22, 24], [16, 27]]) {
      rect(ctx, x + fx, y + fy, 4, 2, [255, 150, 40])
      rect(ctx, x + fx - 2, y + fy, 2, 2, [255, 120, 30])
    }
    rect(ctx, x + 2, y + 34, 34, 2, [80, 80, 90])
    oval(ctx, x + ww - 12, y + hh - 10, 9, 6, [236, 200, 150])
    rect(ctx, x + ww - 20, y + hh - 18, 4, 6, [236, 200, 150])
    rect(ctx, x + ww - 7, y + hh - 18, 4, 6, [236, 200, 150])
    rect(ctx, x + ww - 15, y + hh - 12, 2, 2, [40, 30, 30])
    rect(ctx, x + ww - 10, y + hh - 12, 2, 2, [40, 30, 30])
  },
  CANDY(ctx, x, y, ww, hh) {
    for (let i = 0; i < 4; i++) {
      const cx = x + 8 + i * 14
      rect(ctx, cx, y + 22, 1, 18, [245, 245, 245])
      oval(ctx, cx, y + 18, 5, 5, BOOKS[i % 6])
      oval(ctx, cx, y + 18, 2, 2, [255, 255, 255])
    }
    for (let i = 0; i < 3; i++) {
      rect(ctx, x + 6 + i * 18, y + hh - 12, 12, 12, [220, 236, 244])
      for (let k = 0; k < 5; k++) rect(ctx, x + 7 + i * 18 + (k * 3) % 10, y + hh - 10 + ((k * 4) % 8), 2, 2, BOOKS[(k + i) % 6])
    }
  },
  PIZZA(ctx, x, y, ww, hh) {
    rect(ctx, x, y, ww, hh, [120, 70, 50])
    oval(ctx, x + ww / 2, y + 22, 18, 14, [70, 40, 30])
    oval(ctx, x + ww / 2, y + 24, 12, 8, [255, 150, 50])
    rect(ctx, x, y + hh - 14, ww, 14, [236, 226, 210])
    oval(ctx, x + ww / 2, y + hh - 8, 14, 3, [236, 180, 70])
    for (let k = 0; k < 5; k++) rect(ctx, x + ww / 2 - 9 + k * 4, y + hh - 9 + (k % 2), 2, 2, [200, 50, 40])
  },
  MUSIC(ctx, x, y, ww, hh) {
    for (let i = 0; i < 3; i++) {
      const gx = x + 10 + i * 18
      const c = BOOKS[(i * 2) % 6]
      rect(ctx, gx - 1, y + 8, 2, 22, [120, 80, 50])
      oval(ctx, gx, y + 34, 6, 5, c)
      oval(ctx, gx, y + 27, 4, 4, c)
      oval(ctx, gx, y + 32, 1, 1, [30, 30, 30])
    }
  },
  TECH(ctx, x, y, ww, hh) {
    rect(ctx, x + 4, y + 10, 26, 18, [30, 30, 36])
    rect(ctx, x + 6, y + 12, 22, 14, [60, 150, 220])
    rect(ctx, x + 15, y + 28, 4, 4, [30, 30, 36])
    for (let i = 0; i < 3; i++) {
      rect(ctx, x + 36 + i * 7, y + hh - 18, 5, 10, [30, 30, 36])
      rect(ctx, x + 37 + i * 7, y + hh - 17, 3, 7, [100, 200, 240])
    }
  },
  HATS(ctx, x, y, ww, hh) {
    for (let i = 0; i < 3; i++) {
      const hx = x + 10 + i * 18
      const c = BOOKS[(i * 2 + 1) % 6]
      rect(ctx, hx - 1, y + 30, 2, hh - 30, [120, 120, 126])
      rect(ctx, hx - 8, y + 28, 16, 2, c)
      rect(ctx, hx - 5, y + 18, 10, 10, c)
      rect(ctx, hx - 5, y + 25, 10, 2, [245, 245, 245])
    }
  },
}

// A shop: its sign, a striped awning, its window and door.
function shopFront(ctx, s) {
  const c = SHOP_COLORS[s.name] ?? [120, 120, 120]
  const top = 26
  const wb = L.wallBase
  rect(ctx, s.x, top - 2, s.w, wb - top + 2, [206, 198, 186])
  rect(ctx, s.x + 4, top, s.w - 8, 12, c)
  text(ctx, s.name, s.x + s.w / 2, top + 3, WHITE)
  for (let k = 0; k * 6 < s.w - 4; k++) {
    const col = k % 2 ? WHITE : c
    rect(ctx, s.x + 2 + k * 6, top + 13, Math.min(6, s.w - 4 - k * 6), 8, col)
    rect(ctx, s.x + 3 + k * 6, top + 21, 4, 2, col)
  }
  const win = { x: s.x + 4, y: top + 25, w: s.w - 34, h: wb - 3 - (top + 25) }
  rect(ctx, win.x - 1, win.y - 1, win.w + 2, win.h + 2, [120, 124, 132])
  rect(ctx, win.x, win.y, win.w, win.h, [206, 230, 240])
  GOODS[s.name]?.(ctx, win.x, win.y, win.w, win.h)
  for (let k = 0; k < 10; k++) rect(ctx, win.x + 6 + k, win.y + 2 + k * 2, 1, 2, WHITE, 0.4)
  const dx = s.x + s.w - 27
  rect(ctx, dx - 1, win.y - 1, 25, wb - win.y + 1, [120, 124, 132])
  rect(ctx, dx, win.y, 23, wb - win.y, [160, 196, 214])
  rect(ctx, dx + 3, win.y + 22, 1, 8, [80, 80, 90])
  for (let k = 0; k < 6; k++) rect(ctx, dx + 4 + k, win.y + 4 + k * 2, 1, 2, WHITE, 0.35)
}

function paintMall(ctx, sky) {
  const { w, h, wallBase, door, shops, fountain: f } = L
  for (let y = 0; y < 18; y++) rect(ctx, 0, y, w, 1, lerp(sky.top, sky.low, y / 18))
  if (sky.tint > 0.2) {
    const r = farmRandom(L)
    for (let i = 0; i < w / 12; i++) rect(ctx, r() * w, r() * 16, 1, 1, [255, 255, 235], (sky.tint - 0.2) / 0.3)
  }
  rect(ctx, 0, 18, w, wallBase - 18, [238, 232, 222])
  rect(ctx, 0, 18, w, 4, [214, 206, 194])
  // The way in: glass doors on the outside.
  const d = door
  rect(ctx, d.x - 4, d.y - 4, d.w + 8, d.h + 4, [150, 156, 166])
  for (let y = d.y; y < d.y + d.h; y++) {
    const t = (y - d.y) / d.h
    rect(ctx, d.x, y, d.w, 1, t < 0.62 ? lerp(sky.top, sky.low, t / 0.62) : [110, 160, 90])
  }
  rect(ctx, d.x, d.y, d.w, d.h, [200, 230, 244], 0.3)
  rect(ctx, d.x + d.w / 2 - 1, d.y, 2, d.h, [150, 156, 166])
  rect(ctx, d.x + d.w / 2 - 5, d.y + 26, 1, 10, [90, 90, 96])
  rect(ctx, d.x + d.w / 2 + 4, d.y + 26, 1, 10, [90, 90, 96])
  for (let k = 0; k < 12; k++) rect(ctx, d.x + 4 + k, d.y + 6 + k * 3, 1, 3, WHITE, 0.35)
  for (const s of shops) shopFront(ctx, s)
  // Polished tiles, with the shops in them.
  for (let y = wallBase; y < h; y++) rect(ctx, 0, y, w, 1, lerp([234, 228, 216], [208, 200, 186], (y - wallBase) / (h - wallBase)))
  for (let y = wallBase, row = 0; y < h; y += 14, row++) {
    for (let x = (row % 2) * 20; x < w; x += 40) rect(ctx, x, y, 20, Math.min(14, h - y), [212, 204, 190], 0.55)
  }
  for (const s of shops) rect(ctx, s.x + 4, wallBase + 2, s.w - 8, 10, SHOP_COLORS[s.name] ?? WHITE, 0.1)
  rect(ctx, 0, wallBase, w, 2, [176, 168, 156])
  // The fountain's pool.
  oval(ctx, f.cx, f.cy + 2, f.rx + 5, f.ry + 4, [160, 154, 146])
  oval(ctx, f.cx, f.cy, f.rx + 5, f.ry + 3, [206, 200, 190])
  oval(ctx, f.cx, f.cy, f.rx, f.ry, [86, 156, 214])
  oval(ctx, f.cx, f.cy + 2, f.rx - 4, f.ry - 3, [70, 136, 200])
  for (let i = 0; i < 9; i++) rect(ctx, f.cx - f.rx * 0.7 + hash(i) * f.rx * 1.4, f.cy - 6 + hash(i + 9) * 12, 2, 1, [255, 214, 90], 0.8)
  if (sky.tint > 0) rect(ctx, 0, 18, w, h - 18, NIGHT, sky.tint * 0.25)
  if (sky.tint > 0.2) for (const s of shops) rect(ctx, s.x + 4, 51, s.w - 34, wallBase - 54, [255, 236, 170], sky.tint * 0.25)
  sign(ctx, d, [60, 60, 70])
}

// ---- What stands on the floor, drawn in turn with everyone ----

// Each drawn about x, with its feet at b; w by h is room enough for it.
const THING_ART = {
  pingpong: {
    w: 96,
    h: 30,
    paint(ctx, x, b) {
      rect(ctx, x - 40, b - 1, 80, 3, BLACK, 0.18)
      for (const lx of [-34, -10, 10, 34]) rect(ctx, x + lx - 1, b - 12, 2, 12, [70, 70, 76])
      rect(ctx, x - 38, b - 18, 76, 6, [28, 100, 72])
      rect(ctx, x - 38, b - 17, 76, 2, [60, 156, 110])
      rect(ctx, x - 38, b - 18, 76, 1, [240, 240, 240])
      rect(ctx, x - 38, b - 13, 76, 1, [20, 70, 50])
      rect(ctx, x - 1, b - 25, 2, 8, [236, 236, 236], 0.85)
      rect(ctx, x - 2, b - 26, 4, 1, [60, 60, 60])
    },
  },
  couch: {
    w: 86,
    h: 32,
    paint(ctx, x, b) {
      rect(ctx, x - 40, b - 1, 80, 3, BLACK, 0.18)
      rect(ctx, x - 34, b - 28, 68, 15, [104, 84, 164])
      rect(ctx, x - 1, b - 28, 2, 15, [84, 66, 138])
      rect(ctx, x - 34, b - 14, 68, 8, [124, 104, 186])
      rect(ctx, x - 34, b - 14, 68, 1, [152, 134, 212])
      rect(ctx, x - 34, b - 6, 68, 3, [92, 72, 150])
      for (const ax of [-40, 32]) {
        rect(ctx, x + ax, b - 22, 8, 19, [92, 72, 150])
        rect(ctx, x + ax, b - 22, 8, 2, [124, 104, 186])
      }
      rect(ctx, x - 37, b - 3, 3, 3, [70, 50, 40])
      rect(ctx, x + 34, b - 3, 3, 3, [70, 50, 40])
      rect(ctx, x - 28, b - 24, 10, 9, [240, 196, 90])
      rect(ctx, x + 18, b - 24, 10, 9, [90, 190, 200])
    },
  },
  ficus: {
    w: 44,
    h: 66,
    paint(ctx, x, b) {
      rect(ctx, x - 10, b - 1, 20, 3, BLACK, 0.18)
      rect(ctx, x - 1, b - 36, 2, 24, [110, 76, 48])
      for (const [dx, dy, rr, c] of [
        [0, -44, 14, [52, 120, 56]],
        [-10, -38, 9, [52, 120, 56]],
        [10, -40, 9, [52, 120, 56]],
        [-4, -54, 8, [80, 152, 70]],
        [6, -50, 7, [80, 152, 70]],
      ]) {
        oval(ctx, x + dx, b + dy, rr, rr * 0.8, c)
      }
      rect(ctx, x - 8, b - 14, 16, 14, [236, 236, 230])
      rect(ctx, x - 9, b - 15, 18, 3, [210, 210, 204])
    },
  },
  jet: {
    w: 30,
    h: 24,
    paint(ctx, x, b) {
      rect(ctx, x - 4, b - 16, 8, 16, [206, 200, 190])
      rect(ctx, x - 4, b - 16, 2, 16, [226, 222, 214])
      rect(ctx, x - 11, b - 20, 22, 4, [222, 216, 206])
      rect(ctx, x - 9, b - 16, 18, 1, [170, 166, 160])
    },
    // The water: up from the bowl, and down all round into the pool.
    live(x, b, now) {
      rect(g, x - 1, b - 36, 2, 16, [210, 238, 255], 0.75)
      for (let i = 0; i < 10; i++) {
        const p = (now / 1100 + i / 10) % 1
        const side = i % 2 ? 1 : -1
        const dx = side * (2 + p * 14 + (i % 3) * 2)
        const dy = -36 - 14 * p + 40 * p * p
        rect(g, x + dx, b + dy, 1, 2, [210, 238, 255], 0.8 * (1 - p * 0.5))
      }
      rect(g, x - 10, b - 21, 20, 1, [210, 238, 255], 0.6)
    },
  },
  bench: {
    w: 56,
    h: 26,
    paint(ctx, x, b) {
      rect(ctx, x - 22, b - 1, 44, 3, BLACK, 0.15)
      for (const lx of [-19, 17]) rect(ctx, x + lx, b - 22, 2, 22, [60, 60, 66])
      rect(ctx, x - 23, b - 11, 46, 3, [176, 124, 72])
      rect(ctx, x - 23, b - 8, 46, 1, [130, 90, 52])
      rect(ctx, x - 23, b - 22, 46, 3, [176, 124, 72])
      rect(ctx, x - 23, b - 17, 46, 3, [176, 124, 72])
    },
  },
  table: {
    w: 56,
    h: 64,
    paint(ctx, x, b, t) {
      const c = [[226, 76, 66], [70, 130, 210], [60, 150, 90]][Math.round(t.x) % 3]
      rect(ctx, x - 14, b - 1, 28, 3, BLACK, 0.15)
      rect(ctx, x, b - 52, 1, 38, [210, 210, 214])
      for (let k = 0; k < 10; k++) {
        const half = 4 + k * 2.2
        rect(ctx, x - half, b - 62 + k, half * 2, 1, c)
        rect(ctx, x - half * 0.34, b - 62 + k, half * 0.68, 1, WHITE)
      }
      for (let k = -22; k < 22; k += 6) rect(ctx, x + k + 1, b - 52, 4, 2, c)
      rect(ctx, x + 16, b - 20, 2, 20, [226, 76, 66])
      rect(ctx, x + 12, b - 10, 8, 2, [226, 76, 66])
      rect(ctx, x + 12, b - 8, 1, 8, [90, 90, 96])
      rect(ctx, x - 12, b - 16, 24, 3, [245, 245, 245])
      rect(ctx, x - 12, b - 13, 24, 1, [190, 190, 190])
      rect(ctx, x - 1, b - 13, 2, 11, [120, 120, 126])
      rect(ctx, x - 5, b - 2, 10, 2, [100, 100, 106])
      rect(ctx, x + 2, b - 19, 6, 3, [236, 176, 70])
      rect(ctx, x - 7, b - 21, 3, 5, [220, 60, 60])
    },
  },
  palm: {
    w: 50,
    h: 64,
    paint(ctx, x, b) {
      rect(ctx, x - 10, b - 1, 20, 3, BLACK, 0.18)
      for (let k = 0; k < 9; k++) rect(ctx, x - 2 + Math.round(k * 0.3), b - 18 - k * 4, 4, 3, k % 2 ? [150, 110, 66] : [128, 92, 54])
      const top = [x + 3, b - 52]
      for (const a of [-2.8, -2.2, -1.5, -0.9, -0.3, 0.3]) {
        for (let p = 0; p < 18; p++) {
          const px = top[0] + Math.cos(a) * p
          const py = top[1] + Math.sin(a) * p * 0.6 + (p * p) / 30
          rect(ctx, px, py, 2, 2, p > 12 ? [92, 170, 80] : [52, 130, 60])
        }
      }
      rect(ctx, x - 9, b - 14, 18, 14, [176, 120, 80])
      rect(ctx, x - 10, b - 15, 20, 3, [150, 100, 64])
    },
  },
}

// ---- What moves ----

// Clouds across the sky, or the mall's skylight (below `floor`, none).
function clouds(now, sky, floor = L.horizon * 0.45 + 8) {
  const r = farmRandom({ ...L, seed: L.seed + 1 })
  g.save()
  g.beginPath()
  g.rect(0, 0, L.w, floor)
  g.clip()
  const night = sky.tint > 0.3
  for (let i = 0; i < 6; i++) {
    const speed = 2 + r() * 3
    const span = L.w + 120
    const x = ((r() * span + (now / 1000) * speed) % span) - 60
    const y = 8 + r() * (L.horizon * 0.45)
    const n = 3 + Math.floor(r() * 3)
    for (let k = 0; k < n; k++) {
      const cw = 14 + r() * 12
      rect(g, x + k * 10, y - (k % 2) * 4, cw, 8 + (k % 2) * 4, night ? [120, 130, 170] : [255, 255, 255], night ? 0.25 : 0.9)
    }
  }
  g.restore()
}

// Light moving on water: the pond, the fountain's pool.
function shimmer(now, { cx, cy, rx, ry }) {
  for (let i = 0; i < 7; i++) {
    const p = (now / 4000 + i / 7) % 1
    const y = cy - ry + 5 + ((i * 7) % (ry * 2 - 8))
    const half = rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 8
    if (half < 6) continue
    const x = cx - half + p * (half * 2 - 8)
    rect(g, x, y, 8, 1, [190, 225, 250], 0.6 * Math.sin(p * Math.PI))
  }
}

function water(now, sky) {
  shimmer(now, L.pond)
  // Fireflies once it is dark.
  if (sky.tint > 0.3) {
    const r = farmRandom({ ...L, seed: L.seed + 2 })
    for (let i = 0; i < 14; i++) {
      const ox = r() * L.w
      const oy = L.ground.top - 20 + r() * 80
      const ph = r() * 6
      const x = ox + Math.sin(now / 2300 + ph) * 18
      const y = oy + Math.sin(now / 1700 + ph * 2) * 8
      const a = Math.max(0, Math.sin(now / 600 + ph * 3))
      rect(g, x, y, 1, 1, [230, 255, 140], a)
      rect(g, x - 1, y - 1, 3, 3, [230, 255, 140], a * 0.2)
    }
  }
}

// The office's clock, telling the time; steam off the coffee machine.
function officeMoving(now) {
  const c = L.wall.find(t => t.kind === 'coffee')
  const cy = 34
  oval(g, c.x, cy, 9, 9, [90, 80, 70])
  oval(g, c.x, cy, 8, 8, [250, 250, 246])
  for (const [dx, dy] of [[0, -7], [7, 0], [0, 6], [-7, 0]]) rect(g, c.x + dx, cy + dy, 1, 1, [90, 80, 70])
  const d = new Date(now)
  const m = (d.getMinutes() / 60) * Math.PI * 2
  const hr = (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2
  line(g, c.x, cy, Math.round(c.x + Math.sin(hr) * 4), Math.round(cy - Math.cos(hr) * 4), [30, 30, 34])
  line(g, c.x, cy, Math.round(c.x + Math.sin(m) * 6), Math.round(cy - Math.cos(m) * 6), [30, 30, 34])
  rect(g, c.x, cy, 1, 1, [200, 50, 50])
  const b = L.ground.top - 1
  for (let i = 0; i < 3; i++) {
    const p = (now / 1800 + i / 3) % 1
    rect(g, c.x - 1 + Math.sin(p * 7 + i) * 2, b - 50 - p * 14, 1, 2, WHITE, 0.5 * (1 - p))
  }
}

// The arcade's screens; light on the fountain's pool.
function mallMoving(now, sky) {
  clouds(now, sky, 17)
  shimmer(now, L.fountain)
  const s = L.shops.find(s => s.name === 'ARCADE')
  if (!s) return
  for (let i = 0; i < 3; i++) {
    const k = Math.floor(now / 250 + i * 3) % 6
    rect(g, s.x + 4 + 4 + i * 18 + 3, 51 + 16, 8, 8, BOOKS[k], 0.85)
    rect(g, s.x + 4 + 4 + i * 18 + 3 + ((now / 120 + i * 2) % 7), 51 + 19, 1, 1, WHITE)
  }
}

// ---- The Pixelings ----

const sprite = document.createElement('canvas')
sprite.width = sprite.height = SIZE
const sg = sprite.getContext('2d')
const img = sg.createImageData(SIZE, SIZE)

// His figure with a see-through background: drawn on black and on white,
// what changes between the two is how much shows through.
function figure(agent, now, roam) {
  const b = renderFigure(agent, now, BLACK, roam)
  const w = renderFigure(agent, now, WHITE, roam)
  const d = img.data
  for (let i = 0, j = 0; i < b.length; i += 3, j += 4) {
    const a = 255 - (w[i] - b[i] + w[i + 1] - b[i + 1] + w[i + 2] - b[i + 2]) / 3
    if (a <= 0) {
      d[j + 3] = 0
      continue
    }
    const k = 255 / a
    d[j] = b[i] * k
    d[j + 1] = b[i + 1] * k
    d[j + 2] = b[i + 2] * k
    d[j + 3] = a
  }
  sg.putImageData(img, 0, 0)
  return sprite
}

const TAG = {
  ask: [196, 34, 34],
  working: [24, 110, 100],
  done: [150, 56, 120],
  compacting: [40, 62, 156],
}

// Over his head: what he is doing, or idle, his name.
function tag(a, now, drop) {
  const agent = a.agent
  let word = agent.kind === 'idle' ? fitWords((agent.title ?? '').toUpperCase(), 18) : keyLabel(agent)
  if (['working', 'done', 'compacting'].includes(agent.kind)) word += '.'.repeat(Math.floor(now / 400) % 4)
  const width = word.replace(/\.+$/, '...').length * 6 + 3
  const y = Math.round(a.y - 50 + drop)
  // Kept on the screen at its edges.
  const cx = Math.min(L.w - width / 2 - 1, Math.max(width / 2 + 1, a.x))
  rect(g, cx - width / 2, y, width, 10, TAG[agent.kind] ?? BLACK, TAG[agent.kind] ? 0.92 : 0.45)
  text(g, word, cx + 1, y + 2, [10, 10, 14], 0.6)
  text(g, word, cx, y + 1, [245, 245, 245])
}

// Under his feet: how full his context is, in the fire's colours (as over
// his key's hat).
function contextBar(a, now) {
  const pct = a.agent.pct
  if (typeof pct !== 'number' || (DESKTOP && !state.desktopContext)) return
  const w = 28
  const x = Math.round(a.x - w / 2)
  const y = Math.round(a.y + 5)
  const color = heat(pct) >= 4 && now % 700 >= 350 ? [255, 130, 100] : heatColor(pct)
  rect(g, x - 1, y - 1, w + 2, 5, [10, 10, 14], 0.8)
  rect(g, x, y, w, 3, [45, 45, 50])
  rect(g, x, y, Math.max(1, Math.round((w * Math.min(100, pct)) / 100)), 3, color)
}

function line(ctx, x0, y0, x1, y1, c, a = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) rect(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 1, 1, c, a)
}

// What he is doing at a spot, round him.
function props(a, now) {
  const { x, y } = a
  if (a.plan !== 'activity') return
  if (a.activity === 'fish') {
    const bob = Math.sin(now / 500) > 0.6 ? 1 : 0
    line(g, x + 12, y - 16, x + 26, y - 32, [120, 80, 44])
    line(g, x + 26, y - 32, x + 30, y + 10 + bob, [230, 230, 230], 0.6)
    rect(g, x + 29, y + 9 + bob, 3, 2, [230, 50, 50])
    rect(g, x + 29, y + 8 + bob, 3, 1, [255, 255, 255])
    if (now % 9000 < 500) rect(g, x + 26, y + 12, 9, 1, [200, 235, 255], 0.8)
  } else if (a.activity === 'tend' || a.activity === 'plant') {
    rect(g, x + 14, y - 16, 7, 5, [150, 160, 170])
    rect(g, x + 21, y - 17, 3, 1, [150, 160, 170])
    for (let i = 0; i < 3; i++) {
      const p = (now / 600 + i / 3) % 1
      rect(g, x + 23 + i, y - 16 + p * 16, 1, 2, [120, 190, 255], 1 - p * 0.5)
    }
  } else if (a.activity === 'nap') {
    for (let i = 0; i < 3; i++) {
      const p = (now / 2400 + i / 3) % 1
      text(g, 'z', x + 14 + p * 10, y - 58 - p * 16, [255, 255, 255], Math.sin(p * Math.PI))
    }
  } else if (a.activity === 'coffee') {
    // A cup, steaming.
    rect(g, x + 12, y - 17, 5, 6, [245, 245, 240])
    rect(g, x + 17, y - 16, 1, 3, [245, 245, 240])
    rect(g, x + 12, y - 17, 5, 1, [120, 80, 50])
    for (let i = 0; i < 2; i++) {
      const p = (now / 1500 + i / 2) % 1
      rect(g, x + 13 + i * 2 + Math.sin(p * 6), y - 19 - p * 10, 1, 2, WHITE, 0.6 * (1 - p))
    }
  } else if (a.activity === 'print') {
    // The page he printed, read over.
    rect(g, x + 12, y - 19, 7, 9, [252, 252, 252])
    for (let k = 0; k < 3; k++) rect(g, x + 13, y - 17 + k * 2, 5 - (k % 2) * 2, 1, [150, 150, 160])
  } else if (a.activity === 'pingpong') {
    const spot = L.spots[a.spot]
    const dir = spot?.dir ?? 1
    rect(g, x + dir * 14 - 2, y - 21, 5, 5, [210, 50, 50])
    rect(g, x + dir * 14, y - 16, 1, 3, [120, 80, 40])
    // One ball between the two of them: the one on the left serves it.
    const other = L.spots.findIndex(o => o.kind === 'pingpong' && o !== spot)
    const partner = other >= 0 && farm.taken.has(other) && farm.actors.get(farm.taken.get(other))?.activity === 'pingpong'
    if (dir === 1 || !partner) {
      const p = (now % 1400) / 1400
      const t = partner ? (p < 0.5 ? p * 2 : 2 - p * 2) : p < 0.5 ? p : 1 - p
      const bx = x + dir * (15 + t * 70)
      const hop = Math.abs(Math.sin(t * Math.PI * 2)) * 10
      rect(g, bx, y - 17 - hop, 2, 2, WHITE)
    }
  } else if (a.activity === 'shop') {
    // A bag of what he bought, and a heart for what is in the window.
    const c = BOOKS[Math.floor(hash(a.sid.length * 13 + a.sid.charCodeAt(0)) * 5)]
    rect(g, x + 12, y - 14, 7, 8, c)
    rect(g, x + 13, y - 16, 1, 2, c)
    rect(g, x + 17, y - 16, 1, 2, c)
    const p = (now % 5000) / 5000
    if (p < 0.4) {
      const hx = x + 12
      const hy = y - 36 - p * 20
      const al = Math.sin((p / 0.4) * Math.PI)
      rect(g, hx, hy, 2, 2, [255, 90, 130], al)
      rect(g, hx + 3, hy, 2, 2, [255, 90, 130], al)
      rect(g, hx, hy + 1, 5, 2, [255, 90, 130], al)
      rect(g, hx + 1, hy + 3, 3, 1, [255, 90, 130], al)
      rect(g, hx + 2, hy + 4, 1, 1, [255, 90, 130], al)
    }
  } else if (a.activity === 'arcade') {
    // Points.
    const p = (now % 900) / 900
    text(g, '+', x + 16, y - 40 - p * 8, BOOKS[Math.floor(now / 900) % 5], 1 - p)
  } else if (a.activity === 'coin') {
    // A coin tossed into the fountain, and its ripple.
    const f = L.fountain
    const p = (now % 3500) / 3500
    if (p < 0.4) {
      const t = p / 0.4
      const cx = x + 10 + (f.cx - x - 10) * t
      const cy = y - 20 + (f.cy - y + 20) * t - Math.sin(t * Math.PI) * 18
      rect(g, cx, cy, 2, 2, [255, 210, 60])
    } else if (p < 0.65) {
      const rr = ((p - 0.4) / 0.25) * 9
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2
        rect(g, f.cx + Math.cos(ang) * rr, f.cy + Math.sin(ang) * rr * 0.4, 1, 1, [210, 238, 255], 1 - (p - 0.4) / 0.25)
      }
    }
  } else if (a.activity === 'eat') {
    // An ice cream, going down.
    const left = 4 - (Math.floor(now / 3000) % 5)
    rect(g, x + 13, y - 16, 4, 2, [210, 160, 90])
    rect(g, x + 14, y - 14, 2, 3, [200, 150, 80])
    if (left > 0) rect(g, x + 12, y - 16 - left, 6, left, [255, 170, 200])
  }
}

function drawActor(a, now) {
  let alpha = 1
  let drop = 0
  const since = now - a.born
  if (since < ARRIVE_MS) {
    const t = since / ARRIVE_MS
    drop = -70 * (1 - t) ** 2
    alpha = Math.min(1, t * 3)
  }
  if (a.leftAt !== null) alpha = Math.max(0, 1 - (now - a.leftAt) / LEAVE_MS)

  const asking = a.agent.kind === 'ask'
  // His shadow; red and pulsing when he asks.
  const pulse = 0.5 + 0.5 * Math.sin((now / 1200) * 2 * Math.PI)
  if (asking) {
    rect(g, a.x - 15, a.y - 2, 30, 5, [235, 55, 55], (0.35 + 0.4 * pulse) * alpha)
    rect(g, a.x - 12, a.y - 3, 24, 7, [235, 55, 55], (0.2 + 0.3 * pulse) * alpha)
  }
  rect(g, a.x - 11, a.y - 1, 22, 3, BLACK, 0.22 * alpha)

  g.globalAlpha = alpha
  g.drawImage(figure(a.agent, now, Farm.roam(a)), Math.round(a.x - FEET[0]), Math.round(a.y - FEET[1] + drop))
  g.globalAlpha = 1

  // Arriving, sparkles; leaving, a puff.
  if (since < ARRIVE_MS) {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2
      const d = 6 + (since / ARRIVE_MS) * 26
      rect(g, a.x + Math.cos(ang) * d, a.y - 14 + Math.sin(ang) * d * 0.6, 2, 2, [255, 240, 150], 1 - since / ARRIVE_MS)
    }
  }
  if (a.leftAt !== null) {
    const p = (now - a.leftAt) / LEAVE_MS
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      rect(g, a.x + Math.cos(ang) * p * 22 - 3, a.y - 16 + Math.sin(ang) * p * 14 - 3, 6, 6, [235, 235, 240], (1 - p) * 0.8)
    }
    return
  }

  props(a, now)
  // A bubble over him when he asks: ? for a question, ! for the rest.
  if (asking && Math.floor(now / 600) % 2 === 0) {
    const bx = Math.round(a.x + 10)
    const by = Math.round(a.y - 67)
    rect(g, bx - 1, by - 1, 11, 13, [10, 10, 14])
    rect(g, bx, by, 9, 11, [255, 255, 255])
    rect(g, bx + 1, by + 11, 3, 2, [10, 10, 14])
    text(g, a.agent.ask === 'question' ? '?' : '!', bx + 4.5, by + 2, [220, 40, 40])
  }
}

// His label and context bar, drawn after everyone so no one in front hides
// them; his label over his head however big he has grown.
function drawLabels(a, now) {
  if (a.leftAt !== null) return
  const since = now - a.born
  const drop = since < ARRIVE_MS ? -70 * (1 - since / ARRIVE_MS) ** 2 : 0
  tag(a, now, drop - 50 * (grown(a) - 1))
  contextBar(a, now)
}

// ---- Taps ----

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.ok ? res.json() : null
}

canvas.addEventListener('pointerdown', async e => {
  if (!farm || e.button !== 0) return
  if (menuFor) return closeMenu()
  const x = e.offsetX / scale
  const y = e.offsetY / scale
  const a = hitAt(x, y)
  if (a) {
    // Held: let go where you pressed and his session opens; drag, and he
    // goes where you put him.
    press = { sid: a.sid, x: e.offsetX, y: e.offsetY, dx: a.x - x, dy: a.y - y, moved: false }
    canvas.setPointerCapture(e.pointerId)
    return
  }
  if (DESKTOP) return
  if (atChip(x, y)) {
    const next = SCENES[(SCENES.indexOf(L.scene) + 1) % SCENES.length]
    taps.push({ x, y: 76, at: performance.now(), word: next.toUpperCase() })
    post('/api/farm-scene', { scene: next })
    return
  }
  if (atDoor(L, x, y)) {
    taps.push({ x: L.door.x + L.door.w / 2, y: L.door.y, at: performance.now(), word: 'PICK A FOLDER' })
    const res = await post('/api/choose-folder', {})
    if (res?.folder) post('/api/new', { folder: res.folder })
  }
})

// ---- Dragging one out of your way ----

// Who is held down: where (screen pixels), where on him (world pixels),
// and whether he has been moved yet.
let press = null
const DRAG_PX = 4
// Those just put down in the front page, until the back page has them there.
const putDown = new Map()

canvas.addEventListener('pointermove', e => {
  if (!press) return
  if (!press.moved && Math.hypot(e.offsetX - press.x, e.offsetY - press.y) < DRAG_PX) return
  press.moved = true
  canvas.style.cursor = 'grabbing'
  farm.hold(press.sid, e.offsetX / scale + press.dx, e.offsetY / scale + press.dy, Date.now())
})

function letGo(open) {
  const p = press
  press = null
  canvas.style.cursor = ''
  const a = p && farm.actors.get(p.sid)
  if (!a) return
  if (!p.moved) {
    if (!open) return
    taps.push({ x: a.x, y: a.y - 20 * grown(a), at: performance.now(), word: 'OPENING' })
    post('/api/open', { sid: a.sid })
    return
  }
  farm.drop(a.sid, Date.now())
  // The front page shows the back page's: he is put down there too.
  if (FRONT) {
    const put = { sid: a.sid, x: Math.round(a.x), y: Math.round(a.y), at: performance.now() }
    putDown.set(a.sid, put)
    window.pixelings?.move(put)
  }
}
canvas.addEventListener('pointerup', () => letGo(true))
canvas.addEventListener('pointercancel', () => letGo(false))

if (DESKTOP && !FRONT) {
  window.pixelings?.onMove(put => {
    farm.hold(put.sid, put.x, put.y, Date.now())
    farm.drop(put.sid, Date.now())
  })
}

// ---- The Desktop: clicks go through but for them ----

// Where the mouse is over the window (world pixels), or null; the app
// sends it moves even while clicks go through.
let mouse = null
let catching = false
if (DESKTOP) {
  addEventListener('mousemove', e => (mouse = { x: e.clientX / scale, y: e.clientY / scale, cx: e.clientX, cy: e.clientY }))
  document.addEventListener('mouseleave', () => (mouse = null))
}

// Asks the app to take clicks while the mouse is over one of them (or his
// menu), and to let them through again once it is not; checked every
// frame, as they walk under a still mouse too. A menu left alone closes.
function catchClicks() {
  const hit = mouse && hitAt(mouse.x, mouse.y)
  const onMenu = Boolean(menuFor && mouse && overMenu(mouse.cx, mouse.cy))
  if (menuFor && (onMenu || hit?.sid === menuFor)) menuSeen = performance.now()
  if (menuFor && performance.now() - menuSeen > MENU_IDLE_MS) closeMenu()
  const over = Boolean(press) || onMenu || Boolean(hit && (FRONT || state.desktopOnTop || !inFront(hit)))
  if (over === catching) return
  catching = over
  window.pixelings?.catchClicks(over)
}

// ---- Right-click: his menu ----

// Dismiss clears whatever he was doing and sends him off every display
// (the hub keeps him gone until his session does something again).
const menu = document.createElement('div')
menu.className = 'menu'
menu.hidden = true
const dismissItem = document.createElement('button')
dismissItem.type = 'button'
dismissItem.textContent = 'Dismiss'
menu.append(dismissItem)
document.body.append(menu)
// Whose menu is open, and when the mouse was last on it (or him).
let menuFor = null
let menuSeen = 0
const MENU_IDLE_MS = 2500

function overMenu(cx, cy) {
  const r = menu.getBoundingClientRect()
  return cx >= r.left - 4 && cx <= r.right + 4 && cy >= r.top - 4 && cy <= r.bottom + 4
}

function closeMenu() {
  menuFor = null
  menu.hidden = true
}

canvas.addEventListener('contextmenu', e => {
  e.preventDefault()
  const a = farm && hitAt(e.offsetX / scale, e.offsetY / scale)
  if (!a) return closeMenu()
  menuFor = a.sid
  menuSeen = performance.now()
  menu.hidden = false
  // Beside the mouse, kept inside the window (the Desktop's is short).
  const left = Math.min(e.clientX + 2, innerWidth - menu.offsetWidth - 4)
  const top = e.clientY + menu.offsetHeight + 4 > innerHeight ? e.clientY - menu.offsetHeight - 2 : e.clientY + 2
  menu.style.left = `${Math.max(4, left)}px`
  menu.style.top = `${Math.max(4, top)}px`
})

dismissItem.addEventListener('click', () => {
  const sid = menuFor
  closeMenu()
  if (sid) post('/api/dismiss', { sid })
})
addEventListener('keydown', e => e.key === 'Escape' && closeMenu())
addEventListener('blur', closeMenu)

// The place's name in the top corner: a tap goes to the next one.
function chipBox() {
  const word = L.scene.toUpperCase()
  const w = word.length * 6 + 7
  return { x: L.w - w - 4, y: 4, w, h: 11, word }
}

function atChip(x, y) {
  const c = chipBox()
  return x >= c.x - 4 && x <= c.x + c.w + 4 && y >= 0 && y <= c.y + c.h + 4
}

function drawChip() {
  const c = chipBox()
  rect(g, c.x, c.y, c.w, c.h, [10, 10, 14], 0.4)
  text(g, c.word, c.x + c.w / 2, c.y + 2, WHITE, 0.85)
}

function drawTaps(now) {
  while (taps.length && now - taps[0].at > 1200) taps.shift()
  for (const t of taps) {
    const p = (now - t.at) / 1200
    const r = 8 + p * 24
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2
      rect(g, t.x + Math.cos(ang) * r, t.y + Math.sin(ang) * r * 0.7, 1, 1, [255, 255, 255], 1 - p)
    }
    const w = t.word.length * 6 + 3
    rect(g, t.x - w / 2, t.y - 58, w, 10, [10, 10, 14], 0.7 * (1 - p))
    text(g, t.word, t.x, t.y - 57, [255, 255, 255], 1 - p)
  }
}

// ---- The frame ----

function resize() {
  // Never less than the world's height: a window or strip between sizes
  // shows more, not less.
  // The Desktop's as big as chosen in Settings.
  scale = DESKTOP ? (state.desktopSize ?? DESKTOP_SIZES.default) : Math.max(1, Math.floor(innerHeight / FARM_H))
  res = DESKTOP ? Math.max(1, Math.round(scale * devicePixelRatio)) : 1
  const w = Math.ceil(innerWidth / scale)
  const h = Math.ceil(innerHeight / scale)
  bg.width = w
  bg.height = h
  canvas.width = w * res
  canvas.height = h * res
  canvas.style.width = `${w * scale}px`
  canvas.style.height = `${h * scale}px`
  L = DESKTOP ? desktopLayout(w, h) : farmLayout(w, h, sceneNow())
  if (farm) farm.resize(L)
  else farm = new Farm(L)
  if (!FRONT) farm.update(state.agents, Date.now())
  bgKey = ''
}

// The place to show: ?scene=, or the one chosen in Settings.
function sceneNow() {
  if (DESKTOP) return 'desktop'
  return SCENE ?? state.farmScene ?? 'farm'
}

const PAINT = { farm: paintFarm, office: paintOffice, mall: paintMall }
// How much darker the inside of each place gets at night.
const INDOOR = { farm: 1, office: 0.3, mall: 0.25 }
// What stands on the floor, each drawn once for each sky.
let things = []

function paintThings(sky) {
  things = L.things.map(t => {
    const art = THING_ART[t.kind]
    const c = document.createElement('canvas')
    c.width = art.w
    c.height = art.h + 4
    const ox = Math.round(t.x - art.w / 2)
    const oy = t.base + 4 - c.height
    const ctx = c.getContext('2d')
    ctx.translate(-ox, -oy)
    art.paint(ctx, t.x, t.base, t)
    const tint = sky.tint * INDOOR[L.scene]
    if (tint > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-atop'
      rect(ctx, 0, 0, c.width, c.height, NIGHT, tint)
    }
    return { y: t.base, t, art, c, ox, oy }
  })
}

let lastDraw = 0
function draw(t) {
  requestAnimationFrame(draw)
  if (t - lastDraw < FRAME_MS) return
  lastDraw = t
  const now = Date.now()
  if (DESKTOP) return drawDesktop(now)
  const date = new Date(now)
  const sky = skyAt(date)
  // The field again every two minutes, as the sun moves.
  const key = `${L.scene}:${L.w}x${L.h}@${Math.floor(now / 120_000)}`
  if (key !== bgKey) {
    bgKey = key
    PAINT[L.scene](bg.getContext('2d'), sky)
    paintThings(sky)
  }
  farm.step(now)
  g.drawImage(bg, 0, 0)
  if (L.scene === 'farm') {
    clouds(now, sky)
    water(now, sky)
  } else if (L.scene === 'office') officeMoving(now)
  else mallMoving(now, sky)
  // Everyone and everything on the floor, the furthest back first.
  const actors = [...farm.actors.values()]
  const all = [...things, ...actors.map(a => ({ y: a.y, a }))].sort((p, q) => p.y - q.y)
  for (const o of all) {
    if (o.a) drawActor(o.a, now)
    else {
      g.drawImage(o.c, o.ox, o.oy)
      o.art.live?.(o.t.x, o.t.base, now)
    }
  }
  for (const a of actors) drawLabels(a, now)
  drawChip()
  drawTaps(performance.now())
}

// Whether he shows in the front window rather than here: he is asking you
// something, while the rest are behind your windows.
const inFront = a => a.leftAt === null && a.agent.kind === 'ask'

// The back page tells the front one who is asking and where, as it changes.
let toldFront = ''
function tellFront() {
  const list = [...farm.actors.values()].filter(inFront).map(a => ({ sid: a.sid, x: Math.round(a.x), y: Math.round(a.y), born: a.born }))
  const said = JSON.stringify(list)
  if (said === toldFront) return
  toldFront = said
  window.pixelings?.front(list)
}

// The front page: just those the back page says are asking, standing still
// (or where you are dragging one, or just put him).
function showFront(list) {
  const agents = new Map(state.agents.map(a => [a.sid, a]))
  const was = farm.actors
  farm.actors = new Map(
    list
      .filter(p => agents.get(p.sid)?.kind === 'ask')
      .map(p => {
        const agent = agents.get(p.sid)
        if (press?.sid === p.sid && was.has(p.sid)) return [p.sid, Object.assign(was.get(p.sid), { agent })]
        const put = putDown.get(p.sid)
        if (put && (performance.now() - put.at > 2000 || (put.x === p.x && put.y === p.y))) putDown.delete(p.sid)
        const at = putDown.get(p.sid) ?? p
        return [p.sid, { sid: p.sid, agent, x: at.x, y: at.y, born: p.born, leftAt: null, plan: 'busy' }]
      }),
  )
}
let frontList = []
if (FRONT) {
  window.pixelings?.onFront(list => {
    frontList = list
    showFront(list)
  })
}

// How many times his size each one is drawn on the Desktop: growing with
// his context there (mode.js), eased to it as it fills or is compacted.
const grownBy = new Map()
const grown = a => grownBy.get(a.sid) ?? 1
const hitAt = (x, y) => farm.hit(x, y, grown)

function growAll() {
  for (const sid of grownBy.keys()) if (!farm.actors.has(sid)) grownBy.delete(sid)
  for (const a of farm.actors.values()) {
    const want = state.desktopGrow ? desktopGrowth(a.agent.pct) : 1
    const k = grownBy.get(a.sid) ?? want
    grownBy.set(a.sid, Math.abs(want - k) < 0.005 ? want : k + (want - k) * 0.08)
  }
}

// The Desktop: only them, the furthest back first, over nothing.
function drawDesktop(now) {
  if (!FRONT) {
    farm.step(now)
    tellFront()
  }
  g.setTransform(res, 0, 0, res, 0, 0)
  g.imageSmoothingEnabled = false
  g.clearRect(0, 0, L.w, L.h)
  growAll()
  let actors = [...farm.actors.values()].sort((p, q) => p.y - q.y)
  if (!FRONT && !state.desktopOnTop) actors = actors.filter(a => !inFront(a))
  for (const a of actors) {
    // Bigger from his feet up.
    const k = grown(a)
    g.save()
    g.translate(a.x, a.y)
    g.scale(k, k)
    g.translate(-a.x, -a.y)
    drawActor(a, now)
    g.restore()
  }
  for (const a of actors) drawLabels(a, now)
  drawTaps(performance.now())
  catchClicks()
}

addEventListener('resize', resize)
resize()
requestAnimationFrame(draw)

const events = new EventSource('/api/events')
events.onmessage = e => {
  state = JSON.parse(e.data)
  // Made bigger or smaller in Settings.
  if (DESKTOP && (state.desktopSize ?? DESKTOP_SIZES.default) !== scale) resize()
  // Somewhere else chosen: everyone goes there.
  if (sceneNow() !== L.scene) {
    L = farmLayout(L.w, L.h, sceneNow())
    farm.moveTo(L, Date.now())
    bgKey = ''
  }
  if (FRONT) showFront(frontList)
  else farm.update(state.agents, Date.now())
}
