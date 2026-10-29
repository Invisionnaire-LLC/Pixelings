// The control page: the deck's keys, live, drawn by the deck's own code
// (/lib/render.js), and whoever you click: his details, Open, and his
// wardrobe. Everything it changes goes to the deck script (server.js),
// which sends the new state back to every open page.
import { layout } from '/lib/layout.js'
import {
  DEFAULT_FLASHES,
  enabledFlashes,
  FLASH_COLORS,
  FLASH_EVENT_NAMES,
  FLASH_EVENTS,
  FLASH_OPTIONS,
  FLASH_STYLES,
  renderKey,
  renderPortrait,
  SIZE,
  STYLE_OPTION,
} from '/lib/render.js'
import { DOT_NAMES, DOTS } from '/lib/dots.js'
import { pickFarmDisplay } from '/lib/farm.js'
import { BUILT_OUTPUTS, OUTPUT_ABOUT, OUTPUT_NAMES, OUTPUTS, outputStatus, pickDesktopDisplay, showingOn } from '/lib/mode.js'
import { SCENE_NAMES, SCENES } from '/lib/scenes.js'
import { ACCESSORIES, BLINK_MS, BODIES, BODY_NAMES, HABITS, HATS, TAP_MS } from '/lib/wardrobe.js'

const KEYS = 15
const $ = id => document.getElementById(id)

// In the Pixelings app's own window: room for the window buttons.
if (new URLSearchParams(location.search).has('app')) document.documentElement.classList.add('in-app')

const HAT_NAMES = {
  tophat: 'Top hat',
  bowler: 'Bowler',
  beanie: 'Beanie',
  cowboy: 'Cowboy',
  crown: 'Crown',
  propeller: 'Propeller',
  party: 'Party',
  chef: 'Chef',
  wizard: 'Wizard',
  cap: 'Cap',
  beret: 'Beret',
  viking: 'Viking',
  grad: 'Graduate',
  halo: 'Halo',
}
const ACC_NAMES = {
  none: 'Nothing',
  glasses: 'Glasses',
  sunglasses: 'Sunglasses',
  bowtie: 'Bow tie',
  scarf: 'Scarf',
  blush: 'Blush',
  moustache: 'Moustache',
}
const HABIT_NAMES = {
  glance: 'Glances around',
  hop: 'Hops',
  sway: 'Sways',
  nod: 'Nods off',
  bob: 'Bobs along',
  lean: 'Leans in',
  focused: 'Head down',
  wave: 'Waves',
  look: 'Looks around',
  bounce: 'Bounces',
}
const TAP_NAMES = { 160: 'Very fast', 200: 'Fast', 240: 'Steady', 300: 'Slow' }
const BLINK_NAMES = { 2800: 'Often', 3600: 'Normal', 4400: 'Less', 5600: 'Rarely' }
const KIND_NAMES = { done: 'Your move', working: 'Working', compacting: 'Compacting', idle: 'Idle' }
const APP_NAMES = {
  'claude-desktop': 'Claude app',
  'claude-vscode': 'VS Code',
  'codex-app': 'Codex app',
  'codex-cli': 'Codex in a terminal',
  'grok-bot': 'Grok Bot',
  't3-code': 'T3 Code',
}

let state = { agents: [], deck: {}, brightness: 70, flash: DEFAULT_FLASHES, hideIdle: 120, agentStarted: false }
let page = 0
// ?select=<session id> opens with that Clawd chosen (the app's screenshots).
let selected = new URLSearchParams(location.search).get('select')
// Whether the first state has come: before it, a chosen Clawd is kept.
let loaded = false
let slots = []
let paged = false
let panelKey = ''

// ---- Drawing ----

