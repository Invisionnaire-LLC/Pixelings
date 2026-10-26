// Pixelings, the app: it drives the Stream Deck itself (device.js), lives
// in the menu bar, opens the control window (the page server.js serves,
// shown in the app's own window), and starts at login. It replaces the old
// clawd-deck login agent; only one of the two should run.
//
//   npm run app        run it from the repo
//   ./install-app.sh   build Pixelings.app and put it in /Applications
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron'

import { demoAgents, seeded } from './demo.js'
import { startDeck } from './device.js'
import { Hub, IDLE_CHOICES } from './hub.js'
import { trayColorPng, trayPng } from './icons.js'
import { dirs } from './paths.js'
import { FLASH_COLORS, FLASH_EVENT_NAMES, FLASH_EVENTS, FLASH_OPTIONS, FLASH_STYLES, STYLE_OPTION } from './render.js'
import { PORT, startServer } from './server.js'

const READ_MS = 500
const LOG_FILE = path.join(dirs().logs, 'pixelings.log')
const KIND_NAMES = { ask: 'Asking', done: 'Your move', working: 'Working', compacting: 'Compacting', idle: 'Idle' }
// Sessions not in Claude Code say where they run.
const TOOL_NAMES = { codex: 'Codex', grokbot: 'Grok Bot' }
const idleChoiceName = m => (m === 'never' ? 'Never' : m < 60 ? `${m} Minute${m === 1 ? '' : 's'}` : `${m / 60} Hour${m === 60 ? '' : 's'}`)
const BRIGHTNESS = [10, 25, 50, 70, 100]
const FLASH_STYLE_NAMES = { screen: 'Whole Key', pulse: 'Fade In and Out', frame: 'Border' }

function log(...a) {
  const line = `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}\n`
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, line)
  } catch {
    // Logging is never worth failing over.
  }
  if (!app.isPackaged) process.stdout.write(line)
}

// Screenshot mode (npm run screenshot): the demo deck in the window, saved
// to this file, then quit; no Stream Deck, menu bar or login item, so it
// runs beside the real app.
const SNAPSHOT = process.env.PIXELINGS_SNAPSHOT

// One Pixelings at a time: a second launch shows the first one's window.
if (!SNAPSHOT && !app.requestSingleInstanceLock()) app.quit()

let hub
let deck
let tray
let win = null
let quitting = false
let trayAsking = false

// The tray icon outside macOS: Clawd in colour, a red dot when asking.
function colorIcon(asking) {
  return nativeImage.createFromBuffer(trayColorPng(asking, 32), { scaleFactor: 2 })
}

async function pickFolder() {
  const res = await dialog.showOpenDialog(win ?? undefined, {
    title: 'Folder for the new Claude session',
    properties: ['openDirectory', 'createDirectory'],
  })
  return res.canceled ? null : res.filePaths[0]
}

function showWindow() {
  if (win) {
    win.show()
    win.focus()
    return
  }
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 420,
    minHeight: 480,
    title: 'Pixelings',
    // macOS: the page is the title bar. Elsewhere: the usual frame, no menu.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0f',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  const origin = `http://127.0.0.1:${PORT}`
  win.loadURL(process.platform === 'darwin' ? `${origin}/?app=1` : `${origin}/`)
  // The window is the control page and nothing else.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault()
  })
  win.once('ready-to-show', () => win.show())
  app.dock?.show()
  win.on('closed', () => {
    win = null
    // Back to living in the menu bar.
    app.dock?.hide()
  })
}

async function newAgent() {
  const folder = await pickFolder()
  if (folder && !hub.newAgent(folder)) dialog.showErrorBox('Pixelings', 'That is not a folder on this Mac.')
}

// Starting at login, from the menu or the window (the hub says 'login').
// Only the installed app registers itself, never `npm run app`.
function registerLogin(on) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true })
}

