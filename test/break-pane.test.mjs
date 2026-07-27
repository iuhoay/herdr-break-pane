import assert from "node:assert/strict";
import test from "node:test";

import { breakPane } from "../break-pane.mjs";

const paneId = "w1:p2";

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

test("leaves a single-pane tab untouched", () => {
  const calls = [];
  const result = breakPane({
    env: { HERDR_PANE_ID: paneId },
    runHerdr(args) {
      calls.push(args);
      return layoutResponse({ paneCount: 1, zoomed: true });
    },
  });

  assert.deepEqual(result, {
    changed: false,
    reason: "single_pane",
    pane_id: paneId,
  });
  assert.deepEqual(calls, [["pane", "layout", "--pane", paneId]]);
});

test("moves an unzoomed pane directly into a new tab", () => {
  const calls = [];
  const responses = [
    layoutResponse({ paneCount: 2, zoomed: false }),
    moveResponse({ movedPaneId: "w1:p2" }),
  ];

  const result = breakPane({
    env: { HERDR_PANE_ID: paneId },
    runHerdr(args) {
      calls.push(args);
      return responses.shift();
    },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(calls, [
    ["pane", "layout", "--pane", paneId],
    ["pane", "move", paneId, "--new-tab", "--focus"],
  ]);
});

test("unzooms a multi-pane tab before moving the pane", () => {
  const calls = [];
  const responses = [
    layoutResponse({ paneCount: 2, zoomed: true }),
    { result: { type: "pane_zoom" } },
    moveResponse(),
  ];

  breakPane({
    env: { HERDR_PANE_ID: paneId },
    runHerdr(args) {
      calls.push(args);
      return responses.shift();
    },
  });

  assert.deepEqual(calls, [
    ["pane", "layout", "--pane", paneId],
    ["pane", "zoom", paneId, "--off"],
    ["pane", "move", paneId, "--new-tab", "--focus"],
  ]);
});

test("falls back to the focused pane in plugin context JSON", () => {
  const calls = [];

  breakPane({
    env: {
      HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: paneId }),
    },
    runHerdr(args) {
      calls.push(args);
      return layoutResponse({ paneCount: 1, zoomed: false });
    },
  });

  assert.deepEqual(calls[0], ["pane", "layout", "--pane", paneId]);
});

test("rejects invocation without a focused pane", () => {
  assert.throws(
    () => breakPane({ env: {}, runHerdr() {} }),
    /no focused Herdr pane/,
  );
});

test("rejects malformed layout responses", () => {
  assert.throws(
    () =>
      breakPane({
        env: { HERDR_PANE_ID: paneId },
        runHerdr() {
          return { result: {} };
        },
      }),
    /pane\.layout returned an unexpected response/,
  );
});
