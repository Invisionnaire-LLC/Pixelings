import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { agentOfBot, botState, GrokBotSessions, shown, sliceName, summarize } from './grokbot.js'

const NOW = 1_800_000_000_000
const ID = '4ef96ce8-d1bf-4442-8ed7-e5053fada539'
const MIN = 60_000
const ACCOUNT = 'auth0|64e12452dcab8eea6ec1c361'
const row = over => ({ id: ID, name: 'Boss', avatarShape: 'blob', avatarColor: 'black', createdAt: 5, lastActivityAt: NOW - 5 * MIN, awaitingUserResponse: null, ...over })
const msg = (role, at, over) => ({ kind: 'message', role, timestampMs: at, ...over })
// A chat that is all your own: you wrote at `input`, it answered at `reply`.
const mine = (input, reply, streaming = false) => ({ input, reply, streaming, yourInput: input, yourReply: reply, yourStreaming: streaming, yours: Math.max(input, reply) })

// Grok Bot's file name for a slice: its name in lowercase base32, no padding.
function blobName(name) {
  const A = 'abcdefghijklmnopqrstuvwxyz234567'
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of Buffer.from(name)) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += A[(value >> bits) & 31]
    }
  }
  if (bits > 0) out += A[(value << (5 - bits)) & 31]
  return `${out}.blob`
}

test("a slice file's name is its slice's name in base32", () => {
  // A real file name from Grok Bot's folder.
  assert.equal(sliceName('onqw4zbomnwgszlooqxhg3djmnss45ljfvwgc6lpov2a.blob'), 'sand.client.slice.ui-layout')
  assert.equal(sliceName(blobName(`sand.client.slice.account.${encodeURIComponent(ACCOUNT)}.roster.last-roster`)), `sand.client.slice.account.auth0%7C64e12452dcab8eea6ec1c361.roster.last-roster`)
  assert.equal(sliceName('.migrated-from-local-storage'), null)
})

test("a chat's messages to the bot and its replies, and when you last talked with it", () => {
  const s = summarize([
    msg('user', 10, { requestId: 'r1' }),
    { kind: 'send-message', timestampMs: 20, requestId: 'r1', message: { type: 'text', content: 'hi' } },
    msg('user', 30, { fromAgent: { id: 'other' }, requestId: 'r2' }),
    msg('assistant', 35, { toAgent: { id: 'other' }, requestId: 'r2' }),
    { kind: 'send-message', timestampMs: 40, requestId: 'r3' },
    { kind: 'event', timestampMs: 99 },
  ])
  // Its answer to you at 20 is the last of yours: another bot's message, its
  // answer to that, and what it sent on its own (an automation) are not.
  assert.deepEqual(s, { input: 30, reply: 40, streaming: false, yours: 20, yourInput: 10, yourReply: 20, yourStreaming: false })
  assert.equal(summarize([msg('assistant', 1, { isStreaming: true })]).streaming, true)
})

test('a message with no reply yet is working; an old one is not', () => {
  assert.deepEqual(botState(row(), mine(NOW - 2 * MIN, NOW - 3 * MIN), NOW, true), { kind: 'working', since: NOW - 2 * MIN })
  assert.equal(botState(row({ lastActivityAt: NOW - 40 * MIN }), mine(NOW - 40 * MIN, NOW - 41 * MIN), NOW, true).kind, 'idle')
})

test('activity in the last seconds is working, a reply coming in too', () => {
  // Your exchange: its answer a few seconds ago may have more to come.
  assert.equal(botState(row(), mine(NOW - 9 * MIN, NOW - 5000), NOW, true).kind, 'working')
  assert.equal(botState(row(), mine(NOW - 9 * MIN, NOW - MIN), NOW, true).kind, 'idle')
  assert.equal(botState(row(), mine(NOW - 9 * MIN, NOW - MIN, true), NOW, true).kind, 'working')
  // With its other work counting, any activity in the last seconds.
  const other = { input: NOW - 9 * MIN, reply: NOW - 9 * MIN, streaming: false, yours: 0, yourInput: 0, yourReply: 0, yourStreaming: false }
  assert.equal(botState(row({ lastActivityAt: NOW - 5000 }), other, NOW, true, true).kind, 'working')
  assert.equal(botState(row({ lastActivityAt: NOW - 5000 }), other, NOW, true).kind, 'idle')
})

test('with the app closed nothing reads as working', () => {
  const chat = { input: NOW - MIN, reply: NOW - 2 * MIN, streaming: false, yours: NOW - MIN }
  assert.equal(botState(row({ lastActivityAt: NOW - 1000 }), chat, NOW, false).kind, 'idle')
})

test('a bot that has answered is done, not waiting: idle since you last talked with it', () => {
  const chat = { input: NOW - 11 * MIN, reply: NOW - 10 * MIN, streaming: false, yours: NOW - 10 * MIN }
  assert.deepEqual(botState(row({ lastActivityAt: NOW - 10 * MIN }), chat, NOW, true), { kind: 'idle', since: NOW - 10 * MIN, idleSince: NOW - 10 * MIN })
})

