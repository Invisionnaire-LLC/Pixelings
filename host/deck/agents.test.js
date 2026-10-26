import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { agentOf, layout, readAgents, YOUR_MOVE_MS } from './agents.js'

const NOW = 1_800_000_000_000
const session = (over = {}) => ({
  pid: 1,
  sessionId: 'sid-1',
  cwd: '/x/Pixelings',
  name: 'Stream Deck',
  entrypoint: 'claude-desktop',
  hostSessionId: 'local_abc',
  status: 'idle',
  statusUpdatedAt: NOW - 60_000,
  ...over,
})
const line = (msg, at = NOW - 1000) => ({ msg: { v: 1, ...msg }, at })

test('a busy session with no mod line is working', () => {
  assert.equal(agentOf(session({ status: 'busy' }), null, NOW).kind, 'working')
})

test('an idle session with no mod line is idle and named by its title', () => {
  const a = agentOf(session(), null, NOW)
  assert.equal(a.kind, 'idle')
  assert.equal(a.title, 'Stream Deck')
  assert.equal(a.folder, 'Pixelings')
})

test('a newer mod line asking permission makes it an ask', () => {
  const a = agentOf(session(), line({ mode: 'waiting', ask: 'permission', pct: 42 }), NOW)
  assert.equal(a.kind, 'ask')
  assert.equal(a.ask, 'permission')
  assert.equal(a.pct, 42)
})

test('a finished turn is your move for a while, then idle', () => {
  assert.equal(agentOf(session(), line({ mode: 'waiting', sinceAt: NOW - 5000 }), NOW).kind, 'done')
  assert.equal(agentOf(session(), line({ mode: 'waiting', sinceAt: NOW - YOUR_MOVE_MS - 1 }), NOW).kind, 'idle')
})

test('compacting comes from the mod line', () => {
  assert.equal(agentOf(session({ status: 'busy' }), line({ mode: 'compacting' }), NOW).kind, 'compacting')
})

test('a status newer than the mod line wins (a turn stopped with Esc)', () => {
  const s = session({ status: 'idle', statusUpdatedAt: NOW })
  assert.equal(agentOf(s, line({ mode: 'working' }, NOW - 60_000), NOW).kind, 'idle')
})

test('a session with no title is named by its folder', () => {
  assert.equal(agentOf(session({ name: undefined }), null, NOW).title, 'Pixelings')
})

test('each agent sits on the key of his seat, whatever he is doing', () => {
  const agents = [
    { sid: 'a', kind: 'idle', seat: 0 },
    { sid: 'b', kind: 'ask', seat: 4 },
    { sid: 'c', kind: 'working', seat: 2 },
  ]
  const { slots } = layout(agents, 15)
  assert.equal(slots.length, 15)
  assert.equal(slots[0].sid, 'a')
  assert.equal(slots[2].sid, 'c')
  assert.equal(slots[4].sid, 'b')
  assert.equal(slots.filter(Boolean).length, 3)
})

test('an agent with no seat takes the one after the last', () => {
  const { slots } = layout([{ sid: 'a', seat: 3 }, { sid: 'b' }], 15)
  assert.equal(slots[4].sid, 'b')
})

test('all 15 keys hold agents until a 16th comes', () => {
  const agents = Array.from({ length: 15 }, (_, i) => ({ sid: String(i), kind: 'idle', seat: i }))
  const { slots } = layout(agents, 15)
  assert.equal(slots[14].sid, '14')
})

test('past the last key, the last key counts the rest and pages to them', () => {
  const agents = Array.from({ length: 20 }, (_, i) => ({ sid: String(i), kind: i === 17 ? 'ask' : 'idle', seat: i }))
  const first = layout(agents, 15, 0)
  assert.equal(first.slots.length, 15)
  assert.equal(first.slots[0].sid, '0')
  assert.equal(first.slots[13].sid, '13')
  assert.deepEqual(first.slots[14], { more: 6, asking: 1, page: 0, pages: 2 })

  const second = layout(agents, 15, 1)
  assert.equal(second.slots[0].sid, '14')
  assert.equal(second.slots[5].sid, '19')
  assert.equal(second.slots[14].more, 14)
  assert.equal(second.slots[14].asking, 0)
  assert.equal(layout(agents, 15, 2).page, 0, 'pages wrap around')
})