function paint(canvas, px) {
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(SIZE, SIZE)
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    img.data[j] = px[i]
    img.data[j + 1] = px[i + 1]
    img.data[j + 2] = px[i + 2]
    img.data[j + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}

function canvas() {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  return c
}

const rgb = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`
const agentBy = sid => state.agents.find(a => a.sid === sid)

// ---- Talking to the deck script ----

async function post(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error()
    return await res.json()
  } catch {
    toast('The deck script did not take that.')
    return null
  }
}

let toastTimer
function toast(text) {
  const t = $('toast')
  t.textContent = text
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400)
}

// ---- The deck ----

const cells = []
for (let i = 0; i < KEYS; i++) {
  const el = document.createElement('div')
  el.className = 'key empty'
  el.tabIndex = -1
  el.dataset.index = i
  const c = canvas()
  el.append(c)
  $('deck').append(el)
  cells.push({ el, c })

  el.addEventListener('click', () => activate(i))
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(i)
    }
  })
  el.addEventListener('dragstart', e => {
    const slot = slots[i]
    if (!slot || 'more' in slot) return e.preventDefault()
    e.dataTransfer.setData('text/plain', slot.sid)
    e.dataTransfer.effectAllowed = 'move'
    el.classList.add('dragging')
  })
  el.addEventListener('dragend', () => el.classList.remove('dragging'))
  el.addEventListener('dragover', e => {
    if (slots[i] && 'more' in slots[i]) return
    e.preventDefault()
    el.classList.add('over')
  })
  el.addEventListener('dragleave', () => el.classList.remove('over'))
  el.addEventListener('drop', e => {
    e.preventDefault()
    el.classList.remove('over')
    const sid = e.dataTransfer.getData('text/plain')
    if (sid) post('/api/move', { sid, seat: seatOf(i) })
  })
}

// The seat key `i` stands for on this page.
const seatOf = i => (paged ? page * (KEYS - 1) + i : i)

function activate(i) {
  const slot = slots[i]
  if (!slot) return
  if ('more' in slot) {
    page = slot.page + 1
    renderDeck()
    return
  }
  selected = slot.sid
  panelKey = ''
  renderDeck()
  renderPanel()
}

function renderDeck() {
  const laid = layout(state.agents, KEYS, page)
  page = laid.page
  slots = laid.slots
  paged = slots[KEYS - 1] != null && 'more' in slots[KEYS - 1]

  cells.forEach(({ el }, i) => {
    const slot = slots[i]
    const isAgent = slot && !('more' in slot)
    el.classList.toggle('empty', !slot)
    el.classList.toggle('selected', isAgent && slot.sid === selected)
    el.draggable = Boolean(isAgent)
    el.tabIndex = slot ? 0 : -1
    el.setAttribute('role', slot ? 'button' : 'presentation')
    el.setAttribute(
      'aria-label',
      !slot ? '' : isAgent ? `${slot.title}: ${KIND_NAMES[slot.kind] ?? 'Asking'}` : `${slot.more} more agents`,
    )
  })

  const tabs = $('tabs')
  const pages = paged ? slots[KEYS - 1].pages : 1
  tabs.hidden = pages < 2
  tabs.replaceChildren(
    ...Array.from({ length: pages }, (_, p) => {
      const b = document.createElement('button')
      b.className = 'tab'
      b.type = 'button'
      b.role = 'tab'
      b.textContent = `Page ${p + 1}`
      b.setAttribute('aria-selected', String(p === page))
      const per = KEYS - 1
      if (state.agents.some(a => Math.floor(a.seat / per) === p && a.kind === 'ask')) b.classList.add('asking')
      b.onclick = () => {
        page = p
        renderDeck()
      }
      return b
    }),
  )
}

// ---- The panel ----

function since(ms) {
  const min = Math.round((Date.now() - ms) / 60000)
  if (!ms || min < 1) return 'just now'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`
}

function heat(pct) {
  if (pct > 90) return 'rgb(255, 80, 80)'
  if (pct > 80) return 'rgb(255, 130, 100)'
  if (pct > 70) return 'rgb(255, 180, 100)'
  if (pct > 60) return 'rgb(255, 220, 120)'
  return 'rgb(130, 230, 210)'
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...children.filter(c => c != null))
  return e
}

function section(title, ...children) {
  return el('div', { className: 'section' }, el('h3', {}, title), ...children)
}

