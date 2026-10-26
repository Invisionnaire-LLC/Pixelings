import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { castFor, loadCast, moveSeat, newLook, restyle, saveCast, validLook } from './cast.js'
import { SCENES } from './scenes.js'
import { ACCESSORIES, BODIES, HATS } from './wardrobe.js'

const NOW = 1_800_000_000_000
// A repeatable "random".
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

test('a new look uses only what the wardrobe has', () => {
  const look = newLook([], seeded())
  assert.ok(HATS[look.hat])
  assert.ok(look.hatColors < HATS[look.hat].colors.length)
  assert.ok(look.accessory in ACCESSORIES)
})

test('live sessions all get different hats while there are hats to go round', () => {
  const n = Object.keys(HATS).length
  const sids = Array.from({ length: n }, (_, i) => `s${i}`)
  const { cast } = castFor(sids, {}, NOW, seeded(7))
  assert.equal(new Set(sids.map(s => cast[s].look.hat)).size, n)
})

test('past that, no hat is worn twice before every hat is worn once', () => {
  const n = Object.keys(HATS).length
  const sids = Array.from({ length: n + 3 }, (_, i) => `s${i}`)
  const { cast } = castFor(sids, {}, NOW, seeded(3))
  const counts = {}
  for (const s of sids) counts[cast[s].look.hat] = (counts[cast[s].look.hat] ?? 0) + 1
  assert.ok(Math.max(...Object.values(counts)) <= 2)
})

test('a session keeps its look', () => {
  const first = castFor(['a', 'b'], {}, NOW, seeded(1)).cast
  const again = castFor(['a', 'b', 'c'], first, NOW + 1000, seeded(99))
  assert.deepEqual(again.cast.a.look, first.a.look)
  assert.deepEqual(again.cast.b.look, first.b.look)
  assert.ok(again.changed, 'c was cast')
})

test('nothing changes when everyone is already cast', () => {
  const first = castFor(['a'], {}, NOW, seeded(1)).cast
  assert.equal(castFor(['a'], first, NOW + 1000).changed, false)
})

test("a new session takes a hat freed by one that ended, not a live one's", () => {
  const hats = Object.keys(HATS)
  const cast = Object.fromEntries(hats.map((h, i) => [`s${i}`, { look: { ...newLook([]), hat: h }, seen: NOW }]))
  const live = hats.slice(1).map((_, i) => `s${i + 1}`)
  const { cast: next } = castFor([...live, 'new'], cast, NOW, seeded(5))
  assert.equal(next.new.look.hat, hats[0])
})

test('long-gone sessions are forgotten, recent ones kept', () => {
  const cast = {
    old: { look: newLook([]), seen: NOW - 40 * 86_400_000 },
    recent: { look: newLook([]), seen: NOW - 86_400_000 },
  }
  const { cast: next } = castFor([], cast, NOW)
  assert.deepEqual(Object.keys(next), ['recent'])
})

test('a look naming a hat that no longer exists is recast', () => {
  const cast = { a: { look: { ...newLook([]), hat: 'gone' }, seen: NOW } }
  assert.ok(HATS[castFor(['a'], cast, NOW).cast.a.look.hat])
})

test('the cast survives a save and a load', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cast-')), 'cast.json')
  const { cast } = castFor(['a', 'b'], {}, NOW, seeded(2))
  saveCast(cast, file)
  assert.deepEqual(loadCast(file), cast)
  assert.deepEqual(loadCast(`${file}.missing`), {})
})

test('sessions take seats in the order they started', () => {
  const { cast } = castFor(['a', 'b', 'c'], {}, NOW, seeded(1))
  assert.deepEqual(
    ['a', 'b', 'c'].map(s => cast[s].seat),
    [0, 1, 2],
  )
})

test('a seat is kept for life, and nobody moves when one ends', () => {
  const first = castFor(['a', 'b', 'c'], {}, NOW, seeded(1)).cast
  const after = castFor(['a', 'c'], first, NOW + 1000).cast
  assert.equal(after.a.seat, 0)
  assert.equal(after.c.seat, 2)
})

test("a new session takes the lowest free seat, a gone session's included", () => {
  const first = castFor(['a', 'b', 'c'], {}, NOW, seeded(1)).cast
  const after = castFor(['a', 'c', 'd', 'e'], first, NOW + 1000, seeded(2)).cast
  assert.equal(after.d.seat, 1, 'the seat b left')
  assert.equal(after.e.seat, 3)
})

test('a session back after its seat was taken sits in the next free one', () => {
  const first = castFor(['a', 'b'], {}, NOW, seeded(1)).cast
  const taken = castFor(['a', 'x'], first, NOW + 1000, seeded(2)).cast
  assert.equal(taken.x.seat, 1)
  const back = castFor(['a', 'x', 'b'], taken, NOW + 2000).cast
  assert.equal(back.b.seat, 2)
  assert.equal(back.x.seat, 1)
})

test('two live sessions never share a seat (the older one keeps it)', () => {
  const cast = {
    a: { look: newLook([]), seen: NOW, seat: 0 },
    b: { look: newLook([]), seen: NOW, seat: 0 },
  }
  const next = castFor(['a', 'b'], cast, NOW).cast
  assert.equal(next.a.seat, 0)
  assert.equal(next.b.seat, 1)
})

test('moving to a free seat moves only him', () => {
  const cast = castFor(['a', 'b'], {}, NOW, seeded(1)).cast
  const next = moveSeat(cast, 'a', 7, ['a', 'b'])
  assert.equal(next.a.seat, 7)
  assert.equal(next.b.seat, 1)
})

