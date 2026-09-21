// src/openPythonScope.smoke.test.tsx — WHAT `Open Python file…` IS ALLOWED TO
// DELETE, driven through the real menu, the real file input and the real
// client.
//
// The bug this file was written to reproduce, found 2026-09-21 while reading
// `definitionBoundary.smoke.test.tsx`'s fourth case: `applyScene` diffed the
// incoming scene against `sceneFromRecords(editor.store.allRecords())` — THE
// WHOLE STORE — and deleted every node the incoming scene did not mention. So
// a projection that only ever describes one Python file was handed authority
// over the whole board, and two ordinary actions lost work silently:
//
//   1. re-opening the same file deleted every cable the person had drawn on
//      top of it (the person's own work is never in pyblocks' answer);
//   2. opening a SECOND file wiped the first one (a different file's nodes
//      are, to that diff, nodes the scene "no longer mentions").
//
// WHY the whole app and not `applyScene` on its own: the seam's scope is
// decided by its CALLER, and the caller is `src/backend/OpenPython.tsx`'s
// `land` → `applyPyblocksBoard`. A test that called `applyScene` directly
// would be grading the argument this test exists to check somebody passes.
// So the action here is the one a person performs: the `Open Python file…`
// row's own `<input type="file">` receiving a file. That is exactly what
// `tests/pyblocks_backend_smoke.mjs` does with Playwright's `setInputFiles`;
// a `DataTransfer` is the same thing from inside the page, and the OS file
// dialog is the only step nothing can drive.
//
// WHY case (c) is here at all: a "fix" that simply stops deleting passes (a)
// and (b) and is wrong — a node the source really lost has to leave the board
// too. (c) is the over-correction guard, and it is the case that fails if the
// scope is narrowed to "delete nothing".
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { createShapeId, type TLShapeId } from "tldraw";

import { BACKEND_SETTING_STORAGE_KEY, DEFAULT_PYBLOCKS_URL } from "@trunk/backend/backendSetting";

import { BLOCK_SHAPE_TYPE, WIRE_SHAPE_TYPE } from "./shapes/types";
import { mountApp, waitFor, type MountedApp } from "./testing/harness";

/* ------------------------------------------------------------------ */
/* A pyblocks server, as far as this app can tell                      */
/* ------------------------------------------------------------------ */

const HEALTH = { status: "ok", analyzer: "pyblocks-blockview-v1", systemsketch: { scene: 1, events: 1 } };

type Rail = { left?: string[]; right?: string[] };

/** One block node in a `pyblocks-scene` document. `authoredPosition: false`
 *  is pyblocks' own word for "I placed nothing", which is what makes the
 *  loader lay the row out — the ordinary case for a file nobody has arranged. */
function pyNode(id: string, name: string, rail: Rail, labels: Record<string, string>, view: "port" | "expanded" = "port") {
  return {
    id,
    type: "block",
    position: { x: 0, y: 0 },
    data: {
      name,
      view,
      ports: { left: rail.left ?? [], right: rail.right ?? [] },
      portLabels: labels,
      pyblocks: {
        blockId: id,
        semanticKind: "transform",
        role: "call",
        effect: "pure",
        certainty: "must",
        sourceSpan: null,
        authoredPosition: false,
      },
    },
  };
}

function pyEdge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string) {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { variant: "data", routing: "elbow", pyblocks: { edgeId: id, kind: "data" } },
  };
}

function pyDocument(uri: string, nodes: unknown[], edges: unknown[]) {
  return {
    schemaVersion: 1,
    kind: "pyblocks-scene",
    source: { uri, sha256: null, selectedViewId: "view:main", title: "main" },
    scene: { nodes, edges },
    controlEdges: [],
    // ONE view, so `OpenPythonMenu` lands the board instead of showing the
    // pick-a-definition list.
    views: [{ id: "view:main", title: "main" }],
    diagnostics: [],
  };
}

/** The three-block chain both files are cut from: `src → mid`, wired by the
 *  file; `sink` present and UNWIRED, which is the pair the person joins by
 *  hand below. */
function chain(prefix: string, midName = "mid()", sinkView: "port" | "expanded" = "port") {
  return [
    pyNode(`${prefix}/src`, "src()", { right: ["out"] }, { out: "out" }),
    pyNode(`${prefix}/mid`, midName, { left: ["in"], right: ["out"] }, { in: "in", out: "out" }),
    pyNode(`${prefix}/sink`, "sink()", { left: ["in"] }, { in: "in" }, sinkView),
  ];
}

const shapeIdOf = (pyblocksId: string) => `shape:${pyblocksId}` as TLShapeId;

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let app: MountedApp | null = null;
let restoreFetch: (() => void) | null = null;

afterEach(() => {
  app?.unmount();
  app = null;
  restoreFetch?.();
  restoreFetch = null;
  window.localStorage.removeItem(BACKEND_SETTING_STORAGE_KEY);
});

