// Drives the Stream Deck from the hub's state: finds the deck (and again
// whenever it is unplugged, or held by the Elgato app), draws every key
// about nine times a second (only the keys that changed go over USB),
// opens a session when its key is pressed, pages with the overflow key,
// and follows the brightness setting. Used by the app (main.js) and by the
// plain script (deck.js).
import { listStreamDecks, openStreamDeck } from '@elgato-stream-deck/node'

import { layout } from './layout.js'
import { renderKey } from './render.js'

const FRAME_MS = 110
const RETRY_MS = 2000
const PRESS_MS = 300

async function run(deck, hub, log, stopped) {
  const keys = deck.CONTROLS.filter(c => c.type === 'button' && c.feedbackType === 'lcd')
  let page = 0
  let slots = []
  const sent = new Map()
  const pressedAt = new Map()

  await deck.setBrightness(hub.settings.brightness)
  await deck.clearPanel()
  const brightness = value => deck.setBrightness(value).catch(() => {})
  hub.on('brightness', brightness)

  deck.on('down', control => {
    if (control.type !== 'button') return
    pressedAt.set(control.index, Date.now())
    const slot = slots[control.index]
    if (!slot) return
    if ('more' in slot) {
      page = slot.page + 1
      return
    }
    log(`open ${slot.title} (${slot.kind})`)
    hub.open(slot.sid)
  })

  return new Promise(resolve => {
    let busy = false
    const stop = () => {
      clearInterval(timer)
      hub.off('brightness', brightness)
      resolve()
    }
    const timer = setInterval(async () => {
      if (busy) return
      if (stopped()) return stop()
      busy = true
      try {
        const now = Date.now()
        const laid = layout(hub.agents, keys.length, page)
        page = laid.page
        slots = laid.slots
        for (const key of keys) {
          const pressed = now - (pressedAt.get(key.index) ?? 0) < PRESS_MS
          const px = renderKey(slots[key.index] ?? null, now, { pressed, flash: hub.flash() })
          const last = sent.get(key.index)
          if (last && Buffer.compare(last, px) === 0) continue
          await deck.fillKeyBuffer(key.index, px, { format: 'rgb' })
          sent.set(key.index, px)
        }
      } catch (e) {
        log(`deck lost: ${e.message}`)
        stop()
      } finally {
        busy = false
      }
    }, FRAME_MS)

    deck.on('error', e => {
      log(`deck error: ${e.message}`)
      stop()
    })
  })
}

// Keeps a Stream Deck driven until stop(), which resolves once the deck is
// handed back showing the Elgato logo (for quitting, or another mode).
export function startDeck(hub, log = console.log, { list = listStreamDecks, open = openStreamDeck } = {}) {
  let stopped = false
  let wake = () => {}

  const loop = (async () => {
    while (!stopped) {
      let current = null
      try {
        const [found] = await list()
        if (found && !stopped) {
          current = await open(found.path)
          log(`${current.PRODUCT_NAME} connected`)
          hub.setDeck(true, current.PRODUCT_NAME)
          await run(current, hub, log, () => stopped)
          // Its last frame is drawn: nothing draws over the logo.
          if (stopped) await current.resetToLogo().catch(() => {})
        }
      } catch (e) {
        log(`waiting for a Stream Deck (${e.message})`)
      }
      if (current) {
        await current.close().catch(() => {})
        hub.setDeck(false)
      }
      if (!stopped) {
        await new Promise(r => {
          const timer = setTimeout(r, RETRY_MS)
          wake = () => {
            clearTimeout(timer)
            r()
          }
        })
      }
    }
  })()

  return {
    async stop() {
      stopped = true
      wake()
      await loop
    },
  }
}
