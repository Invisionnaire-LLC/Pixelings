// Grok Bot's bots, from what the Grok Bot app keeps on disk: no settings to
// change, nothing to install.
//
// The bots run in the cloud; the app, while it is open, keeps a copy of its
// bot list and each bot's chat in sand-client-persistence/ (one JSON file a
// "slice", its name the slice's name in base32), rewritten as they change.
// From the list: each bot's name, shape and colour, its last activity, and
// whether it waits on you (asking). From its chat: whether a message to it
// (yours, or another bot's) has had no reply yet (working), and when you
// last talked with it. A bot that has answered is done, not waiting: it
// waits on you only when it asks (as in the app), so it goes idle. What it
// does for another bot, or on its own (an automation), counts only if you
// say so (Show Bot-to-Bot Work, botWork): then it shows while it works,
// and its idle time counts from its last activity; otherwise only your own
// exchanges with it count, for working and for idle time alike. Grok Bot keeps
// what a bot is doing right now (its tool, its turn) to itself, so working
// is near enough: a message unanswered, or anything in the last BUSY_MS.
// Its context and compacting are not known. Every bot is read; an idle one
// leaves the deck after the time chosen in Hide Idle Agents After (hub.js),
// like any agent. With the app closed nothing is fresh, so no bot reads as
// working.
import fs from 'node:fs'
import path from 'node:path'

import { grokLook } from './grokbots.js'
import { grokBotDir } from './paths.js'

export const GROKBOT_DIR = grokBotDir()
// Activity this recent reads as working: a bot often sends a few messages
// in one go.
const BUSY_MS = 20_000
// A message unanswered this long no longer reads as working.
const PENDING_MS = 30 * 60 * 1000
// The folder is listed again this often.
const LIST_MS = 10_000

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

