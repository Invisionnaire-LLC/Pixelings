import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { Hub, openTarget, systemOpener, VSCODE_FOCUS_MS, vscodeLink } from './hub.js'
import { allowed, handler } from './server.js'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'))
// A flash's options until changed.
const OPTS = { strength: 'strong', size: 'medium', speed: 'normal' }
// Idle since just now, so none has been idle long enough to leave the deck.
const agent = (sid, over = {}) => ({
  sid,
  kind: 'idle',
  since: Date.now(),
  startedAt: 0,
  title: sid,
  folder: 'repo',
  cwd: '/tmp',
  app: 'claude-desktop',
  hostSessionId: `local_${sid}`,
  ...over,
})

function makeHub(agents) {
  const dir = tmp()
  const calls = []
  const hub = new Hub({
    readAgents: () => agents.map(a => ({ ...a })),
    readCodex: null,
    readGrokBot: null,
    castFile: path.join(dir, 'cast.json'),
    settingsFile: path.join(dir, 'settings.json'),
    exec: (cmd, args, cb) => {
      calls.push([cmd, ...args])
      cb?.(null, '/Users/me/project/\n')
    },
    opener: target => calls.push(['open', target.url ?? target.path]),
  })
  hub.refresh()
  return { hub, calls, dir }
}

test('a key opens the Claude app link, VS Code by its link, or the folder', () => {
  assert.deepEqual(openTarget(agent('a1')), { url: 'claude://code/continue?session=local_a1' })
  assert.deepEqual(openTarget(agent('a', { app: 'claude-vscode', cwd: '/x/my app' })), { url: 'vscode://file/x/my%20app' })
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x' })), { path: '/x' })
  assert.deepEqual(openTarget(agent('a', { hostSessionId: 'local_../../x', cwd: '/y' })), { path: '/y' })
})

const VSCODE_SID = 'f7f5e305-163e-489d-8b62-746e18f4a494'

test("a VS Code session opens by the Claude extension's link, after its folder's window", () => {
  assert.deepEqual(openTarget(agent(VSCODE_SID, { app: 'claude-vscode', cwd: '/x/my app' })), {
    url: `vscode://anthropic.claude-code/open?session=${VSCODE_SID}`,
    first: { url: 'vscode://file/x/my%20app' },
  })
  assert.deepEqual(
    openTarget(agent('../x&prompt=rm', { app: 'claude-vscode', cwd: '/x' })),
    { url: 'vscode://file/x' },
    'an id that is not a session id only opens the folder',
  )
})

test('opening a VS Code session puts its window in front, then shows the session', () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const { hub, calls } = makeHub([agent(VSCODE_SID, { app: 'claude-vscode', cwd: '/x' })])
    calls.length = 0
    assert.equal(hub.open(VSCODE_SID), true)
    assert.deepEqual(calls, [['open', 'vscode://file/x']])
    mock.timers.tick(VSCODE_FOCUS_MS)
    assert.deepEqual(calls, [
      ['open', 'vscode://file/x'],
      ['open', `vscode://anthropic.claude-code/open?session=${VSCODE_SID}`],
    ])
  } finally {
    mock.timers.reset()
  }
})

test("VS Code's link works for Windows folders too", () => {
  assert.equal(vscodeLink('C:\\Users\\me\\code'), 'vscode://file/C:/Users/me/code')
})