function pick(look, change, label, pressed, onScene = false) {
  const c = canvas()
  paint(c, renderPortrait({ ...look, ...change, phase: 0 }, 0, onScene ? null : [22, 22, 28]))
  const b = el('button', { className: 'pick', type: 'button', title: label }, c)
  b.setAttribute('aria-label', label)
  b.setAttribute('aria-pressed', String(pressed))
  b.onclick = () => restyle(change)
  return b
}

function swatch(color, label, pressed, change, second) {
  const b = el('button', { className: 'swatch', type: 'button', title: label })
  b.style.background = second ? `linear-gradient(135deg, ${rgb(color)} 50%, ${rgb(second)} 50%)` : rgb(color)
  b.setAttribute('aria-label', label)
  b.setAttribute('aria-pressed', String(pressed))
  b.onclick = () => restyle(change)
  return b
}

function select(label, options, value, names, field) {
  const id = `habit-${field}`
  const s = el('select', { id })
  for (const o of options) s.append(el('option', { value: String(o), textContent: names[o] ?? o, selected: o === value }))
  s.onchange = () => restyle({ [field]: typeof value === 'number' ? Number(s.value) : s.value })
  return [el('label', { htmlFor: id, textContent: label }), s]
}

function restyle(change) {
  if (selected) post('/api/look', { sid: selected, change })
}

let portrait = null

