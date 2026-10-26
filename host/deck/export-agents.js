// Exports every option a Pixelings character can have as its own picture,
// into docs/agents: each hat (in each of its colours), body colour,
// accessory (in each of its colours), background and state, every hat with
// every body colour, one overview sheet per group, and the folder's
// index page. The characters are
// stickers: outlined, on a clear background, cropped close.
//
//   node export-agents.js [out folder]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { encodePng } from './png.js'
import { DOT_NAMES } from './dots.js'
import { GLYPHS, renderKey, renderPortrait, SIZE } from './render.js'
import { SCENE_NAMES, SCENES, sceneBase } from './scenes.js'
import { ACCESSORIES, BODIES, BODY_NAMES, CLASSIC, HATS } from './wardrobe.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'docs', 'agents'))
const STICKER = 8
const KEY = 4
const NOW = 1000
const CLEAR = [255, 0, 255]
const SHEET_BG = [18, 18, 22, 255]

const HAT_NAMES = {
  tophat: 'top-hat',
  bowler: 'bowler',
  beanie: 'beanie',
  cowboy: 'cowboy',
  crown: 'crown',
  propeller: 'propeller',
  party: 'party',
  chef: 'chef',
  wizard: 'wizard',
  cap: 'cap',
  beret: 'beret',
  viking: 'viking',
  grad: 'graduate',
  halo: 'halo',
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const base = { ...CLASSIC, accessory: 'none', accColor: 0, phase: 0 }

// RGBA pixels of `w` by `h`.
class Image {
  constructor(w, h, fill = [0, 0, 0, 0]) {
    this.w = w
    this.h = h
    this.px = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) this.px.set(fill, i * 4)
  }
  // From the renderer's RGB, the key colour made clear, `k` pixels a pixel.
  static fromRgb(rgb, k, clear = null) {
    const img = new Image(SIZE * k, SIZE * k)
    for (let y = 0; y < SIZE * k; y++) {
      for (let x = 0; x < SIZE * k; x++) {
        const s = (Math.floor(y / k) * SIZE + Math.floor(x / k)) * 3
        const isClear = clear && rgb[s] === clear[0] && rgb[s + 1] === clear[1] && rgb[s + 2] === clear[2]
        img.px.set(isClear ? [0, 0, 0, 0] : [rgb[s], rgb[s + 1], rgb[s + 2], 255], (y * img.w + x) * 4)
      }
    }
    return img
  }
  // Cut to what is not clear, with `pad` pixels round it.
  crop(pad) {
    let [x0, y0, x1, y1] = [this.w, this.h, -1, -1]
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.px[(y * this.w + x) * 4 + 3] === 0) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    }
    const img = new Image(x1 - x0 + 1 + pad * 2, y1 - y0 + 1 + pad * 2)
    img.paste(this, pad - x0, pad - y0)
    return img
  }
  paste(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const tx = x + ox
        const ty = y + oy
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue
        const s = (y * src.w + x) * 4
        if (src.px[s + 3] === 0) continue
        this.px.set(src.px.subarray(s, s + 4), (ty * this.w + tx) * 4)
      }
    }
  }
  // The keys' font, `scale` pixels a font pixel, its top-left at x, y.
  text(str, x, y, rgb, scale) {
    for (const ch of str.toUpperCase()) {
      ;(GLYPHS[ch] ?? []).forEach((bits, col) => {
        for (let row = 0; row < 7; row++) {
          if (!(bits & (1 << row))) continue
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) this.px.set([...rgb, 255], ((y + row * scale + dy) * this.w + x + col * scale + dx) * 4)
          }
        }
      })
      x += 6 * scale
    }
  }
  png() {
    return encodePng(this.px, this.w, this.h, 4)
  }
}

const written = {}
function save(group, name, img) {
  fs.mkdirSync(path.join(out, group), { recursive: true })
  fs.writeFileSync(path.join(out, group, `${name}.png`), img.png())
  ;(written[group] ??= []).push({ name, img })
}

// A character as a sticker; every sticker of a group is cut to the same box
// (the 72-pixel portrait's, less the margin) so they line up in a sheet.
function sticker(look) {
  return Image.fromRgb(renderPortrait({ ...base, ...look }, NOW, CLEAR, true), STICKER, CLEAR)
}

