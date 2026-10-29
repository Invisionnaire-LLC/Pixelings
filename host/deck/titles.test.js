import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { defaultName, SessionTitles } from './titles.js'

const SID = 'f7f5e305-163e-489d-8b62-746e18f4a494'
const CWD = '/Users/me/Work DEV/sciroadsV2'

// A projects folder with one transcript for SID in CWD.
function projects(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'))
  const folder = path.join(dir, '-Users-me-Work-DEV-sciroadsV2')
  fs.mkdirSync(folder)
  const file = path.join(folder, `${SID}.jsonl`)
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n'))
  return { dir, file }
}
const ai = aiTitle => ({ type: 'ai-title', aiTitle, sessionId: SID })
const custom = customTitle => ({ type: 'custom-title', customTitle, sessionId: SID })
const user = text => ({ type: 'user', message: { role: 'user', content: text } })

test("Claude Code's default name is its folder's, a dash and two hex digits", () => {
  assert.equal(defaultName('sciroadsv2-04', CWD), true)
  assert.equal(defaultName('pixelings---elgato-version-bf', '/x/Pixelings - ElGato Version'), true)
  assert.equal(defaultName('Feature explorer', CWD), false)
  assert.equal(defaultName('other-04', CWD), false, 'another folder')
  assert.equal(defaultName(undefined, CWD), false)
})

test("a session's title is Claude's latest, or yours once you renamed it", () => {
  const { dir, file } = projects([ai('Old title'), user('hi'), ai('Feature explorer')])
  const titles = new SessionTitles(dir)
  assert.equal(titles.titleFor(SID, CWD), 'Feature explorer')
  fs.appendFileSync(file, `\n${JSON.stringify(custom('My "own" name'))}\n${JSON.stringify(ai('Later'))}`)
  assert.equal(titles.titleFor(SID, CWD), 'My "own" name')
  fs.rmSync(dir, { recursive: true })
})

test('a long transcript is read by its start and end', () => {
  const { dir } = projects([custom('Renamed'), user('x'.repeat(300 * 1024)), ai('Latest')])
  assert.equal(new SessionTitles(dir).titleFor(SID, CWD), 'Renamed')
  fs.rmSync(dir, { recursive: true })
})

test('no transcript, no title, or a bad id: no title', () => {
  const { dir } = projects([user('hi')])
  const titles = new SessionTitles(dir)
  assert.equal(titles.titleFor(SID, CWD), undefined)
  assert.equal(titles.titleFor(SID, '/elsewhere'), undefined)
  assert.equal(titles.titleFor('../x', CWD), undefined)
  fs.rmSync(dir, { recursive: true })
})
