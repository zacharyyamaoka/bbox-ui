// Pure-function tests for contextMenuModel.ts's MenuSpec builders and the
// `:` title/type split — no DOM, no React (per this repo's own split
// between `.test.ts` node coverage and `.stories.tsx` browser coverage;
// `edgeDropMenu.test.ts`'s header is the precedent this file follows).

import { describe, expect, it, vi } from "vitest";

import {
  buildBlockMenu,
  buildPortEdgeMenu,
  buildPortMenu,
  buildRegionArmMenu,
  buildRegionFrameMenu,
  buildTraceMenu,
  isMarkedUnresolved,
  splitTitleAndType,
  toggleUnresolvedDiagnostics,
  unresolvedDiagnostic,
  type MenuAction,
  type MenuGroupSpec,
  type MenuSpec,
} from "./contextMenuModel";

/** Flattens a MenuSpec's groups into one ordered list of rows (submenus
 *  included, as their own entry) — enough for these tests, which never
 *  need to reach INTO a submenu's own items. */
function rows(spec: MenuSpec): (MenuAction | { submenu: MenuSpec })[] {
  return spec.groups.flatMap((g: MenuGroupSpec) => g.items);
}

function actionById(spec: MenuSpec, id: string): MenuAction {
  const found = rows(spec).find((item) => !("submenu" in item) && item.id === id);
  if (!found || "submenu" in found) throw new Error(`no action row "${id}" in menu "${spec.id}"`);
  return found;
}

/* ------------------------------------------------------------------ */
/* Block — the nine commands, exactly Zach's list, in his order        */
/* ------------------------------------------------------------------ */