function renderPanel() {
  const panel = $('panel')
  const a = selected && agentBy(selected)
  if (!a) {
    if (loaded) selected = null
    // Redrawn when sessions come or all go: the first draw is before the
    // state arrives, with none yet.
    const empty = state.agents.length ? 'empty:some' : 'empty:none'
    if (panelKey === empty) return
    panelKey = empty
    portrait = canvas()
    panel.replaceChildren(
      el(
        'div',
        { className: 'empty-panel' },
        portrait,
        el('div', { textContent: state.agents.length ? 'Click a Clawd to see who he is.' : 'No Claude Code sessions running.' }),
      ),
    )
    portrait.dataset.look = '{}'
    return
  }

  // Rebuilt only when something shown changed, so a menu stays open.
  const key = JSON.stringify([a.look, a.kind, a.ask, a.pct, a.title, a.cwd, a.app, Math.round((Date.now() - a.since) / 60000)])
  if (key === panelKey) return
  panelKey = key

  const look = a.look ?? {}
  // A Codex dot or a Grok bot has its own look: no wardrobe.
  const ownLook = a.tool === 'codex' || a.tool === 'grokbot'
  portrait = canvas()
  portrait.dataset.look = JSON.stringify(look)
  const kind = a.kind === 'ask' ? (a.ask === 'question' ? 'Asking a question' : 'Asking permission') : KIND_NAMES[a.kind]

  const hat = HATS[look.hat] ?? HATS.tophat
  const accColors = ACCESSORIES[look.accessory] ?? []
  const ctx =
    typeof a.pct === 'number'
      ? el(
          'div',
          { className: 'ctx' },
          el('div', { className: 'ctx-bar' }, Object.assign(el('span'), { style: `width:${a.pct}%;background:${heat(a.pct)}` })),
          el('span', { textContent: `${a.pct}%` }),
        )
      : el('span', { textContent: 'Not known yet' })

  panel.replaceChildren(
    el(
      'div',
      { className: 'who' },
      portrait,
      el('div', {}, el('h2', { textContent: a.title }), el('span', { className: `chip ${a.kind}`, textContent: kind })),
    ),
    el(
      'dl',
      { className: 'facts' },
      el('dt', { textContent: 'Folder' }),
      el('dd', { textContent: (a.cwd ?? a.folder) || '—', title: a.cwd ?? '' }),
      el('dt', { textContent: 'For' }),
      el('dd', { textContent: since(a.since) }),
      el('dt', { textContent: 'Context' }),
      el('dd', {}, ctx),
      el('dt', { textContent: 'In' }),
      el('dd', { textContent: APP_NAMES[a.app] ?? 'A terminal' }),
      el('dt', { textContent: 'Key' }),
      el('dd', { textContent: `${a.seat + 1}${a.seat >= KEYS ? ` (page ${Math.floor(a.seat / (KEYS - 1)) + 1})` : ''}` }),
    ),
    el(
      'div',
      { className: 'actions' },
      el('button', { className: 'btn primary', type: 'button', textContent: 'Open session', onclick: () => post('/api/open', { sid: a.sid }) }),
      el('button', { className: 'btn', type: 'button', textContent: 'Re-roll look', onclick: () => restyle('reroll') }),
    ),
    section(
      'Background',
      el('div', { className: 'picks' }, ...SCENES.map(x => pick(look, { scene: x }, SCENE_NAMES[x] ?? x, x === look.scene, true))),
      el(
        'div',
        { className: 'swatches' },
        el('button', {
          className: 'btn',
          type: 'button',
          textContent: `New ${(SCENE_NAMES[look.scene] ?? 'background').toLowerCase()}`,
          onclick: () => restyle({ sceneSeed: Math.floor(Math.random() * 2147483647) }),
        }),
      ),
    ),
    // A Codex agent is a Codex dot: its own look, no wardrobe.
    a.tool === 'codex'
      ? section('Dot', el('div', { className: 'picks' }, ...DOT_NAMES.map(d => pick(look, { dot: d }, DOTS[d].name, d === look.dot, true))))
      : null,
    ownLook
      ? null
      : section(
      'Hat',
      el('div', { className: 'picks' }, ...Object.keys(HATS).map(h => pick(look, { hat: h, hatColors: h === look.hat ? look.hatColors : 0 }, HAT_NAMES[h] ?? h, h === look.hat))),
      hat.colors.length > 1
        ? el(
            'div',
            { className: 'swatches' },
            ...hat.colors.map((set, i) => {
              const [first, second] = Object.values(set)
              return swatch(first, `Colours ${i + 1}`, i === look.hatColors, { hatColors: i }, second)
            }),
          )
        : null,
    ),
    ownLook
      ? null
      : section(
      'Wearing',
      el(
        'div',
        { className: 'picks' },
        ...Object.keys(ACCESSORIES).map(x => pick(look, { accessory: x, accColor: x === look.accessory ? look.accColor : 0 }, ACC_NAMES[x] ?? x, x === look.accessory)),
      ),
      accColors.length > 1
        ? el('div', { className: 'swatches' }, ...accColors.map((c, i) => swatch(c, `Colour ${i + 1}`, i === look.accColor, { accColor: i })))
        : null,
    ),
    ownLook
      ? null
      : section('Colour', el('div', { className: 'swatches' }, ...BODIES.map((c, i) => swatch(c, BODY_NAMES[i] ?? `Colour ${i + 1}`, i === look.body, { body: i })))),
    section(
      'Habits',
      el(
        'div',
        { className: 'habits' },
        ...select('Idle', HABITS.idle, look.idle, HABIT_NAMES, 'idle'),
        ...select('Working', HABITS.work, look.work, HABIT_NAMES, 'work'),
        ...select('Your move', HABITS.done, look.done, HABIT_NAMES, 'done'),
        ...select('Typing', TAP_MS, look.tapMs, TAP_NAMES, 'tapMs'),
        ...select('Blinking', BLINK_MS, look.blinkMs, BLINK_NAMES, 'blinkMs'),
      ),
    ),
  )
}

// ---- Top bar ----

function renderBar() {
  const n = state.agents.length
  const asking = state.agents.filter(a => a.kind === 'ask').length
  const who = `${n} agent${n === 1 ? '' : 's'}${asking ? `, ${asking} asking` : ''}`
  const shown = showingOn(state)
  $('status').textContent = `${shown.text} · ${who}`
  $('dot').classList.toggle('on', shown.live)
  // The deck's brightness, while the Stream Deck is on.
  $('brightness').closest('.bright').hidden = !state.outputs?.streamdeck
  for (const b of [$('brightness'), $('deck-brightness')]) if (document.activeElement !== b) b.value = state.brightness
  renderOutputs()
  renderFlash()
  renderHideIdle()
  renderGeneral()
  renderFarm()
  renderDesktop()
}

