import { test } from 'node:test'
import assert from 'node:assert/strict'

import { bundleOf, focuser, focusSteps, Hosts, hostIn, parseLsofCwd, parsePs, SCRIPTS, tmuxState } from './host.js'

// Process trees as ps gave them on a Mac with sessions in Ghostty, VS Code,
// Terminal and Cursor (Oct 27), and one under tmux.
const PS = `    1     0 ??       /sbin/launchd
88049     1 ??       /Applications/Ghostty.app/Contents/MacOS/ghostty
13905 88049 ttys003  /usr/bin/login
13906 13905 ttys003  -/bin/zsh
13929 13906 ttys003  claude
21314     1 ??       /Applications/Visual Studio Code.app/Contents/MacOS/Code
62043 21314 ??       /Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)
18322 62043 ??       /Users/me/.vscode/extensions/anthropic.claude-code/resources/native-binary/claude
  500     1 ??       /System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal
  501   500 ttys007  /usr/bin/login
  502   501 ttys007  -zsh
  503   502 ttys007  claude
  600     1 ??       /Applications/Cursor.app/Contents/MacOS/Cursor
  601   600 ??       /Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin)
  602   601 ??       claude
  700     1 ??       tmux
  701   700 ttys010  -zsh
  702   701 ttys010  claude
  710   502 ttys007  tmux
  800     1 ??       /usr/sbin/cron
  801   800 ??       claude
  900   502 ttys007  /usr/local/bin/codex
`
const TABLE = parsePs(PS)
const GHOSTTY = '/Applications/Ghostty.app'
const TERMINAL = '/System/Applications/Utilities/Terminal.app'
const TMUX = tmuxState('/dev/ttys010 %3 work\n/dev/ttys011 %4 other\n', '/dev/ttys007 work\n')

test("ps's table, and an executable's outermost app", () => {
  assert.deepEqual(TABLE.get(62043), {
    ppid: 21314,
    tty: '??',
    comm: '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)',
  })
  assert.equal(bundleOf(TABLE.get(62043).comm), '/Applications/Visual Studio Code.app')
  assert.equal(bundleOf('/usr/bin/login'), null)
})

test('a session is in the first app above it, with its tty', () => {
  assert.deepEqual(hostIn(TABLE, 13929), { app: 'ghostty', bundle: GHOSTTY, tty: '/dev/ttys003' })
  assert.deepEqual(hostIn(TABLE, 503), { app: 'terminal', bundle: TERMINAL, tty: '/dev/ttys007' })
  assert.deepEqual(hostIn(TABLE, 18322), { app: 'vscode', bundle: '/Applications/Visual Studio Code.app', tty: undefined })
  assert.deepEqual(hostIn(TABLE, 602), { app: 'cursor', bundle: '/Applications/Cursor.app', tty: undefined })
})

test('a session under no app has no host', () => {
  assert.equal(hostIn(TABLE, 801), null)
  assert.equal(hostIn(TABLE, 99999), null)
})

test("under tmux, it's the pane and the app its client shows in", () => {
  assert.deepEqual(hostIn(TABLE, 702, () => TMUX), {
    app: 'terminal',
    bundle: TERMINAL,
    tty: '/dev/ttys007',
    tmux: { pane: '%3', client: '/dev/ttys007' },
  })
  // Nobody attached to its session: nowhere to show it.
  assert.equal(hostIn(TABLE, 702, () => tmuxState('/dev/ttys010 %3 work\n', '')), null)
  assert.equal(hostIn(TABLE, 702), null, 'tmux not answering')
})

test("tmux's listings, session names with spaces too", () => {
  assert.deepEqual(tmuxState('/dev/ttys1 %0 my work\n', '/dev/ttys2 my work\n'), {
    panes: [{ tty: '/dev/ttys1', id: '%0', session: 'my work' }],
    clients: [{ tty: '/dev/ttys2', session: 'my work' }],
  })
})

test("lsof's cwd listing", () => {
  assert.deepEqual(parseLsofCwd('p900\nfcwd\nn/Users/me/app\np901\nfcwd\nn/x y\n'), new Map([[900, '/Users/me/app'], [901, '/x y']]))
})

// A Hosts on a fake system: what it ran, and what each command answers.
function fakeHosts(answers, platform = 'darwin') {
  const ran = []
  const hosts = new Hosts({
    platform,
    exec: (cmd, args) => {
      ran.push([cmd, ...args].join(' '))
      const answer = answers[cmd.split('/').pop()]
      if (answer === undefined) throw new Error('not here')
      return answer
    },
  })
  return { hosts, ran }
}

