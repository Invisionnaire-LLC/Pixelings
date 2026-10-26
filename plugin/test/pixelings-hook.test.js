import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { contextPct, handle, nextLine, windowFor } from '../hooks/pixelings-hook.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(here, '..', 'hooks', 'pixelings-hook.js')
const NOW = 1_800_000_000_000
const ev = (name, over = {}) => ({ hook_event_name: name, session_id: 'sid-1', cwd: '/x/my-repo', ...over })
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hook-'))

test('a prompt starts work, a stop is your move', () => {
  assert.equal(nextLine(null, ev('UserPromptSubmit'), NOW).mode, 'working')
  assert.equal(nextLine(null, ev('Stop'), NOW).mode, 'waiting')
  assert.equal(nextLine(null, ev('Stop'), NOW).ask, undefined)
})

test('a permission request asks, and a tool finishing ends the ask', () => {
  const asking = nextLine(null, ev('PermissionRequest', { tool_name: 'Bash' }), NOW)
  assert.equal(asking.mode, 'waiting')
  assert.equal(asking.ask, 'permission')
  const after = nextLine(asking, ev('PostToolUse'), NOW + 5000)
  assert.equal(after.mode, 'working')
  assert.equal(after.ask, undefined)
})

test('AskUserQuestion is a question', () => {
  const line = nextLine(null, ev('PreToolUse', { tool_name: 'AskUserQuestion' }), NOW)
  assert.equal(line.mode, 'waiting')
  assert.equal(line.ask, 'question')
  assert.equal(nextLine(null, ev('PreToolUse', { tool_name: 'Read' }), NOW).mode, 'working')
})

test("a turn that ends on the Claude app's next-step question ends as a question", () => {
  const WRAP_UP = 'mcp__ccd_turn__wrap_up'
  let line = nextLine(null, ev('UserPromptSubmit'), NOW)
  line = nextLine(line, ev('PreToolUse', { tool_name: WRAP_UP, tool_input: { recap: 'Done.', ask: 'Rebuild it?' } }), NOW + 1000)
  assert.equal(line.mode, 'working', 'still working while it says its last words')
  assert.equal(line.askAtEnd, 'question')
  line = nextLine(line, ev('PostToolUse', { tool_name: WRAP_UP }), NOW + 2000)
  assert.equal(line.askAtEnd, 'question', 'kept through the rest of the turn')
  line = nextLine(line, ev('Stop'), NOW + 3000)
  assert.deepEqual([line.mode, line.ask, line.askAtEnd], ['waiting', 'question', undefined])
  // Answering it starts a new turn, and the question is gone.
  line = nextLine(line, ev('UserPromptSubmit'), NOW + 9000)
  assert.deepEqual([line.mode, line.ask, line.askAtEnd], ['working', undefined, undefined])
})

test('a next-step box with no question, or a turn that fails, is just your move', () => {
  const WRAP_UP = 'mcp__ccd_turn__wrap_up'
  const recapOnly = nextLine(null, ev('PreToolUse', { tool_name: WRAP_UP, tool_input: { recap: 'Done.' } }), NOW)
  assert.equal(recapOnly.askAtEnd, undefined)
  assert.equal(nextLine(recapOnly, ev('Stop'), NOW + 1000).ask, undefined)
  const blank = nextLine(null, ev('PreToolUse', { tool_name: WRAP_UP, tool_input: { ask: '  ' } }), NOW)
  assert.equal(blank.askAtEnd, undefined)
  const asked = nextLine(null, ev('PreToolUse', { tool_name: WRAP_UP, tool_input: { ask: 'Ship it?' } }), NOW)
  assert.equal(nextLine(asked, ev('StopFailure'), NOW + 1000).ask, undefined)
  // Another tool of the same name from somewhere else is not the app's.
  assert.equal(nextLine(null, ev('PreToolUse', { tool_name: 'wrap_up', tool_input: { ask: 'x?' } }), NOW).askAtEnd, undefined)
})

test('notifications: a permission prompt asks, an idle reminder changes nothing', () => {
  assert.equal(nextLine(null, ev('Notification', { notification_type: 'permission_prompt' }), NOW).ask, 'permission')
  assert.equal(nextLine(null, ev('Notification', { notification_type: 'elicitation_dialog' }), NOW).ask, 'question')
  assert.equal(nextLine(null, ev('Notification', { notification_type: 'idle_prompt' }), NOW), null)
})

test('compaction', () => {
  assert.equal(nextLine(null, ev('PreCompact'), NOW).mode, 'compacting')
  assert.equal(nextLine(null, ev('PostCompact', { trigger: 'auto' }), NOW).mode, 'working')
  assert.equal(nextLine(null, ev('PostCompact', { trigger: 'manual' }), NOW).mode, 'waiting')
  assert.equal(nextLine(null, ev('SessionStart', { source: 'compact' }), NOW).mode, 'working')
  assert.equal(nextLine(null, ev('SessionStart', { source: 'startup' }), NOW).mode, 'idle')
})

