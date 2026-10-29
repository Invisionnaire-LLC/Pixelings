// Pixelings, the app: it shows the Pixelings on the displays turned on
// (mode.js): it drives the Stream Deck itself (device.js), opens the farm
// on a screen of its own (a Xeneon Edge, say), and lets them walk along
// the bottom of a screen over your windows (the Desktop). It lives in the
// menu bar, opens the control window (the page server.js serves, shown in
// the app's own window), and starts at login. It replaces the old
// clawd-deck login agent; only one of the two should run.
//
//   npm run app        run it from the repo
//   ./install-app.sh   build Pixelings.app and put it in /Applications
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'

import { demoAgents, seeded } from './demo.js'
import { startDeck } from './device.js'
import { pickFarmDisplay } from './farm.js'
import { desktopBounds, farmBounds, pickDesktopDisplay } from './mode.js'
import { Hub } from './hub.js'
import { trayColorPng, trayPng } from './icons.js'
import { dirs } from './paths.js'
import { PORT, startServer } from './server.js'

const READ_MS = 500
const LOG_FILE = path.join(dirs().logs, 'pixelings.log')

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
let farmWin = null
let desktopWin = null
// Over every window: those asking you something, while the rest are behind.
let desktopFrontWin = null
let quitting = false
// Quitting at all, deck or not: the farm's window closing then is no choice.
let leaving = false
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

// The window, opened on its Settings (the page opens them for #settings).
function showSettings() {
  showWindow()
  const open = () => win?.webContents.executeJavaScript("location.hash = 'settings'")
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', open)
  else open()
}

// ---- The farm, on its own screen ----

function displayList() {
  const primary = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    name: d.label || `${d.size.width}×${d.size.height}`,
    width: d.size.width,
    height: d.size.height,
    primary: d.id === primary,
  }))
}

// Opens, moves or closes the farm's window for the screen it should be on
// now, as it should sit there (mode.js): full screen over the menu bar, a
// strip along an edge, or a window you move and size. Only while External
// Monitor is on.
function placeFarm() {
  const list = displayList()
  hub.setDisplays(list)
  const chosen = hub.outputs().external ? pickFarmDisplay(list, hub.farmDisplay()) : null
  const display = chosen && screen.getAllDisplays().find(d => d.id === chosen.id)
  if (!display) return closeFarm()
  const opts = hub.farmWindow()
  // A window has a frame; full screen and a strip don't, and a frame can't
  // come or go on an open window.
  const framed = opts.size === 'window'
  if (farmWin && farmWin.framed !== framed) closeFarm()
  const bounds = farmBounds(display, opts, hub.farmPlace())
  if (farmWin) {
    farmWin.setBounds(bounds)
    layFarm(opts)
    return
  }
  const win = new BrowserWindow({
    ...bounds,
    title: 'Pixelings Farm',
    frame: framed,
    resizable: framed,
    movable: framed,
    minWidth: framed ? 480 : undefined,
    minHeight: framed ? 240 : undefined,
    minimizable: framed,
    maximizable: false,
    fullscreenable: false,
    hasShadow: framed,
    skipTaskbar: true,
    enableLargerThanScreen: !framed,
    backgroundColor: '#5ca0e6',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  })
  win.framed = framed
  farmWin = win
  layFarm(opts)
  const origin = `http://127.0.0.1:${PORT}`
  win.loadURL(`${origin}/farm`)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault()
  })
  // Shown without taking the keyboard from what you are doing.
  win.once('ready-to-show', () => {
    win.setBounds(bounds)
    win.showInactive()
  })
  if (framed) {
    // Where you leave it is kept, and the screen you take it to becomes
    // the farm's.
    let timer = null
    const keep = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (win.isDestroyed()) return
        const b = win.getBounds()
        const on = screen.getDisplayMatching(b)
        hub.setFarmPlace({ display: on.id, ...b })
        if (pickFarmDisplay(displayList(), hub.farmDisplay())?.id !== on.id) hub.setFarmDisplay(on.id)
      }, 400)
    }
    win.on('moved', keep)
    win.on('resized', keep)
  }
  win.on('closed', () => {
    if (win !== farmWin) return
    farmWin = null
    // Closing the window yourself turns the Scene off.
    if (!leaving) hub.setOutput('external', false)
  })
}

// Full screen sits over that screen's menu bar and on every desktop; a
// strip floats over windows on every desktop; a window floats only if
// you keep it on top.
function layFarm(opts) {
  if (opts.size === 'window') {
    farmWin.setVisibleOnAllWorkspaces(false)
    farmWin.setAlwaysOnTop(opts.onTop, 'floating')
    return
  }
  farmWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  farmWin.setAlwaysOnTop(true, opts.size === 'full' ? 'screen-saver' : 'floating')
}

function closeFarm() {
  const win = farmWin
  farmWin = null
  win?.close()
}

// ---- The Desktop: them along the bottom of a screen ----

// A see-through window for the Desktop, on every desktop, the page in it
// (/farm?desktop=…). Clicks go through it to what is under it but for the
// Pixelings themselves (the page asks for them, desktop-preload.cjs).
function desktopWindow(bounds, page) {
  const win = new BrowserWindow({
    ...bounds,
    title: 'Pixelings Desktop',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    // Never takes the keyboard from what you are doing; a click on one of
    // them still lands the first time.
    focusable: false,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: fileURLToPath(new URL('./desktop-preload.cjs', import.meta.url)),
    },
  })
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const origin = `http://127.0.0.1:${PORT}`
  win.loadURL(`${origin}/farm?desktop=${page}`)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault()
  })
  win.once('ready-to-show', () => {
    win.setBounds(bounds)
    win.showInactive()
  })
  return win
}

