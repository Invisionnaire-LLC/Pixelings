// T3 Code's threads, for the Claude Code sessions T3 Code runs. T3 Code
// starts Claude Code through the Agent SDK (entrypoint sdk-cli), so its
// sessions are in ~/.claude/sessions like any other; what Claude Code
// doesn't know is the T3 thread a session belongs to, which its key opens.
//
// T3 Code keeps one log per thread with a Claude provider,
// <T3 home>/userdata/logs/provider/events.<thread id>.log, and every line
// it writes for the session names it: the query it opens has the session's
// id, and Claude's own events carry it too. So a session's thread is the
// log whose start or end mentions its id, and its link is
// t3code://threads/<environment id>/<thread id>, the environment id being
// in userdata/environment-id.
import fs from 'node:fs'
import path from 'node:path'

import { t3Dir } from './paths.js'

export const T3_DIR = t3Dir()
// How much of each log's start and end is looked through.
const PART_BYTES = 64 * 1024
// A session no log names yet is looked for again this often.
const RETRY_MS = 5_000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LOG = /^events\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.log$/

// The start and end of `file` (all of it when small).
function ends(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const read = (at, len) => {
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, at)
      return buf.toString('utf8')
    }
    if (size <= 2 * PART_BYTES) return read(0, size)
    return `${read(0, PART_BYTES)}\n${read(size - PART_BYTES, PART_BYTES)}`
  } catch {
    return ''
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

export class T3Threads {
  constructor(dir = T3_DIR) {
    this.dir = dir
    // sid → { env, thread }, once found (a session keeps its thread).
    this.found = new Map()
    // sid → when it was last looked for and not found.
    this.missed = new Map()
  }

  // The T3 thread of Claude Code session `sid`, as { env, thread }, or
  // null when T3 Code doesn't run it.
  threadFor(sid, now = Date.now()) {
    if (this.found.has(sid)) return this.found.get(sid)
    if (typeof sid !== 'string' || !UUID.test(sid)) return null
    if (now - (this.missed.get(sid) ?? -Infinity) < RETRY_MS) return null
    const hit = this.look(sid)
    if (hit) {
      this.found.set(sid, hit)
      this.missed.delete(sid)
    } else this.missed.set(sid, now)
    return hit
  }

  look(sid) {
    let env
    try {
      env = fs.readFileSync(path.join(this.dir, 'environment-id'), 'utf8').trim()
    } catch {
      return null
    }
    if (!UUID.test(env)) return null
    const logs = path.join(this.dir, 'logs', 'provider')
    let names = []
    try {
      names = fs.readdirSync(logs)
    } catch {
      return null
    }
    const quoted = `"${sid}"`
    for (const name of names) {
      const thread = LOG.exec(name)?.[1]
      if (thread && ends(path.join(logs, name)).includes(quoted)) return { env, thread }
    }
    return null
  }
}
