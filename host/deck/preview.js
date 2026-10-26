// Draws the 15 keys into a PNG, without the Stream Deck: the live sessions
// in their saved looks, with --sample the demo deck (demo.js), or with
// --wardrobe every hat, with --scenes every background on its own. --at <ms> moves the clock (to catch a blink or a hop).
//
//   node preview.js out.png [--sample | --wardrobe | --scenes] [--scale 3] [--at 1500]
import fs from 'node:fs'

import { layout, readAgents } from './agents.js'
import { castFor, loadCast, newLook } from './cast.js'
import { CodexSessions } from './codex.js'
import { GrokBotSessions } from './grokbot.js'
import { speciesOf } from './hub.js'
import { demoCast } from './demo.js'
import { asBuffer, encodePng } from './png.js'
import { renderKey, renderScene, SIZE } from './render.js'
import { SCENE_NAMES, SCENES } from './scenes.js'
import { ACCESSORIES, HATS } from './wardrobe.js'

const COLS = 5
const ROWS = 3
const GAP = 12

const args = process.argv.slice(2)
const out = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'deck.png'
const atAt = args.indexOf('--at')
const scaleAt = args.indexOf('--scale')
const scale = scaleAt >= 0 ? Number(args[scaleAt + 1]) : 3
const now = Date.now() + (atAt >= 0 ? Number(args[atAt + 1]) : 0)

// One key per hat, each with the next accessory, all your-move.
function wardrobe(at) {
  const accessories = Object.keys(ACCESSORIES)
  return Object.keys(HATS).map((hat, i) => ({
    sid: hat,
    kind: 'done',
    title: hat,
    folder: '',
    since: at - i,
    look: { ...newLook([]), hat, hatColors: 0, accessory: accessories[i % accessories.length], accColor: 0, phase: 0 },
  }))
}

let agents
if (args.includes('--scenes')) agents = SCENES.map((scene, i) => ({ scene, seed: 11 + i, title: SCENE_NAMES[scene] }))
else if (args.includes('--wardrobe')) agents = wardrobe(now)
else if (args.includes('--sample')) agents = demoCast(now)
else {
  agents = [...readAgents(now), ...new CodexSessions().read(now), ...new GrokBotSessions().read(now)]
  // In memory only: the app owns the saved cast.
  const { cast } = castFor(
    [...agents].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0)).map(a => a.sid),
    loadCast(),
    now,
  )
  for (const a of agents) {
    a.look = { ...cast[a.sid].look, ...speciesOf(a) }
    a.seat = cast[a.sid].seat
  }
}
const scenes = args.includes('--scenes')
const { slots } = scenes ? { slots: agents } : layout(agents, COLS * ROWS)

const W = (COLS * SIZE + (COLS + 1) * GAP) * scale
const H = (ROWS * SIZE + (ROWS + 1) * GAP) * scale
const img = Buffer.alloc(W * H * 3, 18)
slots.forEach((slot, i) => {
  const px = asBuffer(scenes ? renderScene(slot.scene, slot.seed, now, slot.title) : renderKey(slot, now))
  const ox = GAP + (i % COLS) * (SIZE + GAP)
  const oy = GAP + Math.floor(i / COLS) * (SIZE + GAP)
  for (let y = 0; y < SIZE * scale; y++) {
    for (let x = 0; x < SIZE * scale; x++) {
      const s = (Math.floor(y / scale) * SIZE + Math.floor(x / scale)) * 3
      const d = ((oy * scale + y) * W + ox * scale + x) * 3
      px.copy(img, d, s, s + 3)
    }
  }
})

fs.writeFileSync(out, encodePng(img, W, H))
console.log(`${out}: ${agents.length} agents`)
