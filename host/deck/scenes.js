// Each Clawd's own background: a little pixel-art scene drawn on Clawd's
// grid (3 key pixels a cell, 24 cells across), made from a scene name and a
// seed, so every agent's is his own and the same every time. Scenes are
// kept dark and low so he and his name stand out; a few move a little
// (stars, snow, bubbles, the aurora, rain, petals, a fire), slowly, so the deck is not rewritten
// every frame. No Node imports: the control page draws them too.
const S = 72
const C = 3
const N = S / C

export const SCENES = [
  'night',
  'sunset',
  'forest',
  'city',
  'space',
  'beach',
  'snow',
  'mountains',
  'underwater',
  'desert',
  'aurora',
  'office',
  'rain',
  'blossom',
  'campfire',
]
export const SCENE_NAMES = {
  night: 'Night',
  sunset: 'Sunset',
  forest: 'Forest',
  city: 'City',
  space: 'Space',
  beach: 'Beach',
  snow: 'Snow',
  mountains: 'Mountains',
  underwater: 'Underwater',
  desert: 'Desert',
  aurora: 'Aurora',
  office: 'Office',
  rain: 'Rain',
  blossom: 'Blossom',
  campfire: 'Campfire',
}

// A small seeded random (mulberry32): the same seed, the same scene.
export function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1))

class Canvas {
  constructor() {
    this.px = new Uint8Array(S * S * 3)
  }
  // In key pixels.
  rect(x, y, w, h, rgb, alpha = 1) {
    const x0 = Math.max(0, Math.round(x))
    const y0 = Math.max(0, Math.round(y))
    const x1 = Math.min(S, Math.round(x + w))
    const y1 = Math.min(S, Math.round(y + h))
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * S + xx) * 3
        for (let c = 0; c < 3; c++) this.px[i + c] = Math.round(this.px[i + c] * (1 - alpha) + rgb[c] * alpha)
      }
    }
  }
  // In cells.
  cell(cx, cy, cw, ch, rgb, alpha = 1) {
    this.rect(cx * C, cy * C, cw * C, ch * C, rgb, alpha)
  }
  // Sky (or water) in bands from `top` to `bottom`, rows `from`..`to`.
  bands(top, bottom, from = 0, to = N, steps = 6) {
    for (let r = from; r < to; r++) {
      const t = Math.floor(((r - from) / Math.max(1, to - from - 1)) * (steps - 1)) / (steps - 1)
      this.cell(0, r, N, 1, lerp(top, bottom, t))
    }
  }
  disc(cx, cy, radius, rgb) {
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radius * radius + radius * 0.6) this.cell(cx + x, cy + y, 1, 1, rgb)
      }
    }
  }
  // A ridge: column c filled from height h(c) (cells from the top) down.
  ridge(h, rgb) {
    for (let c = 0; c < N; c++) this.cell(c, h(c), 1, N - h(c), rgb)
  }
  pine(cx, base, height, rgb) {
    for (let i = 0; i < height; i++) {
      const half = Math.floor((i * 2) / 3)
      this.cell(cx - half, base - height + i, half * 2 + 1, 1, rgb)
    }
    this.cell(cx, base, 1, 1, lerp(rgb, [0, 0, 0], 0.4))
  }
  dim(k) {
    for (let i = 0; i < this.px.length; i++) this.px[i] = Math.round(this.px[i] * k)
  }
}

function stars(cv, r, n, color = [235, 235, 220], bottom = 14) {
  for (let i = 0; i < n; i++) cv.rect(int(r, 0, S - 1), int(r, 0, bottom * C), 1, 1, color, 0.5 + r() * 0.5)
}

// Which side the campfire burns on: the scene's first draw from its seed,
// so the flames (drawn apart, in sceneMotion) land on the logs.
const campfireX = r => (r() < 0.5 ? 3 : 19)

