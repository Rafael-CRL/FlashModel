# FlashModel

A compact model and effort switcher for Claude Code. One row above the prompt
shows the models you can use and the effort in force. Click to switch:

```text
Model  Haiku │ Sonnet │ Opus    Effort  ‹ medium ›
```

The active model and the effort level are bold; everything else is dim until
you hover or focus it. Effort is a stepper: `‹` lowers it one level, `›` raises
it (low, medium, high, xhigh, max). The value keeps a fixed width, so `›` stays
under the pointer when you click through levels, and an arrow dims at the end
of the range. No command to type, no picker to open, and both settings stay
visible. `/m` remains as a keyboard fallback.

## Install

```sh
claude plugin marketplace add Rafael-CRL/FlashModel   # or a local path
claude plugin install flashmodel@flashmodel
```

Try it without installing: `claude --plugin-dir /path/to/FlashModel`.

## Usage

| Do this | Result |
| --- | --- |
| Click a model | Switches to it |
| Click `‹` or `›` beside the effort | Lowers or raises it one level |
| `Ctrl+X` `Tab`, then `Tab` to a model or arrow and `Enter` | Same as a click; `Esc` returns to the prompt |
| `/m` | Switches to the next model: Haiku → Sonnet → Opus → Haiku |
| `/m <model>` | Switches to that model (any alias or id, Fable included) |
| `/m <effort>` | Sets the effort: `low`, `medium`, `high`, `xhigh` or `max` |
| `/m <model> <effort>` | Both at once, such as `/m opus high` |

While Claude is working, a model or effort level you pick shows in italics
until Claude Code applies it at the end of the turn. The row also updates when you
change the model or effort elsewhere: `/model`, the model picker, or `/effort`.
It makes way for surveys, and `Ctrl+X Ctrl+A` collapses it. When one row does
not fit, Effort moves to a second row.

### Models

- The models come from the options of the `/config` **Model** row, read each
  time, so they follow what your account offers, ordered smallest to largest.
- **Fable is left out** of the row and the `/m` cycle: it bills usage credits
  and needs a one-time consent. `/m fable` still switches to it.
- `default`, `best`, `opusplan` and the `[1m]` variants are left out; `/m
  sonnet[1m]` picks one explicitly.
- If Claude Code refuses a model during `/m` cycling (no access or a pending
  consent), FlashModel skips it for the rest of the session.

### Effort

- The stepper covers the levels the active model takes. Haiku takes none and
  shows `Effort n/a`. To jump straight to a level, use `/m <level>`.
- The row always shows Claude Code's own effort, the one in its session header
  and model picker. However you change it (the row, `/effort`, the `/effort`
  slider, or the model picker with Enter or `s`), the row follows, and the next
  request confirms it.

## Transparency and security

### Slash commands FlashModel runs

FlashModel switches models and effort by running Claude Code's own slash
commands, exactly as if you typed them. It runs these two and no others:

| Command | When FlashModel runs it | Side effects |
| --- | --- | --- |
| `/model <name>` | You click a model in the row; you run `/m` (it tries the next model and, if Claude Code refuses one, the one after, so a single `/m` can run `/model` more than once); you run `/m <model>` or `/m <model> <effort>` | Switches the session's model. **In an interactive session, Claude Code also saves it as your default model for new sessions** (`model` in `~/.claude/settings.json`); in a headless `claude -p` run it applies to this session only. Claude Code prints its usual "Set model to …" line in the transcript. |
| `/effort <level>` | You click `‹` or `›` in the row; you run `/m <effort>` or `/m <model> <effort>` | Sets the session's effort. **In an interactive session, Claude Code also saves it as that model's default** (`modelSettings.<model>.effortLevel` in `~/.claude/settings.json`); `max` is always for this session only, and so is every level in a headless run. Claude Code prints its usual "Set effort level to …" line in the transcript. |

Both run only after a click or a `/m` you typed, never on their own. While
Claude is working, Claude Code holds the command until the turn ends. FlashModel
writes no settings itself: anything saved is saved by these commands. For a
change that lasts only this session, use the model picker's `s` key, and the
row follows it.

FlashModel also registers one command of its own, `/m`, described under
[Usage](#usage).

### Events FlashModel hooks

| Event | What FlashModel reads | What it changes |
| --- | --- | --- |
| `session.start` | Nothing | Registers `/m`. Passes the event on unchanged. |
| `command.run`, for `/m` only | The arguments you typed after `/m` | Answers `/m` itself. No other command is hooked. |
| `ui.render`, for the band above the prompt only | Whether a survey holds the band, and its width | Draws the model and effort row; when a survey is showing, it leaves the band to the survey. No other part of the interface is touched. |
| `classic.PostModelSwitch` | Nothing from the event | Redraws the row. Passes the event on unchanged and adds no context for Claude. |
| `classic.ConfigChange` | Nothing from the event | Redraws the row, which re-reads the saved effort (see below). Passes the event on unchanged. |
| `session.append` | Every row passes through this hook as the conversation stores it. FlashModel looks only at command output in the main conversation, for the "Set model to …" and "Set effort level …" lines that `/model` and `/effort` print, and takes the effort level from them. | Nothing: every row is passed on unchanged. Prompts, Claude's replies, tool calls and results, and subagent rows are not inspected. |
| `turn.step` | The model id and effort level of each main-conversation request. Messages, system prompt and tools are not part of this event. | Nothing: every request is sent unchanged. |

### Data it reads, and what it does not do

- **Reads:** the session's model; the options of the `/config` Model row (the
  list of models offered); and, from your merged settings, only the effort
  fields `effortLevel` and `modelSettings.<model>.effortLevel`.
- **Keeps:** the current effort level, the models Claude Code refused during
  `/m` cycling, and which switch is pending, in memory only. Nothing is stored
  on disk, and it is gone when the session ends or the plugin reloads.
- **Does not:** change messages, prompts, the system prompt, tool descriptions
  or tool calls, other hooks, or permissions; read or write files; use the
  network, processes or tools; run anything in the background; or send data
  anywhere.

## Known limitations

- **Switches save a default, as Claude Code's commands do** (see [Slash
  commands FlashModel runs](#slash-commands-flashmodel-runs)). No command a mod
  can run switches for this session only; that needs the picker's `s` key.
- **No hotkeys.** Plugins cannot register shortcuts, and letter hotkeys
  collided between models and effort (`h` for Haiku and high). Use a click,
  `Ctrl+X Tab`, or `/m`. Claude Code's `Meta+P` opens its own picker.
- **Clicking needs a terminal with mouse support.**
- **Claude Code has no way to ask for the effort in force**, so FlashModel
  reads it from what `/model` and `/effort` report, your settings, and each
  request. A change it cannot see, such as `--effort` at startup, shows after
  the first request.
- **Effort levels per model come from Claude Code's documentation**, since
  there is no API that lists them; a level a model does not take is not shown.
- Terminal and desktop only; other surfaces keep `/m`.
- Mods are an early-access API and may change between Claude Code releases.
  Developed against Claude Code 2.1.288.

## Development

```sh
claude plugin validate . --strict
claude plugin test .
```

## Remove

`claude plugin uninstall flashmodel@flashmodel`

## License

MIT
