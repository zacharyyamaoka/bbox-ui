// src/editor/sourceActions.test.ts — ACCEPTANCE for lane
// `scv-origin-and-actions` (docs/SOURCE-CODE-VIEW-RETARGET-PLAN.md §7).
// Committed BEFORE the lane exists and OFF-LIMITS to its builder.
//
// The one non-negotiable: with no pyblocks backend the actions are ABSENT
// — never rendered disabled. Zach's item 4 asked for "the menu items…
// that could appear if pyblocks is enabled"; edgeDropMenu.tsx's judge rule
// ("never rendered, not merely disabled") is the same shape.

import { describe, expect, it, vi } from "vitest";

import { PYBLOCKS_BACKEND_KIND, SOURCE_ACTION_IDS, SOURCE_ACTION_LABELS, sourceActionsFor, type SourceActionHandlers } from "./sourceActions";

const CELLS = new Set(["cell-1", "cell-2"]);
const selection = (nodeIds: string[]) => ({ nodeIds, isCodeCell: (id: string) => CELLS.has(id) });
const handlers = (): SourceActionHandlers => ({ convertToCode: vi.fn(), expandToBlocks: vi.fn() });

const OFF = { kind: "none" };
const ON = { kind: PYBLOCKS_BACKEND_KIND };

describe("the gate — backend.kind === 'pyblocks'", () => {
  it("ABSENT when the backend is off, null, undefined, or some other kind — never a disabled row", () => {
    expect(sourceActionsFor(OFF, selection(["a", "b"]), handlers())).toEqual([]);
    expect(sourceActionsFor(null, selection(["a", "b"]), handlers())).toEqual([]);
    expect(sourceActionsFor(undefined, selection(["cell-1"]), handlers())).toEqual([]);
    expect(sourceActionsFor({ kind: "jupyter" }, selection(["a"]), handlers())).toEqual([]);
  });

  it("PRESENT when the backend is on and the selection qualifies", () => {
    expect(sourceActionsFor(ON, selection(["a", "b"]), handlers()).map((action) => action.id)).toEqual([SOURCE_ACTION_IDS.convertToCode]);
    expect(sourceActionsFor(ON, selection(["cell-1"]), handlers()).map((action) => action.id)).toEqual([SOURCE_ACTION_IDS.expandToBlocks]);
  });

  it("reads ONLY `kind` off the backend — a richer backend object passes structurally", () => {
    const backend = { kind: PYBLOCKS_BACKEND_KIND, analyze: () => Promise.resolve(null), version: 2 };
    expect(sourceActionsFor(backend, selection(["a"]), handlers())).toHaveLength(1);
  });
});

describe("which action a selection earns (backend on)", () => {
  it("convert-to-code: at least one selected node that is not a code cell", () => {
    expect(sourceActionsFor(ON, selection(["a"]), handlers()).map((action) => action.id)).toEqual(["convert-to-code"]);
    expect(sourceActionsFor(ON, selection(["a", "cell-1"]), handlers()).map((action) => action.id)).toEqual(["convert-to-code"]);
    expect(sourceActionsFor(ON, selection(["cell-1", "cell-2"]), handlers()).map((action) => action.id)).toEqual([]);
  });

  it("expand-to-blocks: exactly one selected node and it is a code cell", () => {
    expect(sourceActionsFor(ON, selection(["cell-2"]), handlers()).map((action) => action.id)).toEqual(["expand-to-blocks"]);
    expect(sourceActionsFor(ON, selection(["cell-1", "cell-2"]), handlers())).toEqual([]);
  });

  it("nothing selected → nothing offered", () => {
    expect(sourceActionsFor(ON, selection([]), handlers())).toEqual([]);
  });

  it("rows are MenuAction-shaped, labelled from the frozen table, never disabled", () => {
    for (const action of [...sourceActionsFor(ON, selection(["a"]), handlers()), ...sourceActionsFor(ON, selection(["cell-1"]), handlers())]) {
      expect(action.label).toBe(SOURCE_ACTION_LABELS[action.id]);
      expect(action.disabled).toBeFalsy();
      expect(typeof action.run).toBe("function");
    }
    expect(SOURCE_ACTION_LABELS["convert-to-code"]).toBe("Convert to code");
    expect(SOURCE_ACTION_LABELS["expand-to-blocks"]).toBe("Expand to blocks");
  });

  it("run() routes to the host's handlers with the ids the rule applies to", () => {
    const h = handlers();
    sourceActionsFor(ON, selection(["a", "b", "cell-1"]), h)[0].run();
    expect(h.convertToCode).toHaveBeenCalledWith(["a", "b", "cell-1"]);
    expect(h.expandToBlocks).not.toHaveBeenCalled();

    const g = handlers();
    sourceActionsFor(ON, selection(["cell-2"]), g)[0].run();
    expect(g.expandToBlocks).toHaveBeenCalledWith("cell-2");
    expect(g.convertToCode).not.toHaveBeenCalled();
  });

  it("is pure: the same inputs give equal rows, and the selection is not mutated", () => {
    const ids = ["a", "b"];
    const first = sourceActionsFor(ON, selection(ids), handlers()).map(({ run: _run, ...rest }) => rest);
    const second = sourceActionsFor(ON, selection(ids), handlers()).map(({ run: _run, ...rest }) => rest);
    expect(first).toEqual(second);
    expect(ids).toEqual(["a", "b"]);
  });
});
