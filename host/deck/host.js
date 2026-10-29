// Where each agent runs: the app (and for a terminal, the tab) its process
// is in, so a press brings up that exact place instead of its folder.
//
// The process tree says it. From an agent's pid, its parents lead to the
// first app bundle: /Applications/Ghostty.app/Contents/MacOS/ghostty for a
// session in Ghostty, …/Visual Studio Code.app/…/Code Helper (Plugin) for
// one in VS Code (the outermost .app is the app). The pid's own tty finds
// its tab in Terminal and iTerm2; Ghostty doesn't say a tab's tty, so its
// tab is the one in the session's folder with the session's title, which
// Claude Code puts in the tab's title. Under tmux the parent is tmux's
// server: the pane is found by tty, and the app is the one the attached
// client runs in.
//
// A Claude Code session has its pid. A Codex CLI thread doesn't: its
// process is the running codex in the thread's folder.
//
// macOS and Linux only (ps); Windows sessions keep opening as before.
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// The apps known by their bundle's name. Any other app is 'app': it can
// still be brought to the front.
export const HOST_APPS = {
  'Ghostty.app': 'ghostty',
  'Terminal.app': 'terminal',
  'iTerm.app': 'iterm',
  'Visual Studio Code.app': 'vscode',
  'Visual Studio Code - Insiders.app': 'vscode-insiders',
  'Cursor.app': 'cursor',
}
// The terminals whose tab can be found and shown.
export const TERMINALS = new Set(['ghostty', 'terminal', 'iterm'])
// A Codex CLI thread's process is looked for again this often.
const CODEX_RETRY_MS = 10_000
// Where tmux is when the app's PATH doesn't have it (an app started from
// the Dock has only the system's).
const TMUX_PATHS = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux']

// `ps -A -o pid=,ppid=,tty=,comm=` as pid → { ppid, tty, comm }.
export function parsePs(text) {
  const table = new Map()
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line)
    if (m) table.set(+m[1], { ppid: +m[2], tty: m[3], comm: m[4].trim() })
  }
  return table
}

// The outermost app bundle in an executable's path, or null.
export function bundleOf(comm) {
  const i = comm.indexOf('.app/')
  return i < 0 ? null : comm.slice(0, i + 4)
}

// ps's tty ("ttys003", or "??" for none) as the terminals name it.
const devTty = tty => (/^tty[A-Za-z0-9]+$/.test(tty ?? '') ? `/dev/${tty}` : undefined)

// The first app among `pid` and its parents in `table`: { app, bundle },
// or { tmux: true } when tmux's server comes first, or null.
function appAbove(table, pid) {
  let p = pid
  for (let i = 0; i < 64 && p > 1; i++) {
    const proc = table.get(p)
    if (!proc) return null
    if (p !== pid && path.basename(proc.comm) === 'tmux') return { tmux: true }
    const bundle = bundleOf(proc.comm)
    if (bundle) return { app: HOST_APPS[path.basename(bundle)] ?? 'app', bundle }
    p = proc.ppid
  }
  return null
}

// Where `pid` runs, from the process table: { app, bundle, tty }, with
// { tmux: { pane, client } } inside tmux, or null. `tmux()` lists panes and
// clients (as tmuxState reads them), asked for only when tmux is there.
export function hostIn(table, pid, tmux = () => null) {
  const above = appAbove(table, pid)
  if (!above) return null
  const tty = devTty(table.get(pid)?.tty)
  if (!above.tmux) return { ...above, tty }
  const state = tmux()
  const pane = state?.panes.find(p => p.tty === tty)
  const client = pane && state.clients.find(c => c.session === pane.session)
  if (!client) return null
  // The client is a process on its own tty, in the app it shows in.
  for (const [cpid, proc] of table) {
    if (devTty(proc.tty) !== client.tty) continue
    const outer = appAbove(table, cpid)
    if (outer?.bundle) return { ...outer, tty: client.tty, tmux: { pane: pane.id, client: client.tty } }
  }
  return null
}

// tmux's panes and clients, from its own listings.
export function tmuxState(panesText, clientsText) {
  const rows = text => text.split('\n').map(l => l.trim().split(' ')).filter(r => r.length >= 2)
  return {
    panes: rows(panesText).map(([tty, id, ...session]) => ({ tty, id, session: session.join(' ') })),
    clients: rows(clientsText).map(([tty, ...session]) => ({ tty, session: session.join(' ') })),
  }
}

const tmuxBin = () => TMUX_PATHS.find(p => fs.existsSync(p)) ?? 'tmux'

// `lsof -Fpn` output as pid → the one name it gave (here, the cwd).
export function parseLsofCwd(text) {
  const cwds = new Map()
  let pid
  for (const line of text.split('\n')) {
    if (line[0] === 'p') pid = +line.slice(1)
    else if (line[0] === 'n' && pid) cwds.set(pid, line.slice(1))
  }
  return cwds
}