let brightTimer
for (const id of ['brightness', 'deck-brightness']) $(id).addEventListener('input', e => {
  clearTimeout(brightTimer)
  brightTimer = setTimeout(() => post('/api/brightness', { value: Number(e.target.value) }), 120)
})

// ---- Flash: what a key flashes for, each in its own style and colour ----

const FLASH_STYLE_NAMES = { screen: 'Whole key', pulse: 'Fade', frame: 'Border' }
const OPTION_NAMES = { strength: 'Strength', size: 'Size', speed: 'Speed' }
const CHOICE_NAMES = { light: 'Light', medium: 'Medium', strong: 'Strong', thin: 'Thin', thick: 'Thick', slow: 'Slow', normal: 'Normal', fast: 'Fast' }

// One row for each thing a key can flash for: on or off, then (on) its
// style and colour.
const flashRows = {}
for (const event of FLASH_EVENTS) {
  const on = el('input', { type: 'checkbox', onchange: e => post('/api/flash', { event, on: e.target.checked }) })
  const styles = el('div', { className: 'seg', role: 'radiogroup' })
  for (const style of FLASH_STYLES) {
    styles.append(el('button', { type: 'button', textContent: FLASH_STYLE_NAMES[style], onclick: () => post('/api/flash', { event, style }) }))
  }
  const colors = el('div', { className: 'swatches', role: 'radiogroup' })
  for (const [color, value] of Object.entries(FLASH_COLORS)) {
    const b = el('button', { type: 'button', title: color, onclick: () => post('/api/flash', { event, color }) })
    b.style.background = rgb(value)
    b.setAttribute('aria-label', color)
    colors.append(b)
  }
  // Strength (whole key, fade) or size (border), shown for the style
  // chosen, and speed for all.
  const options = {}
  for (const option of Object.keys(FLASH_OPTIONS)) {
    const seg = el('div', { className: 'seg', role: 'radiogroup' })
    seg.setAttribute('aria-label', `${FLASH_EVENT_NAMES[event]}: ${OPTION_NAMES[option].toLowerCase()}`)
    for (const choice of Object.keys(FLASH_OPTIONS[option])) {
      const b = el('button', { type: 'button', textContent: CHOICE_NAMES[choice], onclick: () => post('/api/flash', { event, [option]: choice }) })
      b.setAttribute('role', 'radio')
      seg.append(b)
    }
    options[option] = el('div', { className: 'flashopt' }, el('div', { className: 'flash-label', textContent: OPTION_NAMES[option] }), seg)
  }
  const opts = el('div', { className: 'flashopts' }, options.strength, options.size, options.speed)
  for (const b of [...styles.children, ...colors.children]) b.setAttribute('role', 'radio')
  styles.setAttribute('aria-label', `${FLASH_EVENT_NAMES[event]}: style`)
  colors.setAttribute('aria-label', `${FLASH_EVENT_NAMES[event]}: colour`)
  const preview = Object.assign(canvas(), { className: 'flashpreview', title: 'Preview' })
  const head = el('div', { className: 'flashhead' }, el('label', { className: 'flash-on' }, on, FLASH_EVENT_NAMES[event]), preview)
  const row = el('div', { className: 'flashrow' }, head, styles, opts, colors)
  flashRows[event] = { row, on, styles, colors, preview, options }
  $('flashcard').append(row)
}

// A Clawd in each flash's moment, for its preview.
const PREVIEW_LOOK = { scene: 'night', sceneSeed: 1, phase: 0 }
const previewAgent = (event, now) =>
  ({
    question: { kind: 'ask', ask: 'question' },
    permission: { kind: 'ask', ask: 'permission' },
    finished: { kind: 'done', since: now },
    waiting: { kind: 'done', since: now - 60_000 },
    compacting: { kind: 'compacting', since: now - 5000 },
    context: { kind: 'working', pct: 95 },
  })[event]

