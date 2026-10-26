#!/usr/bin/env node
// Claude Code's hooks → what each session is doing, for Pixelings
// (host/deck). Every hook event of a session rewrites one small file,
// <sessions dir>/<session id>.hooks.json, with a protocol v1 line:
//
//   {"v":1,"src":"hooks","mode":"waiting","ask":"permission","sinceAt":...,
//    "pct":34,"name":"my-repo","sid":"..."}
//
// mode is idle, working, waiting (your move; with "ask" when Claude is
// asking you something) or compacting. "askAtEnd" marks a turn that will
// end on a question (the Claude app's next-step box).
// The hooks run in the background (async), never print, and never fail:
// whatever goes wrong, the session carries on and the deck catches up on
// the next event. SessionEnd removes the file.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Must agree with the app's sessionsDir (host/deck/paths.js).
export function sessionsDir(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.PIXELINGS_SESSIONS_DIR) return env.PIXELINGS_SESSIONS_DIR
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'Pixelings', 'sessions')
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Pixelings', 'sessions')
  return path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'pixelings', 'sessions')
}
export const SESSIONS_DIR = sessionsDir()

// How much of the transcript's end is read for the latest context figure.
const TAIL_BYTES = 256 * 1024

// The Claude app's tool that ends a turn with its next-step box.
const WRAP_UP = /(^|__)ccd_turn__wrap_up$/
// Events that end a turn or start one: a question to end on goes no further.
const TURN_EDGES = ['UserPromptSubmit', 'SessionStart', 'Stop', 'StopFailure']

// The line after `event` (a hook's input), given the session's last line
// (`prev`, or null) and, when known, the context % (`pct`). null: leave
// the file as it is; 'end': remove it.
export function nextLine(prev, event, now, pct) {
  const e = event ?? {}
  let mode
  let ask
  // A question the turn will end on: the Claude app's next-step box, asked
  // through its wrap_up tool before the turn's last words. Kept through the
  // rest of the turn, then the turn ends as that question, not as your move.
  let askAtEnd
  switch (e.hook_event_name) {
    case 'SessionStart':
      // After a compaction the turn goes on.
      mode = e.source === 'compact' ? 'working' : 'idle'
      break
    case 'UserPromptSubmit':
    case 'PostToolUse':
    case 'PostToolUseFailure':
    case 'PermissionDenied':
    case 'SubagentStart':
      mode = 'working'
      break
    case 'PreToolUse':
      mode = e.tool_name === 'AskUserQuestion' ? 'waiting' : 'working'
      if (mode === 'waiting') ask = 'question'
      else if (WRAP_UP.test(e.tool_name ?? '') && String(e.tool_input?.ask ?? '').trim()) askAtEnd = 'question'
      break
    case 'PermissionRequest':
      mode = 'waiting'
      ask = 'permission'
      break
    case 'Notification':
      if (e.notification_type === 'permission_prompt') {
        mode = 'waiting'
        ask = 'permission'
      } else if (e.notification_type === 'elicitation_dialog') {
        mode = 'waiting'
        ask = 'question'
      } else return null
      break
    case 'PreCompact':
      mode = 'compacting'
      break
    case 'PostCompact':
      mode = e.trigger === 'manual' ? 'waiting' : 'working'
      break
    case 'Stop':
      mode = 'waiting'
      if (prev?.askAtEnd) ask = prev.askAtEnd
      break
    case 'StopFailure':
      mode = 'waiting'
      break
    case 'SessionEnd':
      return 'end'
    default:
      return null
  }

  // A subagent's tool calls must not end the main thread's question.
  if (prev?.ask && mode === 'working' && e.hook_event_name === 'SubagentStart') {
    mode = prev.mode
    ask = prev.ask
  }

  const same = prev && prev.mode === mode && (prev.ask ?? null) === (ask ?? null)
  const line = {
    v: 1,
    src: 'hooks',
    mode,
    sinceAt: same && prev.sinceAt ? prev.sinceAt : now,
    at: now,
    name: path.basename(e.cwd ?? prev?.name ?? ''),
    sid: e.session_id,
  }
  if (ask) line.ask = ask
  // Until the turn ends, or a new one starts.
  if (!askAtEnd && prev?.askAtEnd && !TURN_EDGES.includes(e.hook_event_name)) askAtEnd = prev.askAtEnd
  if (askAtEnd) line.askAtEnd = askAtEnd
  const p = typeof pct === 'number' ? pct : prev?.pct
  if (typeof p === 'number') line.pct = p
  return line
}

// A model's context window: hooks are not told it, so this follows Claude
// Code's own rule for the families that matter: 1M for a [1m] model and
// for Claude 5 and later, 200k for earlier ones, 1M for anything already
// past 200k. PIXELINGS_CONTEXT_WINDOW overrides it.
export function windowFor(model = '', tokens = 0) {
  const forced = Number(process.env.PIXELINGS_CONTEXT_WINDOW)
  if (forced > 0) return forced
  if (/\[1m\]/i.test(model) || tokens > 200_000) return 1_000_000
  const major = /claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)/i.exec(model)
  return major && Number(major[1]) >= 5 ? 1_000_000 : 200_000
}

// The context %, as the powerline-band mod scales it (80% of the window
// fills the bar), from the last assistant message's usage in `text` (the
// end of a transcript). undefined when there is no usage.
export function contextPct(text) {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"usage"')) continue
    try {
      const m = JSON.parse(lines[i]).message
      const u = m?.usage
      if (!u) continue
      const tokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      const window = windowFor(m.model ?? '', tokens)
      return Math.min(100, Math.floor((tokens / window / 0.8) * 100))
    } catch {
      // A line cut by the tail, or not JSON: try the one before.
    }
  }
  return undefined
}

function readTail(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

// Applies one hook event (the parsed stdin) to the session's file.
export function handle(event, now = Date.now(), dir = SESSIONS_DIR) {
  const sid = event?.session_id
  if (typeof sid !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(sid)) return
  const file = path.join(dir, `${sid}.hooks.json`)

  let prev = null
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    // First event of the session, or a broken file: start over.
  }

  // Only events that can change the figure read the transcript.
  const reads = ['UserPromptSubmit', 'PostToolUse', 'Stop', 'SessionStart', 'PostCompact', 'PreCompact']
  const pct =
    reads.includes(event.hook_event_name) && typeof event.transcript_path === 'string'
      ? contextPct(readTail(event.transcript_path))
      : undefined

  const line = nextLine(prev, event, now, pct)
  if (line === null) return
  if (line === 'end') {
    fs.rmSync(file, { force: true })
    return
  }
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${file}.${process.pid}`
  fs.writeFileSync(tmp, `${JSON.stringify(line)}\n`)
  fs.renameSync(tmp, file)
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => (input += chunk))
  process.stdin.on('end', () => {
    try {
      handle(JSON.parse(input))
    } catch {
      // Never in the way of the session.
    }
    process.exit(0)
  })
}
