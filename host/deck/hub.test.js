import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { Hub, openTarget, systemOpener, vscodeLink } from './hub.js'
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
