// Where the Pixelings show: the displays, each on or off by itself. The
// Stream Deck's keys, the Scene (the farm, office or mall on a screen) and
// the Desktop (just them, walking along the bottom of a screen over your
// windows); the ESP32 desk board isn't built yet. The menu bar and the
// window aren't displays: they are always there. Also how the farm's and
// the Desktop's windows sit on their screens. No Node imports: the page
// runs it.
import { pickFarmDisplay } from './farm.js'

export const OUTPUTS = ['streamdeck', 'external', 'desktop', 'esp32']
// The ones that can be turned on so far.
export const BUILT_OUTPUTS = ['streamdeck', 'external', 'desktop']
export const OUTPUT_NAMES = {
  streamdeck: 'Stream Deck',
  external: 'Scene',
  desktop: 'Desktop',
  esp32: 'ESP32 Board',
}
// What each is, for its page in Settings.
export const OUTPUT_ABOUT = {
  streamdeck: 'Each agent on a key of your Elgato Stream Deck. Press his key to open his session.',
  external: 'Everyone living together in a farm, an office or a mall, on a screen you pick.',
  desktop: 'The Pixelings on your desktop with nothing behind them, walking along the bottom of a screen over your windows. Click one to open his session; everywhere else clicks go to what is under them.',
  esp32: 'A little screen on your desk: an ESP32 board the Pixelings show on over Wi-Fi.',
}

// Which are on, from the saved settings; before there were any, from the
// one mode there was (the Stream Deck, unless the old External Monitor).
export function outputsFrom(settings) {
  const saved = settings?.outputs
  if (saved && typeof saved === 'object') {
    return { streamdeck: saved.streamdeck === true, external: saved.external === true, desktop: saved.desktop === true }
  }
  return settings?.mode === 'external'
    ? { streamdeck: false, external: true, desktop: false }
    : { streamdeck: true, external: false, desktop: false }
}

// Where one shows right now, from the hub's state: { on, live, text },
// `on` it is switched on, `live` the deck's or the screen's name when it's
// there to show on.
export function outputStatus(state, output) {
  const on = Boolean(state?.outputs?.[output])
  if (!BUILT_OUTPUTS.includes(output)) return { on: false, live: null, text: 'Coming' }
  if (!on) return { on, live: null, text: 'Off' }
  if (output === 'external') {
    const screen = pickFarmDisplay(state.displays ?? [], state.farmDisplay ?? 'auto')
    if (screen) return { on, live: screen.name, text: `Showing on ${screen.name}` }
    const text = (state.farmDisplay ?? 'auto') === 'auto' ? 'No external screen for the farm' : "The farm's screen isn't plugged in"
    return { on, live: null, text }
  }
  if (output === 'desktop') {
    const screen = pickDesktopDisplay(state.displays ?? [], state.desktopDisplay ?? 'auto')
    if (screen) return { on, live: screen.name, text: `Showing on ${screen.name}` }
    return { on, live: null, text: "The Desktop's screen isn't plugged in" }
  }
  const deck = state.deck ?? {}
  if (deck.connected) return { on, live: deck.product, text: `Showing on ${deck.product}` }
  return { on, live: null, text: 'No Stream Deck plugged in' }
}

// Where they show, for the window's top bar: { live, text }.
export function showingOn(state) {
  const all = BUILT_OUTPUTS.map(o => outputStatus(state, o))
  const live = all.filter(s => s.live).map(s => s.live)
  if (live.length) return { live: true, text: `Showing on ${live.join(' and ')}` }
  const on = all.filter(s => s.on)
  if (on.length === 1) return { live: false, text: on[0].text }
  if (on.length) return { live: false, text: 'Nothing they show on is plugged in' }
  return { live: false, text: 'Every display is off' }
}

// ---- The farm's window ----

// Full screen (over the screen's menu bar), a window you move and size, or
// a strip along the top or bottom of the screen.
export const FARM_SIZES = ['full', 'window', 'strip']
export const FARM_SIZE_NAMES = { full: 'Full Screen', window: 'Window', strip: 'Strip' }
// A strip's height in points: a world pixel to one, two or three.
export const STRIP_HEIGHTS = { small: 240, medium: 480, large: 720 }
export const STRIP_EDGES = ['bottom', 'top']

