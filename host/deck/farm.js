// The farm: a world on a screen of its own (a Corsair Xeneon Edge under
// the monitor, say) where every agent's Pixeling lives, a farm, an office
// or a mall. Idle, he wanders about and does things there (tends the
// crops, gets a coffee, window-shops); busy, he stops where he is and faces
// you, doing what his key shows. This is the
// world's shape and who goes where; public/farm.js draws it. A world pixel
// is one of his key's pixels. No Node imports: the page runs it.
import { random } from './scenes.js'

// The world's height in world pixels; its width follows the screen's.
export const FARM_H = 240
// Where his feet are in his figure (renderFigure), from its top-left.
export const FEET = [36, 46]
// World pixels a second.
const SPEED = 22
// A newcomer drops in, and a leaver fades out, over these.
export const ARRIVE_MS = 900
export const LEAVE_MS = 700
// How long he stands about between walks.
const PAUSE_MS = [2000, 7000]
// What he can do at a spot: how long for, and how renderFigure poses him
// meanwhile (his key's idle animation when none).
const ACTIVITIES = {
  tend: { ms: [10_000, 20_000], pose: 'tend' },
  fish: { ms: [15_000, 40_000] },
  nap: { ms: [20_000, 60_000], pose: 'sleep' },
  coffee: { ms: [8_000, 18_000] },
  plant: { ms: [8_000, 15_000], pose: 'tend' },
  print: { ms: [6_000, 12_000], pose: 'tend' },
  pingpong: { ms: [15_000, 30_000], pose: 'tend' },
  shop: { ms: [8_000, 20_000] },
  arcade: { ms: [12_000, 30_000], pose: 'tend' },
  coin: { ms: [6_000, 12_000] },
  eat: { ms: [12_000, 25_000] },
}
// How often an idle Pixeling goes to a spot rather than just wandering.
const SPOT_CHANCE = 0.45
// How far apart newcomers are put, across and up and down.
const ROOM = [56, 30]

// The places his world can be.
export const SCENES = ['farm', 'office', 'mall']

// The world for a screen `w` wide: the horizon (or where the back wall
// meets the floor), the ground they walk on, the door (a tap starts a new
// agent), what is in the way (blocks: boxes his feet stay out of; ovals:
// water), the things that stand on the floor (drawn in depth order with
// everyone), and the spots where they do things.
export function farmLayout(w, h = FARM_H, scene = 'farm', seed = 7) {
  const horizon = Math.round(h * 0.4)
  const L = { w, h, seed, scene: SCENES.includes(scene) ? scene : 'farm', horizon, ground: { top: horizon + 26, bottom: h - 14 } }
  Object.assign(L, { blocks: [], ovals: [], things: [], spots: [] })
  LAYOUTS[L.scene](L)
  return L
}

// The Desktop's world: nothing in it but a thin strip of ground along its
// bottom, with room under it for his context bar, and no way in.
export function desktopLayout(w, h) {
  return { w, h, seed: 7, scene: 'desktop', horizon: 0, ground: { top: h - 13, bottom: h - 9 }, blocks: [], ovals: [], things: [], spots: [] }
}

