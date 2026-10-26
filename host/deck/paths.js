// Where Pixelings keeps things, on each system. The plugin's hook
// (plugin/hooks/pixelings-hook.js) has its own copy of sessionsDir and must
// agree with it: the hook writes there, the app reads.
//
//            macOS                               Windows                       Linux
//   data     ~/Library/Application Support/...   %APPDATA%\Pixelings           ~/.config/pixelings
//   cache    ~/Library/Caches/Pixelings          %LOCALAPPDATA%\Pixelings      ~/.cache/pixelings
//   logs     ~/Library/Logs/Pixelings            %LOCALAPPDATA%\Pixelings\Logs ~/.local/state/pixelings
import os from 'node:os'
import path from 'node:path'

export function dirs(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'darwin') {
    return {
      data: path.join(home, 'Library', 'Application Support', 'Pixelings'),
      cache: path.join(home, 'Library', 'Caches', 'Pixelings'),
      logs: path.join(home, 'Library', 'Logs', 'Pixelings'),
    }
  }
  if (platform === 'win32') {
    const roaming = env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    const local = env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    return {
      data: path.join(roaming, 'Pixelings'),
      cache: path.join(local, 'Pixelings'),
      logs: path.join(local, 'Pixelings', 'Logs'),
    }
  }
  return {
    data: path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'pixelings'),
    cache: path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'pixelings'),
    logs: path.join(env.XDG_STATE_HOME ?? path.join(home, '.local', 'state'), 'pixelings'),
  }
}

// Each session's latest state, written by the plugin's hooks.
export function sessionsDir(platform, env = process.env, home) {
  return env.PIXELINGS_SESSIONS_DIR ?? path.join(dirs(platform, env, home).cache, 'sessions')
}

// Claude Code's own folder (CLAUDE_CONFIG_DIR, as Claude Code reads it) and
// Codex's (CODEX_HOME).
export const claudeDir = (env = process.env, home = os.homedir()) => env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude')
export const codexDir = (env = process.env, home = os.homedir()) =>
  env.PIXELINGS_CODEX_DIR ?? env.CODEX_HOME ?? path.join(home, '.codex')

// T3 Code's userdata folder (under T3CODE_HOME, ~/.t3 unless set).
export const t3Dir = (env = process.env, home = os.homedir()) =>
  env.PIXELINGS_T3_DIR ?? path.join(env.T3CODE_HOME ?? path.join(home, '.t3'), 'userdata')

// Grok Bot's own folder (Electron's userData for the "Grok Bot" app), where
// it keeps its bots and their chats while it is open.
export function grokBotDir(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.PIXELINGS_GROKBOT_DIR) return env.PIXELINGS_GROKBOT_DIR
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Grok Bot')
  if (platform === 'win32') return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Grok Bot')
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'Grok Bot')
}
