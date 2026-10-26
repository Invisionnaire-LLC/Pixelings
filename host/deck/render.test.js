import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fitWords, heatColor, keyLabel, nameLines, renderKey, SIZE } from './render.js'

const agent = (kind, over = {}) => ({ sid: 's', kind, title: 'Deck keys', folder: 'Pixelings', since: 0, ...over })
const at = (px, x, y) => [...px.subarray((y * SIZE + x) * 3, (y * SIZE + x) * 3 + 3)]

test('a key is 72x72 RGB', () => {
  assert.equal(renderKey(null, 0).length, SIZE * SIZE * 3)
})

test('an empty key is black', () => {
  assert.ok(renderKey(null, 0).every(b => b === 0))
})

test('every kind draws, and a working key is not an idle key', () => {
  for (const kind of ['ask', 'done', 'working', 'compacting', 'idle']) assert.equal(renderKey(agent(kind), 0).length, SIZE * SIZE * 3)
  assert.notDeepEqual(renderKey(agent('working'), 0), renderKey(agent('idle'), 0))
})

test('an ask key is red and pulses', () => {
  const bright = renderKey(agent('ask'), 300)
  const dim = renderKey(agent('ask'), 900)
  assert.ok(at(bright, 1, 70)[0] > at(bright, 1, 70)[1] * 3, 'red background')
  assert.notDeepEqual(at(bright, 1, 70), at(dim, 1, 70))
})

test('the context bar shows only with a context figure, in the heat colours', () => {
  assert.notDeepEqual(at(renderKey(agent('working'), 0), 15, 4), heatColor(95), 'no bar without a figure')
  assert.deepEqual(at(renderKey(agent('working', { pct: 95 }), 0), 15, 4), heatColor(95))
  assert.deepEqual(heatColor(95), [255, 80, 80])
  assert.deepEqual(heatColor(10), [130, 230, 210])
})

test('a pressed key gets a white ring', () => {
  assert.deepEqual(at(renderKey(null, 0, { pressed: true }), 0, 0), [235, 235, 235])
})

test('the overflow key draws', () => {
  assert.equal(renderKey({ more: 6, asking: 1, page: 0, pages: 2 }, 0).length, SIZE * SIZE * 3)
})

test('titles are cut at a word', () => {
  assert.equal(fitWords('SLOTDB STATUS', 12), 'SLOTDB')
  assert.equal(fitWords('PIXEL DECK MULTI', 12), 'PIXEL DECK')
  assert.equal(fitWords('PIXELINGSDECKAPP', 12), 'PIXELINGSDEC')
})

test('two Clawds in different looks are told apart', () => {
  const a = agent('done', { look: { hat: 'crown', accessory: 'bowtie' } })
  const b = agent('done', { look: { hat: 'cowboy', accessory: 'moustache' } })
  assert.notDeepEqual(renderKey(a, 0), renderKey(b, 0))
})

test('the same look keeps its own clock: phases put them out of step', () => {
  const look = { hat: 'tophat', idle: 'hop' }
  const frames = phase => [0, 1000, 2000, 3000, 4000].map(t => renderKey(agent('idle', { look: { ...look, phase } }), t))
  assert.notDeepEqual(frames(0), frames(2500))
})

test('the propeller turns', () => {
  const a = agent('done', { look: { hat: 'propeller', done: 'look', phase: 0 } })
  assert.notDeepEqual(renderKey(a, 0).subarray(0, SIZE * 22 * 3), renderKey(a, 120).subarray(0, SIZE * 22 * 3))
})

test('a look missing or naming nothing known still draws the classic Clawd', () => {
  assert.deepEqual(renderKey(agent('done'), 0), renderKey(agent('done', { look: { hat: 'nope', accessory: 'nope' } }), 0))
})

test('an idle Clawd is as bright as a busy one', () => {
  const look = { body: 0 }
  const idle = renderKey(agent('idle', { look }), 0)
  const done = renderKey(agent('done', { look }), 0)
  // A pixel of his head, away from the eyes: the same orange in both.
  assert.deepEqual(at(idle, 30, 23), at(done, 30, 23))
})