function trayMenu() {
  const agents = [...hub.agents].sort((a, b) => a.seat - b.seat)
  const asking = agents.filter(a => a.kind === 'ask').length
  const flash = hub.flashSettings()
  const items = [
    {
      label: hub.deck.connected ? `${hub.deck.product} connected` : 'No Stream Deck plugged in',
      enabled: false,
    },
    { type: 'separator' },
  ]
  if (agents.length === 0) items.push({ label: 'No Claude Code sessions running', enabled: false })
  for (const a of agents.slice(0, 20)) {
    items.push({
      label: `${a.title}`,
      sublabel: `${KIND_NAMES[a.kind] ?? a.kind}${TOOL_NAMES[a.tool] ? ` · ${TOOL_NAMES[a.tool]}` : ''}`,
      toolTip: a.cwd,
      click: () => hub.open(a.sid),
    })
  }
  if (agents.length > 20) items.push({ label: `and ${agents.length - 20} more`, enabled: false })
  items.push(
    { type: 'separator' },
    { label: 'Open Pixelings', accelerator: 'CommandOrControl+O', click: showWindow },
    { label: 'New Agent…', accelerator: 'CommandOrControl+N', click: newAgent },
    {
      label: 'Brightness',
      submenu: BRIGHTNESS.map(v => ({
        label: `${v}%`,
        type: 'radio',
        checked: hub.settings.brightness === v,
        click: () => hub.setBrightness(v),
      })),
    },
    {
      // One submenu for each thing a key can flash for.
      label: 'Flash',
      submenu: FLASH_EVENTS.map(event => {
        const f = flash[event]
        return {
          label: FLASH_EVENT_NAMES[event],
          sublabel: f.on ? `${FLASH_STYLE_NAMES[f.style]}, ${f.color}` : 'Off',
          submenu: [
            { label: 'Flash', type: 'checkbox', checked: f.on, click: item => hub.setFlash({ event, on: item.checked }) },
            { type: 'separator' },
            ...FLASH_STYLES.map(style => ({
              label: FLASH_STYLE_NAMES[style],
              type: 'radio',
              checked: f.style === style,
              enabled: f.on,
              click: () => hub.setFlash({ event, style }),
            })),
            // The style's own option (strength or size), then speed.
            ...[STYLE_OPTION[f.style], 'speed'].flatMap(option => [
              { type: 'separator' },
              ...Object.keys(FLASH_OPTIONS[option]).map(choice => ({
                label: `${option === 'speed' ? 'Speed' : option === 'size' ? 'Size' : 'Strength'}: ${choice[0].toUpperCase()}${choice.slice(1)}`,
                type: 'radio',
                checked: f[option] === choice,
                enabled: f.on,
                click: () => hub.setFlash({ event, [option]: choice }),
              })),
            ]),
            { type: 'separator' },
            ...Object.keys(FLASH_COLORS).map(color => ({
              label: color[0].toUpperCase() + color.slice(1),
              type: 'radio',
              checked: f.color === color,
              enabled: f.on,
              click: () => hub.setFlash({ event, color }),
            })),
          ],
        }
      }),
    },
    {
      // Waiting on you is not idle: an agent turns idle half an hour after
      // he finishes, then this clock starts.
      label: 'Hide Idle Agents After',
      submenu: IDLE_CHOICES.map(minutes => ({
        label: idleChoiceName(minutes),
        type: 'radio',
        checked: hub.hideIdle() === minutes,
        click: () => hub.setHideIdle(minutes),
      })),
    },
    {
      // Sessions a script or another agent started, and Grok bots' work
      // for other bots, get keys too.
      label: 'Show Agents Started by Other Agents',
      type: 'checkbox',
      checked: hub.agentStarted(),
      click: item => hub.setAgentStarted(item.checked),
    },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: hub.openAtLogin(),
      enabled: app.isPackaged,
      click: item => hub.setOpenAtLogin(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit Pixelings', accelerator: 'CommandOrControl+Q', click: () => app.quit() },
  )
  return { menu: Menu.buildFromTemplate(items), asking, count: agents.length }
}

function updateTray() {
  const { menu, asking, count } = trayMenu()
  tray.setContextMenu(menu)
  // Quiet unless someone needs you: a count beside the icon on macOS, a red
  // dot on it elsewhere (other trays show no text).
  if (process.platform === 'darwin') tray.setTitle(asking ? ` ${asking}!` : '')
  else if (Boolean(asking) !== trayAsking) {
    trayAsking = Boolean(asking)
    tray.setImage(colorIcon(trayAsking))
  }
  tray.setToolTip(`Pixelings: ${count} agent${count === 1 ? '' : 's'}${asking ? `, ${asking} asking` : ''}`)
}

app.on('second-instance', showWindow)
app.on('activate', showWindow)
app.on('window-all-closed', () => {
  // Closing the window leaves the app in the menu bar.
})

app.on('before-quit', e => {
  if (quitting || !deck) return
  e.preventDefault()
  quitting = true
  deck.stop().finally(() => app.quit())
})

async function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-snapshot-'))
  app.setPath('userData', dir)
  hub = new Hub({
    readAgents: now => demoAgents(now),
    readCodex: null,
    readGrokBot: null,
    castFile: path.join(dir, 'cast.json'),
    settingsFile: path.join(dir, 'settings.json'),
    rand: seeded(20261023),
    exec: () => {},
  })
  hub.appInfo = { version: app.getVersion(), loginAvailable: false }
  hub.refresh()
  hub.setDeck(true, 'Stream Deck MK.2')
  setInterval(() => hub.refresh(), READ_MS)
  startServer(hub, PORT, log)

  const shot = new BrowserWindow({
    width: Number(process.env.PIXELINGS_SNAPSHOT_WIDTH ?? 1280),
    height: Number(process.env.PIXELINGS_SNAPSHOT_HEIGHT ?? 800),
    show: false,
    backgroundColor: '#0b0b0f',
    webPreferences: { contextIsolation: true, sandbox: true, offscreen: false },
  })
  await shot.loadURL(`http://127.0.0.1:${PORT}/?select=${process.env.PIXELINGS_SNAPSHOT_SELECT ?? 'demo-0'}`)
  // Long enough for the state to arrive and the keys to draw.
  await new Promise(r => setTimeout(r, 2500))
  const image = await shot.webContents.capturePage()
  fs.writeFileSync(SNAPSHOT, image.toPNG())
  log(`screenshot: ${SNAPSHOT} (${image.getSize().width}x${image.getSize().height})`)
  app.exit(0)
}

