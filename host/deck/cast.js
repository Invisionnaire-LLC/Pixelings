// Every session gets its own Clawd and its own seat (a key) the first time
// the deck sees it, and keeps both for life. The seat is the lowest one no
// live session holds, so a new session fills the first free key and nobody
// else moves. The Clawd: a hat and a colour no other live session has
// (while there are enough to go round), the least-worn accessory, and hat
// colours and habits picked at random. The cast is saved, so a restart of the deck (or
// the Mac) leaves everyone looking as they did.
import fs from 'node:fs'
import path from 'node:path'

import { DOT_NAMES } from './dots.js'
import { dirs } from './paths.js'
import { SCENES } from './scenes.js'
import { ACCESSORIES, BLINK_MS, BODIES, HABITS, HATS, TAP_MS } from './wardrobe.js'

export const CAST_FILE =
  process.env.PIXELINGS_CAST ?? path.join(dirs().data, 'cast.json')

// A session not seen for this long is forgotten (its hat is long free).
const FORGET_MS = 30 * 24 * 60 * 60 * 1000

const pick = (list, rand) => list[Math.floor(rand() * list.length) % list.length]

// The least-used of `options` among `worn`, ties broken at random.
function leastWorn(options, worn, rand) {
  const count = o => worn.filter(w => w === o).length
  const fewest = Math.min(...options.map(count))
  return pick(
    options.filter(o => count(o) === fewest),
    rand,
  )
}

const MAX_SEED = 2 ** 31 - 1

// A background no live session has (while there are enough), and its seed.
function newScene(others, rand) {
  return { scene: leastWorn(SCENES, others.map(o => o.scene), rand), sceneSeed: Math.floor(rand() * MAX_SEED) }
}

// A new Clawd, dressed apart from `others` (the looks of the live sessions).
export function newLook(others, rand = Math.random) {
  const hat = leastWorn(Object.keys(HATS), others.map(o => o.hat), rand)
  const accessory = leastWorn(Object.keys(ACCESSORIES), others.map(o => o.accessory), rand)
  return {
    hat,
    hatColors: Math.floor(rand() * HATS[hat].colors.length),
    accessory,
    accColor: Math.floor(rand() * ACCESSORIES[accessory].length),
    body: leastWorn([...BODIES.keys()], others.map(o => o.body), rand),
    idle: pick(HABITS.idle, rand),
    work: pick(HABITS.work, rand),
    done: pick(HABITS.done, rand),
    tapMs: pick(TAP_MS, rand),
    blinkMs: pick(BLINK_MS, rand),
    // So no two Clawds blink, tap or hop in step.
    phase: Math.floor(rand() * 60_000),
    ...newScene(others, rand),
    // The Codex dot he is when his session runs in Codex.
    dot: leastWorn(DOT_NAMES, others.map(o => o.dot), rand),
  }
}

// The cast with everyone in `sids` (the live sessions, oldest first) given a
// look and a seat; whether anything changed. Sessions not live are kept
// (their seats free for others), and forgotten after FORGET_MS.
export function castFor(sids, cast, now, rand = Math.random) {
  const next = {}
  let changed = false
  for (const [sid, entry] of Object.entries(cast)) {
    if (sids.includes(sid) || now - (entry.seen ?? 0) < FORGET_MS) next[sid] = entry
    else changed = true
  }
  for (const sid of sids) {
    if (next[sid] && HATS[next[sid].look?.hat] && !DOT_NAMES.includes(next[sid].look.dot)) {
      // Cast before the Codex dots: he gets one now.
      const others = sids.filter(s => s !== sid && next[s]?.look).map(s => next[s].look)
      next[sid] = { ...next[sid], look: { ...next[sid].look, dot: leastWorn(DOT_NAMES, others.map(o => o.dot), rand) } }
      changed = true
    }
    if (next[sid] && HATS[next[sid].look?.hat] && !SCENES.includes(next[sid].look.scene)) {
      // Cast before there were backgrounds: he gets one now.
      const others = sids.filter(s => s !== sid && next[s]?.look).map(s => next[s].look)
      next[sid] = { ...next[sid], look: { ...next[sid].look, ...newScene(others, rand) } }
      changed = true
    }
    if (next[sid] && HATS[next[sid].look?.hat]) {
      // Seen-at moves at most once an hour, so the file is not rewritten
      // every half second.
      if (now - (next[sid].seen ?? 0) > 3_600_000) {
        next[sid] = { ...next[sid], seen: now }
        changed = true
      }
      continue
    }
    const others = sids.filter(s => s !== sid && next[s]).map(s => next[s].look)
    next[sid] = { ...next[sid], look: newLook(others, rand), seen: now }
    changed = true
  }

  // Seats: everyone live keeps his own unless an older session holds it;
  // the rest take the lowest free ones.
  const held = new Set()
  const unseated = []
  for (const sid of sids) {
    const seat = next[sid].seat
    if (Number.isInteger(seat) && seat >= 0 && !held.has(seat)) held.add(seat)
    else unseated.push(sid)
  }
  let free = 0
  for (const sid of unseated) {
    while (held.has(free)) free++
    held.add(free)
    next[sid] = { ...next[sid], seat: free }
    changed = true
  }
  return { cast: next, changed }
}