// Who is asking you something, and where (the back page says): kept for a
// front window that opens later.
let desktopAsking = []

// Opens, moves or closes the Desktop's windows, just above the Dock or the
// taskbar, while the Desktop is on. Kept on top, everyone is in one window
// over every window. Otherwise that window sits among your windows (the
// one you use covers it) and a second one over every window shows just
// those asking you something, until they don't.
function placeDesktop() {
  const list = displayList()
  hub.setDisplays(list)
  const chosen = hub.outputs().desktop ? pickDesktopDisplay(list, hub.desktopDisplay()) : null
  const display = chosen && screen.getAllDisplays().find(d => d.id === chosen.id)
  if (!display) return closeDesktop()
  const bounds = desktopBounds(display, hub.desktopSize(), hub.desktopGrow())
  const onTop = hub.desktopOnTop()
  if (desktopWin) desktopWin.setBounds(bounds)
  else {
    const win = (desktopWin = desktopWindow(bounds, 'back'))
    win.on('closed', () => {
      if (win === desktopWin) desktopWin = null
    })
  }
  desktopWin.setAlwaysOnTop(onTop, 'floating')
  if (onTop) return closeDesktopFront()
  if (desktopFrontWin) return desktopFrontWin.setBounds(bounds)
  const front = (desktopFrontWin = desktopWindow(bounds, 'front'))
  front.setAlwaysOnTop(true, 'floating')
  front.webContents.on('did-finish-load', () => front.webContents.send('desktop-front', desktopAsking))
  front.on('closed', () => {
    if (front === desktopFrontWin) desktopFrontWin = null
  })
}

function closeDesktopFront() {
  const win = desktopFrontWin
  desktopFrontWin = null
  win?.close()
}

function closeDesktop() {
  closeDesktopFront()
  const win = desktopWin
  desktopWin = null
  win?.close()
}

// A page says when the mouse is over one of them (take the click) and
// when it is not (let clicks through, still sending it the moves).
ipcMain.on('desktop-catch-clicks', (e, on) => {
  const win = [desktopWin, desktopFrontWin].find(w => w && e.sender === w.webContents)
  win?.setIgnoreMouseEvents(!on, { forward: true })
})

// The back page says who is asking and where; the front page shows them.
ipcMain.on('desktop-front', (e, list) => {
  if (!desktopWin || e.sender !== desktopWin.webContents || !Array.isArray(list)) return
  desktopAsking = list
  desktopFrontWin?.webContents.send('desktop-front', list)
})

// One dragged in the front page: the back page puts him down there.
ipcMain.on('desktop-move', (e, put) => {
  if (!desktopFrontWin || e.sender !== desktopFrontWin.webContents || typeof put?.sid !== 'string') return
  desktopWin?.webContents.send('desktop-move', { sid: put.sid, x: Number(put.x), y: Number(put.y) })
})

// ---- The Stream Deck, while it's on ----

// Drives the deck while the Stream Deck is on; turning it off hands the
// deck back showing the Elgato logo (for Elgato's app, say).
function placeDeck() {
  if (hub.outputs().streamdeck) {
    deck ??= startDeck(hub, log)
    return
  }
  if (!deck) return
  const leaving = deck
  deck = null
  leaving.stop().then(() => log('Stream Deck handed back'))
}

// Starting at login, from the menu or the window (the hub says 'login').
// Only the installed app registers itself, never `npm run app`.
function registerLogin(on) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: on, openAsHidden: true })
}

function trayMenu() {
  const agents = [...hub.agents].sort((a, b) => a.seat - b.seat)
  const asking = agents.filter(a => a.kind === 'ask').length
  const items = [
    { label: 'Open Pixelings', accelerator: 'CommandOrControl+O', click: showWindow },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', click: showSettings },
    { type: 'separator' },
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
  ]
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
  leaving = true
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
  // PIXELINGS_SNAPSHOT_PAGE=/farm shoots the farm instead.
  const page = process.env.PIXELINGS_SNAPSHOT_PAGE ?? `/?select=${process.env.PIXELINGS_SNAPSHOT_SELECT ?? 'demo-0'}`
  await shot.loadURL(`http://127.0.0.1:${PORT}${page}`)
  // Long enough for the state to arrive and the keys to draw.
  await new Promise(r => setTimeout(r, Number(process.env.PIXELINGS_SNAPSHOT_WAIT ?? 2500)))
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
  // The deck, the farm and the Desktop follow their switches.
  placeDeck()
  hub.on('outputs', () => {
    placeDeck()
    placeFarm()
    placeDesktop()
  })

  // The farm and the Desktop follow their settings and the screens as they
  // come and go (and the Dock or taskbar as it moves).
  hub.on('farm', placeFarm)
  hub.on('desktop', placeDesktop)
  for (const e of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(e, () =>
      setTimeout(() => {
        placeFarm()
        placeDesktop()
      }, 500),
    )
  }
  placeFarm()
  placeDesktop()

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