test('a subagent starting keeps the main thread asking', () => {
  const asking = nextLine(null, ev('PermissionRequest'), NOW)
  assert.equal(nextLine(asking, ev('SubagentStart'), NOW + 1).ask, 'permission')
})

test('since stays put while the mode does, and moves when it changes', () => {
  const a = nextLine(null, ev('UserPromptSubmit'), NOW)
  const b = nextLine(a, ev('PostToolUse'), NOW + 9000)
  assert.equal(b.sinceAt, NOW)
  const c = nextLine(b, ev('Stop'), NOW + 20000)
  assert.equal(c.sinceAt, NOW + 20000)
})

test('the context figure is kept until a new one comes', () => {
  const a = nextLine(null, ev('Stop'), NOW, 42)
  assert.equal(nextLine(a, ev('PermissionRequest'), NOW + 1).pct, 42)
  assert.equal(nextLine(a, ev('Stop'), NOW + 2, 50).pct, 50)
})

test('the line names the session and its folder', () => {
  const line = nextLine(null, ev('Stop'), NOW)
  assert.equal(line.v, 1)
  assert.equal(line.src, 'hooks')
  assert.equal(line.sid, 'sid-1')
  assert.equal(line.name, 'my-repo')
})

test('SessionEnd ends it, unknown events change nothing', () => {
  assert.equal(nextLine(null, ev('SessionEnd'), NOW), 'end')
  assert.equal(nextLine(null, ev('SomethingNew'), NOW), null)
})

test('the context % comes from the last usage, scaled so 80% of the window is full', () => {
  const u = (input, model = 'claude-sonnet-4-5') =>
    JSON.stringify({ type: 'assistant', message: { model, usage: { input_tokens: input, cache_read_input_tokens: 0 } } })
  assert.equal(contextPct([u(1000), u(80_000)].join('\n')), 50)
  assert.equal(contextPct(u(400_000)), 50, 'past 200k the window is 1M')
  assert.equal(contextPct(u(80_000, 'claude-sonnet-4-5[1m]')), 10)
  assert.equal(contextPct(u(80_000, 'claude-haiku-5-5')), 10, 'Claude 5 has 1M')
  assert.equal(contextPct(`${u(80_000)}\n{"cut": `), 50, 'a cut last line is skipped')
  assert.equal(contextPct('{"type":"user"}'), undefined)
})

test('context windows by model', () => {
  assert.equal(windowFor('claude-opus-5-5'), 1_000_000)
  assert.equal(windowFor('claude-fable-5-1'), 1_000_000)
  assert.equal(windowFor('claude-sonnet-4-5'), 200_000)
  assert.equal(windowFor('claude-3-5-haiku-20241022'), 200_000)
  assert.equal(windowFor('claude-sonnet-4-5[1m]'), 1_000_000)
  assert.equal(windowFor('something-else', 250_000), 1_000_000)
})

test('handle writes one file per session, and removes it at the end', () => {
  const dir = tmp()
  handle(ev('UserPromptSubmit'), NOW, dir)
  handle(ev('PermissionRequest', { session_id: 'sid-2' }), NOW, dir)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sid-1.hooks.json'), 'utf8')).mode, 'working')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sid-2.hooks.json'), 'utf8')).ask, 'permission')
  handle(ev('SessionEnd'), NOW, dir)
  assert.equal(fs.existsSync(path.join(dir, 'sid-1.hooks.json')), false)
})

test('handle ignores a session id that is not a plain id', () => {
  const dir = tmp()
  handle(ev('Stop', { session_id: '../evil' }), NOW, dir)
  assert.deepEqual(fs.readdirSync(dir), [])
})

test('handle reads the context from the transcript', () => {
  const dir = tmp()
  const transcript = path.join(dir, 't.jsonl')
  fs.writeFileSync(transcript, `${JSON.stringify({ message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 80_000 } } })}\n`)
  handle(ev('Stop', { transcript_path: transcript }), NOW, dir)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sid-1.hooks.json'), 'utf8')).pct, 50)
})

test('run as a hook: reads stdin, prints nothing, exits 0, even on junk', () => {
  const dir = tmp()
  const env = { ...process.env, PIXELINGS_SESSIONS_DIR: dir }
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(ev('Stop')), env })
  assert.equal(out.toString(), '')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'sid-1.hooks.json'), 'utf8')).mode, 'waiting')
  assert.equal(execFileSync('node', [HOOK], { input: 'not json', env }).toString(), '')
})
