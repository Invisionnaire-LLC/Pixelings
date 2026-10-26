# Changelog

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
