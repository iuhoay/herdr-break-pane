import { stdin, stdout, stderr } from "node:process";
import { pathToFileURL } from "node:url";

import { createHerdrRunner, paneIdFromEnvironment } from "./break-pane.mjs";

export function workspaceIdFromEnvironment(env) {
  if (env.HERDR_WORKSPACE_ID) return env.HERDR_WORKSPACE_ID;

  if (env.HERDR_PLUGIN_CONTEXT_JSON) {
    try {
      return JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON).workspace_id;
    } catch {
      throw new Error("HERDR_PLUGIN_CONTEXT_JSON is not valid JSON");
    }
  }

  return undefined;
}

export function sourcePaneIdFromEnvironment(env) {
  return env.SOURCE_PANE_ID || paneIdFromEnvironment(env);
}

export function listMoveTargets({ env = process.env, runHerdr } = {}) {
  const run = runHerdr ?? createHerdrRunner(env.HERDR_BIN_PATH || "herdr");
  const response = run(["workspace", "list"]);
  const workspaces = response?.result?.workspaces;

  if (response?.result?.type !== "workspace_list" || !Array.isArray(workspaces)) {
    throw new Error("workspace.list returned an unexpected response");
  }

  const currentWorkspaceId = workspaceIdFromEnvironment(env);
  return workspaces.filter((workspace) => {
    if (!workspace || typeof workspace.workspace_id !== "string") return false;
    if (currentWorkspaceId) return workspace.workspace_id !== currentWorkspaceId;
    return workspace.focused !== true;
  });
}

function unzoomThenMove(run, paneId, moveArgs) {
  const layoutResponse = run(["pane", "layout", "--pane", paneId]);
  const layout = layoutResponse?.result?.layout;

  if (!layout || !Array.isArray(layout.panes) || typeof layout.zoomed !== "boolean") {
    throw new Error("pane.layout returned an unexpected response");
  }

  if (layout.zoomed) {
    run(["pane", "zoom", paneId, "--off"]);
  }

  const moveResponse = run(["pane", "move", paneId, ...moveArgs]);
  const moveResult = moveResponse?.result?.move_result;
  if (!moveResult || typeof moveResult.changed !== "boolean") {
    throw new Error("pane.move returned an unexpected response");
  }

  return {
    changed: moveResult.changed,
    reason: moveResult.reason,
    pane_id: moveResult.pane?.pane_id ?? paneId,
  };
}

export function movePaneToWorkspace({
  env = process.env,
  runHerdr,
  workspaceId,
} = {}) {
  const paneId = sourcePaneIdFromEnvironment(env);
  if (!paneId) {
    throw new Error("no focused Herdr pane is available in the plugin context");
  }
  if (!workspaceId) {
    throw new Error("no target workspace was selected");
  }

  const run = runHerdr ?? createHerdrRunner(env.HERDR_BIN_PATH || "herdr");
  return {
    ...unzoomThenMove(run, paneId, [
      "--new-tab",
      "--workspace",
      workspaceId,
      "--focus",
    ]),
    workspace_id: workspaceId,
  };
}

export function movePaneToNewWorkspace({ env = process.env, runHerdr } = {}) {
  const paneId = sourcePaneIdFromEnvironment(env);
  if (!paneId) {
    throw new Error("no focused Herdr pane is available in the plugin context");
  }

  const run = runHerdr ?? createHerdrRunner(env.HERDR_BIN_PATH || "herdr");
  return unzoomThenMove(run, paneId, ["--new-workspace", "--focus"]);
}

export function openWorkspacePicker({ env = process.env, runHerdr } = {}) {
  const pluginId = env.HERDR_PLUGIN_ID;
  if (!pluginId) {
    throw new Error("HERDR_PLUGIN_ID is not set");
  }

  const paneId = sourcePaneIdFromEnvironment(env);
  if (!paneId) {
    throw new Error("no focused Herdr pane is available in the plugin context");
  }

  const run = runHerdr ?? createHerdrRunner(env.HERDR_BIN_PATH || "herdr");
  const args = [
    "plugin",
    "pane",
    "open",
    "--plugin",
    pluginId,
    "--entrypoint",
    "workspace-picker",
    "--env",
    `SOURCE_PANE_ID=${paneId}`,
  ];
  run(args);
  return { opened: true, pane_id: paneId };
}

function workspaceLabel(workspace) {
  const number = workspace.number != null ? String(workspace.number) : "";
  const label = workspace.label || workspace.workspace_id;
  return number ? `${number}  ${label}` : label;
}