test("a folder name can't put shell characters into VS Code's link", () => {
  const link = vscodeLink('C:\\Users\\me\\R&D "x" | <y> ^z %PATH%')
  const rest = link.slice('vscode://file/'.length)
  assert.doesNotMatch(rest, /[&|<>^" ]/)
  assert.doesNotMatch(rest, /%(?![0-9A-F]{2})/, 'every % is an encoded character')
  assert.equal(decodeURIComponent(link.split('/').pop()), 'R&D "x" | <y> ^z %PATH%')
})

test("each system's own opener", () => {
  const calls = []
  const exec = (cmd, args) => calls.push([cmd, ...args])
  systemOpener(exec, 'darwin')({ url: 'claude://x' })
  systemOpener(exec, 'win32')({ url: 'claude://x' })
  systemOpener(exec, 'win32')({ path: 'C:\\x' })
  systemOpener(exec, 'linux')({ path: '/x' })
  assert.deepEqual(calls, [
    ['open', 'claude://x'],
    ['rundll32', 'url.dll,FileProtocolHandler', 'claude://x'],
    ['explorer', 'C:\\x'],
    ['xdg-open', '/x'],
  ])
})

test('the hub casts and seats the live sessions, oldest first', () => {
  const { hub } = makeHub([agent('b', { startedAt: 2 }), agent('a', { startedAt: 1 })])
  const seats = Object.fromEntries(hub.agents.map(a => [a.sid, a.seat]))
  assert.deepEqual(seats, { a: 0, b: 1 })
  assert.ok(hub.agents.every(a => a.look?.hat))
})

test('the hub says when something changed, and only then', () => {
  const { hub } = makeHub([agent('a')])
  let changes = 0
  hub.on('change', () => changes++)
  hub.refresh()
  assert.equal(changes, 0)
  hub.setDeck(true, 'Stream Deck MK.2')
  assert.equal(changes, 1)
})

test('moving and restyling go through the cast and are saved', () => {
  const { hub, dir } = makeHub([agent('a', { startedAt: 1 }), agent('b', { startedAt: 2 })])
  assert.equal(hub.move('a', 1), true)
  assert.equal(hub.agents.find(x => x.sid === 'a').seat, 1)
  assert.equal(hub.agents.find(x => x.sid === 'b').seat, 0)
  assert.equal(hub.restyle('a', { hat: 'crown' }), true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'cast.json'))).a.look.hat, 'crown')
  assert.equal(hub.restyle('a', { hat: 'nope' }), false)
  assert.equal(hub.move('gone', 3), false)
})

test('brightness is checked, saved and announced', () => {
  const { hub, dir } = makeHub([])
  let told
  hub.on('brightness', v => (told = v))
  assert.equal(hub.setBrightness(30), true)
  assert.equal(told, 30)
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).brightness, 30)
  assert.equal(hub.setBrightness(101), false)
  assert.equal(hub.setBrightness('50'), false)
})

test('only questions flash until changed; each flash is set on its own, and saved', () => {
  const { hub, dir } = makeHub([])
  assert.deepEqual(hub.flashSettings().question, { on: true, style: 'screen', color: 'white', ...OPTS })
  assert.equal(hub.flashSettings().finished.on, false)
  assert.deepEqual(hub.flash(), { question: { style: 'screen', color: 'white', ...OPTS } })
  assert.equal(hub.setFlash({ event: 'question', style: 'frame', color: 'pink' }), true)
  assert.deepEqual(hub.state().flash.question, { on: true, style: 'frame', color: 'pink', ...OPTS })
  assert.equal(hub.setFlash({ event: 'finished', on: true }), true)
  assert.equal(hub.setFlash({ event: 'question', on: false }), true)
  assert.deepEqual(hub.flash(), { finished: { style: 'pulse', color: 'teal', ...OPTS } })
  assert.deepEqual(hub.flashSettings().question, { on: false, style: 'frame', color: 'pink', ...OPTS }, 'off keeps the style and colour')
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json')))
  assert.deepEqual(saved.flash.question, { on: false, style: 'frame', color: 'pink', ...OPTS })
  assert.equal(saved.flash.finished.on, true)
})

test('the question flash chosen before there were others carries over', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ flashQuestions: false, flashStyle: 'frame', flashColor: 'pink' }))
  const hub = new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  assert.deepEqual(hub.flashSettings().question, { on: false, style: 'frame', color: 'pink', ...OPTS })
  hub.setFlash({ event: 'waiting', on: true })
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 's.json')))
  assert.equal(saved.flashQuestions, undefined)
  assert.deepEqual(saved.flash.question, { on: false, style: 'frame', color: 'pink', ...OPTS })
})