app.whenReady().then(() => {
  if (SNAPSHOT) return snapshot()
  app.dock?.hide()
  log(`Pixelings ${app.getVersion()} started`)

  hub = new Hub({
    pickFolder,
    // Electron opens links and folders the same way on every system.
    opener: target => (target.url ? shell.openExternal(target.url) : shell.openPath(target.path)),
  })
  hub.appInfo = { version: app.getVersion(), loginAvailable: app.isPackaged }
  hub.on('login', registerLogin)
  // Said again at every start, so a reinstalled or moved app is still the
  // one that starts at login (on until turned off).
  registerLogin(hub.openAtLogin())
  hub.refresh()
  setInterval(() => hub.refresh(), READ_MS)

  const server = startServer(hub, PORT, log)
  server.on('error', e => {
    dialog.showErrorBox(
      'Pixelings',
      `The control window could not start (${e.code ?? e.message}). If the old clawd-deck login agent still runs, host/deck/install-app.sh removes it`,
    )
  })
  deck = startDeck(hub, log)

  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromBuffer(trayPng().png, { scaleFactor: 2 })
    icon.setTemplateImage(true)
    tray = new Tray(icon)
  } else {
    tray = new Tray(colorIcon(false))
    // On Windows a left click opens the window; the menu is on the right.
    tray.on('click', showWindow)
  }
  updateTray()
  let pending = null
  hub.on('change', () => {
    clearTimeout(pending)
    pending = setTimeout(updateTray, 200)
  })

  // Opened by hand: show the window. Started at login: stay in the menu bar.
  if (!app.getLoginItemSettings().wasOpenedAtLogin) showWindow()
})
