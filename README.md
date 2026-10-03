# FlashModel

Switch Claude models in Claude Code with two keystrokes and Enter: `/m`.

Each `/m` moves the session to the next model available to you and shows a
toast with the new model. Pass a name to jump straight there: `/m haiku`.

## Install

```sh
claude plugin marketplace add <owner>/FlashModel   # or a local path
claude plugin install flashmodel@flashmodel
```

Try it without installing: `claude --plugin-dir /path/to/FlashModel`.

## Usage

| Command | Effect |
| --- | --- |
| `/m` | Switch to the next model in the cycle |
| `/m <model>` | Switch to that alias or id, same as `/model <model>` |

Because `/m` is a command, it runs from the prompt; with the autocomplete
menu open, `/m` + Enter is all it takes. Claude Code's own shortcut
`Meta+P` (`chat:modelPicker`) opens the model picker if you prefer a key.

### How cycling works

- The cycle is the options of the `/config` **Model** row, read each time, so
  it follows what your account offers.
- `default`, `best`, `opusplan` and the `[1m]` variants are skipped: they are
  not distinct models to land on. Use `/m sonnet[1m]` to pick one explicitly.
- The current model is matched against the list; an unrecognised one moves to
  the first entry. After the last entry it wraps to the first.
- If Claude Code refuses a switch (no access, or a one-time consent such as
  Fable's), FlashModel tries the next model and skips the refused one for the
  rest of the session.
- The switch is **session-only**, exactly like `/model <name>`. Your saved
  default model in `settings.json` is never changed.

## Capabilities used

Mod hooks `session.start` and `command.run`, and the `$` calls
`command.register`, `command.run`, `config.list`, `session.model`,
`clock.after` and `ui.toast`. No network, files, processes, tools, or
settings writes. Nothing runs in the background.

## Known limitations

- **No hotkey.** Plugins cannot register keyboard shortcuts; only the user's
  `keybindings.json` can, and it cannot bind a key to a slash command.
- **Cycling is not a one-press action** for the same reason; `/m` is the
  shortest supported route.
- **Confirmation is a toast** plus Claude Code's own "Set model to …" line.
  Claude Code runs `/model` after the command returns, so the toast comes a
  moment later.
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