test('a flash change naming anything unknown is refused whole', () => {
  const { hub } = makeHub([])
  const q = c => ({ event: 'question', ...c })
  for (const change of [{}, null, 'on', { on: true }, { event: 'lunch', on: true }, { event: 'toString', on: true }, q({}), q({ on: 'yes' }), q({ style: 'strobe' }), q({ color: 'toString' }), q({ color: 'pink', style: 'nope' })]) {
    assert.equal(hub.setFlash(change), false, JSON.stringify(change))
  }
  assert.deepEqual(hub.flashSettings().question, { on: true, style: 'screen', color: 'white', ...OPTS })
  // Settings saved by hand with something unknown read as the defaults.
  hub.settings.flash = { question: { on: 'yes', style: 'strobe', color: 'plaid' } }
  assert.deepEqual(hub.flash(), { question: { style: 'screen', color: 'white', ...OPTS } })
})

test('the farm is on automatic until a screen is chosen, and says so', () => {
  const dir = tmp()
  const make = () => new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  const hub = make()
  assert.equal(hub.farmDisplay(), 'auto')
  const told = []
  hub.on('farm', d => told.push(d))
  for (const bad of ['left', 'off', 1.5, null, {}]) assert.equal(hub.setFarmDisplay(bad), false, 'the mode turns it off now')
  assert.equal(hub.setFarmDisplay('auto'), true)
  assert.equal(hub.setFarmDisplay(42), true)
  assert.deepEqual(told, ['auto', 42])
  assert.equal(make().farmDisplay(), 42, 'kept')
  hub.setDisplays([{ id: 42, name: 'XENEON EDGE', width: 2560, height: 720, primary: false }])
  assert.equal(hub.state().displays[0].name, 'XENEON EDGE')
  assert.equal(hub.state().farmDisplay, 42)
})

test('the Pixelings show on the Stream Deck until other displays are turned on, ones that are built', () => {
  const dir = tmp()
  const make = () => new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  const hub = make()
  assert.deepEqual(hub.outputs(), { streamdeck: true, external: false, desktop: false })
  const told = []
  hub.on('outputs', o => told.push(o))
  for (const [output, on] of [['main', true], ['esp32', true], ['external', 'yes'], [null, true]]) assert.equal(hub.setOutput(output, on), false)
  assert.equal(hub.setOutput('external', true), true)
  assert.deepEqual(told, [{ streamdeck: true, external: true, desktop: false }])
  assert.equal(hub.setOutput('streamdeck', false), true)
  assert.equal(hub.setOutput('desktop', true), true)
  assert.deepEqual(hub.state().outputs, { streamdeck: false, external: true, desktop: true })
  assert.deepEqual(make().outputs(), { streamdeck: false, external: true, desktop: true }, 'kept')
  // A farm turned off before, back when it had an Off, shows on automatic.
  hub.settings.farmDisplay = 'off'
  assert.equal(hub.farmDisplay(), 'auto')
})

test("the farm's window is full screen until a window or a strip is chosen, and where it was left is kept", () => {
  const dir = tmp()
  const make = () => new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  const hub = make()
  assert.equal(hub.farmWindow().size, 'full')
  let told = 0
  hub.on('farm', () => told++)
  for (const bad of [{}, { size: 'huge' }, { onTop: 1 }, { stripHeight: 'toString' }, { stripEdge: 'left' }, { colour: 'red' }]) assert.equal(hub.setFarmWindow(bad), false)
  assert.equal(hub.setFarmWindow({ size: 'strip', stripHeight: 'large', stripEdge: 'top' }), true)
  assert.equal(hub.setFarmWindow({ onTop: false }), true)
  assert.equal(told, 2)
  assert.deepEqual(make().farmWindow(), { size: 'strip', onTop: false, stripHeight: 'large', stripEdge: 'top' })
  hub.setFarmPlace({ display: 4, x: 1, y: 2, width: 900, height: 400 })
  assert.equal(told, 2, 'moving the window changes nothing else')
  assert.deepEqual(make().farmPlace(), { display: 4, x: 1, y: 2, width: 900, height: 400 })
})

test('everyone lives on the farm until the office or the mall is chosen', () => {
  const dir = tmp()
  const make = () => new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  const hub = make()
  assert.equal(hub.farmScene(), 'farm')
  for (const bad of ['moon', 1, null, {}]) assert.equal(hub.setFarmScene(bad), false)
  assert.equal(hub.setFarmScene('mall'), true)
  assert.equal(hub.state().farmScene, 'mall')
  assert.equal(make().farmScene(), 'mall', 'kept')
})