describe("buildBlockMenu", () => {
  const baseState = { showHeader: true, showHeaderDivider: true, showFooter: true, showFooterDivider: true };

  function commands() {
    return {
      toggleHeader: vi.fn(),
      toggleHeaderDivider: vi.fn(),
      toggleFooter: vi.fn(),
      toggleFooterDivider: vi.fn(),
      addInputSideEffect: vi.fn(),
      addOutputSideEffect: vi.fn(),
      addIcon: vi.fn(),
      addDescription: vi.fn(),
      addType: vi.fn(),
    };
  }

  it("carries exactly Zach's nine commands, in his order", () => {
    const spec = buildBlockMenu(baseState, commands());
    const ids = rows(spec).map((item) => ("submenu" in item ? item.submenu.id : item.id));
    expect(ids).toEqual([
      "hide-header",
      "hide-header-line",
      "hide-footer",
      "hide-footer-line",
      "add-input-side-effect",
      "add-output-side-effect",
      "add-icon",
      "add-description",
      "add-type",
    ]);
  });

  it("groups them visibility / ports / fields, with a separator between each (three groups)", () => {
    const spec = buildBlockMenu(baseState, commands());
    expect(spec.groups.map((g) => g.id)).toEqual(["visibility", "ports", "fields"]);
    expect(spec.groups[0].items).toHaveLength(4);
    expect(spec.groups[1].items).toHaveLength(2);
    expect(spec.groups[2].items).toHaveLength(3);
  });

  it("the three field editors end in an ellipsis — they open an editor", () => {
    const spec = buildBlockMenu(baseState, commands());
    for (const id of ["add-icon", "add-description", "add-type"]) {
      expect(actionById(spec, id).label.endsWith("…")).toBe(true);
    }
  });

  it("the four Hide toggles read CURRENT state: checked means the region is currently hidden", () => {
    const shownSpec = buildBlockMenu(baseState, commands());
    expect(actionById(shownSpec, "hide-header").checked).toBe(false);
    expect(actionById(shownSpec, "hide-footer-line").checked).toBe(false);

    const hiddenSpec = buildBlockMenu(
      { showHeader: false, showHeaderDivider: false, showFooter: false, showFooterDivider: false },
      commands(),
    );
    expect(actionById(hiddenSpec, "hide-header").checked).toBe(true);
    expect(actionById(hiddenSpec, "hide-header-line").checked).toBe(true);
    expect(actionById(hiddenSpec, "hide-footer").checked).toBe(true);
    expect(actionById(hiddenSpec, "hide-footer-line").checked).toBe(true);
  });

  it("each toggle row's run() calls its own command and no other", () => {
    const cmds = commands();
    const spec = buildBlockMenu(baseState, cmds);
    actionById(spec, "hide-header").run();
    actionById(spec, "hide-footer-line").run();
    actionById(spec, "add-input-side-effect").run();
    actionById(spec, "add-type").run();
    expect(cmds.toggleHeader).toHaveBeenCalledTimes(1);
    expect(cmds.toggleFooterDivider).toHaveBeenCalledTimes(1);
    expect(cmds.addInputSideEffect).toHaveBeenCalledTimes(1);
    expect(cmds.addType).toHaveBeenCalledTimes(1);
    expect(cmds.toggleFooter).not.toHaveBeenCalled();
    expect(cmds.toggleHeaderDivider).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Port / LabeledPort                                                  */
/* ------------------------------------------------------------------ */

describe("buildPortMenu", () => {
  it("omits Rename for a bare dot (no rename command supplied)", () => {
    const spec = buildPortMenu("in", { label: null, type: undefined, unresolved: false }, {
      toggleUnresolved: vi.fn(),
      onCopyId: vi.fn(),
    });
    const ids = rows(spec).map((item) => ("submenu" in item ? item.submenu.id : item.id));
    expect(ids).not.toContain("rename");
  });

  it("offers Rename…, ellipsized, for a labeled port", () => {
    const spec = buildPortMenu("in", { label: "in", type: "number", unresolved: false }, {
      rename: vi.fn(),
      toggleUnresolved: vi.fn(),
      onCopyId: vi.fn(),
    });
    expect(actionById(spec, "rename").label).toBe("Rename…");
  });

  it("Mark unresolved reflects the port's real diagnostics via isMarkedUnresolved/toggleUnresolvedDiagnostics", () => {
    const empty = buildPortMenu("in", { label: "in", type: undefined, unresolved: isMarkedUnresolved(undefined) }, {
      toggleUnresolved: vi.fn(),
      onCopyId: vi.fn(),
    });
    expect(actionById(empty, "mark-unresolved").checked).toBe(false);

    const marked = toggleUnresolvedDiagnostics(undefined, unresolvedDiagnostic);
    expect(isMarkedUnresolved(marked)).toBe(true);
    const unmarked = toggleUnresolvedDiagnostics(marked, unresolvedDiagnostic);
    expect(unmarked).toEqual([]);
  });

  it("Copy id is disabled with id: null, and enabled with a real id", () => {
    const anonymous = buildPortMenu(null, { label: null, type: undefined, unresolved: false }, {
      toggleUnresolved: vi.fn(),
      onCopyId: vi.fn(),
    });
    expect(actionById(anonymous, "copy-id").disabled).toBe(true);

    const onCopyId = vi.fn();
    const named = buildPortMenu("in", { label: "in", type: undefined, unresolved: false }, {
      toggleUnresolved: vi.fn(),
      onCopyId,
    });
    const row = actionById(named, "copy-id");
    expect(row.disabled).toBeFalsy();
    row.run();
    expect(onCopyId).toHaveBeenCalledWith("in");
  });
});

/* ------------------------------------------------------------------ */
/* PortEdge / Trace / Region arm / Region frame                        */
/* ------------------------------------------------------------------ */

describe("buildPortEdgeMenu", () => {
  it("Edit Ports and Distribute Evenly reflect real PortEdge props", () => {
    const spec = buildPortEdgeMenu("right", { editing: true, distributeEvenly: false }, {
      toggleEditing: vi.fn(),
      toggleDistribution: vi.fn(),
      onCopyId: vi.fn(),
    });
    expect(actionById(spec, "edit-ports").checked).toBe(true);
    expect(actionById(spec, "distribute-evenly").checked).toBe(false);
  });
});

describe("buildTraceMenu", () => {
  it("Mark unresolved and Animated are independent toggles", () => {
    const cmds = { toggleUnresolved: vi.fn(), toggleAnimated: vi.fn(), onCopyId: vi.fn() };
    const spec = buildTraceMenu("wire-1", { unresolved: true, animated: false }, cmds);
    expect(actionById(spec, "mark-unresolved").checked).toBe(true);
    expect(actionById(spec, "animated").checked).toBe(false);
    actionById(spec, "animated").run();
    expect(cmds.toggleAnimated).toHaveBeenCalledTimes(1);
    expect(cmds.toggleUnresolved).not.toHaveBeenCalled();
  });
});

describe("buildRegionArmMenu", () => {
  it("Open reflects RegionArm.open", () => {
    const spec = buildRegionArmMenu("if-true", { open: false }, { toggleOpen: vi.fn(), onCopyId: vi.fn() });
    expect(actionById(spec, "open").checked).toBe(false);
  });
});

describe("buildRegionFrameMenu", () => {
  it("has exactly one row: Copy id — RegionProps exposes no host callback to wire anything else to", () => {
    const onCopyId = vi.fn();
    const spec = buildRegionFrameMenu("loop-1", onCopyId);
    const flat = rows(spec);
    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({ id: "copy-id" });
  });
});

/* ------------------------------------------------------------------ */
/* splitTitleAndType — the `:` shortcut                                 */
/* ------------------------------------------------------------------ */

describe("splitTitleAndType", () => {
  it("no colon: the whole string is the title, type is untouched (undefined)", () => {
    expect(splitTitleAndType("Amplifier")).toEqual({ title: "Amplifier", type: undefined });
  });

  it("a trailing colon commits an EMPTY type, not \"unchanged\"", () => {
    expect(splitTitleAndType("Amplifier:")).toEqual({ title: "Amplifier", type: "" });
  });

  it("several colons: only the FIRST is the boundary; the rest stay in type", () => {
    expect(splitTitleAndType("Amplifier: gain: dB")).toEqual({ title: "Amplifier", type: "gain: dB" });
  });

  it("a colon inside an already-set type is irrelevant — the function is stateless and always replaces", () => {
    // Simulates re-editing a title whose type was previously "already:set" —
    // the raw text being committed now is what wins, in full, regardless.
    const previousType = "already:set";
    const result = splitTitleAndType("Amplifier: fresh:type");
    expect(result.type).toBe("fresh:type");
    expect(result.type).not.toContain(previousType);
  });

  it("trims incidental whitespace around the colon on both sides", () => {
    expect(splitTitleAndType("  Amplifier   :   Thing  ")).toEqual({ title: "Amplifier", type: "Thing" });
  });

  it("a leading colon (no title text before it) still splits — an empty title, not a crash", () => {
    expect(splitTitleAndType(": Thing")).toEqual({ title: "", type: "Thing" });
  });

  it("round-trips: splitting a string with no colon twice never introduces one", () => {
    const once = splitTitleAndType("Plain Title");
    expect(splitTitleAndType(once.title)).toEqual({ title: "Plain Title", type: undefined });
  });
});