test('a bot waiting on you is asking, permission or a question by its reason', () => {
  const chat = summarize([])
  assert.deepEqual(botState(row({ awaitingUserResponse: { tabId: 't', reason: 'approval_required', since: NOW - MIN } }), chat, NOW, false), {
    kind: 'ask',
    ask: 'permission',
    since: NOW - MIN,
  })
  assert.equal(botState(row({ awaitingUserResponse: { tabId: 't', reason: 'question', since: 0 } }), chat, NOW, true).ask, 'question')
})

test('every bot is read but group chats and bots hidden in the app', () => {
  assert.equal(shown(row()), true)
  assert.equal(shown(row({ lastActivityAt: 0 })), true, 'how long idle is for the deck to decide')
  assert.equal(shown(row({ isGroup: true })), false)
  assert.equal(shown(row({ isRemovedFromSidebar: true })), false)
  assert.equal(shown(row({ isHiddenFromSidebar: true })), false)
})

test('a bot that only worked for another bot or on its own is idle since you last talked with it', () => {
  const chat = { input: NOW - 3 * MIN, reply: NOW - 2 * MIN, streaming: false, yours: NOW - 6 * 24 * 60 * MIN }
  assert.equal(botState(row({ lastActivityAt: NOW - 2 * MIN }), chat, NOW, true).idleSince, NOW - 6 * 24 * 60 * MIN)
  assert.equal(botState(row(), { ...chat, yours: 0 }, NOW, true).idleSince, 0, 'never talked with: idle forever')
})

test("a bot is its own name, shape and colour; Grok Bot's default ones when it has none", () => {
  const a = agentOfBot(row(), { kind: 'idle', since: 1 })
  assert.equal(a.sid, `grokbot-${ID}`)
  assert.equal(a.tool, 'grokbot')
  assert.equal(a.app, 'grok-bot')
  assert.equal(a.grokBot, ID)
  assert.equal(a.title, 'Boss')
  assert.deepEqual([a.shape, a.color], ['blob', 'black'])
  // As the Grok Bot app shows FinancialBoy, who never picked either.
  const b = agentOfBot(row({ id: '28eafa4d-7e7a-430b-904f-d5b9f5822510', avatarShape: '', avatarColor: '' }), { kind: 'idle' })
  assert.deepEqual([b.shape, b.color], ['tablet', 'green'])
})

function grokDir({ pid = 4242, rows = [row()], entries = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grokbot-'))
  const store = path.join(dir, 'sand-client-persistence')
  fs.mkdirSync(store)
  const put = (name, value) => fs.writeFileSync(path.join(store, blobName(name)), JSON.stringify({ schemaVersion: 1, value }))
  const acct = `sand.client.slice.account.${encodeURIComponent(ACCOUNT)}.`
  put('sand.client.slice.client-meta.account-slot', ACCOUNT)
  put(`${acct}roster.last-roster`, { rows })
  put(`${acct}transcript.replicas.${ID}`, { entries })
  fs.writeFileSync(path.join(dir, 'desktop-status.json'), JSON.stringify({ version: 1, pid, signedIn: true }))
  return dir
}

test("the app's folder: the signed-in account's bots, read from the list and their chats", () => {
  const dir = grokDir({ entries: [msg('user', NOW - MIN)] })
  const g = new GrokBotSessions({ dir, isAlive: pid => pid === 4242 })
  const [a] = g.read(NOW)
  assert.equal(a.title, 'Boss')
  assert.equal(a.kind, 'working')
  assert.equal(a.since, NOW - MIN)
})

test("the app not running, or no Grok Bot at all, is no working bot, and no error", () => {
  const dir = grokDir({ entries: [msg('user', NOW - MIN)] })
  assert.equal(new GrokBotSessions({ dir, isAlive: () => false }).read(NOW)[0].kind, 'idle')
  assert.deepEqual(new GrokBotSessions({ dir: path.join(dir, 'nowhere') }).read(NOW), [])
})

test("a bot's work for another bot or on its own counts only when asked to", () => {
  // Another bot's message at -1 min, not yet answered; you talked with it a day ago.
  const chat = summarize([
    msg('user', NOW - 24 * 60 * MIN, { requestId: 'mine' }),
    { kind: 'send-message', timestampMs: NOW - 24 * 60 * MIN + 5000, requestId: 'mine' },
    msg('user', NOW - MIN, { fromAgent: { id: 'boss' }, requestId: 'boss' }),
  ])
  const busy = row({ lastActivityAt: NOW - MIN })
  assert.equal(botState(busy, chat, NOW, true).kind, 'idle', 'off: not working for you')
  assert.equal(botState(busy, chat, NOW, true).idleSince, NOW - 24 * 60 * MIN + 5000, 'off: idle since your last exchange')
  assert.equal(botState(busy, chat, NOW, true, true).kind, 'working', 'on: working for the other bot')
  const done = summarize([...[{ kind: 'send-message', timestampMs: NOW - 2 * MIN, requestId: 'boss' }]])
  assert.equal(botState(row({ lastActivityAt: NOW - 2 * MIN }), done, NOW, true, true).idleSince, NOW - 2 * MIN, 'on: idle since its last activity')
  // Working on what you asked shows either way.
  const yours = summarize([msg('user', NOW - MIN, { requestId: 'r' })])
  assert.equal(botState(busy, yours, NOW, true).kind, 'working')
})