test('a name wraps over two lines at whole words', () => {
  assert.deepEqual(nameLines('PIXEL DECK MULTI-AGENT DASHBOARD', 12), ['PIXEL DECK', 'MULTI-AGENT'])
  assert.deepEqual(nameLines('SLOTDB STATUS', 12), ['SLOTDB', 'STATUS'])
  assert.deepEqual(nameLines('DECK KEYS', 12), ['DECK KEYS'])
  assert.deepEqual(nameLines('SCIROADSV2-F2', 12), ['SCIROADSV2-F'])
  assert.deepEqual(nameLines('', 12), [])
})

test('the name is the first words of the title that fit one line', () => {
  assert.equal(fitWords('PIXEL DECK MULTI-AGENT DASHBOARD', 12), 'PIXEL DECK')
  assert.equal(fitWords('SLOTDB STATUS', 12), 'SLOTDB')
  const short = renderKey(agent('idle', { title: 'Slotdb' }), 0)
  assert.deepEqual(renderKey(agent('idle', { title: 'Slotdb status' }), 0), short, 'the rest of the title is not drawn')
})

test('an idle key shows the name and nothing else below him', () => {
  const a = renderKey(agent('idle', { title: 'Deck', folder: 'AAAA' }), 0)
  const b = renderKey(agent('idle', { title: 'Deck', folder: 'ZZZZ' }), 0)
  assert.deepEqual(a, b, 'the folder is not drawn')
})

test('a busy key says what he is doing instead of his name', () => {
  assert.equal(keyLabel(agent('idle')), 'Deck keys')
  assert.equal(keyLabel(agent('working')), 'WORKING')
  assert.equal(keyLabel(agent('done')), 'WAITING')
  assert.equal(keyLabel(agent('compacting')), 'COMPACTING')
  assert.equal(keyLabel(agent('ask', { ask: 'permission' })), 'PERMISSION')
  assert.equal(keyLabel(agent('ask', { ask: 'question' })), 'QUESTION')
  assert.equal(keyLabel(agent('ask')), 'ASKING')
  const look = { scene: 'night', sceneSeed: 1, phase: 0 }
  assert.deepEqual(
    renderKey(agent('working', { title: 'Deck', look }), 0),
    renderKey(agent('working', { title: 'Other', look }), 0),
    'the name is not drawn while he works',
  )
})

test('working, waiting and compacting dots tick on after the word', () => {
  const look = { scene: 'night', sceneSeed: 1, phase: 0 }
  for (const kind of ['working', 'done', 'compacting']) {
    const strip = t => renderKey(agent(kind, { look }), t).subarray(SIZE * 52 * 3, SIZE * 67 * 3)
    const frames = [0, 400, 800, 1200].map(strip)
    for (let i = 1; i < frames.length; i++) assert.notDeepEqual(frames[i], frames[i - 1], `${kind} step ${i}`)
    // No dots, one, two, three, then round again.
    assert.deepEqual(strip(0), strip(1600), kind)
  }
})

test('every scene draws, and differs by seed', async () => {
  const { SCENES, sceneBase } = await import('./scenes.js')
  for (const name of SCENES) {
    const a = sceneBase(name, 1)
    assert.equal(a.length, SIZE * SIZE * 3)
    assert.ok(a.some(v => v > 0), `${name} is not blank`)
  }
  assert.notDeepEqual(sceneBase('city', 1), sceneBase('city', 2))
  assert.deepEqual(sceneBase('city', 9), sceneBase('city', 9))
})

test('only asking gets a frame', () => {
  const look = { scene: 'night', sceneSeed: 1 }
  assert.ok(at(renderKey(agent('ask', { look }), 300), 1, 36)[0] > 150, 'red frame')
  const plain = at(renderKey(agent('idle', { look }), 0), 1, 36)
  for (const kind of ['done', 'working']) assert.deepEqual(at(renderKey(agent(kind, { look }), 0), 1, 36), plain, kind)
})

test('a key asking a question flashes the whole key white by default, unless flashing is off', () => {
  const look = { scene: 'night', sceneSeed: 1 }
  const question = agent('ask', { ask: 'question', look })
  // His middle, where the scene and he are dark: near white while it flashes.
  const middle = (a, t, opts) => at(renderKey(a, t, opts), 36, 36)
  assert.ok(middle(question, 0).every(v => v > 200), 'on: white')
  assert.ok(middle(question, 500).some(v => v < 200), 'and off')
  assert.ok(middle(question, 0, { flash: {} }).some(v => v < 200), 'never with flashing off')
  assert.ok(middle(agent('ask', { ask: 'permission', look }), 0).some(v => v < 200), 'a permission does not flash')
  for (const kind of ['done', 'working', 'idle']) assert.ok(middle(agent(kind, { look }), 0).some(v => v < 200), kind)
})

