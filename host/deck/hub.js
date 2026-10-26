// What the Stream Deck and the control page share: the live sessions in
// their looks and seats, the deck's settings, whether a deck is plugged in,
// and everything the page can do (move, restyle, open, start, brightness).
// Emits 'change' when what the page shows changes, 'brightness' when that
// does, 'login' when starting at login is turned on or off.
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import { readAgents as readLiveAgents } from './agents.js'
import { castFor, CAST_FILE, loadCast, moveSeat, restyle, saveCast } from './cast.js'
import { CodexSessions } from './codex.js'
import { GrokBotSessions } from './grokbot.js'
import { dirs } from './paths.js'
import { DEFAULT_FLASHES, enabledFlashes, FLASH_COLORS, FLASH_EVENTS, FLASH_OPTIONS, FLASH_STYLES } from './render.js'

export const SETTINGS_FILE =
  process.env.PIXELINGS_SETTINGS ?? path.join(dirs().data, 'settings.json')

const LOCAL_ID = /^local_[A-Za-z0-9-]{1,64}$/
const CODEX_ID = /^[0-9a-f-]{36}$/
const GROKBOT_ID = /^[0-9a-f-]{36}$/
const T3_ID = /^[0-9a-f-]{36}$/
// The choices for how long an idle agent keeps his key, in minutes.
export const IDLE_CHOICES = [1, 60, 120, 180, 240, 300, 'never']
// A finished turn waits on you this long before it counts as idle (as in
// agents.js); a Codex thread is read for that long on top.
const YOUR_MOVE_MS = 30 * 60 * 1000
// "Never" for a Codex thread, which has no process to say it closed.
const CODEX_NEVER_MS = 24 * 60 * 60 * 1000

// VS Code's own link to a folder, on any system: vscode://file/C:/x or
// vscode://file/Users/x. Every path segment is fully percent-encoded (only
// the slashes and a drive's colon stay), so a folder name can never carry
// characters a shell would act on.
export function vscodeLink(folder) {
  const p = folder.replace(/\\/g, '/')
  const encoded = p
    .split('/')
    .map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return `vscode://file${p.startsWith('/') ? '' : '/'}${encoded}`
}

// What pressing a key (or Open on the page) opens for `agent`: a link
// ({ url }) or a folder ({ path }), or null.
export function openTarget(agent) {
  // A Codex thread in the Codex app (inside ChatGPT): its own link.
  if (agent.app === 'codex-app' && CODEX_ID.test(agent.codexThread ?? '')) return { url: `codex://threads/${agent.codexThread}` }
  // A Grok Bot bot: the Grok Bot app's own link to it.
  if (agent.app === 'grok-bot') return GROKBOT_ID.test(agent.grokBot ?? '') ? { url: `grokbot://app/v1/agent?id=${agent.grokBot}` } : null
  if (agent.app === 'claude-desktop' && LOCAL_ID.test(agent.hostSessionId ?? '')) {
    return { url: `claude://code/continue?session=${agent.hostSessionId}` }
  }
  // A T3 Code thread: T3's own link to it.
  if (agent.app === 't3-code' && T3_ID.test(agent.t3Env ?? '') && T3_ID.test(agent.t3Thread ?? '')) {
    return { url: `t3code://threads/${agent.t3Env}/${agent.t3Thread}` }
  }
  if (agent.app === 'claude-vscode' && agent.cwd) return { url: vscodeLink(agent.cwd) }
  // A terminal session: its folder is the best we know.
  if (agent.cwd) return { path: agent.cwd }
  return null
}

// Whether `value` is one of `table`'s own names.
const known = (table, value) => typeof value === 'string' && Object.hasOwn(table, value)

// Whether `agent` has been idle longer than `hideMs`. Waiting on you (your
// move) is not idle: an agent turns idle only after it, so idleSince, when
// a reader gives it, is later than since.
export function hiddenIdle(agent, now, hideMs) {
  return agent.kind === 'idle' && now - (agent.idleSince ?? agent.since ?? 0) >= hideMs
}

// Who an agent is on his key, by the tool his session runs in.
export function speciesOf(agent) {
  if (agent.tool === 'grokbot') return { species: 'grokbot', shape: agent.shape, color: agent.color }
  return { species: agent.tool === 'codex' ? 'codex' : 'clawd' }
}

// Opens a target with the system's own opener (the app passes Electron's,
// which needs none of this): macOS's open, Windows' URL handler and
// Explorer, xdg-open elsewhere. Never through a shell: on Windows a link
// goes to url.dll as one argument, not through cmd.exe, so nothing in it is
// read as a command.
export function systemOpener(exec = execFile, platform = process.platform) {
  return target => {
    const done = () => {}
    if (platform === 'darwin') exec('open', [target.url ?? target.path], done)
    else if (platform === 'win32') {
      if (target.url) exec('rundll32', ['url.dll,FileProtocolHandler', target.url], done)
      else exec('explorer', [target.path], done)
    } else exec('xdg-open', [target.url ?? target.path], done)
  }
}