// The cast with `sid` moved to `seat`; a live session already there swaps
// into the seat `sid` leaves. null when `sid` is not cast or the seat is
// not a seat.
export function moveSeat(cast, sid, seat, liveSids) {
  if (!cast[sid] || !Number.isInteger(seat) || seat < 0 || seat > 999) return null
  const from = cast[sid].seat
  const next = { ...cast, [sid]: { ...cast[sid], seat } }
  const other = liveSids.find(s => s !== sid && cast[s]?.seat === seat)
  if (other) next[other] = { ...cast[other], seat: from }
  return next
}

// Whether `look` only uses what the wardrobe has.
export function validLook(look) {
  const inList = (v, list) => list.includes(v)
  const index = (v, n) => Number.isInteger(v) && v >= 0 && v < n
  return (
    look != null &&
    HATS[look.hat] !== undefined &&
    index(look.hatColors, HATS[look.hat].colors.length) &&
    ACCESSORIES[look.accessory] !== undefined &&
    index(look.accColor, ACCESSORIES[look.accessory].length) &&
    index(look.body, BODIES.length) &&
    inList(look.idle, HABITS.idle) &&
    inList(look.work, HABITS.work) &&
    inList(look.done, HABITS.done) &&
    inList(look.tapMs, TAP_MS) &&
    inList(look.blinkMs, BLINK_MS) &&
    Number.isInteger(look.phase) &&
    SCENES.includes(look.scene) &&
    DOT_NAMES.includes(look.dot) &&
    index(look.sceneSeed, MAX_SEED + 1)
  )
}

// The cast with `sid`'s look changed by `change` (any of the look's
// fields), or with `change === 'reroll'` a new look dressed apart from the
// other live sessions. A new hat or accessory starts on its first colours.
// null when `sid` is not cast or the result is not a look the wardrobe has.
export function restyle(cast, sid, change, liveSids, rand = Math.random) {
  const entry = cast[sid]
  if (!entry) return null
  let look
  if (change === 'reroll') {
    const others = liveSids.filter(s => s !== sid && cast[s]).map(s => cast[s].look)
    look = { ...newLook(others, rand), phase: entry.look.phase }
  } else {
    if (!change || typeof change !== 'object') return null
    look = { ...entry.look, ...change }
    if (change.hat !== undefined && change.hatColors === undefined && change.hat !== entry.look.hat) look.hatColors = 0
    if (change.accessory !== undefined && change.accColor === undefined && change.accessory !== entry.look.accessory)
      look.accColor = 0
  }
  return validLook(look) ? { ...cast, [sid]: { ...entry, look } } : null
}

export function loadCast(file = CAST_FILE) {
  try {
    const cast = JSON.parse(fs.readFileSync(file, 'utf8'))
    return cast && typeof cast === 'object' ? cast : {}
  } catch {
    return {}
  }
}

export function saveCast(cast, file = CAST_FILE) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(cast))
    fs.renameSync(`${file}.tmp`, file)
  } catch {
    // Kept in memory; written again on the next change.
  }
}
