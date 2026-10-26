// A made-up deck of 15 agents, one of every state, with neutral names and
// folders: the README's pictures, the app's screenshot mode and the
// preview tool, so no real session's title or project is ever shown.
// Looks come from a fixed seed, so every picture shows the same characters.
import { castFor } from './cast.js'

export const DEMO_STARTED = 1_800_000_000_000

// Claude Code sessions (Clawd) and Codex threads (the Codex dots).
const CODEX = { tool: 'codex', app: 'codex-app' }
const AGENTS = [
  ['Fix login bug', 'web-app', 'ask', { ask: 'permission', pct: 34 }],
  ['Release notes', 'docs', 'done', { pct: 55 }],
  ['Refactor API', 'api', 'working', { pct: 22, ...CODEX }],
  ['Landing page', 'web-app', 'working', { pct: 66 }],
  ['Write tests', 'api', 'ask', { ask: 'question', pct: 12 }],
  ['Migrations', 'api', 'working', { pct: 84, ...CODEX }],
  ['Long thread', 'mobile', 'compacting', { pct: 97 }],
  ['Design tokens', 'web-app', 'idle', { ...CODEX }],
  ['Search index', 'api', 'working', { pct: 41 }],
  ['Bump deps', 'mobile', 'idle', {}],
  ['Perf audit', 'web-app', 'done', { pct: 47, ...CODEX }],
  ['CI cleanup', 'infra', 'idle', {}],
  ['Onboarding', 'docs', 'working', { pct: 18 }],
  ['Crash report', 'mobile', 'idle', { ...CODEX }],
  ['Dark mode', 'mobile', 'working', { pct: 29 }],
]

// The same small seeded random as the tests: the same cast every time.
function seeded(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// The demo agents as readAgents gives them, at `now`.
export function demoAgents(now = Date.now()) {
  return AGENTS.map(([title, folder, kind, over], i) => ({
    sid: `demo-${i}`,
    pid: 0,
    kind,
    since: now - (i + 1) * 47_000,
    startedAt: DEMO_STARTED + i,
    title,
    folder,
    cwd: `/Users/you/code/${folder}`,
    tool: 'claude',
    app: 'claude-desktop',
    ...over,
  }))
}

// The demo agents dressed and seated, as the hub would have them.
export function demoCast(now = Date.now(), seed = 20261023) {
  const agents = demoAgents(now)
  const { cast } = castFor(
    agents.map(a => a.sid),
    {},
    now,
    seeded(seed),
  )
  return agents.map(a => ({
    ...a,
    look: { ...cast[a.sid].look, species: a.tool === 'codex' ? 'codex' : 'clawd' },
    seat: cast[a.sid].seat,
  }))
}

export { seeded }
