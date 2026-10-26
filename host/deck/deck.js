// Every Claude Code session as a Clawd on an Elgato Stream Deck, without
// the app: the same deck (device.js) and control page (server.js) the app
// runs, as a plain Node script, for development or a Mac with no app.
//
//   node deck.js
//
// Only one of this and the app should run: both want the deck and the port.
import { startDeck } from './device.js'
import { Hub } from './hub.js'
import { startServer } from './server.js'

const READ_MS = 500
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const hub = new Hub()
hub.refresh()
setInterval(() => hub.refresh(), READ_MS)
startServer(hub, undefined, log)
const deck = startDeck(hub, log)

async function quit() {
  await deck.stop()
  process.exit(0)
}
process.on('SIGINT', quit)
process.on('SIGTERM', quit)