test('a new agent needs a real folder, and goes through the Claude app link', () => {
  const { hub, calls } = makeHub([])
  const dir = tmp()
  assert.equal(hub.newAgent(dir), true)
  assert.deepEqual(calls.at(-1), ['open', `claude://code/new?folder=${encodeURIComponent(dir)}`])
  assert.equal(hub.newAgent('/no/such/folder'), false)
  assert.equal(hub.newAgent('relative/path'), false)
})

test('choosing a folder returns what the picker said, or nothing where there is none', async () => {
  const { hub } = makeHub([])
  // Without the app, only macOS has a picker to ask.
  assert.equal(await hub.chooseFolder(), process.platform === 'darwin' ? '/Users/me/project' : null)
})

test('the server only answers its own page', () => {
  const req = (method, headers) => ({ method, headers })
  const json = { 'content-type': 'application/json' }
  assert.equal(allowed(req('GET', { host: '127.0.0.1:47733' }), 47733), true)
  assert.equal(allowed(req('GET', { host: 'evil.example:47733' }), 47733), false, 'DNS rebinding')
  assert.equal(allowed(req('POST', { host: 'localhost:47733', ...json, origin: 'http://localhost:47733' }), 47733), true)
  assert.equal(allowed(req('POST', { host: 'localhost:47733', ...json, origin: 'https://evil.example' }), 47733), false)
  assert.equal(allowed(req('POST', { host: 'localhost:47733', 'content-type': 'text/plain' }), 47733), false)
  assert.equal(allowed(req('DELETE', { host: 'localhost:47733' }), 47733), false)
})

