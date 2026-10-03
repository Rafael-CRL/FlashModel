# FlashModel

A compact model switcher for Claude Code. One row above the prompt shows the
models available to you, marks the active one, and switches when you click or
press a key:

```text
Model  h: Haiku   s: ● Sonnet   o: Opus   f: Fable
```

No command to remember, no picker to open. `/m` cycles to the next model as a
fallback.

## Install

```sh
claude plugin marketplace add <owner>/FlashModel   # or a local path
claude plugin install flashmodel@flashmodel
```

Try it without installing: `claude --plugin-dir /path/to/FlashModel`.

## Usage

| Do this | Result |
| --- | --- |
| Click a model in the row | Switches to it |
| `Ctrl+X` then `Tab`, then the model's letter (`h`, `s`, `o`, `f`) | Switches to it; `Esc` returns to the prompt |
| `/m` | Switches to the next model, wrapping around |
| `/m <model>` | Switches to that alias or id, same as `/model <model>` |

The row updates whenever the model changes, including through `/model`, the
model picker, or `/m`. A toast also confirms each switch. The row yields to
surveys, and you can collapse it with `Ctrl+X Ctrl+A`.

### Model list and cycling

- The models are the options of the `/config` **Model** row, read each time,
  so they follow what your account offers. They are shown smallest to largest
  (Haiku, Sonnet, Opus, Fable); `/m` cycles in the same order.
- `default`, `best`, `opusplan` and the `[1m]` variants are not shown. Use
  `/m sonnet[1m]` to pick one explicitly.
- If Claude Code refuses a switch (no access, or a one-time consent such as
  Fable's), `/m` moves on to the next model and skips the refused one for the
  rest of the session. Clicking a refused model shows `Model unchanged`.
- Every switch is **session-only**, exactly like `/model <name>`. Your saved
  default model in `settings.json` is never changed.

### Option: number keys

Off by default. In the plugin's options (`/config`), turn on **Digit hotkeys**
and the row shows `1: Haiku  2: Sonnet ...`. Typing a digit alone into an empty
prompt and pausing then presses that model, with no focus step. The cost: a
bare `1` typed as a reply to Claude also triggers it, which is why it is opt-in.

### Optional: your own keybinding

Plugins cannot register shortcuts, and `keybindings.json` cannot bind a key to
a slash command, so FlashModel ships none. Claude Code's built-in `Meta+P`
(`chat:modelPicker`) opens the native picker if you want a single key.

## Capabilities used

Mod hooks `session.start`, `command.run`, `ui.render` (the band above the
prompt) and `classic.PostModelSwitch`, and the `$` calls `command.register`,
`command.run`, `config.list`, `session.model`, `clock.after`, `ui.resolve`,
`ui.invalidate` and `ui.toast`. No network, files, processes, tools, or
settings writes. Nothing runs in the background.

## Known limitations

- **Terminal and desktop only.** The band is drawn on those surfaces; other
  surfaces keep `/m`.
- **Clicking needs a terminal with mouse support** (Claude Code's fullscreen
  mode). Without it, use the keyboard path or `/m`.
- **No single-key shortcut** without the number-keys option (see above).
- **One row of space** above the prompt; hidden while a survey is shown, or
  when fewer than two models are available.
- Mods are an early-access API and may change between Claude Code releases.
  Developed against Claude Code 2.1.288.
- The tests mount the row on the terminal and desktop surfaces and press its
  buttons, but the real terminal's mouse and key handling is Claude Code's own
  and is not exercised by `claude plugin test`.

## Development

```sh
claude plugin validate . --strict
claude plugin test .
```

## Remove

`claude plugin uninstall flashmodel@flashmodel`

## License

MIT