test("moving onto a live session's seat swaps them", () => {
  const cast = castFor(['a', 'b', 'c'], {}, NOW, seeded(1)).cast
  const next = moveSeat(cast, 'a', 2, ['a', 'b', 'c'])
  assert.equal(next.a.seat, 2)
  assert.equal(next.c.seat, 0)
  assert.equal(next.b.seat, 1)
})

test("a gone session's old seat is free to take", () => {
  const cast = castFor(['a', 'b'], {}, NOW, seeded(1)).cast
  const next = moveSeat(cast, 'a', 1, ['a'])
  assert.equal(next.a.seat, 1)
  assert.equal(next.b.seat, 1, 'b is gone; it gets a free seat when back')
})

test('moving refuses what is not a seat or not cast', () => {
  const cast = castFor(['a'], {}, NOW, seeded(1)).cast
  assert.equal(moveSeat(cast, 'a', -1, ['a']), null)
  assert.equal(moveSeat(cast, 'a', 1.5, ['a']), null)
  assert.equal(moveSeat(cast, 'zz', 1, ['a']), null)
})

test('restyle changes what it is asked to, and resets colours for a new hat', () => {
  const cast = castFor(['a'], {}, NOW, seeded(1)).cast
  const withCrown = restyle(cast, 'a', { hat: 'crown' }, ['a'])
  assert.equal(withCrown.a.look.hat, 'crown')
  assert.equal(withCrown.a.look.hatColors, 0)
  assert.equal(withCrown.a.look.accessory, cast.a.look.accessory)
  assert.equal(restyle(withCrown, 'a', { hatColors: 1 }, ['a']).a.look.hatColors, 1)
})

test('restyle refuses what the wardrobe does not have', () => {
  const cast = castFor(['a'], {}, NOW, seeded(1)).cast
  assert.equal(restyle(cast, 'a', { hat: 'sombrero' }, ['a']), null)
  assert.equal(restyle(cast, 'a', { hat: 'chef', hatColors: 5 }, ['a']), null)
  assert.equal(restyle(cast, 'a', { idle: 'dance' }, ['a']), null)
  assert.equal(restyle(cast, 'a', 'nope', ['a']), null)
  assert.equal(restyle(cast, 'zz', { hat: 'chef' }, ['a']), null)
})

test('a re-roll gives a new look, dressed apart, keeping his clock', () => {
  const cast = castFor(['a', 'b'], {}, NOW, seeded(1)).cast
  const next = restyle(cast, 'a', 'reroll', ['a', 'b'], seeded(42))
  assert.ok(validLook(next.a.look))
  assert.notEqual(next.a.look.hat, next.b.look.hat)
  assert.equal(next.a.look.phase, cast.a.look.phase)
})

test('live sessions all get different colours while there are colours to go round', () => {
  const sids = BODIES.map((_, i) => `s${i}`)
  const { cast } = castFor(sids, {}, NOW, seeded(11))
  assert.equal(new Set(sids.map(s => cast[s].look.body)).size, BODIES.length)
})

test('live sessions get different backgrounds, each with its own seed', () => {
  const sids = SCENES.map((_, i) => `s${i}`)
  const { cast } = castFor(sids, {}, NOW, seeded(5))
  assert.equal(new Set(sids.map(s => cast[s].look.scene)).size, SCENES.length)
  assert.ok(sids.every(s => Number.isInteger(cast[s].look.sceneSeed)))
})

test('a Clawd cast before backgrounds gets one, and keeps the rest of his look', () => {
  const old = newLook([], seeded(3))
  delete old.scene
  delete old.sceneSeed
  const { cast, changed } = castFor(['a'], { a: { look: old, seen: NOW, seat: 0 } }, NOW, seeded(4))
  assert.ok(changed)
  assert.ok(SCENES.includes(cast.a.look.scene))
  assert.equal(cast.a.look.hat, old.hat)
  assert.ok(validLook(cast.a.look))
})

test('restyle can pick a background or a new seed for it', () => {
  const cast = castFor(['a'], {}, NOW, seeded(1)).cast
  assert.equal(restyle(cast, 'a', { scene: 'space' }, ['a']).a.look.scene, 'space')
  assert.equal(restyle(cast, 'a', { sceneSeed: 12345 }, ['a']).a.look.sceneSeed, 12345)
  assert.equal(restyle(cast, 'a', { scene: 'mars' }, ['a']), null)
  assert.equal(restyle(cast, 'a', { sceneSeed: -1 }, ['a']), null)
})

test('every look has a Codex dot, the least-worn among the live ones', async () => {
  const { DOT_NAMES } = await import('./dots.js')
  const sids = DOT_NAMES.map((_, i) => `s${i}`)
  const { cast } = castFor(sids, {}, NOW, seeded(9))
  assert.equal(new Set(sids.map(s => cast[s].look.dot)).size, DOT_NAMES.length)
  const old = { ...newLook([], seeded(3)) }
  delete old.dot
  const back = castFor(['a'], { a: { look: old, seen: NOW, seat: 0 } }, NOW, seeded(4)).cast
  assert.ok(DOT_NAMES.includes(back.a.look.dot))
  assert.equal(restyle(back, 'a', { dot: 'frog' }, ['a']).a.look.dot, 'frog')
  assert.equal(restyle(back, 'a', { dot: 'bot' }, ['a']), null)
})