test('the server serves the page and takes actions', async () => {
  const { hub } = makeHub([agent('a', { startedAt: 1 }), agent('b', { startedAt: 2 })])
  const server = http.createServer(handler(hub, 0))
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  // The handler checks the port it was given; serve this one.
  server.removeAllListeners('request')
  server.on('request', handler(hub, port))
  const base = `http://127.0.0.1:${port}`

  const page = await fetch(`${base}/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<title>/)
  assert.equal((await fetch(`${base}/lib/render.js`)).status, 200)
  assert.equal((await fetch(`${base}/icon.png`)).headers.get('content-type'), 'image/png')
  assert.equal((await fetch(`${base}/../agents.js`)).status, 404)
  const state = await (await fetch(`${base}/api/state`)).json()
  assert.equal(state.agents.length, 2)

  const post = (p, body) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await post('/api/move', { sid: 'a', seat: 5 })).status, 200)
  assert.equal(hub.agents.find(x => x.sid === 'a').seat, 5)
  assert.equal((await post('/api/look', { sid: 'a', change: 'reroll' })).status, 200)
  assert.equal((await post('/api/brightness', { value: 500 })).status, 400)
  assert.equal((await post('/api/flash', { event: 'question', on: false, color: 'blue' })).status, 200)
  assert.deepEqual(hub.flashSettings().question, { on: false, style: 'screen', color: 'blue', ...OPTS })
  assert.equal((await post('/api/flash', { event: 'question', style: 'strobe' })).status, 400)
  assert.equal((await post('/api/hide-idle', { minutes: 1 })).status, 200)
  assert.equal(hub.hideIdle(), 1)
  assert.equal((await post('/api/hide-idle', { minutes: 2 })).status, 400)
  assert.equal((await post('/api/open-at-login', { on: false })).status, 200)
  assert.equal(hub.openAtLogin(), false)
  assert.equal((await post('/api/open-at-login', { on: 'no' })).status, 400)
  assert.equal((await fetch(`${base}/farm`)).status, 200)
  assert.equal((await fetch(`${base}/farm.js`)).status, 200)
  assert.equal((await fetch(`${base}/lib/farm.js`)).status, 200)
  assert.equal((await post('/api/farm-display', { display: 7 })).status, 200)
  assert.equal(hub.farmDisplay(), 7)
  assert.equal((await post('/api/farm-display', { display: 'left' })).status, 400)
  assert.equal((await post('/api/output', { output: 'external', on: true })).status, 200)
  assert.equal(hub.outputs().external, true)
  assert.equal((await post('/api/output', { output: 'esp32', on: true })).status, 400)
  assert.equal(hub.desktopDisplay(), 'auto')
  assert.equal((await post('/api/desktop-display', { display: 7 })).status, 200)
  assert.equal(hub.state().desktopDisplay, 7)
  assert.equal((await post('/api/desktop-display', { display: 'left' })).status, 400)
  assert.equal(hub.state().desktopOnTop, false)
  assert.equal((await post('/api/desktop-on-top', { on: true })).status, 200)
  assert.equal(hub.desktopOnTop(), true)
  assert.equal((await post('/api/desktop-on-top', { on: 'yes' })).status, 400)
  assert.equal(hub.state().desktopContext, false)
  assert.equal((await post('/api/desktop-context', { on: true })).status, 200)
  assert.equal(hub.desktopContext(), true)
  assert.equal((await post('/api/desktop-context', { on: 1 })).status, 400)
  assert.equal(hub.state().desktopSize, 1.5)
  assert.equal((await post('/api/desktop-size', { size: 1 })).status, 200)
  assert.equal(hub.desktopSize(), 1)
  for (const size of [0.5, 4, 1.3, 'big']) assert.equal((await post('/api/desktop-size', { size })).status, 400)
  assert.equal(hub.state().desktopGrow, false)
  assert.equal((await post('/api/desktop-grow', { on: true })).status, 200)
  assert.equal(hub.desktopGrow(), true)
  assert.equal((await post('/api/desktop-grow', { on: 'yes' })).status, 400)
  assert.equal((await post('/api/farm-window', { size: 'window' })).status, 200)
  assert.equal(hub.farmWindow().size, 'window')
  assert.equal((await post('/api/farm-window', { size: 'huge' })).status, 400)
  assert.equal((await fetch(`${base}/lib/mode.js`)).status, 200)
  assert.equal((await post('/api/farm-scene', { scene: 'office' })).status, 200)
  assert.equal(hub.farmScene(), 'office')
  assert.equal((await post('/api/farm-scene', { scene: 'moon' })).status, 400)
  const text = await fetch(`${base}/api/move`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
  assert.equal(text.status, 403)
  server.close()
})

test("the app's own folder picker is used when given", async () => {
  const hub = new Hub({ readAgents: () => [], readCodex: null, readGrokBot: null, castFile: path.join(tmp(), 'c.json'), settingsFile: path.join(tmp(), 's.json'), pickFolder: async () => '/picked' })
  assert.equal(await hub.chooseFolder(), '/picked')
})

test('Codex threads join the deck, seated and dressed like everyone, as a Codex dot', () => {
  const dir = tmp()
  const hub = new Hub({
    readAgents: () => [agent('c1', { startedAt: 1 })],
    readCodex: () => [{ ...agent('x1', { startedAt: 2 }), tool: 'codex', app: 'codex-app', codexThread: '01a16b54-790d-7e43-b804-a7ec7aa1cab7' }],
    readGrokBot: null,
    castFile: path.join(dir, 'cast.json'),
    settingsFile: path.join(dir, 'settings.json'),
    exec: () => {},
  })
  hub.refresh()
  const x = hub.agents.find(a => a.sid === 'x1')
  assert.equal(x.seat, 1)
  assert.equal(x.look.species, 'codex')
  assert.equal(hub.agents.find(a => a.sid === 'c1').look.species, 'clawd')
  assert.equal(hub.state().agents.find(a => a.sid === 'x1').tool, 'codex')
})

test('a broken Codex reader leaves Claude Code sessions showing', () => {
  const dir = tmp()
  const hub = new Hub({ readAgents: () => [agent('c1')], readCodex: () => { throw new Error('no') }, readGrokBot: null, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  hub.refresh()
  assert.equal(hub.agents.length, 1)
})

test('a Codex thread opens in the Codex app by its link, a terminal one by its folder', () => {
  const id = '01a16b54-790d-7e43-b804-a7ec7aa1cab7'
  assert.deepEqual(openTarget({ app: 'codex-app', codexThread: id, cwd: '/x' }), { url: `codex://threads/${id}` })
  assert.deepEqual(openTarget({ app: 'codex-cli', codexThread: id, cwd: '/x' }), { path: '/x' })
  assert.deepEqual(openTarget({ app: 'codex-app', codexThread: '../evil', cwd: '/x' }), { path: '/x' })
})

const GHOSTTY = { app: 'ghostty', bundle: '/Applications/Ghostty.app', tty: '/dev/ttys003' }
const CURSOR = { app: 'cursor', bundle: '/Applications/Cursor.app' }

test('a terminal session opens its tab in its terminal, with the terminal itself to fall back on', () => {
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x', title: 'Easel', host: GHOSTTY })), {
    focus: { ...GHOSTTY, tmux: undefined, cwd: '/x', title: 'Easel' },
    fallback: { path: '/Applications/Ghostty.app' },
  })
  const tmux = { pane: '%3', client: '/dev/ttys007' }
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x', host: { ...GHOSTTY, tmux } })).focus.tmux, tmux)
})

