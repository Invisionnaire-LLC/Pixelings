# Changelog

## Unreleased

1. VS Code sessions open themselves, not just their folder — *requested by Adrian*
   - Pressing a VS Code session's key (or Open session in the window) now brings up that session's Claude tab in VS Code. It used to only bring the folder's window forward, which looked like nothing happened when several sessions shared a folder.
2. VS Code sessions go by their titles — *requested by Adrian*
   - Sessions with only Claude Code's default name, like every VS Code session ("sciroadsv2-04"), now show the title VS Code shows ("Feature explorer"), or the name you gave it.
3. The farm — *requested by Adrian*
   - Every agent now also lives in a pixel farm that fills a screen of its own, made for a Corsair Xeneon Edge under your monitor. There's a barn, crops, a pond and trees, and the sky follows the time of day. A new agent drops in with a sparkle, and a closed one vanishes in a puff. Idle ones wander about, tend the crops, fish or nap under a tree. Busy ones stop and face you, doing what their key shows: typing at a laptop, waving when asking, with a bubble for a question. Tap one to open its session, or tap the barn door to start a new agent. Settings › Display › Scene picks the screen: Automatic finds a Xeneon Edge or another long, short screen, or you can choose one. It shows while the Scene is on (below).
4. An office and a mall besides the farm — *requested by Adrian*
   - Settings › Display › Scene, or a tap on the place's name in the screen's top corner moves everyone to the farm, an office or a mall, where they arrive again with a sparkle. In the office, idle Pixelings get a coffee, water the plants, print, play ping-pong or nap on the couch, under a clock that tells the real time and windows on the city. At the mall they window-shop, play in the arcade, toss coins in the fountain, eat ice cream at the food court or nap on a bench, under a skylight. The lift and the mall's doors start a new agent, as the barn door does.
5. Terminal sessions open their own tab, not Finder — *requested by Adrian*
   - Pressing a Claude Code session running in Ghostty, Terminal or iTerm2 now brings up that terminal on that session's tab, inside tmux too. It used to open the session's folder in Finder. macOS asks once per terminal to let Pixelings control it. If you say no, or the tab can't be found, the terminal still comes to the front. Codex CLI threads open the same way.
6. Cursor sessions open in Cursor — *requested by Adrian*
   - Claude Code sessions in Cursor used to open VS Code. They now open in Cursor, on that session's tab. A session running in VS Code's or Cursor's own terminal opens that folder's window there, and one in any other app brings that app forward.
7. Pick where the Pixelings show, and how the farm sits — *requested by Adrian*
   - Settings › Display lists each place the Pixelings can show, each with its own switch and page: Stream Deck (on its keys, with its brightness) Scene (the farm on a screen you pick) and Desktop (below), on together or one at a time; the ESP32 Board is listed as coming. Turning the Stream Deck off hands it back to the Elgato logo. The farm can fill its screen (over the menu bar), sit in a window you move and size (kept on top or not; closing it turns the farm off), or run as a strip along the top or bottom of the screen in three heights. The window's top bar says everywhere they show, or that a deck or screen isn't plugged in.
8. A shorter menu bar menu — *requested by Adrian*
   - The menu bar's menu no longer lists every agent or starts a new one (the window and the keys do both), and its settings live in the window: it has Open Pixelings, Settings… (⌘,), which opens the window on its Settings, Show Agents Started by Other Agents, Start at Login and Quit.
9. The Pixelings on your desktop — *requested by Adrian*
   - Settings › Display › Desktop puts the Pixelings straight on your desktop, with nothing behind them. They walk along the bottom of your main screen (or one you pick), just above the Dock or the taskbar, over your windows and on every desktop. Click one to open its session; hovering does nothing, and a click anywhere they aren't goes to whatever is under them, so a text box between two of them works as usual. They stay behind the window you're using, and one that asks you something comes to the front until you answer it; or keep them all on top. Their context bars are hidden there unless you turn them on. External Monitor is now called Scene, as it can go on any screen.

## v0.1.3 — 2026-10-25

1. T3 Code support — *requested by Adrian*
   - Claude Code threads in T3 Code now open in T3 Code: pressing one's key takes you to that thread instead of its folder, and the window says it runs in T3 Code. They already had keys; Pixelings now matches each session to its T3 thread from T3 Code's own logs.

## v0.1.2 — 2026-10-25

1. Grok Bot support — *requested by Adrian*
   - Your Grok Bot bots now get keys alongside Claude Code sessions and Codex threads. Each one is drawn in the shape and colour it has in the Grok Bot app, with the app's two little eyes. Pressing its key opens that bot in Grok Bot. Nothing to install: Pixelings reads what the Grok Bot app keeps on disk while it's open.
2. Grok bots show what you'd expect — *requested by Adrian*
   - A bot that has answered is done, not waiting on you: it goes straight to idle and only shows as asking when it really needs you. Its idle time counts from your last conversation with it, so bots you never talk to stay off the deck.
3. A Settings page — *requested by Adrian*
   - The window has one Settings page, the same size whatever you look at, with General, Flash and Agents in a sidebar. General has starting at login and the app's version.
4. Flashes for more than questions — *requested by Adrian*
   - A key can flash when an agent asks a question, asks permission, has just finished, is waiting for you, is compacting, or has a nearly full context. Each has its own on or off, style (whole key, fade or border), colour and speed, plus strength for the whole key and fade, or size for the border, with a live preview beside each.
5. Hide idle agents after a while — *requested by Adrian*
   - Pick how long an idle agent keeps its key: 1 minute, 1 to 5 hours, or never (two hours until changed). Waiting for you isn't idle: an agent turns idle half an hour after it finishes, then the clock starts. Working, asking and waiting agents always keep their keys.
6. Agents started by other agents stay off the deck unless you want them — *requested by Adrian*
   - Claude Code sessions run by a script, the Agent SDK or another agent, Codex threads one agent made for another, and Grok bots' work for other bots or their automations no longer take keys. Turn on "Show agents started by other agents" to see them.
7. Start at login works again after a reinstall
   - Pixelings now sets itself to start at login every time it opens, so a reinstalled or moved app no longer drops out of your login items.
8. A turn that ends on a question shows as asking
   - When Claude ends its turn with a question for you (the Claude app's next-step box), the key shows QUESTION instead of your move.
9. Keys say what each agent is doing
   - A busy key shows WORKING..., WAITING..., COMPACTING..., PERMISSION or QUESTION under its character, and an idle key shows the session's name.

## v0.1.1 — 2026-10-24

1. Downloads on GitHub Releases
   - The first release with the Mac and Windows downloads attached: releases now get their files before they are published.

## v0.1.0 — 2026-10-24

1. First release
   - Every Claude Code session and Codex thread on your Mac or Windows PC becomes a little pixel character on an Elgato Stream Deck key: Clawd for Claude Code, a Codex dot for Codex. Each has his own hat, colour and background, types at his laptop while his agent works, pulses red when he needs you, and shows how full his context is with smoke and fire. Press his key to open his session. A menu bar app drives the deck, and its window lets you arrange and dress everyone. Under the GPL v3. (This release went out before its downloads could be attached; get 0.1.1.)
