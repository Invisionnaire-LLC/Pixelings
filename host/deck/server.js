// The control page: a small web server on this Mac only (127.0.0.1), part
// of the deck script so the deck and the page share one state (hub.js).
//
//   GET  /                   the page (public/)
//   GET  /farm               the farm, for its own screen (public/farm.html)
//   GET  /lib/<file>.js      render.js, wardrobe.js, layout.js, scenes.js, dots.js,
//                            grokbots.js, farm.js, mode.js
//   GET  /api/state          the state, once
//   GET  /api/events         the state, again on every change (SSE)
//   POST /api/move           { sid, seat }
//   POST /api/look           { sid, change }   change: fields, or "reroll"
//   POST /api/brightness     { value }         0–100
//   POST /api/flash          { event, on, style, color }  any of the last three
//   POST /api/hide-idle      { minutes }       1, 60, 120, 180, 240, 300, or "never"
//   POST /api/agent-started  { on }            agents started by other agents get keys
//   POST /api/open-at-login  { on }            start Pixelings when you log in
//   POST /api/output         { output, on }    a display ("streamdeck", "external", "desktop") on or off
//   POST /api/farm-window    { size?, onTop?, stripHeight?, stripEdge? }  the farm's window
//   POST /api/farm-display   { display }       "auto" or a screen's id
//   POST /api/farm-scene     { scene }         "farm", "office" or "mall"
//   POST /api/desktop-display { display }      "auto" or a screen's id
//   POST /api/desktop-on-top { on }            the Desktop over every window, or behind
//   POST /api/desktop-context { on }           the Desktop's context bars shown or not
//   POST /api/desktop-size   { size }          how big they are on the Desktop, 1 to 3
//   POST /api/desktop-grow   { on }            on the Desktop, bigger as their context fills
//   POST /api/open           { sid }
//   POST /api/dismiss        { sid }           gone until his session does something again
//   POST /api/new            { folder }
//   POST /api/choose-folder  {}                → { folder }
//
// Other web pages in your browser must not be able to drive it: requests
// are refused unless addressed to this server by name (no DNS rebinding),
// and a POST must be JSON from this page's own origin (a cross-site JSON
// POST needs a CORS preflight, which is never granted).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { encodePng, upscale } from './png.js'
import { renderPortrait, SIZE } from './render.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PORT = Number(process.env.PIXELINGS_PORT ?? 47733)
const MAX_BODY = 16 * 1024

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/farm': ['public/farm.html', 'text/html; charset=utf-8'],
  '/farm.js': ['public/farm.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['public/manifest.webmanifest', 'application/manifest+json'],
  '/lib/render.js': ['render.js', 'text/javascript; charset=utf-8'],
  '/lib/wardrobe.js': ['wardrobe.js', 'text/javascript; charset=utf-8'],
  '/lib/layout.js': ['layout.js', 'text/javascript; charset=utf-8'],
  '/lib/scenes.js': ['scenes.js', 'text/javascript; charset=utf-8'],
  '/lib/dots.js': ['dots.js', 'text/javascript; charset=utf-8'],
  '/lib/grokbots.js': ['grokbots.js', 'text/javascript; charset=utf-8'],
  '/lib/farm.js': ['farm.js', 'text/javascript; charset=utf-8'],
  '/lib/mode.js': ['mode.js', 'text/javascript; charset=utf-8'],
}

let icon = null
function iconPng() {
  icon ??= encodePng(upscale(renderPortrait({}, 0, [0, 48, 42]), SIZE, SIZE, 4), SIZE * 4, SIZE * 4)
  return icon
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too big'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

// The request's own address, if it is this server's.
export function allowed(req, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`]
  if (!hosts.includes(req.headers.host ?? '')) return false
  if (req.method === 'GET') return true
  if (req.method !== 'POST') return false
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return false
  const origin = req.headers.origin
  return origin === undefined || hosts.map(h => `http://${h}`).includes(origin)
}

export function handler(hub, port = PORT) {
  return async (req, res) => {
    if (!allowed(req, port)) return send(res, 403, { error: 'forbidden' })
    const url = new URL(req.url, `http://127.0.0.1:${port}`)

    if (req.method === 'GET') {
      if (STATIC[url.pathname]) {
        const [file, type] = STATIC[url.pathname]
        try {
          return send(res, 200, fs.readFileSync(path.join(here, file)), type)
        } catch {
          return send(res, 404, { error: 'missing' })
        }
      }
      if (url.pathname === '/icon.png') return send(res, 200, iconPng(), 'image/png')
      if (url.pathname === '/api/state') return send(res, 200, hub.state())
      if (url.pathname === '/api/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
        const push = () => res.write(`data: ${JSON.stringify(hub.state())}\n\n`)
        push()
        const beat = setInterval(() => res.write(': beat\n\n'), 20_000)
        hub.on('change', push)
        req.on('close', () => {
          clearInterval(beat)
          hub.off('change', push)
        })
        return
      }
      return send(res, 404, { error: 'not found' })
    }

    let body
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { error: 'bad body' })
    }
    const done = ok => send(res, ok ? 200 : 400, ok ? { ok: true } : { error: 'refused' })
    switch (url.pathname) {
      case '/api/move':
        return done(hub.move(body.sid, body.seat))
      case '/api/look':
        return done(hub.restyle(body.sid, body.change))
      case '/api/brightness':
        return done(hub.setBrightness(body.value))
      case '/api/flash':
        return done(hub.setFlash(body))
      case '/api/hide-idle':
        return done(hub.setHideIdle(body.minutes))
      case '/api/agent-started':
        return done(hub.setAgentStarted(body.on))
      case '/api/open-at-login':
        return done(hub.setOpenAtLogin(body.on))
      case '/api/output':
        return done(hub.setOutput(body.output, body.on))
      case '/api/farm-window':
        return done(hub.setFarmWindow(body))
      case '/api/farm-display':
        return done(hub.setFarmDisplay(body.display))
      case '/api/farm-scene':
        return done(hub.setFarmScene(body.scene))
      case '/api/desktop-display':
        return done(hub.setDesktopDisplay(body.display))
      case '/api/desktop-on-top':
        return done(hub.setDesktopOnTop(body.on))
      case '/api/desktop-context':
        return done(hub.setDesktopContext(body.on))
      case '/api/desktop-size':
        return done(hub.setDesktopSize(body.size))
      case '/api/desktop-grow':
        return done(hub.setDesktopGrow(body.on))
      case '/api/dismiss':
        return done(hub.dismiss(body.sid))
      case '/api/open':
        return done(hub.open(body.sid))
      case '/api/new':
        return done(hub.newAgent(body.folder))
      case '/api/choose-folder':
        return send(res, 200, { folder: await hub.chooseFolder() })
      default:
        return send(res, 404, { error: 'not found' })
    }
  }
}

// Starts the page; a busy port (another deck script) only costs the page.
export function startServer(hub, port = PORT, log = console.log) {
  const server = http.createServer(handler(hub, port))
  server.on('error', e => log(`control page off: ${e.message}`))
  server.listen(port, '127.0.0.1', () => log(`control page: http://localhost:${port}`))
  return server
}
