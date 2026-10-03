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

### What is saved

Each switch runs Claude Code's own command, exactly as if you typed it:
`/model <name>` for a model and `/effort <level>` for effort. In an interactive
session, Claude Code saves that pick as your default for new sessions, the same
as typing the command or pressing Enter in its picker (`max` effort is always
for this session only). FlashModel writes no settings itself. For a
this-session-only change, use the model picker's `s` key; the row follows it.

## Capabilities used

Mod hooks `session.start`, `command.run` (`/m`), `ui.render` (the row above the
prompt), and, to follow the model and effort in force: `classic.PostModelSwitch`,
`classic.ConfigChange`, `session.append` (reads what `/model` and `/effort`
report) and `turn.step` (reads the effort each request carries). `$` calls
`command.register`, `command.run` (`/model` and `/effort` only), `config.list`,
`session.model`, `settings.read`, `clock.after`, `ui.resolve`, `ui.invalidate`
and `ui.toast`. FlashModel changes no messages or requests, uses no network,
files, processes or tools, and runs nothing in the background.

## Known limitations

- **Switches save a default, as Claude Code's commands do.** No command a mod
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
