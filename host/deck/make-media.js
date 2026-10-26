// The README's animations, drawn by the deck's own code from the demo deck
// (demo.js): the whole Stream Deck in a dark body, and the five states side
// by side. Needs ffmpeg.
//
//   node make-media.js     writes docs/preview/pixelings.gif and
//                          docs/preview/pixelings-states.gif
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { demoCast } from './demo.js'
import { layout } from './layout.js'
import { asBuffer, encodePng } from './png.js'
import { renderKey, SIZE } from './render.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '..', '..', 'docs', 'preview')
const FPS = 10
const SECONDS = 8
const BG = [11, 11, 15]
const BODY = [26, 26, 32]

class Picture {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.px = Buffer.alloc(w * h * 3)
    this.fill(0, 0, w, h, BG)
  }
  fill(x, y, w, h, rgb, radius = 0) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (radius) {
          const cx = xx < radius ? radius - xx : xx >= w - radius ? xx - (w - radius - 1) : 0
          const cy = yy < radius ? radius - yy : yy >= h - radius ? yy - (h - radius - 1) : 0
          if (cx * cx + cy * cy > radius * radius) continue
        }
        const i = ((y + yy) * this.w + x + xx) * 3
        this.px[i] = rgb[0]
        this.px[i + 1] = rgb[1]
        this.px[i + 2] = rgb[2]
      }
    }
  }
  // A key at `scale`, its corners rounded like the deck's.
  key(x, y, keyPx, scale, radius) {
    const src = asBuffer(keyPx)
    const n = SIZE * scale
    for (let yy = 0; yy < n; yy++) {
      for (let xx = 0; xx < n; xx++) {
        const cx = xx < radius ? radius - xx : xx >= n - radius ? xx - (n - radius - 1) : 0
        const cy = yy < radius ? radius - yy : yy >= n - radius ? yy - (n - radius - 1) : 0
        if (cx * cx + cy * cy > radius * radius) continue
        const s = (Math.floor(yy / scale) * SIZE + Math.floor(xx / scale)) * 3
        src.copy(this.px, ((y + yy) * this.w + x + xx) * 3, s, s + 3)
      }
    }
  }
}

function gif(name, frames, w, h) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-media-'))
  frames.forEach((px, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), encodePng(px, w, h)))
  const file = path.join(out, name)
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(FPS),
      '-i',
      path.join(dir, 'f%03d.png'),
      '-vf',
      'split[a][b];[a]palettegen=max_colors=192:stats_mode=full[p];[b][p]paletteuse=dither=none',
      '-loop',
      '0',
      file,
    ],
    { stdio: 'inherit' },
  )
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`${path.relative(process.cwd(), file)}: ${frames.length} frames, ${Math.round(fs.statSync(file).size / 1024)} KB`)
}

const start = 1_800_000_000_000
const frameCount = FPS * SECONDS
const agents = demoCast(start)

// The whole deck: 5 by 3 keys in a dark body.
{
  const scale = 2
  const k = SIZE * scale
  const gap = 18
  const pad = 30
  const w = 5 * k + 4 * gap + pad * 2 + 40
  const h = 3 * k + 2 * gap + pad * 2 + 40
  const frames = []
  for (let f = 0; f < frameCount; f++) {
    const now = start + f * (1000 / FPS)
    const p = new Picture(w, h)
    p.fill(20, 20, w - 40, h - 40, BODY, 28)
    const { slots } = layout(agents, 15)
    slots.forEach((slot, i) => {
      p.key(20 + pad + (i % 5) * (k + gap), 20 + pad + Math.floor(i / 5) * (k + gap), renderKey(slot, now), scale, 14)
    })
    frames.push(p.px)
  }
  gif('pixelings.gif', frames, w, h)
}

// The five states, bigger: asking, your move, working, compacting, idle.
{
  const scale = 3
  const k = SIZE * scale
  const gap = 20
  const kinds = ['ask', 'done', 'working', 'compacting', 'idle']
  const picks = kinds.map(kind => agents.find(a => a.kind === kind))
  const w = kinds.length * k + (kinds.length - 1) * gap + 40
  const h = k + 40
  const frames = []
  for (let f = 0; f < frameCount; f++) {
    const now = start + f * (1000 / FPS)
    const p = new Picture(w, h)
    picks.forEach((a, i) => p.key(20 + i * (k + gap), 20, renderKey(a, now), scale, 18))
    frames.push(p.px)
  }
  gif('pixelings-states.gif', frames, w, h)
}
