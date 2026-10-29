import assert from 'node:assert/strict'
import { test } from 'node:test'

import { seeded } from './demo.js'
import { ARRIVE_MS, atDoor, desktopLayout, Farm, FARM_H, farmLayout, LEAVE_MS, pickFarmDisplay, SCENES, walkable } from './farm.js'

const EDGE = { id: 3, name: 'XENEON EDGE', width: 2560, height: 720, primary: false }
const MAIN = { id: 1, name: 'Built-in Retina Display', width: 1728, height: 1117, primary: true }
const WIDE = { id: 2, name: 'S34J55x', width: 3440, height: 1440, primary: false }
const agent = (sid, kind = 'idle') => ({ sid, kind, title: sid })

test('the farm goes on a Xeneon Edge, or another long, short screen', () => {
  assert.equal(pickFarmDisplay([MAIN, WIDE, EDGE], 'auto'), EDGE)
  const strip = { id: 4, name: 'Strip', width: 1920, height: 480, primary: false }
  assert.equal(pickFarmDisplay([MAIN, WIDE, strip], 'auto'), strip)
  assert.equal(pickFarmDisplay([MAIN, WIDE], 'auto'), null)
  // The main screen is never picked for you.
  assert.equal(pickFarmDisplay([{ ...strip, primary: true }], 'auto'), null)
})

test('a chosen screen, or none when it is unplugged or the farm is off', () => {
  assert.equal(pickFarmDisplay([MAIN, WIDE, EDGE], 2), WIDE)
  assert.equal(pickFarmDisplay([MAIN, EDGE], 2), null)
  assert.equal(pickFarmDisplay([MAIN, EDGE], 'off'), null)
})

test('every spot in the farm, the office and the mall can be stood on', () => {
  for (const scene of SCENES) {
    for (const w of [427, 854, 960, 1200]) {
      const L = farmLayout(w, FARM_H, scene)
      assert.equal(L.scene, scene)
      for (const s of L.spots) assert.ok(walkable(L, s.x, s.y), `${s.kind} at ${s.x},${s.y} in the ${scene} ${w} wide`)
      for (const t of L.things) assert.ok(!walkable(L, t.x, t.base - 1), `${t.kind} in the ${scene} ${w} wide is in the way`)
      assert.ok(L.spots.length >= 8)
      assert.ok(atDoor(L, L.door.x + 5, L.door.y + 5))
    }
  }
  const farm = farmLayout(854)
  assert.ok(!walkable(farm, farm.pond.cx, farm.pond.cy))
  const mall = farmLayout(854, FARM_H, 'mall')
  assert.ok(!walkable(mall, mall.fountain.cx, mall.fountain.cy))
  assert.equal(farmLayout(854, FARM_H, 'moon').scene, 'farm')
})

test('somewhere else, everyone arrives again, apart and on its ground', () => {
  const farm = new Farm(farmLayout(854), seeded(4))
  farm.update(['a', 'b', 'c', 'd'].map(s => agent(s)), 0)
  for (let t = 0; t < 60_000; t += 50) farm.step(t)
  farm.update(['a', 'b', 'c'].map(s => agent(s)), 60_000)
  farm.moveTo(farmLayout(854, FARM_H, 'office'), 60_000)
  const all = [...farm.actors.values()]
  assert.deepEqual(all.map(a => a.sid).sort(), ['a', 'b', 'c'])
  assert.equal(farm.taken.size, 0)
  for (const a of all) {
    assert.equal(a.born, 60_000)
    assert.ok(walkable(farm.L, a.x, a.y))
    for (const b of all) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20)
  }
})

test('newcomers arrive apart, on the ground', () => {
  const farm = new Farm(farmLayout(854), seeded(5))
  farm.update(['a', 'b', 'c', 'd', 'e', 'f'].map(s => agent(s)), 0)
  const all = [...farm.actors.values()]
  for (const a of all) assert.ok(walkable(farm.L, a.x, a.y))
  for (const a of all) for (const b of all) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 20)
})

test('an idle Pixeling wanders; a busy one stays put and faces you', () => {
  const farm = new Farm(farmLayout(854), seeded(9))
  farm.update([agent('idle'), agent('busy', 'working')], 0)
  const busy = farm.actors.get('busy')
  const idle = farm.actors.get('idle')
  const at = { x: busy.x, y: busy.y }
  const from = { x: idle.x, y: idle.y }
  let walked = false
  for (let t = 0; t < 30_000; t += 33) {
    farm.step(t)
    if (Farm.roam(idle)?.walk) walked = true
    assert.ok(walkable(farm.L, idle.x, idle.y) || idle.plan === 'walk')
  }
  assert.deepEqual({ x: busy.x, y: busy.y }, at)
  assert.equal(busy.plan, 'busy')
  assert.equal(Farm.roam(busy), null)
  assert.ok(walked)
  assert.notDeepEqual({ x: idle.x, y: idle.y }, from)
})