// A sheet of a group's pictures, `cols` across, on a dark background.
function sheet(group, cols, gap = 24) {
  const items = written[group]
  const imgs = items.map(i => i.img.crop(0))
  const cw = Math.max(...imgs.map(i => i.w))
  const ch = Math.max(...imgs.map(i => i.h))
  const rows = Math.ceil(imgs.length / cols)
  const s = new Image(cols * cw + (cols + 1) * gap, rows * ch + (rows + 1) * gap, SHEET_BG)
  imgs.forEach((img, i) => {
    const x = gap + (i % cols) * (cw + gap) + Math.floor((cw - img.w) / 2)
    const y = gap + Math.floor(i / cols) * (ch + gap) + (ch - img.h)
    s.paste(img, x, y)
  })
  fs.mkdirSync(path.join(out, 'sheets'), { recursive: true })
  fs.writeFileSync(path.join(out, 'sheets', `${group}.png`), s.png())
}

fs.rmSync(out, { recursive: true, force: true })

// Each hat, in each of its colours.
for (const [hat, def] of Object.entries(HATS)) {
  def.colors.forEach((_, i) => save('hats', `${HAT_NAMES[hat] ?? hat}-${i + 1}`, sticker({ hat, hatColors: i }).crop(STICKER)))
}

// Each body colour, in the classic top hat.
BODIES.forEach((_, i) => save('colors', slug(BODY_NAMES[i] ?? `color-${i + 1}`), sticker({ body: i }).crop(STICKER)))

// Each accessory, in each of its colours.
for (const [acc, colors] of Object.entries(ACCESSORIES)) {
  if (acc === 'none') continue
  colors.forEach((_, i) => save('accessories', `${slug(acc)}-${i + 1}`, sticker({ accessory: acc, accColor: i }).crop(STICKER)))
}

// The characters: Clawd (Claude Code) in every body colour, each dressed
// his own way to show the range, every Codex dot, and a row of Grok bots in
// a range of shapes and colours.
const OUTFITS = [
  { hat: 'tophat', accessory: 'bowtie' },
  { hat: 'wizard', hatColors: 1, accessory: 'glasses' },
  { hat: 'propeller', accessory: 'scarf' },
  { hat: 'crown', accessory: 'sunglasses' },
  { hat: 'party', hatColors: 1, accessory: 'blush' },
  { hat: 'cowboy', accessory: 'moustache' },
  { hat: 'viking', accessory: 'scarf', accColor: 1 },
  { hat: 'cap', hatColors: 1, accessory: 'glasses', accColor: 2 },
]
BODIES.forEach((_, i) => save('characters', `clawd-${slug(BODY_NAMES[i])}`, sticker({ body: i, ...OUTFITS[i] }).crop(STICKER)))
for (const dot of DOT_NAMES) save('characters', `codex-${dot}`, sticker({ species: 'codex', dot }).crop(STICKER))
const GROK_BOTS = [
  ['tablet', 'violet'],
  ['hex', 'brown'],
  ['wedge', 'blue'],
  ['cloud', 'cyan'],
  ['blob', 'green'],
  ['teardrop', 'magenta'],
  ['star', 'yellow'],
  ['pumpkin', 'orange'],
]
for (const [shape, color] of GROK_BOTS) save('characters', `grokbot-${shape}`, sticker({ species: 'grokbot', shape, color }).crop(STICKER))

// Every hat with every body colour.
for (const hat of Object.keys(HATS)) {
  BODIES.forEach((_, b) => save('combinations', `${HAT_NAMES[hat] ?? hat}-${slug(BODY_NAMES[b])}`, sticker({ hat, body: b }).crop(STICKER)))
}

// Each background, on its own and with Clawd in it.
for (const scene of SCENES) {
  const rgb = Uint8Array.from(sceneBase(scene, 7))
  save('backgrounds', slug(SCENE_NAMES[scene]), Image.fromRgb(rgb, KEY))
  save('backgrounds-with-clawd', slug(SCENE_NAMES[scene]), Image.fromRgb(renderPortrait({ ...base, scene, sceneSeed: 7 }, NOW), KEY))
}