test('a Claude Code session in Cursor opens in Cursor, by its own links', () => {
  assert.deepEqual(openTarget(agent(VSCODE_SID, { app: 'claude-vscode', cwd: '/x/my app', host: CURSOR })), {
    url: `cursor://anthropic.claude-code/open?session=${VSCODE_SID}`,
    first: { url: 'cursor://file/x/my%20app' },
  })
})

test("in an editor's own terminal, or in any other app, it opens there", () => {
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x', host: CURSOR })), { url: 'cursor://file/x' })
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x', host: { app: 'vscode', bundle: '/V.app' } })), { url: 'vscode://file/x' })
  assert.deepEqual(openTarget(agent('a', { app: 'cli', cwd: '/x', host: { app: 'app', bundle: '/Applications/Warp.app' } })), {
    path: '/Applications/Warp.app',
  })
  const id = '01a16b54-790d-7e43-b804-a7ec7aa1cab7'
  assert.deepEqual(openTarget({ app: 'codex-cli', codexThread: id, cwd: '/x', host: GHOSTTY }).focus.app, 'ghostty')
})

test("pressing a terminal session shows its tab, or brings its terminal forward when that can't", () => {
  const opened = []
  const focused = []
  let works = true
  const hub = new Hub({
    readAgents: () => [agent('g', { app: 'cli', cwd: '/x', title: 'Easel', host: GHOSTTY })],
    readCodex: null,
    readGrokBot: null,
    castFile: path.join(tmp(), 'c.json'),
    settingsFile: path.join(tmp(), 's.json'),
    hosts: null,
    opener: target => opened.push(target.url ?? target.path),
    focus: (focus, failed) => (focused.push(focus.title), works || failed()),
  })
  hub.refresh()
  assert.equal(hub.open('g'), true)
  assert.deepEqual(focused, ['Easel'])
  assert.deepEqual(opened, [], 'not Finder, not the folder')
  works = false
  hub.open('g')
  assert.deepEqual(opened, ['/Applications/Ghostty.app'])
})

test('the hub gives every agent its host before the page sees them', () => {
  const seen = []
  const hub = new Hub({
    readAgents: () => [agent('h', { pid: 42 })],
    readCodex: null,
    readGrokBot: null,
    castFile: path.join(tmp(), 'c.json'),
    settingsFile: path.join(tmp(), 's.json'),
    hosts: { attach: agents => (seen.push(...agents.map(a => a.sid)), agents.forEach(a => (a.host = GHOSTTY))) },
  })
  hub.refresh()
  assert.deepEqual(seen, ['h'])
  assert.equal(hub.agents[0].host, GHOSTTY)
  const broken = new Hub({
    readAgents: () => [agent('h')],
    readCodex: null,
    readGrokBot: null,
    castFile: path.join(tmp(), 'c.json'),
    settingsFile: path.join(tmp(), 's.json'),
    hosts: { attach: () => { throw new Error('no ps') } },
  })
  broken.refresh()
  assert.equal(broken.agents.length, 1, 'still on the deck')
})

test("a T3 Code thread's key opens it in T3 Code", () => {
  const env = 'a9880d54-43db-4de8-b34b-df47f01b3df7'
  const thread = '2f5d5a92-5afc-4104-a8d0-bd895422e99e'
  assert.deepEqual(openTarget({ app: 't3-code', t3Env: env, t3Thread: thread, cwd: '/x' }), { url: `t3code://threads/${env}/${thread}` })
  assert.deepEqual(openTarget({ app: 't3-code', t3Env: env, t3Thread: '../evil', cwd: '/x' }), { path: '/x' })
})