const LAYOUTS = {
  // A barn (its door is the way in), crops, a pond and trees.
  farm(L) {
    const { w, h, horizon, ground } = L
    const bw = 96
    const barn = { x: Math.max(8, Math.round(w * 0.04)), base: horizon + 26, w: bw, h: 66 }
    barn.door = { x: barn.x + bw / 2 - 12, y: barn.base - 26, w: 24, h: 26 }
    const crops = { x: barn.x + bw + 40, y: ground.top + 30, w: Math.max(90, Math.round(w * 0.2)), rows: 5, gap: 12 }
    const pond = { cx: Math.round(w * 0.74), cy: h - 50, rx: Math.max(36, Math.round(w * 0.08)), ry: 22 }
    const trees = [
      { x: Math.round(w * 0.56), base: horizon + 24, size: 1 },
      { x: w - 40, base: horizon + 18, size: 0.8 },
    ]
    Object.assign(L, { barn, crops, pond, trees, door: barn.door })
    L.blocks.push({ x0: barn.x - 14, x1: barn.x + bw + 14, y0: -Infinity, y1: barn.base + 10 })
    L.ovals.push({ cx: pond.cx, cy: pond.cy, rx: pond.rx + 4, ry: pond.ry + 3 })
    for (const r of [0, 2, 4]) {
      for (const f of [0.3, 0.7]) L.spots.push({ kind: 'tend', x: Math.round(crops.x + crops.w * f), y: crops.y + r * crops.gap + 6 })
    }
    for (const f of [-0.5, 0, 0.5]) {
      const dx = pond.rx * f
      L.spots.push({ kind: 'fish', x: Math.round(pond.cx + dx - 10), y: Math.round(pond.cy - pond.ry * Math.sqrt(1 - f * f)) - 6 })
    }
    for (const t of trees) L.spots.push({ kind: 'nap', x: t.x + 14, y: ground.top + 4 })
  },

  // An open office: a lift (the way in), windows on the city, a coffee bar,
  // a water cooler, desks, plants, a bookshelf, a printer and a vending
  // machine along the back wall; a ping-pong table and a couch on the floor.
  office(L) {
    const { w, horizon, ground } = L
    const at = f => Math.round(w * f)
    L.wallBase = horizon + 8
    L.door = { x: Math.max(10, at(0.035)), y: L.wallBase - 54, w: 34, h: 54 }
    // Along the back wall, on the floor just behind where anyone stands.
    L.wall = [
      { kind: 'coffee', x: at(0.14) },
      { kind: 'cooler', x: at(0.21) },
      { kind: 'desk', x: at(0.28) },
      { kind: 'desk', x: at(0.36) },
      { kind: 'plant', x: at(0.43) },
      { kind: 'vending', x: at(0.5) },
      { kind: 'desk', x: at(0.72) },
      { kind: 'shelf', x: at(0.8) },
      { kind: 'printer', x: at(0.88) },
      { kind: 'plant', x: at(0.95) },
    ]
    L.board = { x: at(0.58), w: 56 }
    const front = ground.top + 4
    for (const t of L.wall) {
      if (t.kind === 'coffee') L.spots.push({ kind: 'coffee', x: t.x - 10, y: front }, { kind: 'coffee', x: t.x + 12, y: front })
      if (t.kind === 'cooler' || t.kind === 'vending') L.spots.push({ kind: 'coffee', x: t.x, y: front })
      if (t.kind === 'plant') L.spots.push({ kind: 'plant', x: t.x - 12, y: front })
      if (t.kind === 'printer') L.spots.push({ kind: 'print', x: t.x, y: front })
    }
    const table = { kind: 'pingpong', x: at(0.38), base: ground.top + 50 }
    const couch = { kind: 'couch', x: at(0.64), base: ground.top + 42 }
    const ficus = { kind: 'ficus', x: at(0.9), base: ground.bottom - 4 }
    L.things.push(table, couch, ficus)
    L.blocks.push(
      { x0: table.x - 40, x1: table.x + 40, y0: table.base - 14, y1: table.base + 3 },
      { x0: couch.x - 38, x1: couch.x + 38, y0: couch.base - 12, y1: couch.base + 3 },
      { x0: ficus.x - 10, x1: ficus.x + 10, y0: ficus.base - 6, y1: ficus.base + 3 },
    )
    L.spots.push(
      { kind: 'pingpong', x: table.x - 50, y: table.base - 4, dir: 1 },
      { kind: 'pingpong', x: table.x + 50, y: table.base - 4, dir: -1 },
      { kind: 'nap', x: couch.x - 15, y: couch.base + 5 },
      { kind: 'nap', x: couch.x + 15, y: couch.base + 5 },
    )
  },

  // A shopping mall: glass doors (the way in) and a row of shops under a
  // skylight, an arcade among them; a fountain with benches, and a food
  // court of tables under umbrellas.
  mall(L) {
    const { w, horizon, ground } = L
    const at = f => Math.round(w * f)
    L.wallBase = horizon + 8
    L.door = { x: Math.max(10, at(0.035)), y: L.wallBase - 56, w: 44, h: 56 }
    const NAMES = ['TOYS', 'SHOES', 'ARCADE', 'BOOKS', 'PETS', 'CANDY', 'PIZZA', 'MUSIC', 'TECH', 'HATS']
    L.shops = []
    for (let x = L.door.x + L.door.w + 14, i = 0; x + 92 <= w - 6; x += 100, i++) L.shops.push({ x, w: 92, name: NAMES[i % NAMES.length] })
    const front = ground.top + 4
    for (const s of L.shops) L.spots.push({ kind: s.name === 'ARCADE' ? 'arcade' : 'shop', x: s.x + 34, y: front })
    const fountain = { cx: at(0.4), cy: ground.top + 56, rx: Math.max(30, at(0.06)), ry: 16 }
    L.fountain = fountain
    L.ovals.push({ cx: fountain.cx, cy: fountain.cy, rx: fountain.rx + 5, ry: fountain.ry + 4 })
    L.things.push({ kind: 'jet', x: fountain.cx, base: fountain.cy })
    for (const f of [-0.5, 0, 0.5]) {
      L.spots.push({ kind: 'coin', x: Math.round(fountain.cx + fountain.rx * f - 8), y: Math.round(fountain.cy - fountain.ry * Math.sqrt(1 - f * f)) - 7 })
    }
    for (const side of [-1, 1]) {
      const bench = { kind: 'bench', x: fountain.cx + side * (fountain.rx + 50), base: fountain.cy + 6 }
      L.things.push(bench)
      L.blocks.push({ x0: bench.x - 24, x1: bench.x + 24, y0: bench.base - 8, y1: bench.base + 3 })
      L.spots.push({ kind: 'nap', x: bench.x, y: bench.base + 5 })
    }
    for (const [i, f] of [0.7, 0.8, 0.9].entries()) {
      const table = { kind: 'table', x: at(f), base: ground.top + (i % 2 ? 76 : 44) }
      L.things.push(table)
      L.blocks.push({ x0: table.x - 14, x1: table.x + 14, y0: table.base - 8, y1: table.base + 3 })
      L.spots.push({ kind: 'eat', x: table.x - 20, y: table.base - 1 })
    }
    for (const x of [L.door.x + 10, at(0.56)]) {
      const palm = { kind: 'palm', x, base: ground.bottom - 2 }
      L.things.push(palm)
      L.blocks.push({ x0: x - 10, x1: x + 10, y0: palm.base - 6, y1: palm.base + 3 })
    }
  },
}