test('a spot is taken by one Pixeling at a time', () => {
  const farm = new Farm(farmLayout(854), seeded(11))
  farm.update(Array.from({ length: 12 }, (_, i) => agent(`p${i}`)), 0)
  for (let t = 0; t < 120_000; t += 50) {
    farm.step(t)
    const at = [...farm.actors.values()].filter(a => a.spot != null).map(a => a.spot)
    assert.equal(new Set(at).size, at.length)
  }
})

test('a Pixeling whose agent goes busy stops, and gives up his spot', () => {
  const farm = new Farm(farmLayout(854), seeded(3))
  farm.update([agent('a')], 0)
  const a = farm.actors.get('a')
  let t = 0
  while (a.spot == null && t < 200_000) farm.step((t += 50))
  assert.notEqual(a.spot, null)
  farm.update([agent('a', 'ask')], t)
  farm.step((t += 50))
  const x = a.x
  farm.step((t += 1000))
  assert.equal(a.plan, 'busy')
  assert.equal(a.spot, null)
  assert.equal(farm.taken.size, 0)
  assert.equal(a.x, x)
})

test('a gone agent fades out, then leaves the farm', () => {
  const farm = new Farm(farmLayout(854), seeded(1))
  farm.update([agent('a'), agent('b')], 0)
  farm.update([agent('b')], ARRIVE_MS)
  assert.notEqual(farm.actors.get('a').leftAt, null)
  farm.step(ARRIVE_MS + LEAVE_MS / 2)
  assert.ok(farm.actors.has('a'))
  farm.step(ARRIVE_MS + LEAVE_MS + 50)
  assert.ok(!farm.actors.has('a'))
  // Back before he is gone: he stays.
  farm.update([agent('b')], 0)
  farm.update([agent('a'), agent('b')], 10)
  assert.equal(farm.actors.get('a').leftAt, null)
})

test('a tap finds the Pixeling in front', () => {
  const farm = new Farm(farmLayout(854), seeded(2))
  farm.update([agent('back'), agent('front')], 0)
  Object.assign(farm.actors.get('back'), { x: 300, y: 150 })
  Object.assign(farm.actors.get('front'), { x: 305, y: 170 })
  assert.equal(farm.hit(303, 150)?.sid, 'front')
  assert.equal(farm.hit(300, 120)?.sid, 'back')
  assert.equal(farm.hit(10, 10), null)
  // Grown twice as big, he is there further up and out too.
  assert.equal(farm.hit(300, 100)?.sid, undefined)
  assert.equal(farm.hit(300, 100, a => (a.sid === 'back' ? 2 : 1))?.sid, 'back')
})

test('on the Desktop they stroll along the thin strip at its bottom, and nowhere else', () => {
  const L = desktopLayout(1000, 84)
  const farm = new Farm(L, seeded(3))
  const agents = ['a', 'b', 'c'].map(sid => agent(sid))
  farm.update(agents, 0)
  const start = [...farm.actors.values()].map(a => a.x)
  let walked = false
  for (let t = 0; t <= 120_000; t += 100) {
    farm.step(t)
    for (const a of farm.actors.values()) {
      assert.ok(walkable(L, a.x, a.y), `${a.sid} at ${a.x}, ${a.y}`)
      if (a.plan === 'walk') walked = true
    }
  }
  assert.ok(walked)
  assert.notDeepEqual([...farm.actors.values()].map(a => a.x), start)
})

test('one dragged out of the way stays where he is held, on the ground, and goes on from where he is put', () => {
  const L = desktopLayout(1000, 84)
  const farm = new Farm(L, seeded(4))
  farm.update([agent('a'), agent('b', 'ask')], 0)
  farm.hold('a', 600, 10, 2000)
  // Off the top of the strip: he stays on its ground.
  assert.deepEqual([farm.actors.get('a').x, farm.actors.get('a').y], [600, L.ground.top])
  for (let t = 2000; t <= 60_000; t += 100) farm.step(t)
  assert.deepEqual([farm.actors.get('a').x, farm.actors.get('a').y], [600, L.ground.top])
  farm.hold('a', 5000, L.ground.bottom, 60_000)
  farm.drop('a', 60_000)
  assert.equal(farm.actors.get('a').x, L.w - 14)
  assert.equal(farm.actors.get('a').held, false)
  let walked = false
  for (let t = 60_000; t <= 120_000 && !walked; t += 100) {
    farm.step(t)
    walked = farm.actors.get('a').plan === 'walk'
  }
  assert.ok(walked)
  // One asking you something is put down and stays put, still asking.
  farm.hold('b', 300, L.ground.bottom, 0)
  farm.drop('b', 0)
  farm.step(130_000)
  assert.equal(farm.actors.get('b').x, 300)
  assert.equal(farm.actors.get('b').plan, 'busy')
})