const BOT = '4ef96ce8-d1bf-4442-8ed7-e5053fada539'
const bot = over => ({ ...agent(`grokbot-${BOT}`, { startedAt: 3 }), tool: 'grokbot', app: 'grok-bot', grokBot: BOT, folder: '', cwd: undefined, shape: 'hex', color: 'cyan', ...over })

test('Grok Bot bots join the deck, seated like everyone, each in its own shape and colour', () => {
  const dir = tmp()
  const hub = new Hub({
    readAgents: () => [agent('c1', { startedAt: 1 })],
    readCodex: null,
    readGrokBot: () => [bot()],
    castFile: path.join(dir, 'cast.json'),
    settingsFile: path.join(dir, 'settings.json'),
    exec: () => {},
  })
  hub.refresh()
  const g = hub.agents.find(a => a.tool === 'grokbot')
  assert.equal(g.seat, 1)
  assert.equal(g.look.species, 'grokbot')
  assert.deepEqual([g.look.shape, g.look.color], ['hex', 'cyan'])
  assert.equal(hub.state().agents.find(a => a.tool === 'grokbot').app, 'grok-bot')
})

test('a broken Grok Bot reader leaves the rest showing', () => {
  const dir = tmp()
  const hub = new Hub({ readAgents: () => [agent('c1')], readCodex: null, readGrokBot: () => { throw new Error('no') }, castFile: path.join(dir, 'c.json'), settingsFile: path.join(dir, 's.json') })
  hub.refresh()
  assert.equal(hub.agents.length, 1)
})

test('a Grok Bot bot opens in the Grok Bot app by its link, and nothing else', () => {
  assert.deepEqual(openTarget(bot()), { url: `grokbot://app/v1/agent?id=${BOT}` })
  assert.equal(openTarget(bot({ grokBot: '../evil&x=1' })), null)
  assert.equal(openTarget(bot({ grokBot: undefined, cwd: '/x' })), null)
})

test('an agent idle longer than the time chosen leaves the deck; waiting on you is not idle', () => {
  const dir = tmp()
  const NOW = 10 * 60 * 60 * 1000
  const H = 60 * 60 * 1000
  const codexAsked = []
  const make = () =>
    new Hub({
      readAgents: () => [
        agent('busy', { kind: 'working', since: 0 }),
        agent('waits', { kind: 'done', since: NOW - 25 * 60_000 }),
        agent('idle-3h', { kind: 'idle', since: NOW - 3.5 * H, idleSince: NOW - 3 * H }),
        agent('idle-2m', { kind: 'idle', since: NOW - 32 * 60_000, idleSince: NOW - 2 * 60_000 }),
        agent('idle-old', { kind: 'idle', since: NOW - 9 * H }),
      ],
      readCodex: (now, opts) => (codexAsked.push(opts.keepMs), []),
      readGrokBot: null,
      castFile: path.join(dir, 'cast.json'),
      settingsFile: path.join(dir, 'settings.json'),
      exec: () => {},
    })
  const hub = make()
  const shown = () => (hub.refresh(NOW), hub.agents.map(a => a.sid).sort())
  assert.equal(hub.state().hideIdle, 120, 'two hours until changed')
  assert.deepEqual(shown(), ['busy', 'idle-2m', 'waits'])
  assert.equal(codexAsked.at(-1), 30 * 60_000 + 2 * H, 'a Codex thread is read as long')
  assert.equal(hub.setHideIdle(1), true)
  assert.deepEqual(shown(), ['busy', 'waits'], 'one minute: idle ones go, the one waiting on you stays')
  assert.equal(hub.setHideIdle(240), true)
  assert.deepEqual(shown(), ['busy', 'idle-2m', 'idle-3h', 'waits'])
  assert.equal(hub.setHideIdle('never'), true)
  assert.deepEqual(shown(), ['busy', 'idle-2m', 'idle-3h', 'idle-old', 'waits'])
  assert.equal(codexAsked.at(-1), 24 * H, 'never, for Codex: a day after its last turn')
  for (const bad of [0, 2, 90, 1.5, '60', null, undefined]) assert.equal(hub.setHideIdle(bad), false, String(bad))
  assert.equal(make().hideIdle(), 'never', 'kept in the settings')
})

