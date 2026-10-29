import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { startDeck } from './device.js'

// A deck with one key that records what was done to it.
function fakeDeck() {
  const did = []
  const deck = new EventEmitter()
  Object.assign(deck, {
    PRODUCT_NAME: 'Stream Deck MK.2',
    CONTROLS: [{ type: 'button', feedbackType: 'lcd', index: 0 }],
    setBrightness: async () => did.push('brightness'),
    clearPanel: async () => did.push('clear'),
    fillKeyBuffer: async () => did.push('key'),
    resetToLogo: async () => did.push('logo'),
    close: async () => did.push('close'),
  })
  return { deck, did }
}

function fakeHub() {
  const hub = new EventEmitter()
  Object.assign(hub, { settings: { brightness: 70 }, agents: [], flash: () => ({}), deck: { connected: false } })
  hub.setDeck = (connected, product = null) => (hub.deck = { connected, product })
  return hub
}

test('stopping hands the deck back with its logo, after its last frame', async () => {
  const { deck, did } = fakeDeck()
  const hub = fakeHub()
  const driver = startDeck(hub, () => {}, { list: async () => [{ path: 'usb' }], open: async () => deck })
  await new Promise(r => setTimeout(r, 300))
  assert.deepEqual(hub.deck, { connected: true, product: 'Stream Deck MK.2' })
  assert.ok(did.includes('key'), 'drawn')
  await driver.stop()
  assert.deepEqual(did.slice(-2), ['logo', 'close'])
  assert.deepEqual(hub.deck, { connected: false, product: null })
  const after = did.length
  await new Promise(r => setTimeout(r, 300))
  assert.equal(did.length, after, 'nothing drawn after')
})

test('stopping while no deck is plugged in returns at once', async () => {
  const hub = fakeHub()
  const driver = startDeck(hub, () => {}, { list: async () => [] })
  await new Promise(r => setTimeout(r, 50))
  const t = Date.now()
  await driver.stop()
  assert.ok(Date.now() - t < 500, 'not after the 2 s retry')
  assert.equal(hub.deck.connected, false)
})