test('hosts are found once per pid, and forgotten when it ends', () => {
  const { hosts, ran } = fakeHosts({ ps: PS })
  const a = { sid: 'a', pid: 13929, app: 'cli' }
  const b = { sid: 'b', pid: 801, app: 'cli' }
  hosts.attach([a, b])
  assert.deepEqual(a.host, { app: 'ghostty', bundle: GHOSTTY, tty: '/dev/ttys003' })
  assert.equal(b.host, undefined)
  const again = [{ sid: 'a', pid: 13929, app: 'cli' }, { sid: 'b', pid: 801, app: 'cli' }]
  hosts.attach(again)
  assert.equal(again[0].host.app, 'ghostty')
  assert.equal(ran.filter(r => r.startsWith('ps')).length, 1, 'no ps for pids already known, even with no host')
  hosts.attach([])
  assert.equal(hosts.byPid.size, 0)
})

test("a Codex CLI thread's host is the running codex in its folder, looked for again after a while", () => {
  const { hosts, ran } = fakeHosts({ ps: PS, lsof: 'p900\nfcwd\nn/Users/me/app\n' })
  const thread = () => ({ sid: 't1', pid: 0, app: 'codex-cli', cwd: '/Users/me/app' })
  const t = thread()
  hosts.attach([t], 1000)
  assert.deepEqual(t.host, { app: 'terminal', bundle: TERMINAL, tty: '/dev/ttys007' })
  assert.ok(ran.includes('lsof -a -d cwd -Fpn -p 900'))
  hosts.attach([thread()], 2000)
  assert.equal(ran.length, 2, 'not looked for again so soon')
  hosts.attach([thread()], 20_000)
  assert.equal(ran.length, 4)
  const elsewhere = { sid: 't2', pid: 0, app: 'codex-cli', cwd: '/elsewhere' }
  hosts.attach([elsewhere], 40_000)
  assert.equal(elsewhere.host, undefined)
})

test("no ps, no hosts: Windows, or ps failing", () => {
  const win = fakeHosts({ ps: PS }, 'win32')
  const a = { sid: 'a', pid: 13929 }
  win.hosts.attach([a])
  assert.equal(a.host, undefined)
  assert.equal(win.ran.length, 0)
  const broken = fakeHosts({})
  broken.hosts.attach([a])
  assert.equal(a.host, undefined)
})

test("each terminal's tab is found by what that terminal can say", () => {
  const focus = { bundle: GHOSTTY, tty: '/dev/ttys003', cwd: '/Users/me', title: 'Easel drawing' }
  assert.deepEqual(focusSteps({ ...focus, app: 'ghostty' }), [
    ['osascript', ['-l', 'JavaScript', '-e', SCRIPTS.ghostty, GHOSTTY, '/Users/me', 'Easel drawing']],
  ])
  assert.deepEqual(focusSteps({ ...focus, app: 'terminal', bundle: TERMINAL }), [
    ['osascript', ['-l', 'JavaScript', '-e', SCRIPTS.terminal, TERMINAL, '/dev/ttys003']],
  ])
  assert.equal(focusSteps({ ...focus, app: 'iterm' })[0][1][3], SCRIPTS.iterm)
})

test("a title or folder can't get into a script's text", () => {
  const evil = '"); doShellScript("rm -rf ~'
  const [[, args]] = focusSteps({ app: 'ghostty', bundle: GHOSTTY, cwd: evil, title: evil })
  assert.equal(args[3], SCRIPTS.ghostty)
  assert.deepEqual(args.slice(4), [GHOSTTY, evil, evil])
})

test('under tmux, its pane is chosen before the terminal is shown', () => {
  const steps = focusSteps({ app: 'terminal', bundle: TERMINAL, tty: '/dev/ttys007', tmux: { pane: '%3', client: '/dev/ttys007' } })
  assert.deepEqual(
    steps.map(([cmd, args]) => [cmd.split('/').pop(), ...args.slice(0, 2)]),
    [['tmux', 'switch-client', '-c'], ['tmux', 'select-window', '-t'], ['tmux', 'select-pane', '-t'], ['osascript', '-l', 'JavaScript']],
  )
  const ghostty = focusSteps({ app: 'ghostty', bundle: GHOSTTY, tmux: { pane: '%3', client: '/dev/ttys007' } })
  assert.deepEqual(ghostty.at(-1), ['open', [GHOSTTY]], "Ghostty's tab can't be told by its title under tmux")
})

test('a step that fails (no tab, or Automation refused) falls back, once', () => {
  const ran = []
  let fellBack = 0
  const exec = (cmd, args, opts, cb) => {
    ran.push(cmd.split('/').pop())
    cb(cmd.endsWith('tmux') ? null : new Error('not allowed'))
  }
  focuser(exec)({ app: 'terminal', bundle: TERMINAL, tty: '/dev/ttys007', tmux: { pane: '%3', client: '/dev/ttys007' } }, () => fellBack++)
  assert.deepEqual(ran, ['tmux', 'tmux', 'tmux', 'osascript'])
  assert.equal(fellBack, 1)
  let ok = 0
  focuser((cmd, args, opts, cb) => cb(null))({ app: 'ghostty', bundle: GHOSTTY }, () => ok++)
  assert.equal(ok, 0, 'no fallback when it worked')
})
