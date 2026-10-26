import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { sessionsDir as hookSessionsDir } from '../../plugin/hooks/pixelings-hook.js'
import { claudeDir, codexDir, dirs, grokBotDir, sessionsDir, t3Dir } from './paths.js'

const HOME = '/home/me'

test('each system keeps Pixelings where that system expects', () => {
  assert.equal(dirs('darwin', {}, HOME).data, path.join(HOME, 'Library', 'Application Support', 'Pixelings'))
  const win = dirs('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, HOME)
  assert.equal(win.data, path.join('C:\\Users\\me\\AppData\\Roaming', 'Pixelings'))
  assert.equal(win.cache, path.join('C:\\Users\\me\\AppData\\Local', 'Pixelings'))
  assert.equal(dirs('linux', {}, HOME).cache, path.join(HOME, '.cache', 'pixelings'))
})

test('the plugin writes session states where the app reads them, on every system', () => {
  const env = { APPDATA: 'C:\\R', LOCALAPPDATA: 'C:\\L' }
  for (const platform of ['darwin', 'win32', 'linux']) {
    assert.equal(hookSessionsDir(platform, env, HOME), sessionsDir(platform, env, HOME), platform)
  }
  assert.equal(hookSessionsDir('win32', { PIXELINGS_SESSIONS_DIR: '/x' }, HOME), sessionsDir('win32', { PIXELINGS_SESSIONS_DIR: '/x' }, HOME))
})

test("Claude Code's and Codex's folders follow their own settings", () => {
  assert.equal(claudeDir({}, HOME), path.join(HOME, '.claude'))
  assert.equal(claudeDir({ CLAUDE_CONFIG_DIR: '/c' }, HOME), '/c')
  assert.equal(codexDir({ CODEX_HOME: '/x' }, HOME), '/x')
  assert.equal(codexDir({}, HOME), path.join(HOME, '.codex'))
})

test("T3 Code's folder follows T3CODE_HOME", () => {
  assert.equal(t3Dir({}, HOME), path.join(HOME, '.t3', 'userdata'))
  assert.equal(t3Dir({ T3CODE_HOME: '/t' }, HOME), path.join('/t', 'userdata'))
  assert.equal(t3Dir({ PIXELINGS_T3_DIR: '/p' }, HOME), '/p')
})

test("Grok Bot's folder is the app's own data folder on each system", () => {
  assert.equal(grokBotDir('darwin', {}, HOME), path.join(HOME, 'Library', 'Application Support', 'Grok Bot'))
  assert.equal(grokBotDir('win32', { APPDATA: 'C:\\R' }, HOME), path.join('C:\\R', 'Grok Bot'))
  assert.equal(grokBotDir('linux', {}, HOME), path.join(HOME, '.config', 'Grok Bot'))
  assert.equal(grokBotDir('darwin', { PIXELINGS_GROKBOT_DIR: '/g' }, HOME), '/g')
})