// Each preview flashes only for its own row, so it shows what that one does.
function paintFlashPreviews(now) {
  for (const event of FLASH_EVENTS) {
    const f = state.flash[event] ?? DEFAULT_FLASHES[event]
    const agent = { sid: `preview-${event}`, title: 'Clawd', look: PREVIEW_LOOK, since: now, ...previewAgent(event, now) }
    paint(flashRows[event].preview, renderKey(agent, now, { flash: enabledFlashes({ [event]: f }) }))
  }
}

function renderFlash() {
  for (const event of FLASH_EVENTS) {
    const f = state.flash[event] ?? DEFAULT_FLASHES[event]
    const { row, on, styles, colors, options } = flashRows[event]
    on.checked = f.on
    row.classList.toggle('off', !f.on)
    for (const [option, cell] of Object.entries(options)) {
      cell.hidden = option !== 'speed' && STYLE_OPTION[f.style] !== option
      Object.keys(FLASH_OPTIONS[option]).forEach((c, i) => cell.lastChild.children[i].setAttribute('aria-checked', String(c === f[option])))
    }
    FLASH_STYLES.forEach((s, i) => styles.children[i].setAttribute('aria-checked', String(s === f.style)))
    Object.keys(FLASH_COLORS).forEach((c, i) => colors.children[i].setAttribute('aria-checked', String(c === f.color)))
  }
}

// ---- Idle: how long an idle agent keeps his key ----

const IDLE_CHOICES = [1, 60, 120, 180, 240, 300, 'never']

for (const minutes of IDLE_CHOICES) {
  const name = minutes === 'never' ? 'Never' : minutes < 60 ? `${minutes} min` : `${minutes / 60} h`
  const b = el('button', { type: 'button', textContent: name, onclick: () => post('/api/hide-idle', { minutes }) })
  b.setAttribute('role', 'radio')
  $('hide-idle').append(b)
}

function renderHideIdle() {
  IDLE_CHOICES.forEach((m, i) => $('hide-idle').children[i].setAttribute('aria-checked', String(m === state.hideIdle)))
  $('agent-started').checked = Boolean(state.agentStarted)
}

// ---- Other agents: whether agents started by agents get keys ----

$('agent-started').addEventListener('change', e => post('/api/agent-started', { on: e.target.checked }))

// ---- Display: each place the Pixelings show, on or off ----

const showTabOf = output => () => showTab(`out-${output}`)

$('outputs').replaceChildren(
  ...OUTPUTS.map(output => {
    const sw = el('input', { type: 'checkbox', className: 'switch', disabled: !BUILT_OUTPUTS.includes(output) })
    sw.dataset.output = output
    sw.setAttribute('aria-label', OUTPUT_NAMES[output])
    const text = el('span', { className: 'out-text' })
    text.dataset.status = output
    return el('div', { className: 'out-row' }, el('button', { type: 'button', textContent: OUTPUT_NAMES[output], onclick: showTabOf(output) }), text, sw)
  }),
)
for (const sw of document.querySelectorAll('input[data-output]')) {
  sw.addEventListener('change', () => post('/api/output', { output: sw.dataset.output, on: sw.checked }))
}
for (const p of document.querySelectorAll('[data-about]')) p.textContent = OUTPUT_ABOUT[p.dataset.about]

// What each display says it is doing, everywhere it is shown.
const OFF_TEXT = {
  streamdeck: 'Off: the Stream Deck shows the Elgato logo, free for Elgato’s app.',
  external: 'Off: no farm, office or mall on any screen.',
  desktop: 'Off: nobody on your desktop.',
}

function renderOutputs() {
  for (const output of OUTPUTS) {
    const st = outputStatus(state, output)
    for (const sw of document.querySelectorAll(`input[data-output="${output}"]`)) sw.checked = st.on
    for (const t of document.querySelectorAll(`[data-status="${output}"]`)) {
      t.textContent = t.classList.contains('out-text') ? st.text : st.on ? `${st.text}.` : (OFF_TEXT[output] ?? 'Coming soon.')
    }
    for (const d of document.querySelectorAll(`[data-dot="${output}"]`)) d.classList.toggle('on', st.on)
  }
}