const DRAW = {
  night(cv, r) {
    cv.bands([8, 12, 34], [30, 32, 72])
    stars(cv, r, 26)
    // A crescent moon in a top corner.
    const mx = r() < 0.5 ? int(r, 2, 4) : int(r, 19, 21)
    cv.disc(mx, 3, 2, [235, 228, 195])
    cv.disc(mx + 1, 2, 2, [10, 14, 38])
    const base = int(r, 16, 18)
    const ph = r() * 6
    cv.ridge(c => base + Math.round(Math.sin(c / 3 + ph) * 1.2), [14, 22, 34])
  },
  sunset(cv, r) {
    cv.bands([52, 28, 84], [230, 112, 72], 0, 15, 7)
    cv.disc(int(r, 5, 18), 14, 3, [250, 190, 100])
    cv.cell(0, 15, N, N - 15, [44, 22, 46])
    const ph = r() * 6
    cv.ridge(c => 15 + Math.round(Math.abs(Math.sin(c / 4 + ph)) * -2) + 1, [36, 18, 40])
    for (let i = 0; i < 3; i++) cv.cell(int(r, 1, 20), int(r, 2, 6), int(r, 2, 4), 1, [120, 60, 110])
  },
  forest(cv, r) {
    cv.bands([16, 34, 38], [44, 82, 74], 0, 19)
    cv.cell(0, 19, N, N - 19, [18, 32, 24])
    const dark = [16, 44, 30]
    for (const cx of [int(r, 0, 3), int(r, 3, 6), int(r, 18, 20), int(r, 21, 23)]) cv.pine(cx, 19, int(r, 9, 15), dark)
    for (const cx of [int(r, 7, 10), int(r, 13, 16)]) cv.pine(cx, 19, int(r, 5, 8), [24, 58, 40])
  },
  city(cv, r) {
    cv.bands([14, 14, 34], [48, 30, 72])
    stars(cv, r, 10, [220, 220, 240], 8)
    let x = 0
    while (x < N) {
      const w = int(r, 2, 4)
      const h = int(r, 6, 14)
      cv.cell(x, N - h, w, h, [24, 24, 40])
      for (let wy = (N - h) * C + 2; wy < S - 3; wy += 3) {
        for (let wx = x * C + 1; wx < (x + w) * C - 1; wx += 2) {
          if (r() < 0.28) cv.rect(wx, wy, 1, 1, [250, 205, 110])
        }
      }
      x += w
    }
  },
  space(cv, r) {
    cv.cell(0, 0, N, N, [4, 4, 12])
    stars(cv, r, 40, [230, 230, 255], 24)
    const hue = [
      [200, 110, 80],
      [90, 150, 210],
      [170, 120, 210],
      [110, 190, 140],
    ][int(r, 0, 3)]
    const px = r() < 0.5 ? 3 : 20
    const py = int(r, 3, 18)
    cv.disc(px, py, 3, hue)
    cv.disc(px - 1, py - 1, 1, lerp(hue, [255, 255, 255], 0.3))
    cv.cell(px - 5, py, 11, 1, [200, 190, 160])
  },
  beach(cv, r) {
    cv.bands([60, 110, 170], [130, 170, 205], 0, 12)
    cv.disc(int(r, 3, 20), 3, 2, [250, 225, 150])
    cv.cell(0, 12, N, 4, [30, 86, 140])
    cv.cell(0, 16, N, N - 16, [176, 150, 100])
    for (let i = 0; i < 4; i++) cv.cell(int(r, 0, 22), int(r, 17, 23), 1, 1, [150, 125, 80])
    // A small cloud.
    const kx = int(r, 1, 7)
    const ky = int(r, 2, 5)
    cv.cell(kx + 1, ky, 2, 1, [190, 210, 230])
    cv.cell(kx, ky + 1, 4, 1, [190, 210, 230])
  },
  snow(cv, r) {
    cv.bands([52, 62, 90], [104, 114, 142], 0, 18)
    cv.cell(0, 18, N, N - 18, [196, 206, 222])
    for (const cx of [int(r, 1, 4), int(r, 19, 22)]) {
      cv.pine(cx, 18, int(r, 8, 12), [26, 52, 46])
      cv.cell(cx - 1, 18 - int(r, 6, 9), 3, 1, [220, 230, 240])
    }
  },
  mountains(cv, r) {
    cv.bands([36, 56, 104], [116, 136, 176], 0, 16)
    const p1 = int(r, 3, 9)
    const p2 = int(r, 14, 20)
    const far = c => Math.max(6, 18 - Math.round(Math.max(10 - Math.abs(c - p1), 10 - Math.abs(c - p2) - 1) * 1.1))
    cv.ridge(far, [70, 78, 116])
    // Snow on the peaks, following the slope.
    for (let c = 0; c < N; c++) if (far(c) <= 9) cv.cell(c, far(c), 1, 2, [210, 218, 232])
    const p3 = int(r, 8, 15)
    cv.ridge(c => Math.max(12, 22 - Math.round((9 - Math.abs(c - p3)) * 0.9)), [38, 44, 70])
  },
  underwater(cv, r) {
    cv.bands([22, 96, 148], [8, 30, 70])
    for (let i = 0; i < 4; i++) {
      const sx = [int(r, 0, 4), int(r, 5, 7), int(r, 16, 19), int(r, 20, 23)][i]
      const h = int(r, 5, 10)
      for (let k = 0; k < h; k++) cv.cell(sx + (Math.floor(k / 2) % 2), N - 1 - k, 1, 1, [30, 120, 80])
    }
    cv.cell(0, N - 1, N, 1, [70, 60, 40])
  },
  desert(cv, r) {
    cv.bands([86, 56, 106], [228, 150, 98], 0, 15)
    cv.disc(int(r, 4, 19), 5, 2, [250, 210, 130])
    const ph = r() * 6
    cv.ridge(c => 15 + Math.round(Math.sin(c / 5 + ph) * 1.5), [190, 128, 78])
    cv.ridge(c => 19 + Math.round(Math.sin(c / 4 + ph * 2) * 1), [158, 98, 58])
    const cx = r() < 0.5 ? int(r, 1, 3) : int(r, 20, 22)
    cv.cell(cx, 12, 1, 6, [60, 130, 70])
    cv.cell(cx - 1, 14, 1, 2, [60, 130, 70])
    cv.cell(cx + 1, 13, 1, 2, [60, 130, 70])
  },
  aurora(cv, r) {
    cv.bands([6, 10, 26], [18, 24, 48])
    stars(cv, r, 18)
    cv.ridge(c => 19 + (c % 5 === 0 ? -1 : 0), [10, 16, 22])
  },
  office(cv, r) {
    const wall = [
      [58, 52, 74],
      [44, 60, 70],
      [70, 56, 52],
    ][int(r, 0, 2)]
    cv.cell(0, 0, N, N, wall)
    cv.cell(0, 18, N, N - 18, lerp(wall, [0, 0, 0], 0.4))
    const wx = r() < 0.5 ? 1 : 16
    cv.cell(wx, 2, 7, 6, [80, 80, 96])
    cv.cell(wx + 1, 3, 5, 4, [16, 20, 48])
    for (let i = 0; i < 5; i++) cv.rect((wx + 1) * C + int(r, 0, 14), 3 * C + int(r, 0, 11), 1, 1, [235, 235, 220])
    cv.cell(wx + 3, 3, 1, 4, [80, 80, 96])
    const ox = wx === 1 ? 19 : 2
    cv.cell(ox, 4, 3, 4, [r() < 0.5 ? 200 : 90, 120, 160])
    cv.cell(ox + 1, 15, 2, 3, [150, 90, 60])
    cv.cell(ox, 12, 4, 3, [60, 140, 80])
  },
  rain(cv, r) {
    cv.bands([28, 34, 48], [56, 64, 80], 0, 17)
    // Low clouds.
    for (let i = 0; i < 3; i++) cv.cell(int(r, -2, 18), int(r, 0, 3), int(r, 5, 9), 2, [70, 78, 94])
    let x = 0
    while (x < N) {
      const w = int(r, 2, 5)
      const h = int(r, 4, 8)
      cv.cell(x, 17 - h, w, h, [34, 38, 54])
      x += w
    }
    cv.cell(0, 17, N, N - 17, [30, 34, 44])
    // Puddles, with the sky in them.
    for (let i = 0; i < 3; i++) cv.cell(int(r, 0, 20), int(r, 19, 23), int(r, 2, 4), 1, [64, 74, 96])
  },
  blossom(cv, r) {
    cv.bands([70, 52, 96], [186, 128, 150], 0, 18)
    cv.cell(0, 18, N, N - 18, [52, 86, 58])
    const side = r() < 0.5 ? -1 : 1
    const tx = side < 0 ? int(r, 2, 4) : int(r, 19, 21)
    cv.cell(tx, 8, 2, 10, [76, 48, 42])
    cv.cell(tx + side, 10, 1, 2, [76, 48, 42])
    const pink = [228, 150, 180]
    const deep = [196, 110, 150]
    cv.disc(tx, 6, 3, deep)
    cv.disc(tx + 3 * side, 7, 2, deep)
    cv.disc(tx + 1, 5, 2, pink)
    cv.disc(tx - 2 * side, 7, 2, pink)
    // Petals already down.
    for (let i = 0; i < 6; i++) cv.cell(int(r, 0, 23), int(r, 19, 23), 1, 1, pink)
  },
  campfire(cv, r) {
    const fx = campfireX(r)
    cv.bands([8, 10, 24], [24, 22, 40], 0, 18)
    stars(cv, r, 20, [235, 235, 220], 12)
    for (const cx of [int(r, 0, 2), int(r, 21, 23)]) cv.pine(cx, 18, int(r, 8, 12), [12, 22, 20])
    cv.cell(0, 18, N, N - 18, [30, 24, 22])
    // A ring of stones and the logs.
    cv.cell(fx - 1, 17, 4, 1, [70, 66, 70])
    cv.cell(fx, 16, 2, 1, [96, 60, 36])
    // The glow on the ground.
    cv.cell(fx - 2, 18, 6, 2, [120, 70, 30], 0.35)
  },
}

