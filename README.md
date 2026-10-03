# FlashModel

A compact model and effort switcher for Claude Code. One row above the prompt
shows the models you can use and the effort in force. Click to switch:

```text
Model  Haiku │ Sonnet │ Opus    Effort  ━━━━──────  medium
```

The active model and the effort level are bold; everything else is dim until
you hover or focus it. Effort is a slider, like the one in Claude Code's model
picker: each cell is one level (low, medium, high, xhigh, max), and clicking a
cell sets that level. No command to type, no picker to open, and both settings
stay visible. `/m` remains as a keyboard fallback.

## Install

```sh
claude plugin marketplace add <owner>/FlashModel   # or a local path
claude plugin install flashmodel@flashmodel
```

Try it without installing: `claude --plugin-dir /path/to/FlashModel`.

## Usage

| Do this | Result |
| --- | --- |
| Click a model | Switches to it |
| Click a cell of the effort slider | Sets that level |
| `Ctrl+X` `Tab`, then `Tab` to a model or slider cell and `Enter` | Same as a click; `Esc` returns to the prompt |
| `/m` | Switches to the next model: Haiku → Sonnet → Opus → Haiku |
| `/m <model>` | Switches to that model (any alias or id, Fable included) |
| `/m <effort>` | Sets the effort: `low`, `medium`, `high`, `xhigh` or `max` |
| `/m <model> <effort>` | Both at once, such as `/m opus high` |

While Claude is working, a model you pick shows in italics with `…` until
Claude Code applies it at the end of the turn. The row also updates when you
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
- Switching runs `/model <name>`, which is **session-only**: your saved default
  model is never changed.

### Effort

- The slider has one cell per level the active model takes. Haiku takes none
  and shows `Effort n/a`.
- **Session-only, and never saved.** `/effort <level>` saves the level as the
  model's default, so FlashModel does not run it. Instead, it sends your chosen
  level with each request of the main conversation. Subagents keep their own
  effort.
- Running `/effort` yourself takes over again from FlashModel's choice.
- With no choice made, the row shows what Claude Code uses: your saved
  per-model level, else the model's default. After the first request, it shows
  the level the request actually carried.

## Capabilities used

Mod hooks `session.start`, `command.run` (`/m`, and watching `/effort`),
`turn.step` (reads the effort of each main-conversation request and applies
yours), `ui.render` (the row above the prompt) and `classic.PostModelSwitch`.
`$` calls `command.register`, `command.run` (`/model` only), `config.list`,
`session.model`, `settings.read`, `clock.after`, `ui.resolve`,
`ui.invalidate` and `ui.toast`. FlashModel uses no network, files, processes
or tools, never writes settings, and runs nothing in the background.

## Known limitations

- **Claude Code's own effort indicator does not see FlashModel's choice.** The
  session header and footer show the effort Claude Code would use by itself;
  the row shows the effort actually sent.
- **No hotkeys.** Plugins cannot register shortcuts, and letter hotkeys
  collided between models and effort (`h` for Haiku and high). Use a click,
  `Ctrl+X Tab`, or `/m`. Claude Code's `Meta+P` opens its own picker.
- **Clicking needs a terminal with mouse support.**
- **Effort levels per model come from Claude Code's documentation**, since
  there is no API that lists them; a level a model does not take is not shown.
- FlashModel's effort choice lasts until the plugin reloads or the session
  ends.
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