// Whether his feet can be at x, y: on the ground, out of the water and
// clear of what is in the way.
export function walkable(L, x, y) {
  if (x < 14 || x > L.w - 14 || y < L.ground.top || y > L.ground.bottom) return false
  for (const { cx, cy, rx, ry } of L.ovals) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) return false
  return !L.blocks.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)
}

// Whether he can walk straight from a to b.
function clear(L, ax, ay, bx, by) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4))
  for (let i = 0; i <= n; i++) {
    if (!walkable(L, ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false
  }
  return true
}

const between = (r, [lo, hi]) => lo + r() * (hi - lo)

// The screen the farm goes on: `choice` is 'off', 'auto' or a display's
// id. Automatic is a Xeneon Edge, or else another long, short screen that
// is not the main one; a chosen screen that is unplugged shows nothing.
export function pickFarmDisplay(displays, choice) {
  if (choice === 'off' || !Array.isArray(displays)) return null
  if (choice !== 'auto') return displays.find(d => d.id === choice) ?? null
  return displays.find(d => /xeneon\s*edge/i.test(d.name ?? '')) ?? displays.find(d => !d.primary && d.width >= 3 * d.height) ?? null
}

// Everyone in the farm: one actor for each agent, kept as the state comes
// and goes (update), moved along on every frame (step).
export class Farm {
  constructor(layout, rand = Math.random) {
    this.L = layout
    this.rand = rand
    this.actors = new Map()
    // Spot index → the sid of whoever is at it or on his way there.
    this.taken = new Map()
    this.last = null
  }

  // A new world size: everyone kept, moved onto the ground if off it.
  resize(layout) {
    this.L = layout
    this.taken.clear()
    for (const a of this.actors.values()) {
      if (!walkable(layout, a.x, a.y)) Object.assign(a, this.anywhere())
      this.rest(a, 0)
    }
  }

  // Somewhere else altogether: everyone arrives again, spread about it.
  moveTo(layout, now) {
    this.L = layout
    this.taken.clear()
    const all = [...this.actors.values()]
    for (const a of all) this.actors.delete(a.sid)
    for (const a of all) {
      if (a.leftAt !== null) continue
      Object.assign(a, this.anywhere(), { born: now, spot: null, activity: null, plan: 'pause', until: now + ARRIVE_MS + 1000 })
      this.actors.set(a.sid, a)
    }
  }

  // A free place to stand, as far from everyone else as can be found (a
  // figure and his name want about ROOM apart).
  anywhere() {
    const L = this.L
    const others = [...this.actors.values()].filter(a => a.leftAt === null)
    let best = null
    for (let i = 0; i < 80; i++) {
      const x = 14 + this.rand() * (L.w - 28)
      const y = L.ground.top + this.rand() * (L.ground.bottom - L.ground.top)
      if (!walkable(L, x, y)) continue
      const room = Math.min(Infinity, ...others.map(a => Math.hypot((a.x - x) / ROOM[0], (a.y - y) / ROOM[1])))
      if (room >= 1) return { x, y }
      if (!best || room > best.room) best = { x, y, room }
    }
    return best ? { x: best.x, y: best.y } : { x: L.w / 2, y: L.ground.bottom - 4 }
  }

  // The agents now (the hub's state): newcomers arrive, the gone leave.
  update(agents, now) {
    const live = new Set()
    for (const agent of agents) {
      live.add(agent.sid)
      const a = this.actors.get(agent.sid)
      if (a) {
        a.agent = agent
        a.leftAt = null
        continue
      }
      const at = this.anywhere()
      this.actors.set(agent.sid, { sid: agent.sid, agent, ...at, born: now, leftAt: null, plan: 'pause', until: now + ARRIVE_MS + 1000 })
    }
    for (const a of this.actors.values()) {
      if (!live.has(a.sid) && a.leftAt === null) {
        a.leftAt = now
        this.release(a)
      }
    }
  }

  release(a) {
    for (const [i, sid] of this.taken) if (sid === a.sid) this.taken.delete(i)
    a.spot = null
  }

  rest(a, now) {
    this.release(a)
    a.plan = 'pause'
    a.activity = null
    a.until = now + between(this.rand, PAUSE_MS)
  }

  // Where he goes next: a free spot sometimes, else a stroll.
  next(a, now) {
    const L = this.L
    if (this.rand() < SPOT_CHANCE) {
      const free = L.spots.map((s, i) => i).filter(i => !this.taken.has(i) && clear(L, a.x, a.y, L.spots[i].x, L.spots[i].y))
      if (free.length) {
        const i = free[Math.floor(this.rand() * free.length)]
        this.taken.set(i, a.sid)
        a.spot = i
        Object.assign(a, { plan: 'walk', tx: L.spots[i].x, ty: L.spots[i].y })
        return
      }
    }
    for (let i = 0; i < 20; i++) {
      const tx = a.x + (this.rand() - 0.5) * 320
      const ty = a.y + (this.rand() - 0.5) * Math.min(90, L.ground.bottom - L.ground.top)
      if (walkable(L, tx, ty) && clear(L, a.x, a.y, tx, ty)) {
        Object.assign(a, { plan: 'walk', tx, ty })
        return
      }
    }
    this.rest(a, now)
  }

  // Everyone a frame on; the actors gone long enough are dropped.
  step(now) {
    const dt = this.last === null ? 0 : Math.min(0.25, (now - this.last) / 1000)
    this.last = now
    for (const a of [...this.actors.values()]) {
      if (a.leftAt !== null) {
        if (now - a.leftAt > LEAVE_MS) this.actors.delete(a.sid)
        continue
      }
      // Busy (working, asking, your move, compacting): he stops and faces you.
      if (a.agent.kind !== 'idle') {
        if (a.plan !== 'busy') {
          this.release(a)
          a.plan = 'busy'
          a.activity = null
        }
        continue
      }
      if (a.plan === 'busy') this.rest(a, now)
      if (now - a.born < ARRIVE_MS) continue
      if (a.plan === 'walk') {
        const dx = a.tx - a.x
        const dy = a.ty - a.y
        const d = Math.hypot(dx, dy)
        const go = SPEED * dt
        if (d > go) {
          a.x += (dx / d) * go
          a.y += (dy / d) * go
          continue
        }
        a.x = a.tx
        a.y = a.ty
        if (a.spot != null) {
          const kind = this.L.spots[a.spot].kind
          a.plan = 'activity'
          a.activity = kind
          a.until = now + between(this.rand, ACTIVITIES[kind].ms)
        } else this.rest(a, now)
      } else if (now >= a.until) {
        if (a.plan === 'activity') this.rest(a, now)
        else this.next(a, now)
      }
    }
  }

  // How renderFigure poses him (its `roam`), or null for his key's own.
  static roam(a) {
    if (a.plan === 'walk') return { walk: true }
    const pose = a.plan === 'activity' && ACTIVITIES[a.activity]?.pose
    return pose ? { [pose]: true } : null
  }

  // Who is at x, y (world pixels), the one in front first; or null.
  hit(x, y) {
    const near = [...this.actors.values()]
      .filter(a => a.leftAt === null && x >= a.x - 18 && x <= a.x + 18 && y >= a.y - 40 && y <= a.y + 4)
      .sort((p, q) => q.y - p.y)
    return near[0] ?? null
  }
}

// The way in (the barn's door, the lift, the mall's doors), where a tap
// starts a new agent.
export function atDoor(L, x, y) {
  const d = L.door
  return x >= d.x - 4 && x <= d.x + d.w + 4 && y >= d.y - 14 && y <= d.y + d.h
}

// The same layout every time for a seed: its grass, flowers and hills.
export function farmRandom(L) {
  return random(L.seed * 7919 + L.w)
}