const cache = new Map()

// The scene's still picture: `name` (one of SCENES) from `seed`.
export function sceneBase(name, seed = 1) {
  const key = `${name}:${seed}`
  let px = cache.get(key)
  if (!px) {
    const cv = new Canvas()
    ;(DRAW[name] ?? DRAW.night)(cv, random(seed))
    cv.dim(0.82)
    px = cv.px
    if (cache.size > 200) cache.clear()
    cache.set(key, px)
  }
  return px
}

// What moves, drawn with `rect(x, y, w, h, rgb, alpha)` in key pixels, at
// `now` (his own clock). Steps at most every 400 ms.
export function sceneMotion(name, seed, now, rect) {
  const r = random(seed ^ 0x9e3779b9)
  const step = Math.floor(now / 400)
  switch (name) {
    case 'night':
    case 'space':
    case 'city': {
      // A few stars twinkle.
      for (let i = 0; i < 4; i++) {
        const x = int(r, 0, S - 1)
        const y = int(r, 0, 36)
        if ((step + i * 3) % 7 === 0) rect(x, y, 1, 1, [255, 255, 255])
      }
      return
    }
    case 'snow': {
      for (let i = 0; i < 10; i++) {
        const x = int(r, 0, S - 2)
        const off = int(r, 0, S)
        rect(x + ((step + i) % 2), (off + step * 2) % 54, 1, 1, [235, 240, 250])
      }
      return
    }
    case 'underwater': {
      for (let i = 0; i < 6; i++) {
        const x = int(r, 2, S - 4)
        const off = int(r, 0, S)
        const y = S - 4 - ((off + step * 3) % (S - 4))
        rect(x, y, 2, 2, [150, 200, 230], 0.7)
      }
      return
    }
    case 'aurora': {
      const colors = [
        [60, 220, 150],
        [80, 200, 210],
        [150, 110, 220],
      ]
      for (let band = 0; band < 3; band++) {
        for (let c = 0; c < N; c++) {
          const y = 4 + band * 3 + Math.round(Math.sin(c / 3 + step / 4 + band) * 1.5)
          rect(c * C, y * C, C, C, colors[band], 0.35)
        }
      }
      return
    }
    case 'forest': {
      for (let i = 0; i < 3; i++) {
        const x = int(r, 0, S - 1)
        const y = int(r, 30, 54)
        if ((step + i * 2) % 5 < 2) rect(x, y, 1, 1, [240, 230, 120])
      }
      return
    }
    case 'beach': {
      for (let i = 0; i < 5; i++) {
        const x = (int(r, 0, S) + step * 2) % S
        rect(x, 36 + int(r, 0, 2) * 3, 3, 1, [220, 235, 245], 0.8)
      }
      return
    }
    case 'rain': {
      for (let i = 0; i < 14; i++) {
        const x = int(r, 0, S)
        const off = int(r, 0, S)
        const y = (off + step * 6) % (S + 6) - 6
        rect(x - Math.floor(y / 6), y, 1, 4, [150, 170, 200], 0.6)
      }
      return
    }
    case 'blossom': {
      for (let i = 0; i < 6; i++) {
        const x = int(r, 0, S - 2)
        const off = int(r, 0, S)
        const y = (off + step * 2) % 56
        rect(x + Math.round(Math.sin((step + i * 5) / 3) * 2), y, 2, 1, [240, 170, 196])
      }
      return
    }
    case 'campfire': {
      // The flames dance and sparks rise from where the scene put the fire.
      const x = campfireX(random(seed)) * C
      const tall = [0, 2, 1, 3][step % 4]
      rect(x, 13 * C - tall, 2 * C, 3 * C + tall, [230, 90, 30])
      rect(x + 1 + (step % 2), 14 * C - tall, 2 * C - 2, 2 * C + tall, [250, 180, 60])
      rect(x + 2, 15 * C, 2, C, [255, 235, 150])
      for (let i = 0; i < 3; i++) {
        const y = 12 * C - ((step * 2 + i * 7) % 20)
        rect(x + int(r, 0, 2 * C), y, 1, 1, [255, 200, 90], 0.8)
      }
      return
    }
    default:
  }
}
