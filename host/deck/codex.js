// Codex sessions, from Codex's own session logs: no Codex settings to
// change, and it covers the Codex app (in ChatGPT) and the command line.
//
// Each thread writes ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl,
// appended to as it goes (one can grow past a gigabyte, so only its end is
// ever read, then only what was added). From it: a turn starting (working),
// finishing (your move) or stopped (idle), the context from its token
// counts, and its folder. Its name is in ~/.codex/session_index.jsonl. A
// thread counts as running while it is working, or had a turn lately (how
// lately follows Hide Idle Agents After; two hours unless told): Codex
// threads have no process of their own to watch, and the Codex app touches
// old logs when it opens, so a log changing says nothing.
import fs from 'node:fs'
import path from 'node:path'

import { codexDir } from './paths.js'

export const CODEX_DIR = codexDir()
// How long after its last turn a thread still counts, unless told.
export const KEEP_MS = 120 * 60_000
// A finished turn reads as "your move" this long, then as idle (as for
// Claude Code).
const YOUR_MOVE_MS = 30 * 60 * 1000
// How much of a log's end is read the first time.
const TAIL_BYTES = 1024 * 1024
// The sessions folder is listed again this often.
const LIST_MS = 10_000

const ROLLOUT = /^rollout-(\d{4})-(\d\d)-(\d\d)T(\d\d)-(\d\d)-(\d\d)-([0-9a-f-]{36})\.jsonl$/

// What one log line changes in a thread's `state`; lines that say nothing
// about it are skipped before they are parsed (some are megabytes).
export function applyLine(state, line) {
  if (
    !/"(task_started|task_complete|turn_aborted|token_count|turn_context|thread_settings_applied|session_meta)"|approval_request|request_user_input/.test(
      line.slice(0, 200),
    )
  )
    return state
  let d
  try {
    d = JSON.parse(line)
  } catch {
    return state
  }
  const p = d.payload ?? {}
  const at = Date.parse(d.timestamp ?? '') || state.since || 0
  const next = { ...state }
  if (d.type === 'session_meta') {
    next.originator = p.originator ?? next.originator
    // A thread one agent made for another, or a subagent's.
    next.byAgent = p.thread_source === 'agent_created_thread' || (typeof p.source === 'object' && p.source !== null && 'subagent' in p.source)
    if (p.cwd) next.cwd = p.cwd
    if (p.context_window) next.window = p.context_window
    return next
  }
  if (d.type === 'turn_context') {
    if (p.cwd) next.cwd = p.cwd
    return next
  }
  if (d.type !== 'event_msg') return state
  switch (p.type) {
    case 'thread_settings_applied':
      if (p.thread_settings?.cwd) next.cwd = p.thread_settings.cwd
      return next
    case 'task_started':
      next.kind = 'working'
      next.ask = undefined
      next.since = p.started_at ? p.started_at * 1000 : at
      if (p.model_context_window) next.window = p.model_context_window
      return next
    case 'task_complete':
      next.kind = 'done'
      next.ask = undefined
      next.since = p.completed_at ? p.completed_at * 1000 : at
      return next
    case 'turn_aborted':
      next.kind = 'idle'
      next.ask = undefined
      next.since = p.completed_at ? p.completed_at * 1000 : at
      return next
    case 'token_count': {
      const used = p.info?.last_token_usage?.input_tokens
      const window = p.info?.model_context_window ?? next.window
      if (typeof used === 'number' && window > 0) {
        next.window = window
        // As for Claude Code: 80% of the window fills the bar.
        next.pct = Math.min(100, Math.floor((used / window / 0.8) * 100))
      }
      return next
    }
    default:
      // An approval or a question to you (Codex set to ask first).
      if (/approval_request/.test(p.type ?? '')) {
        next.kind = 'ask'
        next.ask = 'permission'
        next.since = at
      } else if (/request_user_input/.test(p.type ?? '')) {
        next.kind = 'ask'
        next.ask = 'question'
        next.since = at
      }
      return next
  }
}

// The latest name of each thread in session_index.jsonl's text.
export function threadNames(text) {
  const names = new Map()
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      const d = JSON.parse(line)
      if (d.id && d.thread_name) names.set(d.id, d.thread_name)
    } catch {
      // A half-written last line: the next read has it.
    }
  }
  return names
}

