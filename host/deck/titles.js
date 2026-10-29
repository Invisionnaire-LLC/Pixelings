// The titles Claude Code gives its sessions, for the ones whose name is
// only Claude Code's default (<folder>-<two hex digits>), as a session the
// VS Code extension runs always is. The title the extension shows is in the
// session's transcript, ~/.claude/projects/<folder>/<session id>.jsonl (the
// folder is the session's cwd with every other character than a letter or
// digit made a "-"): a "custom-title" line once you rename it, and an
// "ai-title" line Claude writes and writes again as the session goes on.
import fs from 'node:fs'
import path from 'node:path'

import { claudeDir } from './paths.js'

export const PROJECTS_DIR = path.join(claudeDir(), 'projects')
// How much of each transcript's start and end is looked through.
const PART_BYTES = 64 * 1024

const SID = /^[A-Za-z0-9_-]{1,80}$/

// Whether `name` is Claude Code's default name for a session in `cwd`:
// its folder's name, lower case, then a dash and two hex digits.
export function defaultName(name, cwd) {
  const m = /^(.+)-[0-9a-f]{2}$/.exec(name ?? '')
  const plain = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  return !!m && !!cwd && plain(m[1]) === plain(path.basename(cwd))
}

// The start and end of the open file `fd` (all of it when small).
function ends(fd, size) {
  const read = (at, len) => {
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, at)
    return buf.toString('utf8')
  }
  if (size <= 2 * PART_BYTES) return read(0, size)
  return `${read(0, PART_BYTES)}\n${read(size - PART_BYTES, PART_BYTES)}`
}

// The last string value of `key` in `text`, or undefined.
function last(text, key) {
  const re = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`, 'g')
  let value
  for (let m; (m = re.exec(text)); ) value = m[1]
  if (value === undefined) return undefined
  try {
    return JSON.parse(`"${value}"`).trim() || undefined
  } catch {
    return undefined
  }
}

export class SessionTitles {
  constructor(dir = PROJECTS_DIR) {
    this.dir = dir
    // file → { mtimeMs, size, title }: read again only once it changes.
    this.seen = new Map()
  }

  // Session `sid`'s title (yours over Claude's), or undefined.
  titleFor(sid, cwd) {
    if (typeof sid !== 'string' || !SID.test(sid) || typeof cwd !== 'string') return undefined
    const file = path.join(this.dir, cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sid}.jsonl`)
    let fd
    try {
      fd = fs.openSync(file, 'r')
      const { mtimeMs, size } = fs.fstatSync(fd)
      const was = this.seen.get(file)
      if (was && was.mtimeMs === mtimeMs && was.size === size) return was.title
      const text = ends(fd, size)
      const title = last(text, 'customTitle') ?? last(text, 'aiTitle')
      this.seen.set(file, { mtimeMs, size, title })
      return title
    } catch {
      return undefined
    } finally {
      if (fd !== undefined) fs.closeSync(fd)
    }
  }
}