export class Hosts {
  constructor({ exec = execFileSync, platform = process.platform } = {}) {
    this.run = (cmd, args) => exec(cmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
    this.on = platform !== 'win32'
    // pid → host (null for none): a pid's host never changes while it runs.
    this.byPid = new Map()
    // Codex thread id → { host, at }.
    this.codex = new Map()
  }

  table() {
    try {
      return parsePs(this.run('ps', ['-A', '-o', 'pid=,ppid=,tty=,comm=']))
    } catch {
      return null
    }
  }

  tmux() {
    try {
      const bin = tmuxBin()
      return tmuxState(
        this.run(bin, ['list-panes', '-a', '-F', '#{pane_tty} #{pane_id} #{session_name}']),
        this.run(bin, ['list-clients', '-F', '#{client_tty} #{client_session}']),
      )
    } catch {
      return null
    }
  }

  // The running codex processes' folders: folder → pid.
  codexFolders(table) {
    const pids = [...table].filter(([, p]) => path.basename(p.comm) === 'codex').map(([pid]) => pid)
    if (!pids.length) return new Map()
    try {
      const cwds = parseLsofCwd(this.run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]))
      return new Map([...cwds].map(([pid, cwd]) => [cwd, pid]))
    } catch {
      return new Map()
    }
  }

  // Gives each of `agents` its host (agent.host), where one is found.
  attach(agents, now = Date.now()) {
    if (!this.on) return agents
    const pids = new Set(agents.filter(a => Number.isInteger(a.pid) && a.pid > 0).map(a => a.pid))
    for (const pid of this.byPid.keys()) if (!pids.has(pid)) this.byPid.delete(pid)
    const fresh = [...pids].filter(pid => !this.byPid.has(pid))
    const codex = agents.filter(a => a.app === 'codex-cli' && a.cwd)
    const codexDue = codex.filter(a => !(now - (this.codex.get(a.sid)?.at ?? -Infinity) < CODEX_RETRY_MS))

    if (fresh.length || codexDue.length) {
      const table = this.table()
      let tmux
      const tmuxOnce = () => (tmux === undefined ? (tmux = this.tmux()) : tmux)
      if (table) for (const pid of fresh) this.byPid.set(pid, hostIn(table, pid, tmuxOnce))
      if (table && codexDue.length) {
        const folders = this.codexFolders(table)
        for (const a of codexDue) {
          const pid = folders.get(a.cwd)
          this.codex.set(a.sid, { host: pid ? hostIn(table, pid, tmuxOnce) : null, at: now })
        }
      }
    }
    const live = new Set(codex.map(a => a.sid))
    for (const sid of this.codex.keys()) if (!live.has(sid)) this.codex.delete(sid)

    for (const a of agents) {
      const host = a.app === 'codex-cli' ? this.codex.get(a.sid)?.host : this.byPid.get(a.pid)
      if (host) a.host = host
    }
    return agents
  }
}

// The scripts (JavaScript for Automation) that show one terminal tab. Each
// takes what it looks for as arguments, never inside its text.
export const SCRIPTS = {
  // argv: the app, the session's folder, its title. The tab in that folder
  // with that title (Ghostty puts a spinner before it), else the only tab in
  // that folder.
  ghostty: `function run(argv) {
  const [bundle, cwd, title] = argv
  const app = Application(bundle)
  const plain = s => String(s).replace(/^[^\\p{L}\\p{N}]+/u, '').trim()
  const all = app.terminals()
  const here = all.filter(t => t.workingDirectory() === cwd)
  const named = (here.length ? here : all).filter(t => plain(t.name()) === title)
  const pick = named.length ? named[0] : here.length === 1 ? here[0] : null
  if (!pick) throw new Error('no such tab')
  app.focus(pick)
  app.activate()
}`,
  // argv: the app, the tty.
  terminal: `function run(argv) {
  const [bundle, tty] = argv
  const app = Application(bundle)
  for (const w of app.windows()) {
    for (const t of w.tabs()) {
      if (t.tty() !== tty) continue
      t.selected = true
      w.index = 1
      app.activate()
      return
    }
  }
  throw new Error('no such tab')
}`,
  iterm: `function run(argv) {
  const [bundle, tty] = argv
  const app = Application(bundle)
  for (const w of app.windows()) {
    for (const t of w.tabs()) {
      for (const s of t.sessions()) {
        if (s.tty() !== tty) continue
        s.select()
        t.select()
        w.select()
        app.activate()
        return
      }
    }
  }
  throw new Error('no such tab')
}`,
}

// The steps that show `focus` ({ app, bundle, tty, tmux, cwd, title }), as
// [command, args]: tmux's pane first, then the terminal's tab.
export function focusSteps(focus) {
  const steps = []
  if (focus.tmux) {
    const bin = tmuxBin()
    const pane = focus.tmux.pane
    steps.push([bin, ['switch-client', '-c', focus.tmux.client, '-t', pane]])
    steps.push([bin, ['select-window', '-t', pane]])
    steps.push([bin, ['select-pane', '-t', pane]])
  }
  // Ghostty's tab running tmux has tmux's title, not the session's: its
  // app is brought forward, on the pane just chosen.
  if (focus.tmux && focus.app === 'ghostty') steps.push(['open', [focus.bundle]])
  else if (focus.app === 'ghostty') steps.push(['osascript', ['-l', 'JavaScript', '-e', SCRIPTS.ghostty, focus.bundle, focus.cwd ?? '', focus.title ?? '']])
  else if (focus.app === 'terminal' || focus.app === 'iterm') {
    steps.push(['osascript', ['-l', 'JavaScript', '-e', SCRIPTS[focus.app], focus.bundle, focus.tty ?? '']])
  }
  return steps
}

// Shows `focus`, step by step; `failed()` when a step can't (no such tab,
// or Automation not allowed for that app), so the app is brought forward
// instead.
export function focuser(exec = execFile) {
  return (focus, failed) => {
    const steps = focusSteps(focus)
    const next = i => {
      if (i === steps.length) return
      exec(steps[i][0], steps[i][1], { timeout: 5000 }, err => (err ? failed() : next(i + 1)))
    }
    if (steps.length) next(0)
    else failed()
  }
}