// Each state, as its key shows it.
const STATES = [
  ['asking', { kind: 'ask', ask: 'permission' }],
  ['your-move', { kind: 'done' }],
  ['working', { kind: 'working' }],
  ['compacting', { kind: 'compacting' }],
  ['idle', { kind: 'idle' }],
]
for (const [name, over] of STATES) {
  const agent = { sid: name, title: name.replace('-', ' '), folder: '', since: 0, pct: 40, look: { ...base, scene: 'city', sceneSeed: 7 }, ...over }
  save('states', name, Image.fromRgb(renderKey(agent, 300), KEY))
}

// The characters as rows, each labelled with the tool it stands for.
function castSheet(rows, gap = 24, scale = 4) {
  const labelW = Math.max(...rows.map(([label]) => label.length * 6 * scale - scale)) + gap
  const imgs = rows.map(([, prefix]) => written.characters.filter(i => i.name.startsWith(prefix)).map(i => i.img.crop(0)))
  const cw = Math.max(...imgs.flat().map(i => i.w))
  const ch = Math.max(...imgs.flat().map(i => i.h))
  const cols = Math.max(...imgs.map(r => r.length))
  const s = new Image(labelW + cols * cw + (cols + 1) * gap, rows.length * ch + (rows.length + 1) * gap, SHEET_BG)
  rows.forEach(([label], r) => {
    const top = gap + r * (ch + gap)
    s.text(label, gap, top + Math.floor((ch - 7 * scale) / 2), [200, 200, 210], scale)
    imgs[r].forEach((img, i) => s.paste(img, labelW + gap + i * (cw + gap) + Math.floor((cw - img.w) / 2), top + ch - img.h))
  })
  fs.mkdirSync(path.join(out, 'sheets'), { recursive: true })
  fs.writeFileSync(path.join(out, 'sheets', 'characters.png'), s.png())
}

castSheet([['Claude Code', 'clawd-'], ['Codex', 'codex-'], ['Grok Bot', 'grokbot-']])
sheet('hats', 7)
sheet('colors', 8)
sheet('accessories', 6)
sheet('combinations', 8)
sheet('backgrounds', 6)
sheet('backgrounds-with-clawd', 6)
sheet('states', 5)

// The folder's own index page, rebuilt with the counts every run.
const ROWS = [
  ['characters', 'Clawd (Claude Code) in every body colour, every Codex dot, and some Grok bots'],
  ['hats', 'every hat, in each of its colours'],
  ['colors', 'every body colour, in the classic top hat'],
  ['accessories', 'every accessory, in each of its colours'],
  ['combinations', 'every hat with every body colour'],
  ['backgrounds', 'every background on its own'],
  ['backgrounds-with-clawd', 'every background with Clawd in it'],
  ['states', 'every state, as its Stream Deck key shows it'],
]
const SECTIONS = [
  ['Characters', 'characters'],
  ['Hats', 'hats'],
  ['Colours', 'colors'],
  ['Accessories', 'accessories'],
  ['Hats with colours', 'combinations'],
  ['Backgrounds', 'backgrounds-with-clawd'],
  ['States', 'states'],
]
fs.writeFileSync(
  path.join(out, 'README.md'),
  [
    '# Every Pixelings character option',
    '',
    'Each option a character can have, as its own picture, exported by',
    '`host/deck/export-agents.js` (`npm --prefix host/deck run agents` redoes them',
    'all, and this page). The characters are stickers: outlined, on a clear',
    'background, cropped close.',
    '',
    '| Folder | What | Count |',
    '|--------|------|-------|',
    ...ROWS.map(([g, what]) => `| \`${g}/\` | ${what} | ${written[g].length} |`),
    `| \`sheets/\` | one overview picture per folder | ${ROWS.length} |`,
    '',
    ...SECTIONS.flatMap(([title, g]) => [`## ${title}`, '', `![${title}](sheets/${g}.png)`, '']),
  ].join('\n'),
)

const total = Object.values(written).reduce((n, g) => n + g.length, 0)
console.log(`${out}: ${total} pictures`)
for (const [g, items] of Object.entries(written)) console.log(`  ${g}: ${items.length}`)