// The farm's window settings, from the saved settings: full screen and
// kept on top until changed, a strip medium and at the bottom.
export function farmWindowFrom(settings) {
  const w = settings?.farmWindow ?? {}
  return {
    size: FARM_SIZES.includes(w.size) ? w.size : 'full',
    onTop: w.onTop !== false,
    stripHeight: Object.hasOwn(STRIP_HEIGHTS, w.stripHeight ?? '') ? w.stripHeight : 'medium',
    stripEdge: STRIP_EDGES.includes(w.stripEdge) ? w.stripEdge : 'bottom',
  }
}

// Where the farm's window goes on `display` ({ id, bounds, workArea }):
// all of it; a strip along an edge of where windows go; or a window where
// it was left on that screen (`saved`, { display, x, y, width, height }),
// else in its middle.
export function farmBounds(display, win, saved) {
  if (win.size === 'full') return { ...display.bounds }
  const wa = display.workArea
  if (win.size === 'strip') {
    const height = Math.min(STRIP_HEIGHTS[win.stripHeight], wa.height)
    return { x: wa.x, y: win.stripEdge === 'top' ? wa.y : wa.y + wa.height - height, width: wa.width, height }
  }
  const onIt =
    saved?.display === display.id &&
    saved.x < wa.x + wa.width - 40 &&
    saved.x + saved.width > wa.x + 40 &&
    saved.y >= wa.y - 10 &&
    saved.y < wa.y + wa.height - 40
  if (onIt) return { x: saved.x, y: saved.y, width: Math.min(saved.width, wa.width), height: Math.min(saved.height, wa.height) }
  const width = Math.min(1200, Math.round(wa.width * 0.7))
  const height = Math.min(480, wa.height)
  return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width, height }
}

// ---- The Desktop's window ----

// The Desktop's world height in world pixels: room for him, his tag and
// his "?" bubble over his feet, and his context bar under them.
export const DESKTOP_H = 84
// How big they are on the Desktop: screen points to a world pixel, in
// half steps (still whole screen pixels on a Retina screen). 1.5 until
// changed.
export const DESKTOP_SIZES = { min: 1, max: 3, step: 0.5, default: 1.5 }

// The Desktop's size, from the saved settings.
export function desktopSizeFrom(settings) {
  const v = settings?.desktopSize
  const { min, max, step } = DESKTOP_SIZES
  return typeof v === 'number' && v >= min && v <= max && Number.isInteger(v / step) ? v : DESKTOP_SIZES.default
}

// The Desktop's screen: 'auto' (the main one) or a screen's id; a chosen
// screen that is unplugged shows nothing.
export function pickDesktopDisplay(displays, choice) {
  if (!Array.isArray(displays)) return null
  if (choice !== 'auto') return displays.find(d => d.id === choice) ?? null
  return displays.find(d => d.primary) ?? displays[0] ?? null
}

// Growing with their context, how much bigger one is when it is full.
export const DESKTOP_GROW = 2

// How many times bigger one is on the Desktop for `pct` of his context
// used, when they grow with it: 1 empty, DESKTOP_GROW full.
export function desktopGrowth(pct) {
  if (typeof pct !== 'number' || !(pct > 0)) return 1
  return 1 + ((DESKTOP_GROW - 1) * Math.min(100, pct)) / 100
}

// Where the Desktop's see-through window goes on `display` ({ workArea }),
// them `size` big: a band along the bottom of where windows go, so over
// the Dock or the taskbar, never under it. Growing with their context, it
// is tall enough for one at his biggest.
export function desktopBounds(display, size = DESKTOP_SIZES.default, grow = false) {
  const wa = display.workArea
  const height = Math.min(Math.round(DESKTOP_H * size * (grow ? DESKTOP_GROW : 1)), wa.height)
  return { x: wa.x, y: wa.y + wa.height - height, width: wa.width, height }
}