/**
 * Opt the viewer into the pyblocks backend and answer its three routes.
 * `documents` is keyed by FILENAME and read at request time, so a test can
 * swap what the "same" file analyses to between two opens — which is how
 * "the source really lost a node" is expressed.
 */
function serve(documents: Map<string, unknown>) {
  window.localStorage.setItem(
    BACKEND_SETTING_STORAGE_KEY,
    JSON.stringify({ kind: "pyblocks", url: DEFAULT_PYBLOCKS_URL }),
  );
  const real = window.fetch.bind(window);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/health")) return json(HEALTH);
    if (url.endsWith("/api/systemsketch/events")) return json({ accepted: 0, applied: 0, classified: [] });
    if (url.endsWith("/api/systemsketch/scene")) {
      const request = JSON.parse(String(init?.body ?? "{}")) as { filename?: string };
      const document = documents.get(String(request.filename));
      if (!document) return json({ error: `no fixture for ${request.filename}` }, 404);
      return json(document);
    }
    return real(input as RequestInfo, init);
  }) as typeof window.fetch;
  restoreFetch = () => {
    window.fetch = real;
  };
}

/** The person's own gesture, minus the OS dialog: the `Open Python file…`
 *  row's input receives a file and fires its own `change`. */
async function openPythonFile(filename: string) {
  const input = await waitFor(() => app!.root.querySelector<HTMLInputElement>('[data-testid="ss-backend-file"]'), {
    what: "the Open Python file… input",
  });
  // The row itself has to be reachable, or the input is chrome nobody can get
  // at — asserted here so this never becomes a test of a hidden element.
  await waitFor(() => document.querySelector('[data-testid="ss-backend-open-python"], [data-testid="ss-backend-menu"]'), {
    what: "the Python menu",
  });
  const transfer = new DataTransfer();
  transfer.items.add(new File([`# ${filename}\n`], filename, { type: "text/x-python" }));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const nameOf = (id: TLShapeId) => (app!.editor.getShape(id) as { props: { name?: string } } | undefined)?.props.name;

async function blockLanded(id: TLShapeId, name: string) {
  await waitFor(() => (nameOf(id) === name ? true : null), { what: `${id} on the board as ${name}` });
}

async function anchorsMeasured(id: TLShapeId, count: number) {
  await waitFor(() => ((app!.editor.getShape(id) as { props: { anchors: unknown[] } }).props.anchors.length >= count ? true : null), {
    what: `${count} anchors on ${id}`,
  });
}

async function dotOf(blockId: TLShapeId, portId: string): Promise<HTMLElement> {
  return waitFor(
    () => app!.root.querySelector<HTMLElement>(`[data-block-id="${blockId}"] [data-port-id="${portId}"] [data-slot="port-dot"]`),
    { what: `${blockId}/${portId} dot` },
  );
}

const wires = () => app!.editor.getCurrentPageShapes().filter((shape) => shape.type === WIRE_SHAPE_TYPE);

/** A cable the PERSON drew: a real press-drag between two rendered dots. */
async function drawCable(from: { block: TLShapeId; port: string }, to: { block: TLShapeId; port: string }): Promise<TLShapeId> {
  const before = new Set(wires().map((wire) => String(wire.id)));
  await userEvent.dragAndDrop(await dotOf(from.block, from.port), await dotOf(to.block, to.port));
  const drawn = await waitFor(() => wires().find((wire) => !before.has(String(wire.id))), {
    what: `a hand-drawn cable ${from.port} -> ${to.port}`,
  });
  return drawn.id;
}

/* ------------------------------------------------------------------ */

describe("Open Python file… owns the shapes it made, and nothing else", () => {
  it("(a) re-opening the same file keeps the cable the person drew", async () => {
    const uri = "file:///tmp/chain.py";
    const documents = new Map<string, unknown>([
      ["chain.py", pyDocument(uri, chain("f"), [pyEdge("f/e1", "f/src", "out", "f/mid", "in")])],
    ]);
    serve(documents);
    app = await mountApp();

    await openPythonFile("chain.py");
    await blockLanded(shapeIdOf("f/mid"), "mid()");
    await anchorsMeasured(shapeIdOf("f/mid"), 2);
    await anchorsMeasured(shapeIdOf("f/sink"), 1);

    const drawn = await drawCable({ block: shapeIdOf("f/mid"), port: "out" }, { block: shapeIdOf("f/sink"), port: "in" });

    // The SECOND open differs by one block name, so the re-apply has a
    // positive signal to wait on — a test that waited on nothing would pass
    // whether the open landed or never happened at all.
    documents.set("chain.py", pyDocument(uri, chain("f", "mid2()"), [pyEdge("f/e1", "f/src", "out", "f/mid", "in")]));
    await openPythonFile("chain.py");
    await blockLanded(shapeIdOf("f/mid"), "mid2()");

    expect(app.editor.getShape(drawn), "the re-open deleted the cable the person drew").toBeTruthy();
  });

  it("(b) opening a second, different file leaves the first board alone", async () => {
    const documents = new Map<string, unknown>([
      ["first.py", pyDocument("file:///tmp/first.py", chain("a"), [pyEdge("a/e1", "a/src", "out", "a/mid", "in")])],
      ["second.py", pyDocument("file:///tmp/second.py", chain("b"), [pyEdge("b/e1", "b/src", "out", "b/mid", "in")])],
    ]);
    serve(documents);
    app = await mountApp();

    await openPythonFile("first.py");
    await blockLanded(shapeIdOf("a/mid"), "mid()");

    await openPythonFile("second.py");
    await blockLanded(shapeIdOf("b/mid"), "mid()");

    for (const id of ["a/src", "a/mid", "a/sink"]) {
      expect(app.editor.getShape(shapeIdOf(id)), `opening a second file wiped ${id}`).toBeTruthy();
    }

    // …and it is READABLE, which is the other half of "not wiped". pyblocks
    // lays every unplaced node out from {40,40}, so without a landing offset
    // the second board would be drawn exactly on top of the first — measured,
    // not presence-asserted.
    const spanOf = (ids: string[]) => {
      const boxes = ids.map((id) => app!.editor.getShapePageBounds(shapeIdOf(id))!);
      return { minX: Math.min(...boxes.map((box) => box.minX)), maxX: Math.max(...boxes.map((box) => box.maxX)) };
    };
    const first = spanOf(["a/src", "a/mid", "a/sink"]);
    const second = spanOf(["b/src", "b/mid", "b/sink"]);
    expect(second.minX, "the second board landed on top of the first").toBeGreaterThan(first.maxX);
  });

  it("(c) a node the source really lost is still removed on re-open", async () => {
    const uri = "file:///tmp/chain.py";
    const documents = new Map<string, unknown>([
      ["chain.py", pyDocument(uri, chain("f"), [pyEdge("f/e1", "f/src", "out", "f/mid", "in")])],
    ]);
    serve(documents);
    app = await mountApp();

    await openPythonFile("chain.py");
    await blockLanded(shapeIdOf("f/sink"), "sink()");

    // `sink()` is gone from the file, and `mid()` is renamed so the re-apply
    // has its own positive signal.
    documents.set(
      "chain.py",
      pyDocument(uri, chain("f", "mid2()").filter((node) => node.id !== "f/sink"), [pyEdge("f/e1", "f/src", "out", "f/mid", "in")]),
    );
    await openPythonFile("chain.py");
    await blockLanded(shapeIdOf("f/mid"), "mid2()");

    await waitFor(() => (app!.editor.getShape(shapeIdOf("f/sink")) === undefined ? true : null), {
      what: "the node the source dropped left the board",
    });
    expect(app.editor.getShape(shapeIdOf("f/sink"))).toBeUndefined();
  });

  it("(d) a block the person put INSIDE a node the source loses is hoisted out, not cascaded away", async () => {
    // The scope rule is only true as far as the first container without this:
    // `editor.deleteShapes` cascades to CHILDREN, so a node this apply owns
    // takes the person's own shapes down with it one level lower — the same
    // silent loss, one nesting deeper.
    //
    // WHY the person's block is parented programmatically while the ACTION
    // under test is still the real file open: dropping a shape into an
    // expanded block is the HOST's drag (`definitionBoundary.smoke.test.tsx`
    // makes the same call for the same reason). The arrangement is one a
    // person can really have; what is being measured is what the OPEN does to
    // it.
    const uri = "file:///tmp/nested.py";
    const documents = new Map<string, unknown>([
      ["nested.py", pyDocument(uri, chain("f", "mid()", "expanded"), [pyEdge("f/e1", "f/src", "out", "f/mid", "in")])],
    ]);
    serve(documents);
    app = await mountApp();

    await openPythonFile("nested.py");
    await blockLanded(shapeIdOf("f/sink"), "sink()");

    const mine = createShapeId();
    app.editor.createShape({ id: mine, type: BLOCK_SHAPE_TYPE, x: 20, y: 20, props: { name: "my note", view: "port" } } as never);
    app.editor.reparentShapes([mine], shapeIdOf("f/sink"));
    await waitFor(() => (String(app!.editor.getShape(mine)!.parentId) === shapeIdOf("f/sink") ? true : null), {
      what: "the person's block inside sink()",
    });

    documents.set(
      "nested.py",
      pyDocument(uri, chain("f", "mid2()", "expanded").filter((node) => node.id !== "f/sink"), [
        pyEdge("f/e1", "f/src", "out", "f/mid", "in"),
      ]),
    );
    await openPythonFile("nested.py");
    await blockLanded(shapeIdOf("f/mid"), "mid2()");
    await waitFor(() => (app!.editor.getShape(shapeIdOf("f/sink")) === undefined ? true : null), {
      what: "the node the source dropped left the board",
    });

    expect(app.editor.getShape(mine), "the cascade took the person's block with its parent").toBeTruthy();
    // …and it is somewhere they can still reach: the nearest surviving
    // ancestor, which here is the page.
    expect(String(app.editor.getShape(mine)!.parentId)).toMatch(/^page:/);
  });
});
