// What the Stream Deck and the control page share: the live sessions in
// their looks and seats, the deck's settings, whether a deck is plugged in,
// and everything the page can do (move, restyle, open, start, brightness).
// Emits 'change' when what the page shows changes, 'brightness' when that
// does, 'login' when starting at login is turned on or off, 'outputs' when
// a display is turned on or off, 'farm' when the farm's screen or window
// changes, 'desktop' when the Desktop's screen, size, growing or layering does.
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import { readAgents as readLiveAgents } from './agents.js'
import { SCENES } from './farm.js'
import { castFor, CAST_FILE, loadCast, moveSeat, restyle, saveCast } from './cast.js'
import { CodexSessions } from './codex.js'
import { GrokBotSessions } from './grokbot.js'
import { focuser, Hosts, TERMINALS } from './host.js'
import { BUILT_OUTPUTS, desktopSizeFrom, FARM_SIZES, farmWindowFrom, outputsFrom, STRIP_EDGES, STRIP_HEIGHTS } from './mode.js'
import { dirs } from './paths.js'
import { DEFAULT_FLASHES, enabledFlashes, FLASH_COLORS, FLASH_EVENTS, FLASH_OPTIONS, FLASH_STYLES } from './render.js'

export const SETTINGS_FILE =
  process.env.PIXELINGS_SETTINGS ?? path.join(dirs().data, 'settings.json')

const LOCAL_ID = /^local_[A-Za-z0-9-]{1,64}$/
const CODEX_ID = /^[0-9a-f-]{36}$/
const GROKBOT_ID = /^[0-9a-f-]{36}$/
const T3_ID = /^[0-9a-f-]{36}$/
const VSCODE_ID = /^[0-9a-f-]{36}$/
// How long VS Code is given to bring a folder's window to the front before
// the Claude extension's link, which goes to the window in front, follows.
export const VSCODE_FOCUS_MS = 700
// The choices for how long an idle agent keeps his key, in minutes.
export const IDLE_CHOICES = [1, 60, 120, 180, 240, 300, 'never']
// A finished turn waits on you this long before it counts as idle (as in
// agents.js); a Codex thread is read for that long on top.
const YOUR_MOVE_MS = 30 * 60 * 1000
// "Never" for a Codex thread, which has no process to say it closed.
const CODEX_NEVER_MS = 24 * 60 * 60 * 1000

// The link scheme of each editor built on VS Code, by its host (host.js).
const EDITORS = { vscode: 'vscode', 'vscode-insiders': 'vscode-insiders', cursor: 'cursor' }

// VS Code's own link to a folder, on any system: vscode://file/C:/x or
// vscode://file/Users/x (cursor://file/… for Cursor, by `scheme`). Every
// path segment is fully percent-encoded (only the slashes and a drive's
// colon stay), so a folder name can never carry characters a shell would
// act on.
export function vscodeLink(folder, scheme = 'vscode') {
  const p = folder.replace(/\\/g, '/')
  const encoded = p
    .split('/')
    .map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return `${scheme}://file${p.startsWith('/') ? '' : '/'}${encoded}`
}