export function filterWorkspaces(workspaces, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return workspaces;
  return workspaces.filter((workspace) => {
    const haystack = [
      workspace.label,
      workspace.workspace_id,
      workspace.number != null ? String(workspace.number) : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function visibleSlice(items, index, size) {
  if (items.length <= size) return { items, offset: 0 };
  const offset = Math.min(
    Math.max(0, index - Math.floor(size / 2)),
    items.length - size,
  );
  return { items: items.slice(offset, offset + size), offset };
}

function filterLine(state) {
  if (state.filtering) return `/${state.query}`;
  if (state.query) return `\x1b[2m/${state.query}\x1b[0m`;
  return "\x1b[2mj/k  /  c  enter  esc/q\x1b[0m";
}

function renderPicker(state, visible) {
  const rows = Math.min(stdout.rows || 16, 16);
  const size = Math.max(1, rows - 3);
  const { items, offset } = visibleSlice(visible, state.index, size);
  const lines = [
    "Move pane to workspace",
    filterLine(state),
    ...items.map((workspace, i) => {
      const selected = i + offset === state.index;
      const line = `${selected ? ">" : " "} ${workspaceLabel(workspace)}`;
      return selected ? `\x1b[7m${line}\x1b[0m` : line;
    }),
  ];
  if (items.length === 0) lines.push("\x1b[2mno matches\x1b[0m");
  stdout.write(`\x1b[?25l\x1b[2J\x1b[H${lines.join("\n")}`);
}

export function parseKey(buffer) {
  const text = buffer.toString("utf8");
  if (text === "\u0003") return "quit";
  if (text === "\r" || text === "\n") return "select";
  if (text === "\x7f" || text === "\b" || text.startsWith("\x1b[127")) return "backspace";
  if (text === "\x15") return "clear";
  if (text === "\x1b[B" || text === "\x1bOB" || text === "\x0e") return "down";
  if (text === "\x1b[A" || text === "\x1bOA" || text === "\x10") return "up";
  if (text === "\u001b" || text === "\u001b\u001b" || text.startsWith("\u001b[27")) {
    return "escape";
  }
  if (text.startsWith("\x1b")) return "other";
  if ([...text].every((ch) => ch >= " ")) return `type:${text}`;
  return "other";
}

export function applyPickerKey(state, key) {
  const visible = filterWorkspaces(state.targets, state.query);

  if (key === "quit") {
    return { ...state, done: "cancelled" };
  }

  if (key === "escape") {
    if (state.filtering) return { ...state, filtering: false };
    if (state.query) return { ...state, query: "", index: 0 };
    return { ...state, done: "cancelled" };
  }

  if (key === "select") {
    const selected = visible[state.index];
    if (!selected) return state;
    return { ...state, done: "select", workspaceId: selected.workspace_id };
  }

  const moveDown = key === "down" || (!state.filtering && key === "type:j");
  const moveUp = key === "up" || (!state.filtering && key === "type:k");
  if (moveDown) {
    if (visible.length === 0) return state;
    return { ...state, index: (state.index + 1) % visible.length };
  }
  if (moveUp) {
    if (visible.length === 0) return state;
    return {
      ...state,
      index: (state.index - 1 + visible.length) % visible.length,
    };
  }

  if (!state.filtering && key === "type:/") {
    return { ...state, filtering: true };
  }
  if (!state.filtering && key === "type:c") {
    return { ...state, done: "new-workspace" };
  }
  if (!state.filtering && key === "type:q") {
    return { ...state, done: "cancelled" };
  }

  if (state.filtering && key === "backspace") {
    return { ...state, query: state.query.slice(0, -1), index: 0 };
  }
  if (state.filtering && key === "clear") {
    return { ...state, query: "", index: 0 };
  }
  if (state.filtering && key.startsWith("type:")) {
    return { ...state, query: state.query + key.slice(5), index: 0 };
  }

  return state;
}

function readKey() {
  return new Promise((resolve) => {
    const onData = (chunk) => {
      stdin.off("data", onData);
      resolve(chunk);
    };
    stdin.on("data", onData);
  });
}

function restoreTerminal() {
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false);
    } catch {
      // ignore: stdin may already be paused or non-TTY during shutdown
    }
  }
  stdin.pause();
  stdout.write("\x1b[?25h");
}

async function runPicker({ env = process.env, runHerdr } = {}) {
  const targets = listMoveTargets({ env, runHerdr });

  if (!stdin.isTTY) {
    throw new Error("workspace picker requires a terminal");
  }

  stdin.setRawMode(true);
  stdin.resume();
  let state = { targets, index: 0, query: "", filtering: false };
  try {
    for (;;) {
      const visible = filterWorkspaces(state.targets, state.query);
      if (state.index >= visible.length) {
        state = { ...state, index: Math.max(0, visible.length - 1) };
      }
      renderPicker(state, visible);
      state = applyPickerKey(state, parseKey(await readKey()));
      if (state.done === "cancelled") {
        return { changed: false, reason: "cancelled" };
      }
      if (state.done === "select") {
        restoreTerminal();
        return movePaneToWorkspace({
          env,
          runHerdr,
          workspaceId: state.workspaceId,
        });
      }
      if (state.done === "new-workspace") {
        restoreTerminal();
        return movePaneToNewWorkspace({ env, runHerdr });
      }
    }
  } finally {
    restoreTerminal();
  }
}

async function main() {
  if (process.argv.includes("--open")) {
    openWorkspacePicker();
    return;
  }
  await runPicker();
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    restoreTerminal();
    stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
