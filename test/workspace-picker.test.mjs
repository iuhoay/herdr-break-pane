import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPickerKey,
  filterWorkspaces,
  listMoveTargets,
  movePaneToNewWorkspace,
  movePaneToWorkspace,
  openWorkspacePicker,
  parseKey,
  renderPickerFrame,
} from "../workspace-picker.mjs";

const paneId = "w1:p2";
const workspaceId = "w2";

function layoutResponse({ paneCount, zoomed }) {
  return {
    result: {
      type: "pane_layout",
      layout: {
        zoomed,
        panes: Array.from({ length: paneCount }, (_, index) => ({
          pane_id: `w1:p${index + 1}`,
        })),
      },
    },
  };
}

function moveResponse({ changed = true, movedPaneId = paneId } = {}) {
  return {
    result: {
      type: "pane_move",
      move_result: {
        changed,
        pane: { pane_id: movedPaneId },
      },
    },
  };
}

function workspaceListResponse(workspaces) {
  return {
    result: {
      type: "workspace_list",
      workspaces,
    },
  };
}

test("lists workspaces other than the current one", () => {
  const targets = listMoveTargets({
    env: { HERDR_WORKSPACE_ID: "w1" },
    runHerdr() {
      return workspaceListResponse([
        { workspace_id: "w1", label: "one", number: 1, focused: true },
        { workspace_id: "w2", label: "two", number: 2, focused: false },
      ]);
    },
  });

  assert.deepEqual(
    targets.map((workspace) => workspace.workspace_id),
    ["w2"],
  );
});

test("falls back to the unfocused workspaces when no current id is set", () => {
  const targets = listMoveTargets({
    env: {},
    runHerdr() {
      return workspaceListResponse([
        { workspace_id: "w1", focused: true },
        { workspace_id: "w2", focused: false },
      ]);
    },
  });

  assert.deepEqual(
    targets.map((workspace) => workspace.workspace_id),
    ["w2"],
  );
});

