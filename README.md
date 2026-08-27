# herdr-break-pane

A small Herdr plugin with two pane actions:

- **Break** moves the focused pane into a new tab in the same workspace (tmux-style break-pane). A pane that is already alone in its tab is left untouched.
- **Move to workspace** opens a popup to pick another workspace (or create one) and moves the pane there as a new tab. A lone pane is still moved — relocating it is the point.

Both actions unzoom a zoomed tab before the move. The pane and its running process stay alive and receive focus afterwards.

![Demo](https://github.com/iuhoay/herdr-break-pane/releases/download/demo/demo.mp4)

## Usage

Break runs immediately. Move to workspace opens a popup (the current workspace is omitted):

| Key | Action |
| --- | --- |
| `j` / `k` or arrows | move selection |
| `/` | filter by number, label, or id |
| `c` | move the pane into a new workspace |
| Enter | move to the selected workspace |
| `esc` / `q` | cancel |

## Background

I originally shared this idea in
[Herdr Discussion #1114](https://github.com/ogulcancelik/herdr/discussions/1114).

This plugin makes the proposed `break_pane` workflow available today using
Herdr's public plugin APIs. If you find it useful, feel free to try it and join
the discussion—the feedback and upvotes help show whether it would also be
valuable as a built-in Herdr action.

## Requirements

- Herdr 0.7.4 or newer
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

[[keys.command]]
key = "prefix+shift+m"
type = "plugin_action"
command = "iuhoay.break-pane.move-to-workspace"
description = "move pane to workspace"
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
herdr plugin action invoke iuhoay.break-pane.move-to-workspace
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

The plugin has no npm dependencies. Herdr starts the declared actions and the workspace picker popup; the scripts read the focused pane from the injected plugin context and call Herdr back through `HERDR_BIN_PATH`.
