import { test } from 'node:test'
import assert from 'node:assert/strict'

import { desktopBounds, farmBounds, farmWindowFrom, outputsFrom, outputStatus, pickDesktopDisplay, showingOn } from './mode.js'

const MAIN = { id: 1, name: 'Built-in Retina Display', width: 1512, height: 982, primary: true }
const EDGE = { id: 3, name: 'XENEON EDGE', width: 2560, height: 720, primary: false }
const DECK = { connected: true, product: 'Stream Deck MK.2' }

test('the Stream Deck is on until changed; an old External Monitor mode turns the farm on instead', () => {
  assert.deepEqual(outputsFrom({}), { streamdeck: true, external: false, desktop: false })
  assert.deepEqual(outputsFrom({ mode: 'external' }), { streamdeck: false, external: true, desktop: false })
  assert.deepEqual(outputsFrom({ mode: 'external', outputs: { streamdeck: true, external: true } }), { streamdeck: true, external: true, desktop: false })
  assert.deepEqual(outputsFrom({ outputs: { streamdeck: 'yes', desktop: true } }), { streamdeck: false, external: false, desktop: true })
})

test('each display says whether it shows, and where', () => {
  const both = { outputs: { streamdeck: true, external: true }, deck: DECK, displays: [MAIN, EDGE], farmDisplay: 'auto' }
  assert.deepEqual(outputStatus(both, 'streamdeck'), { on: true, live: 'Stream Deck MK.2', text: 'Showing on Stream Deck MK.2' })
  assert.deepEqual(outputStatus(both, 'external'), { on: true, live: 'XENEON EDGE', text: 'Showing on XENEON EDGE' })
  assert.equal(outputStatus({ ...both, deck: { connected: false } }, 'streamdeck').text, 'No Stream Deck plugged in')
  assert.equal(outputStatus({ ...both, displays: [MAIN] }, 'external').text, 'No external screen for the farm')
  assert.equal(outputStatus({ ...both, displays: [MAIN], farmDisplay: 3 }, 'external').text, "The farm's screen isn't plugged in")
  assert.deepEqual(outputStatus({ ...both, outputs: { streamdeck: false } }, 'streamdeck'), { on: false, live: null, text: 'Off' })
  assert.deepEqual(outputStatus(both, 'esp32'), { on: false, live: null, text: 'Coming' })
  // The Desktop is on the main screen until another is picked.
  const desk = { outputs: { desktop: true }, displays: [MAIN, EDGE], desktopDisplay: 'auto' }
  assert.deepEqual(outputStatus(desk, 'desktop'), { on: true, live: 'Built-in Retina Display', text: 'Showing on Built-in Retina Display' })
  assert.equal(outputStatus({ ...desk, desktopDisplay: 3 }, 'desktop').text, 'Showing on XENEON EDGE')
  assert.equal(outputStatus({ ...desk, desktopDisplay: 9 }, 'desktop').text, "The Desktop's screen isn't plugged in")
  assert.deepEqual(outputStatus({ ...desk, outputs: {} }, 'desktop'), { on: false, live: null, text: 'Off' })
})

test('the top bar says everywhere they show', () => {
  const both = { outputs: { streamdeck: true, external: true }, deck: DECK, displays: [MAIN, EDGE], farmDisplay: 'auto' }
  assert.equal(showingOn(both).text, 'Showing on Stream Deck MK.2 and XENEON EDGE')
  assert.equal(showingOn({ ...both, displays: [MAIN] }).text, 'Showing on Stream Deck MK.2')
  assert.equal(showingOn({ ...both, displays: [MAIN], deck: {} }).text, 'Nothing they show on is plugged in')
  assert.equal(showingOn({ ...both, outputs: { external: true }, displays: [MAIN] }).text, 'No external screen for the farm')
  assert.deepEqual(showingOn({ outputs: {} }), { live: false, text: 'Every display is off' })
})

test("the farm's window is full screen until changed, and anything unknown reads as the default", () => {
  assert.deepEqual(farmWindowFrom({}), { size: 'full', onTop: true, stripHeight: 'medium', stripEdge: 'bottom' })
  assert.deepEqual(farmWindowFrom({ farmWindow: { size: 'strip', onTop: false, stripHeight: 'huge', stripEdge: 'left' } }), {
    size: 'strip',
    onTop: false,
    stripHeight: 'medium',
    stripEdge: 'bottom',
  })
})

test("the farm's window fills the screen, runs along an edge of it, or stays where it was left", () => {
  const display = { id: 4, bounds: { x: 0, y: 0, width: 3440, height: 1440 }, workArea: { x: 0, y: 30, width: 3440, height: 1410 } }
  const win = farmWindowFrom({})
  assert.deepEqual(farmBounds(display, win), display.bounds)
  assert.deepEqual(farmBounds(display, { ...win, size: 'strip' }), { x: 0, y: 960, width: 3440, height: 480 })
  assert.deepEqual(farmBounds(display, { ...win, size: 'strip', stripEdge: 'top', stripHeight: 'small' }), { x: 0, y: 30, width: 3440, height: 240 })
  // A window starts in the middle; once moved, it stays, on that screen only.
  assert.deepEqual(farmBounds(display, { ...win, size: 'window' }), { x: 1120, y: 495, width: 1200, height: 480 })
  const saved = { display: 4, x: 100, y: 200, width: 900, height: 400 }
  assert.deepEqual(farmBounds(display, { ...win, size: 'window' }, saved), { x: 100, y: 200, width: 900, height: 400 })
  assert.deepEqual(farmBounds(display, { ...win, size: 'window' }, { ...saved, display: 9 }), { x: 1120, y: 495, width: 1200, height: 480 })
  assert.deepEqual(farmBounds(display, { ...win, size: 'window' }, { ...saved, x: 5000 }), { x: 1120, y: 495, width: 1200, height: 480 })
})

test("the Desktop picks the main screen until changed, and sits along the bottom of where windows go", () => {
  assert.equal(pickDesktopDisplay([EDGE, MAIN], 'auto'), MAIN)
  assert.equal(pickDesktopDisplay([EDGE, MAIN], 3), EDGE)
  assert.equal(pickDesktopDisplay([MAIN], 3), null)
  // The work area stops above the Dock (or the taskbar): the band ends there.
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 38, width: 1512, height: 880 } }
  assert.deepEqual(desktopBounds(display), { x: 0, y: 750, width: 1512, height: 168 })
})