// Whether a thread with `state` is running: working, or a turn lately.
export function running(state, now, keepMs = KEEP_MS) {
  if (state.kind === 'working' || state.kind === 'ask') return true
  return typeof state.since === 'number' && now - state.since < keepMs
}

// A Codex thread as the deck shows agents.
export function agentOfThread(id, state, name, mtime, startedAt, now) {
  let kind = state.kind ?? 'idle'
  let idleSince
  if (kind === 'done' && now - (state.since ?? mtime) >= YOUR_MOVE_MS) {
    kind = 'idle'
    idleSince = (state.since ?? mtime) + YOUR_MOVE_MS
  } else if (kind === 'idle') idleSince = state.since ?? mtime
  const folder = path.basename(state.cwd ?? '')
  const app = /desktop/i.test(state.originator ?? '') ? 'codex-app' : 'codex-cli'
  return {
    sid: id,
    pid: 0,
    tool: 'codex',
    kind,
    ask: state.ask,
    since: state.since ?? mtime,
    startedAt,
    pct: state.pct,
    title: name || folder || 'Codex',
    folder,
    cwd: state.cwd,
    app,
    codexThread: id,
    idleSince,
    byAgent: state.byAgent === true,
  }
}

function readRange(file, start, end) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(end - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    return buf.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

export class CodexSessions {
  constructor({ dir = CODEX_DIR } = {}) {
    this.dir = dir
    this.files = []
    this.listedAt = 0
    this.logs = new Map()
    this.names = new Map()
    this.indexSize = -1
  }

  list(now) {
    if (now - this.listedAt < LIST_MS) return
    this.listedAt = now
    const root = path.join(this.dir, 'sessions')
    const found = []
    const walk = (d, depth) => {
      let entries = []
      try {
        entries = fs.readdirSync(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.isDirectory() && depth < 3) walk(path.join(d, e.name), depth + 1)
        else if (e.isFile() && ROLLOUT.test(e.name)) found.push(path.join(d, e.name))
      }
    }
    walk(root, 0)
    this.files = found
  }

  readNames() {
    const file = path.join(this.dir, 'session_index.jsonl')
    try {
      const size = fs.statSync(file).size
      if (size === this.indexSize) return
      this.indexSize = size
      this.names = threadNames(fs.readFileSync(file, 'utf8'))
    } catch {
      // No index yet: threads go by their folder.
    }
  }

  // The first line, for where the thread came from; it is small enough.
  firstLine(file) {
    try {
      const head = readRange(file, 0, Math.min(fs.statSync(file).size, 256 * 1024))
      const nl = head.indexOf('\n')
      return nl >= 0 ? head.slice(0, nl) : ''
    } catch {
      return ''
    }
  }

  // A log brought up to date: its end the first time, then what was added.
  update(file, size) {
    let log = this.logs.get(file)
    if (log && size === log.size) return log
    let from
    let state
    if (!log || size < log.size) {
      from = Math.max(0, size - TAIL_BYTES)
      state = applyLine({}, this.firstLine(file))
    } else {
      from = log.size
      state = log.state
    }
    const text = readRange(file, from, size)
    const lines = text.split('\n')
    // A tail starts mid-line; a read can end mid-line (kept for next time).
    if (from > 0 && (!log || size < log.size)) lines.shift()
    const partial = lines.pop() ?? ''
    for (const line of lines) state = applyLine(state, line)
    log = { size: size - Buffer.byteLength(partial), state }
    this.logs.set(file, log)
    return log
  }

  // Every running Codex thread at `now`.
  // `keepMs`: how long after its last turn a thread still counts.
  read(now = Date.now(), { keepMs = KEEP_MS } = {}) {
    this.list(now)
    this.readNames()
    const agents = []
    for (const file of this.files) {
      let st
      try {
        st = fs.statSync(file)
      } catch {
        continue
      }
      // Not written lately: certainly not running, and not worth reading.
      if (now - st.mtimeMs > keepMs) continue
      const m = ROLLOUT.exec(path.basename(file))
      const startedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      let log
      try {
        log = this.update(file, st.size)
      } catch {
        continue
      }
      if (!running(log.state, now, keepMs)) continue
      agents.push(agentOfThread(m[7], log.state, this.names.get(m[7]), st.mtimeMs, startedAt, now))
    }
    return agents
  }
}
