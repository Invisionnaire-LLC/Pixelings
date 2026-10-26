import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { T3Threads } from './t3.js'

const ENV = 'a9880d54-43db-4de8-b34b-df47f01b3df7'
const THREAD = '2f5d5a92-5afc-4104-a8d0-bd895422e99e'
const SID = '9ff3fe69-455f-4146-923d-e022fbc760b7'
const OTHER = 'afa176c2-d84c-4746-9784-aa17a6219756'

// A T3 home with one thread's provider log, as T3 Code writes it.
function t3Home(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't3-'))
  fs.writeFileSync(path.join(dir, 'environment-id'), `${ENV}\n`)
  fs.mkdirSync(path.join(dir, 'logs', 'provider'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'logs', 'provider', `events.${THREAD}.log`), lines.join('\n'))
  return dir
}
const open = sid =>
  `[2026-10-26T01:26:50.484Z] NTIVE: {"provider":"claudeAgent","event":{"payload":{"type":"query.open","options":{"sessionId":"${sid}","cwd":"/x"}}}}`
const event = sid => `[2026-10-26T01:27:00.000Z] NTIVE: {"provider":"claudeAgent","event":{"payload":{"type":"system","session_id":"${sid}"}}}`

test("a session's thread is the log that names it", () => {
  const t3 = new T3Threads(t3Home([open(SID), event(SID)]))
  assert.deepEqual(t3.threadFor(SID, 0), { env: ENV, thread: THREAD })
  assert.equal(t3.threadFor(OTHER, 0), null, 'not run by T3 Code')
})

test("a long log is found by its end when its start is gone", () => {
  const filler = 'x'.repeat(200 * 1024)
  const t3 = new T3Threads(t3Home([filler, event(SID)]))
  assert.deepEqual(t3.threadFor(SID, 0), { env: ENV, thread: THREAD })
})

test('a session not found yet is looked for again, but not every time', () => {
  const dir = t3Home([open(OTHER)])
  const t3 = new T3Threads(dir)
  assert.equal(t3.threadFor(SID, 0), null)
  fs.writeFileSync(path.join(dir, 'logs', 'provider', `events.${THREAD}.log`), open(SID))
  assert.equal(t3.threadFor(SID, 1000), null, 'too soon')
  assert.deepEqual(t3.threadFor(SID, 6000), { env: ENV, thread: THREAD })
})

test('no T3 Code, a broken environment id, or an odd session id: no thread', () => {
  assert.equal(new T3Threads(path.join(os.tmpdir(), 'no-t3-here')).threadFor(SID, 0), null)
  const dir = t3Home([open(SID)])
  fs.writeFileSync(path.join(dir, 'environment-id'), '../evil')
  assert.equal(new T3Threads(dir).threadFor(SID, 0), null)
  assert.equal(new T3Threads(t3Home([open('"')])).threadFor('"', 0), null)
})