export class Hub extends EventEmitter {
  constructor({
    readAgents = readLiveAgents,
    // Codex threads (from ~/.codex unless given); none when null.
    readCodex,
    // Grok Bot's bots (from the Grok Bot app unless given); none when null.
    readGrokBot,
    castFile = CAST_FILE,
    settingsFile = SETTINGS_FILE,
    exec = execFile,
    // Opens a { url } or { path }; the system's own opener by default.
    opener,
    rand = Math.random,
    // The app's own folder picker; the Mac's (through osascript) otherwise.
    pickFolder = null,
  } = {}) {
    super()
    this.readAgents = readAgents
    if (readCodex === undefined) {
      const codex = new CodexSessions()
      this.readCodex = (now, opts) => codex.read(now, opts)
    } else this.readCodex = readCodex
    if (readGrokBot === undefined) {
      const grok = new GrokBotSessions()
      this.readGrokBot = (now, opts) => grok.read(now, opts)
    } else this.readGrokBot = readGrokBot
    this.castFile = castFile
    this.settingsFile = settingsFile
    this.exec = exec
    this.opener = opener ?? systemOpener(exec)
    this.rand = rand
    this.pickFolder = pickFolder
    this.cast = loadCast(castFile)
    this.settings = { brightness: Number(process.env.PIXELINGS_BRIGHTNESS ?? 70), ...this.loadSettings() }
    this.agents = []
    // What the app says about itself (main.js fills it in): its version, and
    // whether it can start at login (only the installed app can).
    this.appInfo = { version: null, loginAvailable: false }
    this.deck = { connected: false, product: null }
    this.shown = ''
  }

  loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'))
    } catch {
      return {}
    }
  }

  saveSettings() {
    try {
      fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true })
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings))
    } catch {
      // Kept for this run.
    }
  }

  // Reads the sessions again, casts newcomers, and tells the page if
  // anything it shows changed.
  refresh(now = Date.now()) {
    let codex = []
    try {
      const hide = this.hideIdleMs()
      codex = this.readCodex?.(now, { keepMs: Number.isFinite(hide) ? YOUR_MOVE_MS + hide : CODEX_NEVER_MS }) ?? []
    } catch {
      // Codex's logs unreadable for now: Claude Code's sessions still show.
    }
    let grok = []
    try {
      grok = this.readGrokBot?.(now, { botWork: this.agentStarted() }) ?? []
    } catch {
      // Grok Bot's files unreadable for now: the rest still show.
    }
    // Idle a while, he leaves the deck (Hide Idle Agents After); started by
    // another agent, he is not on it unless asked for.
    const agents = [...this.readAgents(now), ...codex, ...grok].filter(
      a => !hiddenIdle(a, now, this.hideIdleMs()) && (this.agentStarted() || !a.byAgent),
    )
    const next = castFor(
      [...agents].sort((a, b) => a.startedAt - b.startedAt).map(a => a.sid),
      this.cast,
      now,
      this.rand,
    )
    if (next.changed) {
      this.cast = next.cast
      saveCast(this.cast, this.castFile)
    }
    for (const a of agents) {
      // His kind (Clawd, a Codex dot, or a Grok bot in its own shape and
      // colour) goes with the look, for the page.
      a.look = this.cast[a.sid]?.look && { ...this.cast[a.sid].look, ...speciesOf(a) }
      a.seat = this.cast[a.sid]?.seat
    }
    this.agents = agents
    this.changed()
    return agents
  }

  changed() {
    const state = JSON.stringify(this.state())
    if (state !== this.shown) {
      this.shown = state
      this.emit('change')
    }
  }

  // Everything the page draws.
  state() {
    return {
      deck: this.deck,
      brightness: this.settings.brightness,
      flash: this.flashSettings(),
      hideIdle: this.hideIdle(),
      agentStarted: this.agentStarted(),
      openAtLogin: this.openAtLogin(),
      app: this.appInfo,
      agents: this.agents.map(a => ({
        sid: a.sid,
        kind: a.kind,
        ask: a.ask,
        since: a.since,
        pct: a.pct,
        title: a.title,
        folder: a.folder,
        cwd: a.cwd,
        app: a.app,
        tool: a.tool,
        look: a.look,
        seat: a.seat,
      })),
    }
  }

  live() {
    return this.agents.map(a => a.sid)
  }

  setDeck(connected, product = null) {
    this.deck = { connected, product }
    this.changed()
  }

  // Each action: true when done, false when refused.
  move(sid, seat) {
    const next = moveSeat(this.cast, sid, seat, this.live())
    if (!next || !this.live().includes(sid)) return false
    this.cast = next
    saveCast(this.cast, this.castFile)
    this.refresh()
    return true
  }

  restyle(sid, change) {
    const next = restyle(this.cast, sid, change, this.live(), this.rand)
    if (!next || !this.live().includes(sid)) return false
    this.cast = next
    saveCast(this.cast, this.castFile)
    this.refresh()
    return true
  }

  setBrightness(value) {
    if (!Number.isInteger(value) || value < 0 || value > 100) return false
    this.settings.brightness = value
    this.saveSettings()
    this.emit('brightness', value)
    this.changed()
    return true
  }

  // How a key flashes for each thing it can flash for (FLASH_EVENTS):
  // { event: { on, style, color } }, the defaults (DEFAULT_FLASHES) where
  // nothing known was chosen. The question flash from before it had
  // company carries over.
  flashSettings() {
    const s = this.settings
    const saved = s.flash ?? { question: { on: s.flashQuestions, style: s.flashStyle, color: s.flashColor } }
    return Object.fromEntries(
      FLASH_EVENTS.map(e => {
        const d = DEFAULT_FLASHES[e]
        const x = saved?.[e] ?? {}
        return [
          e,
          {
            on: typeof x.on === 'boolean' ? x.on : d.on,
            style: FLASH_STYLES.includes(x.style) ? x.style : d.style,
            color: known(FLASH_COLORS, x.color) ? x.color : d.color,
            ...Object.fromEntries(Object.keys(FLASH_OPTIONS).map(o => [o, known(FLASH_OPTIONS[o], x[o]) ? x[o] : d[o]])),
          },
        ]
      }),
    )
  }

  // The flashes that are on, as the renderer takes them.
  flash() {
    return enabledFlashes(this.flashSettings())
  }

  // { event, and any of on, style, color, strength, size, speed }; refused
  // whole if any is not one we know.
  setFlash(change) {
    if (!change || typeof change !== 'object' || !FLASH_EVENTS.includes(change.event)) return false
    const fields = ['on', 'style', 'color', ...Object.keys(FLASH_OPTIONS)].filter(f => change[f] !== undefined)
    if (fields.length === 0) return false
    const ok = {
      on: v => typeof v === 'boolean',
      style: v => FLASH_STYLES.includes(v),
      color: v => known(FLASH_COLORS, v),
      ...Object.fromEntries(Object.keys(FLASH_OPTIONS).map(o => [o, v => known(FLASH_OPTIONS[o], v)])),
    }
    if (!fields.every(f => ok[f](change[f]))) return false
    const next = this.flashSettings()
    next[change.event] = { ...next[change.event], ...Object.fromEntries(fields.map(f => [f, change[f]])) }
    this.settings.flash = next
    delete this.settings.flashQuestions
    delete this.settings.flashStyle
    delete this.settings.flashColor
    this.saveSettings()
    this.changed()
    return true
  }

  // How long an idle agent keeps his key, in minutes (IDLE_CHOICES), or
  // 'never' hidden; two hours until changed.
  hideIdle() {
    return IDLE_CHOICES.includes(this.settings.hideIdleMinutes) ? this.settings.hideIdleMinutes : 120
  }

  hideIdleMs() {
    const minutes = this.hideIdle()
    return minutes === 'never' ? Infinity : minutes * 60_000
  }

  setHideIdle(minutes) {
    if (!IDLE_CHOICES.includes(minutes)) return false
    this.settings.hideIdleMinutes = minutes
    this.saveSettings()
    this.refresh()
    return true
  }

  // Whether Pixelings starts when you log in: on until changed. The app
  // registers it with the system when told ('login').
  openAtLogin() {
    return this.settings.openAtLogin !== false
  }

  setOpenAtLogin(on) {
    if (typeof on !== 'boolean') return false
    this.settings.openAtLogin = on
    this.saveSettings()
    this.emit('login', on)
    this.changed()
    return true
  }

  // Whether agents started by other agents get keys: Claude Code sessions
  // run by a script, the Agent SDK or another agent, Codex threads one
  // agent made for another, and Grok bots' work for other bots or on their
  // own (automations). Off until changed.
  agentStarted() {
    return this.settings.showAgentStarted === true
  }

  setAgentStarted(on) {
    if (typeof on !== 'boolean') return false
    this.settings.showAgentStarted = on
    delete this.settings.grokBotWork
    this.saveSettings()
    this.refresh()
    return true
  }

  open(sid) {
    const agent = this.agents.find(a => a.sid === sid)
    const target = agent && openTarget(agent)
    if (!target) return false
    this.opener(target)
    return true
  }

  // A new Claude app session in `folder` (an existing folder).
  newAgent(folder) {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) return false
    try {
      if (!fs.statSync(folder).isDirectory()) return false
    } catch {
      return false
    }
    this.opener({ url: `claude://code/new?folder=${encodeURIComponent(folder)}` })
    return true
  }

  // The Mac's own folder picker; the chosen folder, or null if cancelled.
  chooseFolder() {
    if (this.pickFolder) return this.pickFolder()
    // Without the app, only macOS has a picker to ask (osascript).
    if (process.platform !== 'darwin') return Promise.resolve(null)
    return new Promise(resolve => {
      this.exec(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Folder for the new Claude session")'],
        (err, stdout) => resolve(err ? null : String(stdout).trim().replace(/(.)\/$/, '$1') || null),
      )
    })
  }
}
