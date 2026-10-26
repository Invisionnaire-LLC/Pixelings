#!/bin/sh
# Builds Pixelings.app from this folder and installs it in /Applications.
# The app then starts at login by itself (its menu has the switch).
#
#   host/deck/install-app.sh              build, install, open
#   host/deck/install-app.sh --uninstall  quit and remove it
#
# It also retires what came before: the "Clawd Deck" app and the
# clawd-deck login agent, carrying their saved looks, seats and settings
# over to Pixelings the first time. Needs Node.js 20 or newer to build. The
# app is signed for the Mac that builds it.
set -e

here="$(cd "$(dirname "$0")" && pwd)"
dest="/Applications/Pixelings.app"
domain="gui/$(id -u)"
support="$HOME/Library/Application Support/Pixelings"
old_support="$HOME/Library/Application Support/AIdeskCompanion"

# What came before: the clawd-deck login agent and the Clawd Deck app.
old_label=com.invisionnaire.clawd-deck
launchctl bootout "$domain/$old_label" 2>/dev/null || true
rm -rf "$HOME/Library/LaunchAgents/$old_label.plist" "$old_support/deck"
osascript -e 'tell application "Clawd Deck" to quit' >/dev/null 2>&1 || true
rm -rf "/Applications/Clawd Deck.app"

osascript -e 'tell application "Pixelings" to quit' >/dev/null 2>&1 || true

if [ "$1" = "--uninstall" ]; then
  rm -rf "$dest"
  echo "Pixelings removed (turn it off in System Settings > General > Login Items if it is still listed)"
  exit 0
fi

# Saved looks, seats and settings, and the sessions' latest state, carried
# over once (copied, so the old ones stay as they were).
mkdir -p "$support" "$HOME/Library/Caches/Pixelings/sessions"
[ -f "$support/cast.json" ] || [ ! -f "$old_support/deck-cast.json" ] || cp "$old_support/deck-cast.json" "$support/cast.json"
[ -f "$support/settings.json" ] || [ ! -f "$old_support/deck-settings.json" ] || cp "$old_support/deck-settings.json" "$support/settings.json"
for f in "$HOME/Library/Caches/AIdeskCompanion/sessions"/*.json; do
  [ -e "$f" ] || continue
  [ -e "$HOME/Library/Caches/Pixelings/sessions/$(basename "$f")" ] || cp "$f" "$HOME/Library/Caches/Pixelings/sessions/"
done

command -v node >/dev/null || { echo "building Pixelings needs Node.js 20 or newer" >&2; exit 1; }
cd "$here"
npm install --no-audit --no-fund >/dev/null
npm run dist >/dev/null
built="$(ls -d dist/Pixelings-darwin-*/Pixelings.app | head -1)"
codesign --force --deep --sign - "$built"

rm -rf "$dest"
cp -R "$built" "$dest"
# Run from an Electron app's terminal (T3 Code's, VS Code's), the shell has
# ELECTRON_RUN_AS_NODE set, and Pixelings started with it quits at once.
env -u ELECTRON_RUN_AS_NODE open "$dest"
echo "Pixelings installed in /Applications and running (menu bar)"
