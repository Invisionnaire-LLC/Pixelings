import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { agentOfThread, applyLine, CodexSessions, running, threadNames } from './codex.js'

const T = '2026-10-24T10:00:00.000Z'
const line = (type, payload) => JSON.stringify({ timestamp: T, type, payload })
const ev = (payload) => line('event_msg', payload)
const ID = '01a16b54-790d-7e43-b804-a7ec7aa1cab7'

test('a turn starting is working, finishing is your move, stopping is idle', () => {
  let s = applyLine({}, ev({ type: 'task_started', started_at: 100, model_context_window: 400_000 }))
  assert.equal(s.kind, 'working')
  assert.equal(s.since, 100_000)
  assert.equal(s.window, 400_000)
  s = applyLine(s, ev({ type: 'task_complete', completed_at: 160 }))
  assert.equal(s.kind, 'done')
  assert.equal(s.since, 160_000)
  s = applyLine(s, ev({ type: 'turn_aborted', completed_at: 170 }))
  assert.equal(s.kind, 'idle')
})

test('the context comes from the last token count, scaled like Claude Code', () => {
  const s = applyLine({}, ev({ type: 'token_count', info: { last_token_usage: { input_tokens: 160_000 }, model_context_window: 400_000 } }))
  assert.equal(s.pct, 50)
})

test('the folder comes from the turn context or the thread settings', () => {
  assert.equal(applyLine({}, line('turn_context', { cwd: '/x/api' })).cwd, '/x/api')
  assert.equal(applyLine({}, ev({ type: 'thread_settings_applied', thread_settings: { cwd: '/x/web' } })).cwd, '/x/web')
  const meta = applyLine({}, line('session_meta', { cwd: '/x/one', originator: 'Codex Desktop' }))
  assert.equal(meta.originator, 'Codex Desktop')
})

test('an approval request is asking permission; a question to you is a question', () => {
  assert.equal(applyLine({}, ev({ type: 'exec_approval_request' })).ask, 'permission')
  assert.equal(applyLine({}, ev({ type: 'request_user_input' })).ask, 'question')
  const after = applyLine(applyLine({}, ev({ type: 'exec_approval_request' })), ev({ type: 'task_started', started_at: 1 }))
  assert.equal(after.ask, undefined)
})

test('lines that say nothing about the state, or are broken, change nothing', () => {
  const s = { kind: 'working' }
  assert.equal(applyLine(s, line('response_item', { type: 'message' })), s)
  assert.equal(applyLine(s, '{"type":"event_msg","payload":{"type":"task_complete"'), s)
})

test('thread names: the latest per thread', () => {
  const names = threadNames(
    [JSON.stringify({ id: 'a', thread_name: 'One' }), JSON.stringify({ id: 'a', thread_name: 'Two' }), '{"id":'].join('\n'),
  )
  assert.equal(names.get('a'), 'Two')
})

test('a thread as an agent: the app or the command line, named, your move fades', () => {
  const now = 2_000_000_000_000
  const a = agentOfThread(ID, { kind: 'done', since: now - 1000, cwd: '/x/api', originator: 'Codex Desktop' }, 'Fix auth', now, 1, now)
  assert.equal(a.tool, 'codex')
  assert.equal(a.app, 'codex-app')
  assert.equal(a.title, 'Fix auth')
  assert.equal(a.kind, 'done')
  assert.equal(agentOfThread(ID, { kind: 'done', since: now - 31 * 60_000 }, '', now, 1, now).kind, 'idle')
  const cli = agentOfThread(ID, { cwd: '/x/api', originator: 'codex_cli_rs' }, '', now, 1, now)
  assert.equal(cli.app, 'codex-cli')
  assert.equal(cli.title, 'api')
})

test('running: working or asking, or a turn in the last two hours', () => {
  const now = 2_000_000_000_000
  assert.equal(running({ kind: 'working', since: 0 }, now), true)
  assert.equal(running({ kind: 'done', since: now - 60_000 }, now), true)
  assert.equal(running({ kind: 'done', since: now - 3 * 3600_000 }, now), false)
  assert.equal(running({}, now), false, 'no turn seen')
})

test('reading a sessions folder: recent threads only, and only what was added', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'))
  const day = path.join(dir, 'sessions', '2026', '10', '24')
  fs.mkdirSync(day, { recursive: true })
  const file = path.join(day, `rollout-2026-10-24T10-00-00-${ID}.jsonl`)
  fs.writeFileSync(file, [line('session_meta', { cwd: '/x/api', originator: 'Codex Desktop' }), ev({ type: 'task_started', started_at: 1 }), ''].join('\n'))
  const old = path.join(day, 'rollout-2026-10-24T09-00-00-01a16b54-0000-7e43-b804-a7ec7aa1cab7.jsonl')
  fs.writeFileSync(old, `${ev({ type: 'task_started', started_at: 1 })}\n`)
  fs.utimesSync(old, new Date(Date.now() - 5 * 3600_000), new Date(Date.now() - 5 * 3600_000))
  // Touched by the app just now, but its last turn was days ago.
  const quiet = path.join(day, 'rollout-2026-10-24T08-00-00-01a16b54-1111-7e43-b804-a7ec7aa1cab7.jsonl')
  fs.writeFileSync(quiet, `${ev({ type: 'task_complete', completed_at: Math.floor(Date.now() / 1000) - 5 * 86400 })}\n`)
  fs.writeFileSync(path.join(dir, 'session_index.jsonl'), `${JSON.stringify({ id: ID, thread_name: 'Fix auth' })}\n`)

  const codex = new CodexSessions({ dir })
  let agents = codex.read()
  assert.equal(agents.length, 1, 'neither the old thread nor the touched quiet one is running')
  assert.equal(agents[0].kind, 'working')
  assert.equal(agents[0].title, 'Fix auth')
  assert.equal(agents[0].folder, 'api')

  // A turn finishes, the line written in two pieces.
  const done = ev({ type: 'task_complete', completed_at: Math.floor(Date.now() / 1000) })
  fs.appendFileSync(file, done.slice(0, 20))
  assert.equal(codex.read()[0].kind, 'working', 'half a line changes nothing')
  fs.appendFileSync(file, `${done.slice(20)}\n`)
  assert.equal(codex.read()[0].kind, 'done')
  fs.rmSync(dir, { recursive: true })
})

test('a Codex thread is idle half an hour after its turn, and read as long as asked', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  const a = agentOfThread(ID, { kind: 'done', since: now - 40 * 60_000 }, '', now, 1, now)
  assert.equal(a.idleSince, now - 10 * 60_000)
  assert.equal(running({ kind: 'done', since: now - 3 * 60 * 60_000 }, now), false)
  assert.equal(running({ kind: 'done', since: now - 3 * 60 * 60_000 }, now, 4 * 60 * 60_000), true)
})

test('a thread one agent made for another, or a subagent, is marked as such', () => {
  const meta = payload => applyLine({}, line('session_meta', { cwd: '/x', ...payload }))
  assert.equal(meta({ thread_source: 'agent_created_thread' }).byAgent, true)
  assert.equal(meta({ thread_source: 'user', source: 'vscode' }).byAgent, false)
  assert.equal(meta({ thread_source: 'voice_chat' }).byAgent, false)
  assert.equal(meta({ source: { subagent: 'review' } }).byAgent, true)
  const now = Date.parse('2026-10-24T12:00:00Z')
  assert.equal(agentOfThread(ID, { kind: 'working', byAgent: true }, '', now, 1, now).byAgent, true)
})