// ---- Scene: which screen, and where everyone lives ----

for (const b of $('farm-scene').children) b.addEventListener('click', () => post('/api/farm-scene', { scene: b.dataset.value }))
for (const b of $('farm-size').children) b.addEventListener('click', () => post('/api/farm-window', { size: b.dataset.value }))
for (const b of $('strip-height').children) b.addEventListener('click', () => post('/api/farm-window', { stripHeight: b.dataset.value }))
for (const b of $('strip-edge').children) b.addEventListener('click', () => post('/api/farm-window', { stripEdge: b.dataset.value }))
$('farm-on-top').addEventListener('change', e => post('/api/farm-window', { onTop: e.target.checked }))

const SIZE_HINTS = {
  full: 'Fills the screen, over its menu bar, on every desktop. Windows you take there go behind it.',
  window: 'A window you move and size like any other; it remembers where you leave it. Closing it turns the Scene off.',
  strip: 'A band across the screen, over other windows, on every desktop. Small, Medium and Large draw the world one, two or three times bigger.',
}

// Picks the button whose value is `value` in a row of them.
function check(box, value) {
  for (const b of box.children) b.setAttribute('aria-checked', String(b.dataset.value === value))
}

// A row of the screens to pick from, Automatic first, kept as they are
// until the screens change; `chosen` is checked.
function screenChoices(box, auto, url, chosen) {
  const choices = [{ value: 'auto', label: auto }, ...(state.displays ?? []).map(d => ({ value: d.id, label: d.name }))]
  const want = choices.map(c => `${c.value}:${c.label}`).join('|')
  if (box.dataset.choices !== want) {
    box.dataset.choices = want
    box.replaceChildren(
      ...choices.map(c => {
        const b = el('button', { type: 'button', textContent: c.label, onclick: () => post(url, { display: c.value }) })
        b.setAttribute('role', 'radio')
        b.dataset.value = String(c.value)
        return b
      }),
    )
  }
  check(box, String(chosen ?? 'auto'))
}

function renderFarm() {
  screenChoices($('farm-display'), 'Automatic', '/api/farm-display', state.farmDisplay)
  check($('farm-scene'), state.farmScene ?? 'farm')
  const win = state.farmWindow ?? { size: 'full', onTop: true, stripHeight: 'medium', stripEdge: 'bottom' }
  check($('farm-size'), win.size)
  check($('strip-height'), win.stripHeight)
  check($('strip-edge'), win.stripEdge)
  $('farm-on-top').checked = win.onTop
  $('farm-size-hint').textContent = SIZE_HINTS[win.size]
  $('farm-window-opts').hidden = win.size !== 'window'
  $('farm-strip-opts').hidden = win.size !== 'strip'
  const on = pickFarmDisplay(state.displays ?? [], state.farmDisplay ?? 'auto')
  $('farm-hint').textContent = on
    ? `Showing on ${on.name} (${on.width}×${on.height}).`
    : state.farmDisplay === 'auto'
      ? 'No Xeneon Edge or other long, short screen plugged in. Pick a screen to show it there.'
      : 'That screen is not plugged in.'
}

// ---- Desktop: which screen they walk along, over your windows or not ----

$('desktop-on-top').addEventListener('change', e => post('/api/desktop-on-top', { on: e.target.checked }))
$('desktop-context').addEventListener('change', e => post('/api/desktop-context', { on: e.target.checked }))

function renderDesktop() {
  screenChoices($('desktop-display'), 'Main Screen', '/api/desktop-display', state.desktopDisplay)
  const on = pickDesktopDisplay(state.displays ?? [], state.desktopDisplay ?? 'auto')
  $('desktop-hint').textContent = on
    ? `Along the bottom of ${on.name}, just above the Dock or the taskbar.`
    : 'That screen is not plugged in.'
  $('desktop-on-top').checked = Boolean(state.desktopOnTop)
  $('desktop-on-top-hint').textContent = state.desktopOnTop
    ? 'Over every window, all the time.'
    : 'Behind the window you are using. One asking you something comes to the front until you answer him.'
  $('desktop-context').checked = Boolean(state.desktopContext)
}