// A slice file's name ("<base32>.blob") as the slice it holds, or null.
export function sliceName(file) {
  const m = /^([a-z2-7]+)\.blob$/.exec(file)
  if (!m) return null
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of m[1]) {
    value = (value << 5) | BASE32.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((value >> bits) & 0xff)
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

// What a bot's chat says: when it last had a message (from you or another
// bot), when it last replied, whether a reply is coming in now; and the
// same for your own exchanges with it (your messages, and its answers to
// them: a reply carries the requestId of the message it answers), `yours`
// being the latest of either.
export function summarize(entries) {
  const s = { input: 0, reply: 0, streaming: false, yours: 0, yourInput: 0, yourReply: 0, yourStreaming: false }
  const asked = new Set()
  for (const e of entries ?? []) {
    const fromYou = (e?.kind === 'message' && e.role === 'user' && !e.fromAgent) || e?.kind === 'user-attachment'
    if (fromYou && e.requestId) asked.add(e.requestId)
  }
  for (const e of entries ?? []) {
    const at = Number(e?.timestampMs) || 0
    if (e?.kind === 'send-message' || (e?.kind === 'message' && e.role === 'assistant')) {
      s.reply = Math.max(s.reply, at)
      if (e.isStreaming) s.streaming = true
      if (asked.has(e.requestId)) {
        s.yourReply = Math.max(s.yourReply, at)
        if (e.isStreaming) s.yourStreaming = true
      }
    } else if ((e?.kind === 'message' && e.role === 'user') || e?.kind === 'user-attachment') {
      s.input = Math.max(s.input, at)
      if (!e.fromAgent) s.yourInput = Math.max(s.yourInput, at)
    }
  }
  s.yours = Math.max(s.yourInput, s.yourReply)
  return s
}

// A bot's { kind, ask, since, idleSince } from its row in the list and its
// chat; `botWork`: what it does for other bots or on its own counts too.
export function botState(row, chat, now, appOpen, botWork = false) {
  const activity = Number(row.lastActivityAt) || 0
  const waiting = row.awaitingUserResponse
  if (waiting) {
    const ask = /permi|approv|consent|allow|confirm/i.test(waiting.reason ?? '') ? 'permission' : 'question'
    return { kind: 'ask', ask, since: Number(waiting.since) || activity }
  }
  // Everything it does, or only your exchanges with it.
  const input = botWork ? chat.input : chat.yourInput
  const reply = botWork ? chat.reply : chat.yourReply
  const last = botWork ? Math.max(activity, chat.input, chat.reply) : chat.yours
  if (appOpen) {
    if (botWork ? chat.streaming : chat.yourStreaming) return { kind: 'working', since: input || last }
    if (input > reply && now - input < PENDING_MS) return { kind: 'working', since: input }
    if (now - last < BUSY_MS) return { kind: 'working', since: input || last }
  }
  // Done is idle, idle since its last activity that counts (none: long ago).
  return { kind: 'idle', since: Math.max(chat.reply, activity), idleSince: Math.min(now, last) }
}

// Whether a bot can have a key: never a group chat (its bots have theirs)
// or one hidden in the app.
export function shown(row) {
  return !(row.isGroup || row.isHiddenFromSidebar || row.isRemovedFromSidebar)
}

export function agentOfBot(row, state) {
  return {
    sid: `grokbot-${row.id}`,
    pid: 0,
    tool: 'grokbot',
    kind: state.kind,
    ask: state.ask,
    since: state.since,
    idleSince: state.idleSince,
    startedAt: Number(row.createdAt) || 0,
    title: row.name || row.title || 'Grok Bot',
    folder: '',
    app: 'grok-bot',
    grokBot: row.id,
    ...grokLook(row.id, row.avatarShape, row.avatarColor),
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

export class GrokBotSessions {
  constructor({ dir = GROKBOT_DIR, isAlive = alive } = {}) {
    this.dir = dir
    this.isAlive = isAlive
    this.listedAt = -Infinity
    this.slices = new Map()
    this.pid = 0
    this.files = new Map()
  }

  // The slices on disk, by name, and the app's pid.
  list(now) {
    if (now - this.listedAt < LIST_MS) return
    this.listedAt = now
    const slices = new Map()
    const store = path.join(this.dir, 'sand-client-persistence')
    let names = []
    try {
      names = fs.readdirSync(store)
    } catch {
      // No Grok Bot here.
    }
    for (const file of names) {
      const name = sliceName(file)
      if (name) slices.set(name, path.join(store, file))
    }
    this.slices = slices
    this.pid = Number(this.json(path.join(this.dir, 'desktop-status.json'))?.pid) || 0
  }

  json(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  }

  // A slice's value, parsed again only when its file changed.
  slice(name, parse = v => v) {
    const file = this.slices.get(name)
    if (!file) return null
    let mtime
    try {
      mtime = fs.statSync(file).mtimeMs
    } catch {
      return null
    }
    const had = this.files.get(file)
    if (had?.mtime === mtime) return had.value
    const value = parse(this.json(file)?.value ?? null)
    this.files.set(file, { mtime, value })
    return value
  }

  // The signed-in account's slices start with this; any account's, if the
  // app does not say whose.
  prefix() {
    const account = this.slice('sand.client.slice.client-meta.account-slot')
    if (typeof account === 'string' && account) return `sand.client.slice.account.${encodeURIComponent(account)}.`
    for (const name of this.slices.keys()) {
      const m = /^(sand\.client\.slice\.account\.[^.]+\.)roster\.last-roster$/.exec(name)
      if (m) return m[1]
    }
    return null
  }

  read(now = Date.now(), { botWork = false } = {}) {
    this.list(now)
    const prefix = this.prefix()
    if (!prefix) return []
    const rows = this.slice(`${prefix}roster.last-roster`)?.rows
    if (!Array.isArray(rows)) return []
    const appOpen = this.isAlive(this.pid)
    const agents = []
    for (const row of rows) {
      if (typeof row?.id !== 'string') continue
      const chat = this.slice(`${prefix}transcript.replicas.${row.id}`, v => summarize(v?.entries)) ?? summarize([])
      const state = botState(row, chat, now, appOpen, botWork)
      if (shown(row)) agents.push(agentOfBot(row, state))
    }
    return agents
  }
}
