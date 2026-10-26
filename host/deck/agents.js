// Who is on the deck: every live Claude Code session, what it is doing, and
// which key shows it.
//
// The roster is Claude Code's own: one ~/.claude/sessions/<pid>.json per
// running session (its id, folder, title, app, and a busy/idle status), live
// while its pid is. What each one is doing comes from the latest line for
// that session, from the pixelings plugin's hooks (plugin/), which know
// more than busy/idle: a permission or a question, compacting, the context.
// Whichever of the two changed last wins, so a turn stopped with Esc (no
// hook hears it end) still reads as idle.
import fs from 'node:fs'
import path from 'node:path'

export { layout } from './layout.js'
import { claudeDir, sessionsDir } from './paths.js'
import { T3Threads } from './t3.js'

export const SESSIONS_DIR = path.join(claudeDir(), 'sessions')
export const LINES_DIR = sessionsDir()

// A finished turn reads as "your move" this long, then as idle.
export const YOUR_MOVE_MS = 30 * 60 * 1000
// The session kinds Claude Code gives sessions you did not start yourself.
const AGENT_KINDS = new Set(['bg', 'sdk', 'subagent', 'worker'])
// Two changes this close count as the same moment; the mod's line wins it.
const SAME_MOMENT_MS = 2000
// Which T3 Code thread runs each session, for the ones it does.
const T3 = new T3Threads()

export function agentOf(s, line, now) {
  const statusAt = s.statusUpdatedAt ?? s.updatedAt ?? s.startedAt ?? 0
  let kind = s.status === 'busy' ? 'working' : /wait|input|permission/i.test(s.status ?? '') ? 'ask' : 'idle'
  let since = statusAt
  let ask
  // Waiting on you turns idle only once YOUR_MOVE_MS has passed.
  let waited = false

  if (line && line.at >= statusAt - SAME_MOMENT_MS) {
    const m = line.msg
    since = typeof m.sinceAt === 'number' && m.sinceAt > 0 ? m.sinceAt : line.at
    if (m.mode === 'compacting') kind = 'compacting'
    else if (m.mode === 'working') kind = 'working'
    else if (m.mode === 'waiting' && m.ask) {
      kind = 'ask'
      ask = m.ask
    } else if (m.mode === 'waiting') {
      kind = now - since < YOUR_MOVE_MS ? 'done' : 'idle'
      waited = true
    }
    else kind = 'idle'
  }

  const pct = line && typeof line.msg.pct === 'number' ? line.msg.pct : undefined
  return {
    sid: s.sessionId,
    pid: s.pid,
    kind,
    ask,
    since,
    startedAt: s.startedAt ?? 0,
    pct,
    title: s.name || path.basename(s.cwd ?? ''),
    folder: path.basename(s.cwd ?? ''),
    cwd: s.cwd,
    tool: 'claude',
    app: s.entrypoint,
    hostSessionId: s.hostSessionId,
    // When he became idle (for hiding idle agents after a while).
    idleSince: kind === 'idle' ? since + (waited ? YOUR_MOVE_MS : 0) : undefined,
    // Started by a script, the Agent SDK or another agent (Claude Code's
    // bg, sdk, subagent and worker sessions), not by you.
    byAgent: AGENT_KINDS.has(s.kind),
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// Every live session, read from disk now.
export function readAgents(now = Date.now(), sessionsDir = SESSIONS_DIR, linesDir = LINES_DIR, t3 = T3) {
  let names = []
  try {
    names = fs.readdirSync(sessionsDir).filter(n => /^\d+\.json$/.test(n))
  } catch {
    return []
  }

  const agents = []
  for (const name of names) {
    const s = readJson(path.join(sessionsDir, name))
    if (!s || typeof s.pid !== 'number' || typeof s.sessionId !== 'string' || !alive(s.pid)) continue

    // The mod's line (<sid>.json) and the pixelings plugin's
    // (<sid>.hooks.json): whichever changed last.
    let line = null
    if (/^[A-Za-z0-9_-]{1,80}$/.test(s.sessionId)) {
      for (const name of [`${s.sessionId}.json`, `${s.sessionId}.hooks.json`]) {
        const file = path.join(linesDir, name)
        const msg = readJson(file)
        if (!msg || msg.v !== 1) continue
        try {
          const at = fs.statSync(file).mtimeMs
          if (!line || at > line.at) line = { msg, at }
        } catch {
          // Gone between the read and the stat: no line.
        }
      }
    }
    const agent = agentOf(s, line, now)
    // T3 Code runs Claude Code through the Agent SDK: its sessions are
    // sdk-cli, as are other hosts', so only one T3 has a thread for is T3's.
    const t3Thread = agent.app === 'sdk-cli' ? t3?.threadFor(agent.sid, now) : null
    if (t3Thread) Object.assign(agent, { app: 't3-code', t3Env: t3Thread.env, t3Thread: t3Thread.thread })
    agents.push(agent)
  }
  return agents
}