test("moves a single pane into another workspace", () => {
  const calls = [];
  const responses = [
    layoutResponse({ paneCount: 1, zoomed: false }),
    moveResponse(),
  ];

  const result = movePaneToWorkspace({
    env: { HERDR_PANE_ID: paneId },
    workspaceId,
    runHerdr(args) {
      calls.push(args);
      return responses.shift();
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.workspace_id, workspaceId);
  assert.deepEqual(calls, [
    ["pane", "layout", "--pane", paneId],
    ["pane", "move", paneId, "--new-tab", "--workspace", workspaceId, "--focus"],
  ]);
});

test("moves the pane into a new workspace", () => {
  const calls = [];
  const responses = [
    layoutResponse({ paneCount: 1, zoomed: false }),
    moveResponse(),
  ];

  movePaneToNewWorkspace({
    env: { HERDR_PANE_ID: paneId },
    runHerdr(args) {
      calls.push(args);
      return responses.shift();
    },
  });

  assert.deepEqual(calls, [
    ["pane", "layout", "--pane", paneId],
    ["pane", "move", paneId, "--new-workspace", "--focus"],
  ]);
});

test("unzooms before moving into another workspace", () => {
  const calls = [];
  const responses = [
    layoutResponse({ paneCount: 2, zoomed: true }),
    { result: { type: "pane_zoom" } },
    moveResponse(),
  ];

  movePaneToWorkspace({
    env: { SOURCE_PANE_ID: paneId },
    workspaceId,
    runHerdr(args) {
      calls.push(args);
      return responses.shift();
    },
  });

  assert.deepEqual(calls, [
    ["pane", "layout", "--pane", paneId],
    ["pane", "zoom", paneId, "--off"],
    ["pane", "move", paneId, "--new-tab", "--workspace", workspaceId, "--focus"],
  ]);
});

test("opens the picker pane with the source pane id", () => {
  const calls = [];

  const result = openWorkspacePicker({
    env: {
      HERDR_PLUGIN_ID: "iuhoay.break-pane",
      HERDR_PANE_ID: paneId,
    },
    runHerdr(args) {
      calls.push(args);
      return { result: { type: "ok" } };
    },
  });

  assert.deepEqual(result, { opened: true, pane_id: paneId });
  assert.deepEqual(calls, [
    [
      "plugin",
      "pane",
      "open",
      "--plugin",
      "iuhoay.break-pane",
      "--entrypoint",
      "workspace-picker",
      "--env",
      `SOURCE_PANE_ID=${paneId}`,
    ],
  ]);
});

test("rejects a move without a focused pane", () => {
  assert.throws(
    () => movePaneToWorkspace({ env: {}, workspaceId, runHerdr() {} }),
    /no focused Herdr pane/,
  );
});

test("treats escape encodings as escape and ctrl-c as quit", () => {
  assert.equal(parseKey(Buffer.from("\u001b")), "escape");
  assert.equal(parseKey(Buffer.from("\u001b[27u")), "escape");
  assert.equal(parseKey(Buffer.from("\u001b[27;1u")), "escape");
  assert.equal(parseKey(Buffer.from("\u0003")), "quit");
  assert.equal(parseKey(Buffer.from("/")), "type:/");
});

test("filters workspaces by label, id, or number", () => {
  const workspaces = [
    { workspace_id: "w1", label: "herdr-break-pane", number: 1 },
    { workspace_id: "w2", label: "core_mind", number: 2 },
  ];
  assert.deepEqual(
    filterWorkspaces(workspaces, "HERDR").map((workspace) => workspace.workspace_id),
    ["w1"],
  );
  assert.deepEqual(
    filterWorkspaces(workspaces, "w2").map((workspace) => workspace.workspace_id),
    ["w2"],
  );
  assert.deepEqual(
    filterWorkspaces(workspaces, "2").map((workspace) => workspace.workspace_id),
    ["w2"],
  );
});

test("lays the picker out like the Go To list", () => {
  const frame = renderPickerFrame(
    { index: 0, query: "", filtering: false },
    [
      { workspace_id: "w2", label: "core", number: 2 },
      { workspace_id: "w10", label: "notes", number: 10 },
    ],
    { columns: 40, rows: 8 },
  );
  const lines = frame.split("\n");

  assert.equal(lines.length, 8);
  assert.equal(frame.includes("Move pane to workspace"), false);
  assert.match(lines[0], /\/ search workspaces/);
  assert.match(lines[0], /2\x1b\[0m$/);
  assert.match(lines[1], /─{40}/);
  assert.match(lines[2], /\x1b\[1;7m {2}2  core/);
  assert.equal(lines[2].includes(">"), false);
  assert.equal(lines[2].match(/\x1b\[1;7m(.*)\x1b\[0m/)[1].length, 40);
  assert.match(lines[3], /10 {2}notes/);
  assert.equal(lines[3].includes("\x1b[1;7m"), false);
  assert.match(lines[7], /↑↓\/j\/k · \/ search · c new · enter · esc/);
});

test("pins the search query and filters the footer while typing", () => {
  const frame = renderPickerFrame(
    { index: 0, query: "nope", filtering: true },
    [],
    { columns: 48, rows: 5 },
  );
  const lines = frame.split("\n");

  assert.match(lines[0], /\/ nope/);
  assert.equal(lines[0].includes("search workspaces"), false);
  assert.match(frame, /No matches/);
  assert.match(lines[4], /type · ↑↓ · enter · esc/);
});

test("uses vim-style slash filtering", () => {
  let state = {
    targets: [
      { workspace_id: "w1", label: "alpha" },
      { workspace_id: "w2", label: "beta" },
    ],
    index: 0,
    query: "",
    filtering: false,
  };

  state = applyPickerKey(state, "type:j");
  assert.equal(state.index, 1);

  state = applyPickerKey(state, "type:/");
  assert.equal(state.filtering, true);

  state = applyPickerKey(state, "type:b");
  assert.equal(state.query, "b");
  assert.equal(state.index, 0);

  state = applyPickerKey(state, "type:j");
  assert.equal(state.query, "bj");

  state = applyPickerKey(state, "escape");
  assert.equal(state.filtering, false);
  assert.equal(state.query, "bj");

  state = applyPickerKey(state, "escape");
  assert.equal(state.query, "");

  state = applyPickerKey(state, "type:c");
  assert.equal(state.done, "new-workspace");

  state = { ...state, done: undefined, filtering: true, query: "" };
  state = applyPickerKey(state, "type:c");
  assert.equal(state.query, "c");
  assert.equal(state.done, undefined);
});