test("each flash's options: strength or size, and speed, checked and saved", () => {
  const { hub, dir } = makeHub([])
  assert.equal(hub.setFlash({ event: 'waiting', on: true, style: 'frame', size: 'thick', speed: 'fast' }), true)
  assert.deepEqual(hub.flash().waiting, { style: 'frame', color: 'pink', strength: 'strong', size: 'thick', speed: 'fast' })
  assert.equal(hub.setFlash({ event: 'question', strength: 'light' }), true)
  assert.equal(hub.flashSettings().question.strength, 'light')
  for (const bad of [{ size: 'huge' }, { speed: 'warp' }, { strength: 'toString' }, { size: 'thin', speed: 'nope' }]) {
    assert.equal(hub.setFlash({ event: 'waiting', ...bad }), false, JSON.stringify(bad))
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).flash.waiting.size, 'thick')
})

test('agents started by other agents get keys only when asked for, and the Grok reader is told', () => {
  const dir = tmp()
  const asked = []
  const make = () =>
    new Hub({
      readAgents: () => [agent('mine', { startedAt: 1 }), agent('sdk', { startedAt: 2, byAgent: true })],
      readCodex: () => [{ ...agent('made', { startedAt: 3 }), tool: 'codex', byAgent: true }],
      readGrokBot: (now, opts) => (asked.push(opts.botWork), []),
      castFile: path.join(dir, 'cast.json'),
      settingsFile: path.join(dir, 'settings.json'),
      exec: () => {},
    })
  const hub = make()
  hub.refresh()
  assert.equal(hub.state().agentStarted, false)
  assert.deepEqual(hub.agents.map(a => a.sid), ['mine'])
  assert.equal(asked.at(-1), false)
  assert.equal(hub.setAgentStarted(true), true)
  assert.deepEqual(hub.agents.map(a => a.sid).sort(), ['made', 'mine', 'sdk'], 'the deck is read again at once')
  assert.equal(asked.at(-1), true)
  for (const bad of ['yes', 1, null, undefined]) assert.equal(hub.setAgentStarted(bad), false, String(bad))
  assert.equal(make().agentStarted(), true, 'kept in the settings')
})

test('starting at login: on until changed, told to the app, kept; the window learns the version', () => {
  const { hub, dir } = makeHub([])
  const told = []
  hub.on('login', on => told.push(on))
  assert.equal(hub.state().openAtLogin, true)
  assert.deepEqual(hub.state().app, { version: null, loginAvailable: false })
  hub.appInfo = { version: '0.1.1', loginAvailable: true }
  assert.deepEqual(hub.state().app, { version: '0.1.1', loginAvailable: true })
  assert.equal(hub.setOpenAtLogin(false), true)
  assert.deepEqual(told, [false])
  assert.equal(hub.state().openAtLogin, false)
  for (const bad of ['off', 0, null, undefined]) assert.equal(hub.setOpenAtLogin(bad), false, String(bad))
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'))).openAtLogin, false)
})

test('a dismissed agent is gone everywhere until his session does something again', () => {
  const agents = [agent('a', { kind: 'compacting', since: 1000 }), agent('b')]
  const { hub } = makeHub(agents)
  assert.equal(hub.dismiss('nobody'), false)
  assert.equal(hub.dismiss('a'), true)
  assert.deepEqual(hub.agents.map(a => a.sid), ['b'])
  assert.deepEqual(hub.state().agents.map(a => a.sid), ['b'])
  // Nothing new: still gone.
  hub.refresh()
  assert.deepEqual(hub.agents.map(a => a.sid), ['b'])
  // He does something: back, and forgotten as dismissed.
  agents[0] = agent('a', { kind: 'working', since: 2000 })
  hub.refresh()
  assert.deepEqual(hub.agents.map(a => a.sid).sort(), ['a', 'b'])
  assert.deepEqual(hub.settings.dismissed, {})
  // A dismissed session that ends is forgotten too.
  hub.dismiss('b')
  agents.pop()
  hub.refresh()
  assert.deepEqual(hub.settings.dismissed, {})
})
