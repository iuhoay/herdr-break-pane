# herdr-break-pane

A small Herdr plugin that moves the focused pane into a new tab.

It mirrors tmux-style break-pane behavior:

- a pane that is already alone in its tab is left untouched;
- a zoomed multi-pane tab is unzoomed before the pane moves;
- the moved pane and its running process remain alive and receive focus in the new tab.

## Requirements

- Herdr 0.7.0 or newer
- Node.js 18 or newer

## Install

Install the plugin directly from GitHub:

```bash
herdr plugin install iuhoay/herdr-break-pane
herdr plugin action list --plugin iuhoay.break-pane
```

## Manual keybinding setup

Herdr plugins cannot install keybindings from their manifests. After installing or linking this plugin, add the binding manually to your Herdr `config.toml`:

- Linux and macOS: `~/.config/herdr/config.toml` (or `$XDG_CONFIG_HOME/herdr/config.toml`)
- Windows: `%APPDATA%\herdr\config.toml`
- Custom location: the path specified by `HERDR_CONFIG_PATH`

Append this block at the top level of the file, outside any existing `[section]`:

```toml
[[keys.command]]
key = "prefix+shift+c"
type = "plugin_action"
command = "iuhoay.break-pane.break"
description = "break pane to new tab"
```

The binding syntax uses `+` between every part: `prefix+shift+c`, not `prefix-shift+c`. You can replace it with another unused key combination.

Validate and apply the configuration:

```bash
herdr config check
herdr server reload-config
```

A successful reload reports `"status":"applied"` with an empty `diagnostics` array. If Herdr reports a key conflict, choose another key and reload again.

Confirm that the plugin action is registered:

```bash
herdr plugin action list --plugin iuhoay.break-pane
```

You can test the action without a keybinding:

```bash
herdr plugin action invoke iuhoay.break-pane.break
```

To remove the shortcut, delete the complete `[[keys.command]]` block and run `herdr server reload-config` again. Uninstalling the plugin does not remove manually added keybindings.

## Development

Link a local checkout while developing:

```bash
git clone https://github.com/iuhoay/herdr-break-pane.git
cd herdr-break-pane
herdr plugin link .
```

Run the tests:

```bash
npm test
```

The plugin has no npm dependencies. Herdr starts `break-pane.mjs` as a declared plugin action; the script reads the focused pane from the injected plugin context and calls Herdr back through `HERDR_BIN_PATH`.