test('the flash comes in styles and colours', async () => {
  const { FLASH_COLORS, FLASH_STYLES } = await import('./render.js')
  const look = { scene: 'night', sceneSeed: 1 }
  const question = agent('ask', { ask: 'question', look })
  const key = (t, style, color = 'white') => renderKey(question, t, { flash: { question: { style, color } } })
  const plain = renderKey(question, 0, { flash: {} })
  for (const style of FLASH_STYLES) {
    const t = style === 'pulse' ? 500 : 0
    assert.notDeepEqual(key(t, style), renderKey(question, t, { flash: {} }), style)
  }
  // A border: its colour round the edge, the middle left as it was.
  assert.deepEqual(at(key(0, 'frame', 'yellow'), 2, 36), FLASH_COLORS.yellow)
  assert.deepEqual(at(key(0, 'frame', 'yellow'), 36, 36), at(plain, 36, 36))
  // A fade: nothing at the start of the beat, most of it half way.
  assert.deepEqual(key(0, 'pulse'), plain)
  assert.ok(at(key(500, 'pulse'), 36, 36).every(v => v > 180))
  // Another colour floods the key in it.
  const blue = at(key(0, 'screen', 'blue'), 36, 36)
  assert.ok(blue[2] > blue[0] + 100, 'blue')
})

test('a Codex agent is his Codex dot, not Clawd, and every dot draws differently', async () => {
  const { DOT_NAMES } = await import('./dots.js')
  const look = { scene: 'night', sceneSeed: 1, accessory: 'none', phase: 0 }
  const clawd = renderKey(agent('idle', { tool: 'claude', look }), 1000)
  const dots = DOT_NAMES.map(dot => renderKey(agent('idle', { tool: 'codex', look: { ...look, dot } }), 1000))
  for (const d of dots) assert.notDeepEqual(d, clawd)
  for (let i = 1; i < dots.length; i++) assert.notDeepEqual(dots[i], dots[0])
  // His own look, not the wardrobe's: a hat changes nothing on a dot.
  assert.deepEqual(renderKey(agent('idle', { tool: 'codex', look: { ...look, dot: 'frog', hat: 'crown' } }), 1000), renderKey(agent('idle', { tool: 'codex', look: { ...look, dot: 'frog', hat: 'chef' } }), 1000))
})

test('a Grok Bot bot is its own shape in its own colour, and every shape draws differently', async () => {
  const { GROK_COLORS, GROK_SHAPE_NAMES } = await import('./grokbots.js')
  const look = { scene: 'night', sceneSeed: 1, accessory: 'none', phase: 0 }
  const bot = over => renderKey(agent('idle', { tool: 'grokbot', look: { ...look, color: 'blue', ...over } }), 1000)
  const clawd = renderKey(agent('idle', { tool: 'claude', look }), 1000)
  const shapes = GROK_SHAPE_NAMES.map(shape => bot({ shape }))
  for (const s of shapes) assert.notDeepEqual(s, clawd)
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) assert.notDeepEqual(shapes[i], shapes[j], `${GROK_SHAPE_NAMES[i]} and ${GROK_SHAPE_NAMES[j]}`)
  for (const color of Object.keys(GROK_COLORS)) if (color !== 'blue') assert.notDeepEqual(bot({ shape: 'blob', color }), bot({ shape: 'blob' }), color)
  // His own look, not the wardrobe's: a hat changes nothing on a bot.
  assert.deepEqual(bot({ shape: 'hex', hat: 'crown' }), bot({ shape: 'hex', hat: 'chef' }))
  // Working, he looks over his laptop like everyone.
  assert.notDeepEqual(renderKey(agent('working', { tool: 'grokbot', look: { ...look, shape: 'hex', color: 'blue' } }), 1000), bot({ shape: 'hex' }))
})

