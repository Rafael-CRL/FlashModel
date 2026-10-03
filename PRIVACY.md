# FlashModel Privacy Policy

Effective October 3, 2026.

FlashModel is a Claude Code plugin that runs entirely on your computer, inside
Claude Code. It has no server, no account and no analytics.

## What it reads

- The model your Claude Code session is using.
- The list of models in Claude Code's `/config` Model setting.
- The effort fields of your Claude Code settings (`effortLevel` and
  `modelSettings.<model>.effortLevel`). Claude Code hands plugins the settings
  as a whole; FlashModel uses only these fields.
- The lines Claude Code prints after `/model` and `/effort` ("Set model to …",
  "Set effort level …"), to follow the effort in force. Every row of the
  conversation passes through the same plugin event; FlashModel reads no other
  rows: not your prompts, Claude's replies, tool calls or results, or rows from
  other plugins or subagents.
- The model and effort level of each request Claude Code sends. Messages, the
  system prompt and tools are not part of that event.

## What it keeps

The current effort level, the models Claude Code refused during `/m` cycling,
and which switch is pending, in memory only. Nothing is written to disk, and
all of it is gone when the session ends or the plugin reloads.

## What it sends

Nothing. FlashModel makes no network requests and shares no data with anyone,
including the plugin's author.

## What it changes

FlashModel runs Claude Code's own `/model` and `/effort` commands when you ask
it to switch. In an interactive session, Claude Code saves that choice as your
default in `~/.claude/settings.json`, as it does when you type those commands
yourself. FlashModel writes no files of its own. The README's "Transparency and
security" section describes every command and event in detail.

## Changes and contact

Changes to this policy are published in this file, in the plugin's repository.
Questions: open an issue at https://github.com/Rafael-CRL/FlashModel/issues.