test('readAgents joins live sessions with their mod lines and skips dead ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'))
  const sessions = path.join(dir, 'sessions')
  const lines = path.join(dir, 'lines')
  fs.mkdirSync(sessions)
  fs.mkdirSync(lines)
  const now = Date.now()
  fs.writeFileSync(
    path.join(sessions, `${process.pid}.json`),
    JSON.stringify(session({ pid: process.pid, sessionId: 'live-1', statusUpdatedAt: now - 60_000 })),
  )
  fs.writeFileSync(path.join(sessions, '999999.json'), JSON.stringify(session({ pid: 999999, sessionId: 'dead-1' })))
  fs.writeFileSync(path.join(sessions, 'junk.json'), 'not json')
  fs.writeFileSync(path.join(lines, 'live-1.json'), JSON.stringify({ v: 1, mode: 'waiting', ask: 'question', pct: 7 }))

  const agents = readAgents(now, sessions, lines)
  assert.equal(agents.length, 1)
  assert.equal(agents[0].sid, 'live-1')
  assert.equal(agents[0].kind, 'ask')
  assert.equal(agents[0].ask, 'question')
  fs.rmSync(dir, { recursive: true })
})

test('readAgents takes the newer of the mod line and the hook line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'))
  const sessions = path.join(dir, 'sessions')
  const lines = path.join(dir, 'lines')
  fs.mkdirSync(sessions)
  fs.mkdirSync(lines)
  const now = Date.now()
  fs.writeFileSync(
    path.join(sessions, `${process.pid}.json`),
    JSON.stringify(session({ pid: process.pid, sessionId: 'live-1', statusUpdatedAt: now - 600_000 })),
  )
  const mod = path.join(lines, 'live-1.json')
  const hooks = path.join(lines, 'live-1.hooks.json')
  fs.writeFileSync(mod, JSON.stringify({ v: 1, mode: 'working' }))
  fs.writeFileSync(hooks, JSON.stringify({ v: 1, src: 'hooks', mode: 'waiting', ask: 'permission' }))
  fs.utimesSync(mod, new Date(now - 60_000), new Date(now - 60_000))
  assert.equal(readAgents(now, sessions, lines)[0].kind, 'ask', 'hooks newer')

  fs.utimesSync(hooks, new Date(now - 120_000), new Date(now - 120_000))
  assert.equal(readAgents(now, sessions, lines)[0].kind, 'working', 'mod newer')

  fs.rmSync(mod)
  assert.equal(readAgents(now, sessions, lines)[0].kind, 'ask', 'hooks alone, without the mod')
  fs.rmSync(dir, { recursive: true })
})

test('a session T3 Code runs is a T3 Code thread; other SDK hosts stay as they are', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'))
  const sessions = path.join(dir, 'sessions')
  fs.mkdirSync(sessions)
  const write = sessionId =>
    fs.writeFileSync(
      path.join(sessions, `${process.pid}.json`),
      JSON.stringify(session({ pid: process.pid, sessionId, entrypoint: 'sdk-cli', hostSessionId: undefined })),
    )
  const t3 = { threadFor: sid => (sid === 't3-1' ? { env: 'e', thread: 't' } : null) }
  write('t3-1')
  const a = readAgents(Date.now(), sessions, dir, t3)[0]
  assert.equal(a.app, 't3-code')
  assert.equal(a.t3Env, 'e')
  assert.equal(a.t3Thread, 't')
  write('other-1')
  assert.equal(readAgents(Date.now(), sessions, dir, t3)[0].app, 'sdk-cli')
  fs.rmSync(dir, { recursive: true })
})

test('a turn waiting on you turns idle only after your move, and says when', () => {
  const a = agentOf(session(), line({ mode: 'waiting', sinceAt: NOW - YOUR_MOVE_MS - 60_000 }), NOW)
  assert.equal(a.kind, 'idle')
  assert.equal(a.idleSince, NOW - 60_000)
  assert.equal(agentOf(session(), line({ mode: 'waiting', sinceAt: NOW - 5000 }), NOW).idleSince, undefined)
})

test('a session a script, the SDK or another agent started is marked as such', () => {
  assert.equal(agentOf(session({ kind: 'interactive' }), null, NOW).byAgent, false)
  for (const kind of ['bg', 'sdk', 'subagent', 'worker']) assert.equal(agentOf(session({ kind }), null, NOW).byAgent, true, kind)
  assert.equal(agentOf(session(), null, NOW).byAgent, false, 'no kind: yours')
})