// What pressing a key (or Open on the page) opens for `agent`: a link
// ({ url }), a folder or app ({ path }), a terminal tab ({ focus }, with
// the app as its `fallback`), or null. A target with `first` has that
// opened first, VSCODE_FOCUS_MS before it.
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
  const host = agent.host
  if (agent.app === 'claude-vscode' && agent.cwd) {
    // Cursor runs the same extension, and opens by its own links.
    const scheme = EDITORS[host?.app] ?? 'vscode'
    // The Claude extension's own link shows the session's tab, but in the
    // window VS Code last had in front: its folder's window is put there first.
    if (VSCODE_ID.test(agent.sid ?? '')) {
      return { url: `${scheme}://anthropic.claude-code/open?session=${agent.sid}`, first: { url: vscodeLink(agent.cwd, scheme) } }
    }
    return { url: vscodeLink(agent.cwd, scheme) }
  }
  // In an editor's own terminal, or Codex in its extension: the folder's
  // window in that editor.
  if (EDITORS[host?.app] && agent.cwd) return { url: vscodeLink(agent.cwd, EDITORS[host.app]) }
  // In a terminal: its tab, or the terminal at least.
  if (TERMINALS.has(host?.app)) {
    const { app, bundle, tty, tmux } = host
    return { focus: { app, bundle, tty, tmux, cwd: agent.cwd, title: agent.title }, fallback: { path: bundle } }
  }
  // In any other app: that app.
  if (host?.bundle) return { path: host.bundle }
  // Nowhere known: its folder is the best we know.
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
    // Finds where each agent runs (host.js); none when null.
    hosts = new Hosts(),
    // Shows a terminal tab, or says it can't; host.js's by default.
    focus,
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
    this.hosts = hosts
    this.focus = focus ?? focuser(exec)
    this.rand = rand
    this.pickFolder = pickFolder
    this.cast = loadCast(castFile)
    this.settings = { brightness: Number(process.env.PIXELINGS_BRIGHTNESS ?? 70), ...this.loadSettings() }
    this.agents = []
    // What the app says about itself (main.js fills it in): its version, and
    // whether it can start at login (only the installed app can).
    this.appInfo = { version: null, loginAvailable: false }
    this.deck = { connected: false, product: null }
    // The screens plugged in (main.js says): { id, name, width, height, primary }.
    this.displays = []
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
    const all = [...this.readAgents(now), ...codex, ...grok]
    const dismissed = this.keepDismissed(all)
    // Idle a while, he leaves the deck (Hide Idle Agents After); started by
    // another agent, he is not on it unless asked for; dismissed, he is
    // gone until his session does something again.
    const agents = all.filter(
      a => !hiddenIdle(a, now, this.hideIdleMs()) && (this.agentStarted() || !a.byAgent) && !dismissed.has(a.sid),
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
    try {
      this.hosts?.attach(agents, now)
    } catch {
      // Hosts unknown for now: presses open folders, as before.
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

  // Dismissed agents (settings.dismissed: sid → his `since` then) that are
  // still dismissed: those whose session has done nothing since. One that
  // has, or whose session is gone, is forgotten, so he shows again.
  keepDismissed(all) {
    const saved = this.settings.dismissed ?? {}
    const keep = {}
    for (const a of all) if (Object.hasOwn(saved, a.sid) && (a.since ?? 0) <= saved[a.sid]) keep[a.sid] = saved[a.sid]
    if (Object.keys(keep).length !== Object.keys(saved).length) {
      this.settings.dismissed = keep
      this.saveSettings()
    }
    return new Set(Object.keys(keep))
  }

  // Dismisses one (a right-click on him): whatever he was doing is cleared
  // and he leaves every display, until his session does something again.
  dismiss(sid) {
    const agent = this.agents.find(a => a.sid === sid)
    if (!agent) return false
    this.settings.dismissed = { ...this.settings.dismissed, [sid]: agent.since ?? 0 }
    this.saveSettings()
    this.refresh()
    return true
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
      outputs: this.outputs(),
      farmWindow: this.farmWindow(),
      farmDisplay: this.farmDisplay(),
      farmScene: this.farmScene(),
      desktopDisplay: this.desktopDisplay(),
      desktopOnTop: this.desktopOnTop(),
      desktopContext: this.desktopContext(),
      desktopSize: this.desktopSize(),
      desktopGrow: this.desktopGrow(),
      displays: this.displays,
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

  // Where the Pixelings show (mode.js): each display on or off by itself,
  // the Stream Deck alone until changed.
  outputs() {
    return outputsFrom(this.settings)
  }

  setOutput(output, on) {
    if (!BUILT_OUTPUTS.includes(output) || typeof on !== 'boolean') return false
    this.settings.outputs = { ...this.outputs(), [output]: on }
    delete this.settings.mode
    this.saveSettings()
    this.emit('outputs', this.outputs())
    this.changed()
    return true
  }

  // How the farm's window sits on its screen (mode.js): full screen, a
  // window (kept on top or not) or a strip (its height and edge).
  farmWindow() {
    return farmWindowFrom(this.settings)
  }

  setFarmWindow(change) {
    const keys = Object.keys(change ?? {})
    const ok = {
      size: v => FARM_SIZES.includes(v),
      onTop: v => typeof v === 'boolean',
      stripHeight: v => typeof v === 'string' && Object.hasOwn(STRIP_HEIGHTS, v),
      stripEdge: v => STRIP_EDGES.includes(v),
    }
    if (!keys.length || !keys.every(k => ok[k]?.(change[k]))) return false
    this.settings.farmWindow = { ...this.farmWindow(), ...change }
    this.saveSettings()
    this.emit('farm')
    this.changed()
    return true
  }

  // Where the farm's window was left, as a window: { display, x, y, width,
  // height }, kept for next time. Nothing else changes with it.
  farmPlace() {
    return this.settings.farmPlace ?? null
  }

  setFarmPlace(place) {
    this.settings.farmPlace = place
    this.saveSettings()
  }

  // The farm's screen: 'auto' (a Xeneon Edge, or another long, short
  // screen) or a screen's id. Automatic until changed; the Scene's
  // switch turns it off now, so an old 'off' reads as automatic.
  farmDisplay() {
    const d = this.settings.farmDisplay
    return Number.isInteger(d) ? d : 'auto'
  }

  setFarmDisplay(display) {
    if (display !== 'auto' && !Number.isInteger(display)) return false
    this.settings.farmDisplay = display
    this.saveSettings()
    this.emit('farm', display)
    this.changed()
    return true
  }

  // Where everyone lives on that screen: 'farm', 'office' or 'mall'. The
  // farm until changed.
  farmScene() {
    return SCENES.includes(this.settings.farmScene) ? this.settings.farmScene : 'farm'
  }

  setFarmScene(scene) {
    if (!SCENES.includes(scene)) return false
    this.settings.farmScene = scene
    this.saveSettings()
    this.changed()
    return true
  }

  // The Desktop's screen: 'auto' (the main one) or a screen's id.
  desktopDisplay() {
    const d = this.settings.desktopDisplay
    return Number.isInteger(d) ? d : 'auto'
  }

  setDesktopDisplay(display) {
    if (display !== 'auto' && !Number.isInteger(display)) return false
    this.settings.desktopDisplay = display
    this.saveSettings()
    this.emit('desktop', display)
    this.changed()
    return true
  }

  // Whether the Desktop's Pixelings stay over every window, or behind them
  // with only those asking you something brought to the front. Behind
  // until changed.
  desktopOnTop() {
    return this.settings.desktopOnTop === true
  }

  setDesktopOnTop(on) {
    if (typeof on !== 'boolean') return false
    this.settings.desktopOnTop = on
    this.saveSettings()
    this.emit('desktop')
    this.changed()
    return true
  }

  // Whether the Desktop shows how full each one's context is, a bar under
  // his feet. Hidden until changed.
  desktopContext() {
    return this.settings.desktopContext === true
  }

  setDesktopContext(on) {
    if (typeof on !== 'boolean') return false
    this.settings.desktopContext = on
    this.saveSettings()
    this.changed()
    return true
  }

  // How big they are on the Desktop (mode.js): 1 to 3, in half steps.
  desktopSize() {
    return desktopSizeFrom(this.settings)
  }

  setDesktopSize(size) {
    if (desktopSizeFrom({ desktopSize: size }) !== size) return false
    this.settings.desktopSize = size
    this.saveSettings()
    this.emit('desktop')
    this.changed()
    return true
  }

  // Whether they grow on the Desktop as their context fills, up to twice
  // as big (mode.js). Off until changed.
  desktopGrow() {
    return this.settings.desktopGrow === true
  }

  setDesktopGrow(on) {
    if (typeof on !== 'boolean') return false
    this.settings.desktopGrow = on
    this.saveSettings()
    this.emit('desktop')
    this.changed()
    return true
  }

  setDisplays(displays) {
    this.displays = displays
    this.changed()
  }

  open(sid) {
    const agent = this.agents.find(a => a.sid === sid)
    const target = agent && openTarget(agent)
    if (!target) return false
    if (target.focus) this.focus(target.focus, () => this.opener(target.fallback))
    else if (target.first) {
      this.opener(target.first)
      setTimeout(() => this.opener(target), VSCODE_FOCUS_MS)
    } else this.opener(target)
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