test('heat levels: smoke at 60%, fire at 70, 80, ablaze at 90', async () => {
  const { heat } = await import('./render.js')
  assert.deepEqual([undefined, 59, 60, 70, 80, 90, 100].map(heat), [0, 0, 1, 2, 3, 4, 4])
})

test('a fuller context burns: a 95% key is not a 40% key, working or not', () => {
  const look = { scene: 'night', sceneSeed: 1, phase: 0 }
  for (const kind of ['working', 'idle']) {
    const cool = renderKey(agent(kind, { pct: 40, look }), 1300)
    const ablaze = renderKey(agent(kind, { pct: 95, look }), 1300)
    // Below the bar: the fire itself, not only the bar's length.
    assert.notDeepEqual(cool.subarray(SIZE * 10 * 3), ablaze.subarray(SIZE * 10 * 3), kind)
  }
})

test('compacting puts the fire out: flames gone once doused', () => {
  const look = { scene: 'night', sceneSeed: 1, phase: 0 }
  const burning = renderKey(agent('compacting', { pct: 95, since: 1000, look }), 1100)
  const out = renderKey(agent('compacting', { pct: 95, since: 1000, look }), 1000 + 3000)
  assert.notDeepEqual(burning, out)
})

test('each flash is for its own moment: a permission, a turn just finished, waiting, compacting, a full context', async () => {
  const { flashFor } = await import('./render.js')
  const all = Object.fromEntries(['question', 'permission', 'finished', 'waiting', 'compacting', 'context'].map(e => [e, { style: 'frame', color: e }]))
  const NOW = 1_000_000
  const event = (a, flash = all) => flashFor({ since: NOW, ...a }, NOW, flash)?.color ?? null
  assert.equal(event({ kind: 'ask', ask: 'question' }), 'question')
  assert.equal(event({ kind: 'ask', ask: 'permission' }), 'permission')
  assert.equal(event({ kind: 'done', since: NOW - 5000 }), 'finished', 'its first seconds')
  assert.equal(event({ kind: 'done', since: NOW - 60_000 }), 'waiting', 'then waiting')
  assert.equal(event({ kind: 'done', since: NOW - 5000 }, { waiting: all.waiting }), 'waiting', 'waiting covers it with finished off')
  assert.equal(event({ kind: 'compacting' }), 'compacting')
  assert.equal(event({ kind: 'working', pct: 92 }), 'context')
  assert.equal(event({ kind: 'working', pct: 60 }), null)
  assert.equal(event({ kind: 'idle' }), null, 'idle never flashes')
  // The first that applies wins: asking with a full context is asking.
  assert.equal(event({ kind: 'ask', ask: 'question', pct: 95 }), 'question')
  assert.equal(event({ kind: 'ask', ask: 'question' }, {}), null, 'nothing on, nothing flashes')
})

test("a flash's options: a border's size, the whole key's strength, and its speed", () => {
  const look = { scene: 'night', sceneSeed: 1 }
  const question = agent('ask', { ask: 'question', look })
  const key = (t, f) => renderKey(question, t, { flash: { question: { style: 'screen', color: 'yellow', strength: 'strong', size: 'medium', speed: 'normal', ...f } } })
  // A thick border reaches further in than a thin one.
  assert.deepEqual(at(key(0, { style: 'frame', size: 'thick' }), 8, 36), [255, 214, 60])
  assert.notDeepEqual(at(key(0, { style: 'frame', size: 'thin' }), 8, 36), [255, 214, 60])
  // A light whole key lets more of the key through than a strong one.
  const plain = at(renderKey(question, 0, { flash: {} }), 36, 36)
  const light = at(key(0, { strength: 'light' }), 36, 36)
  const strong = at(key(0, { strength: 'strong' }), 36, 36)
  assert.ok(Math.abs(light[2] - plain[2]) < Math.abs(strong[2] - plain[2]), 'light is fainter')
  // Fast is off at 300 ms into its beat; normal is still on.
  assert.notDeepEqual(at(key(300, { speed: 'fast' }), 36, 36), at(key(300, { speed: 'normal' }), 36, 36))
  assert.deepEqual(at(key(300, { speed: 'fast' }), 36, 36), plain.length ? at(renderKey(question, 300, { flash: {} }), 36, 36) : null)
})
