// src/tldrawHostPort.smoke.test.tsx — B-SHELL-P1 acceptance: the HostPort over
// tldraw, in real headless Chromium against the mounted studio.
//
// Committed RED by the lane's acceptance author before any builder existed
// (docs/lanes/finish-B-SHELL-P1.md). OFF-LIMITS to the builder: "cannot pass →
// report FAIL with the one-line reason" is a valid result; editing this file
// is not.
//
// What it pins, each test named after its id in the brief:
//   - SHELL-P1/contract-tldraw — docs/WORK-ORDER-HOST-LESS-SHELL.md A1.2 and
//     lanes.json B-SHELL-P1 acceptance line 1: the SAME `runHostContract` the
//     fake host passes (TRUNK/shell/hostContract.ts, unedited) is green
//     against the tldraw adapter, with NO check skipped — the studio declares
//     all four capabilities, so a skip would be a capability silently dropped.
//   - SHELL-P1/residual-scene — lanes.json B-SHELL-P1 extra 5 and
//     completeness-critic.md #18: `useDocumentScene` (document/
//     sceneFromStore.ts:212-214) derives over `editor.store.allRecords()`, so
//     a camera move, a pointer move or a selection change rebuilds the whole
//     scene. The port's `scene()` is the cached derivation the three callers
//     (focusLens, compareView, problems) move onto; it must keep its
//     reference through those ticks and change on a document write.
//
// The adapter is loaded through `import.meta.glob`, not a static import, so
// that this file compiles and runs BEFORE the adapter exists and fails on an
// assertion that names the deliverable — not on a module-resolution error.
import { afterEach, describe, expect, it } from "vitest";
import { computed, createShapeId, type Editor } from "tldraw";

import { runHostContract } from "@trunk/shell/hostContract";
import type { HostPort } from "@trunk/shell/hostPort";

import { sceneFromRecords } from "./document/sceneFromStore";
import { BLOCK_SHAPE_TYPE } from "./shapes/types";
import { mountApp, nextFrame, waitFor, type MountedApp } from "./testing/harness";

/** Where the brief puts the adapter, and the one export this file needs. */
const ADAPTER_PATH = "./chrome/tldrawHostPort.ts";
type CreateTldrawHostPort = (editor: Editor) => HostPort;
const ADAPTER = import.meta.glob<{ createTldrawHostPort?: CreateTldrawHostPort }>("./chrome/tldrawHostPort.ts");

async function loadAdapter(): Promise<CreateTldrawHostPort> {
  const load = ADAPTER[ADAPTER_PATH];
  expect(
    load,
    "B-SHELL-P1 builds apps/systemsketch/src/chrome/tldrawHostPort.ts (the tldraw HostPort adapter) — it does not exist yet",
  ).toBeTypeOf("function");
  const module = await load!();
  expect(
    module.createTldrawHostPort,
    "chrome/tldrawHostPort.ts must export createTldrawHostPort(editor: Editor): HostPort",
  ).toBeTypeOf("function");
  return module.createTldrawHostPort!;
}

let app: MountedApp | null = null;
afterEach(() => {
  app?.unmount();
  app = null;
});

const NO_PORTS = { left: [], right: [], top: [], bottom: [] };
const SEED_A = createShapeId("shell-p1-contract-a");
const SEED_B = createShapeId("shell-p1-contract-b");

/**
 * A fresh board for every contract check: two plain blocks, nothing selected,
 * the select tool, the camera at the origin, no document name, and NO
 * history. HOST-PORT.md "One precondition the suite has": the suite needs at
 * least two nodes, and it calls the factory once per check so one check's
 * writes cannot leak into the next. Never Zach's board — the harness mounts
 * with `persistenceKey: null`.
 */
function resetBoard(editor: Editor): void {
  editor.run(() => {
    const existing = [...editor.getCurrentPageShapeIds()];
    if (existing.length > 0) editor.deleteShapes(existing);
    editor.createShapes([
      { id: SEED_A, type: BLOCK_SHAPE_TYPE, x: 240, y: 260, props: { name: "Sense", ports: NO_PORTS } },
      { id: SEED_B, type: BLOCK_SHAPE_TYPE, x: 620, y: 260, props: { name: "Act", ports: NO_PORTS } },
    ] as never);
  });
  editor.updateDocumentSettings({ name: "" });
  editor.selectNone();
  editor.setCurrentTool("select");
  editor.setCamera({ x: 0, y: 0, z: 1 });
  editor.clearHistory();
}

describe("B-SHELL-P1 — the tldraw HostPort adapter", () => {
  it(
    "SHELL-P1/contract-tldraw (A1.2): every HostPort contract check is green against the tldraw host, none skipped",
    async () => {
      app = await mountApp();
      const createTldrawHostPort = await loadAdapter();
      const editor = app.editor;

      const result = await runHostContract(() => {
        resetBoard(editor);
        return createTldrawHostPort(editor);
      });

      // The whole report, so a red names every rule the adapter breaks and why.
      expect(result.violations.map((check) => `[${check.group}] ${check.name}: ${check.detail}`)).toEqual([]);
      // The studio has undo, a tool dock, Duplicate and real files: it must
      // declare history, tools, duplicate and documentIo. A skipped check is a
      // capability the shell would silently HIDE from Zach.
      expect(
        result.skipped.map((check) => `[${check.group}] ${check.name}`),
        "the tldraw host declares every capability, so no contract check may be skipped",
      ).toEqual([]);
      // Non-vacuity: the suite really ran (30 checks when this was written).
      expect(result.checks.length).toBeGreaterThanOrEqual(30);
    },
    180_000,
  );

  it("SHELL-P1/residual-scene: scene() keeps its reference through camera, pointer and selection ticks; a document write replaces it", async () => {
    app = await mountApp();
    const createTldrawHostPort = await loadAdapter();
    const editor = app.editor;
    resetBoard(editor);
    const port = createTldrawHostPort(editor);

    // The derivation `useDocumentScene` runs today (sceneFromStore.ts:212-214),
    // as a signal. It is the NON-VACUITY ruler: if the ticks below did not
    // change the store, "scene() kept its reference" would prove nothing.
    const perTick = computed("useDocumentScene's derivation", () => sceneFromRecords(editor.store.allRecords()));
    const perTickBefore = perTick.get();
    const before = port.scene();
    expect(before.nodes.map((node) => node.id).sort()).toEqual([SEED_A, SEED_B].sort());

    // Three ticks that are not document edits: the camera, the pointer, the selection.
    editor.setCamera({ x: -37, y: -21, z: 1 });
    await nextFrame();
    editor.dispatch({
      type: "pointer",
      target: "canvas",
      name: "pointer_move",
      point: { x: 333, y: 222, z: 0.5 },
      pointerId: 1,
      button: 0,
      isPen: false,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      accelKey: false,
    });
    editor.select(SEED_A);
    await nextFrame();

    expect(Object.is(perTick.get(), perTickBefore), "the ticks must really change the store (non-vacuity)").toBe(false);
    expect(
      Object.is(port.scene(), before),
      "scene() was rebuilt by a camera/pointer/selection tick — the per-tick rebuild the residual names",
    ).toBe(true);

    // A document write is the one thing that may replace it, and the new
    // scene must carry the write.
    editor.updateShape({ id: SEED_A, type: BLOCK_SHAPE_TYPE, x: 300 } as never);
    const after = await waitFor(() => (Object.is(port.scene(), before) ? null : port.scene()), {
      what: "scene() replaced after a document write",
    });
    expect(after.nodes.find((node) => node.id === SEED_A)?.position.x).toBe(300);
  });
});