// ---- General: starting at login, and the version ----

$('open-at-login').addEventListener('change', e => post('/api/open-at-login', { on: e.target.checked }))

function renderGeneral() {
  const available = Boolean(state.app?.loginAvailable)
  $('open-at-login').checked = Boolean(state.openAtLogin)
  $('open-at-login').disabled = !available
  $('login-hint').textContent = available
    ? 'It starts quietly in the menu bar; open it from there.'
    : 'Only the installed app can start at login (not while run from the code).'
  $('app-version').textContent = state.app?.version ? `Pixelings ${state.app.version}` : 'Pixelings'
}

// ---- The settings window: its tabs, and how it opens and closes ----

let settingsTab = 'general'
function showTab(tab) {
  settingsTab = tab
  for (const b of document.querySelectorAll('.settings-nav [data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const p of document.querySelectorAll('.settings-body[data-panel]')) p.hidden = p.dataset.panel !== tab
}
for (const b of document.querySelectorAll('.settings-nav [data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab))
showTab(settingsTab)

$('settings-open').addEventListener('click', () => $('settings').showModal())
// The menu bar's Settings… opens the window here, on #settings (or on a
// tab of them: #settings/display).
function settingsFromHash() {
  const [page, tab] = location.hash.slice(1).split('/')
  if (page !== 'settings') return
  history.replaceState(null, '', location.pathname + location.search)
  if (tab && document.querySelector(`.settings-nav [data-tab="${CSS.escape(tab)}"]`)) showTab(tab)
  if (!$('settings').open) $('settings').showModal()
}
addEventListener('hashchange', settingsFromHash)
settingsFromHash()
$('settings-close').addEventListener('click', () => $('settings').close())
// A click on the dimmed page around it closes it too.
$('settings').addEventListener('click', e => {
  if (e.target === $('settings')) $('settings').close()
})

// ---- New agent ----

$('new').onclick = () => {
  const folders = [...new Set(state.agents.map(a => a.cwd).filter(Boolean))].sort()
  $('recent').replaceChildren(...folders.map(f => el('option', { value: f })))
  $('newError').textContent = ''
  if (!$('folder').value && folders[0]) $('folder').value = folders[0]
  $('newDialog').showModal()
  $('folder').focus()
}
$('cancelNew').onclick = () => $('newDialog').close()
$('choose').onclick = async () => {
  const res = await post('/api/choose-folder', {})
  if (res?.folder) $('folder').value = res.folder
}
$('newForm').addEventListener('submit', async e => {
  e.preventDefault()
  const folder = $('folder').value.trim()
  const res = await fetch('/api/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ folder }),
  }).catch(() => null)
  if (res?.ok) {
    $('newDialog').close()
    toast('Starting a new agent in the Claude app.')
  } else $('newError').textContent = 'That is not a folder on this Mac.'
})

// ---- Live ----

function render() {
  renderBar()
  renderDeck()
  renderPanel()
}

const events = new EventSource('/api/events')
events.onmessage = e => {
  state = JSON.parse(e.data)
  loaded = true
  render()
}
events.onerror = () => {
  $('status').textContent = 'Reconnecting to the deck script…'
  $('dot').classList.remove('on')
}

// The animation: every key, the portrait and the logo, ten times a second.
const logo = $('logo')
setInterval(() => {
  const now = Date.now()
  cells.forEach(({ c }, i) => paint(c, renderKey(slots[i] ?? null, now, { flash: enabledFlashes(state.flash) })))
  if (portrait) paint(portrait, renderPortrait(JSON.parse(portrait.dataset.look || '{}'), now))
  paint(logo, renderPortrait({}, now, [0, 48, 42]))
  if ($('settings').open && settingsTab === 'flash') paintFlashPreviews(now)
}, 100)

render()
