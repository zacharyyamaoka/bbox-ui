// src/shell/fakeHost.ts — an in-memory HostPort with no canvas behind it.
//
// Two jobs. `apps/bbox-no-host` mounts the shell on it, so every window can
// be built and reviewed before either engine host exists. And the contract
// suite runs this SAME constructor with one behaviour deliberately broken
// (`broken:` below) to prove the contract has teeth — one constructor, one
// surgical difference, so a broken fake cannot fail for an incidental reason.
// That is A0.1 of docs/WORK-ORDER-HOST-LESS-SHELL.md: "a contract that cannot
// fail is not a contract".
//
// It is a FAKE, not a mock: it really holds a document, really derives a
// scene from it, and really has an undo stack. A stub that returned canned
// answers would let a wrong contract pass.

import type { BlockScene, SceneEdge, SceneNode } from "../scene/scene";
import {
  type HostCapability,
  type HostPort,
  type InteractionPhase,
  type LoadResult,
  type NodeAction,
  type NodeId,
  type Rect,
  type ToolDescriptor,
  type ViewAction,
} from "./hostPort";

/** Which single behaviour to break, for the contract's own teeth test. */
export type FakeHostBreak =
  /** `undo()` moves the history flags but does not restore the document. */
  | "undo-does-not-restore"
  /** A change never reaches `subscribe`'s listeners. */
  | "selection-does-not-notify"
  /** `scene()` answers from a snapshot captured at construction. */
  | "scene-is-stored"
  /** `scene()` forwards the host's internal helper record to the shell. */
  | "scene-leaks-helper";

export interface FakeHostOptions {
  capabilities?: readonly HostCapability[];
  broken?: FakeHostBreak;
  documentName?: string;
}

export const FAKE_HOST_TOOLS: readonly ToolDescriptor[] = [
  { id: "select", label: "Select", kbd: "v" },
  { id: "hand", label: "Hand", kbd: "h" },
  { id: "block", label: "Block", kbd: "b", family: "system" },
  { id: "arrow:elbow", label: "Elbow arrow", kbd: "a", family: "arrow" },
  { id: "arrow:curve", label: "Curved arrow", family: "arrow" },
];

/**
 * The host's OWN document. Deliberately not a `BlockScene`: it carries a
 * `helper` node kind that must never reach the shell, mirroring React Flow's
 * invisible 1×1 `anchor` nodes (`simple-reactflow-whiteboard/src/whiteboard/
 * model.ts:createAnchorNode`). Constraint 3 says free-floating helper records
 * never appear in the derived scene; without one here, "derived" would be a
 * word rather than a behaviour the contract can check.
 */
interface FakeDocument {
  records: { id: string; kind: "node" | "helper"; type: string; x: number; y: number; data: Record<string, unknown> }[];
  links: { id: string; source: string; target: string }[];
  name: string;
}

function initialDocument(name: string): FakeDocument {
  return {
    records: [
      { id: "n1", kind: "node", type: "block", x: 40, y: 40, data: { name: "Sense" } },
      { id: "n2", kind: "node", type: "block", x: 320, y: 40, data: { name: "Plan" } },
      { id: "n3", kind: "node", type: "block", x: 600, y: 40, data: { name: "Act" } },
      // Never visible to the shell. Its presence is the derivation's teeth.
      { id: "h1", kind: "helper", type: "anchor", x: 0, y: 0, data: {} },
    ],
    links: [{ id: "e1", source: "n1", target: "n2" }],
    name,
  };
}

const clone = (doc: FakeDocument): FakeDocument => JSON.parse(JSON.stringify(doc)) as FakeDocument;

/** Node size, only so a selection has a believable box. Not a document fact. */
const NODE_SIZE = { w: 200, h: 96 };
const VIEWPORT: Rect = { x: 0, y: 0, w: 1280, h: 800 };

export function createFakeHost(options: FakeHostOptions = {}): HostPort {
  const capabilities = new Set<HostCapability>(options.capabilities ?? []);
  const broken = options.broken;

  let doc = initialDocument(options.documentName ?? "Untitled board");
  let selected: NodeId[] = [];
  let zoom = 1;
  let activeTool = "select";
  let phase: InteractionPhase = "idle";
  const undoStack: FakeDocument[] = [];
  const redoStack: FakeDocument[] = [];
  const listeners = new Set<() => void>();

  /* ---- memoised getters ----
   * WHY every getter is cached rather than derived per call: constraint 7.
   * The shell reads through `useSyncExternalStore`, which throws "The result
   * of getSnapshot should be cached to avoid an infinite loop" the moment a
   * getter hands back a fresh object. `scene()` is DERIVED, so the naive
   * implementation allocates a new BlockScene on every render and spins. The
   * cache is the HOST caching its own derivation — not the shell keeping a
   * second document, so D1 is intact. See HOST-PORT.md, constraint 7. */
  let sceneCache: BlockScene | null = null;
  let frozenScene: BlockScene | null = null;
  let selectionCache: { ids: readonly NodeId[]; screenBounds: Rect | null } | null = null;
  let viewportCache: { zoom: number; screenBounds: Rect } | null = null;
  let toolsCache: { catalogue: readonly ToolDescriptor[]; active: string } | null = null;
  let historyCache: { canUndo: boolean; canRedo: boolean } | null = null;

  function deriveScene(): BlockScene {
    const nodes: SceneNode[] = doc.records
      // The break: the helper record rides along into the shell's scene. This
      // is the REAL bug shape for both engines — React Flow's invisible 1x1
      // anchor, a tldraw helper shape — and an audit proved the suite could
      // not see it until the "no record survives deleting every node" check
      // existed. It is memoised like any other derivation, so it passes the
      // stability rule while violating constraint 3, which is the distinction
      // being tested.
      .filter((record) => (broken === "scene-leaks-helper" ? true : record.kind === "node"))
      .map((record) => ({
        id: record.id,
        type: record.type,
        position: { x: record.x, y: record.y },
        data: { ...record.data },
      }));
    const visible = new Set(nodes.map((n) => n.id));
    const edges: SceneEdge[] = doc.links
      .filter((link) => visible.has(link.source) && visible.has(link.target))
      .map((link) => ({ id: link.id, source: link.source, target: link.target }));
    return { nodes, edges };
  }

  function invalidate(what: "scene" | "selection" | "viewport" | "tools" | "history") {
    if (what === "scene") {
      sceneCache = null;
      selectionCache = null; // bounds are derived from node positions
      historyCache = null;
    }
    if (what === "selection") selectionCache = null;
    if (what === "viewport") viewportCache = null;
    if (what === "tools") toolsCache = null;
    if (what === "history") historyCache = null;
  }

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  /** A write that is its own undo step unless it is already inside one. */
  let transactDepth = 0;
  function write(mutate: () => void, opts?: { undoable?: boolean }) {
    const undoable = opts?.undoable !== false;
    const outermost = transactDepth === 0;
    if (outermost && undoable) {
      undoStack.push(clone(doc));
      redoStack.length = 0;
    }
    mutate();
    invalidate("scene");
    invalidate("history");
    notify();
  }

  const port: HostPort = {
    capabilities,

    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    scene() {
      if (broken === "scene-is-stored") {
        // A snapshot taken once and handed out forever. Referentially stable
        // (so it passes constraint 7) and completely wrong (so it fails
        // constraint 3) — which is exactly the distinction being tested.
        frozenScene ??= deriveScene();
        return frozenScene;
      }
      sceneCache ??= deriveScene();
      return sceneCache;
    },

    selection() {
      if (!selectionCache) {
        let screenBounds: Rect | null = null;
        const live = doc.records.filter((r) => r.kind === "node" && selected.includes(r.id));
        if (live.length > 0) {
          const minX = Math.min(...live.map((r) => r.x));
          const minY = Math.min(...live.map((r) => r.y));
          const maxX = Math.max(...live.map((r) => r.x + NODE_SIZE.w));
          const maxY = Math.max(...live.map((r) => r.y + NODE_SIZE.h));
          screenBounds = { x: minX * zoom, y: minY * zoom, w: (maxX - minX) * zoom, h: (maxY - minY) * zoom };
        }
        selectionCache = { ids: [...selected], screenBounds };
      }
      return selectionCache;
    },

    viewport() {
      viewportCache ??= { zoom, screenBounds: VIEWPORT };
      return viewportCache;
    },

    interaction: () => phase,

    tools() {
      toolsCache ??= { catalogue: FAKE_HOST_TOOLS, active: activeTool };
      return toolsCache;
    },

    history() {
      historyCache ??= { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
      return historyCache;
    },

    documentName: () => doc.name,

    /* -------------------- commands -------------------- */

    select(ids) {
      // A helper record is not selectable — that is what MAKES it a helper.
      // React Flow spells it `selectable: false` on the anchor node
      // (simple-reactflow-whiteboard/src/whiteboard/model.ts:createAnchorNode).
      // Modelling it here is what lets the contract catch a leaked record that
      // is still addressable by id.
      const real = new Set(doc.records.filter((r) => r.kind === "node").map((r) => r.id));
      selected = ids.filter((id) => real.has(id));
      invalidate("selection");
      // The break: state moves, nobody is told. Every getter still answers
      // correctly, so only the notification check can catch it.
      if (broken !== "selection-does-not-notify") notify();
    },

    setTool(id) {
      activeTool = id;
      invalidate("tools");
      notify();
    },

    view(action: ViewAction) {
      if (action.kind === "zoomTo") zoom = action.zoom;
      else {
        const ids = action.ids;
        const live = doc.records.filter((r) => r.kind === "node" && (!ids || ids.includes(r.id)));
        zoom = live.length === 0 ? 1 : Math.min(1, VIEWPORT.w / (Math.max(...live.map((r) => r.x + NODE_SIZE.w)) || 1));
      }
      invalidate("viewport");
      invalidate("selection");
      notify();
    },

    nodes(action: NodeAction) {
      write(() => {
        if (action.kind === "update") {
          for (const patch of action.patches) {
            const record = doc.records.find((r) => r.id === patch.id);
            if (!record) continue;
            if (patch.position) {
              record.x = patch.position.x;
              record.y = patch.position.y;
            }
            // Merged, not replaced — the shell only knows the keys it set.
            if (patch.data) record.data = { ...record.data, ...patch.data };
          }
          return;
        }
        if (action.kind === "delete") {
          // Same rule as `select`: a helper is the host's own bookkeeping and
          // is not deleted by a shell command naming its id. It goes when the
          // thing it supports goes.
          const real = new Set(doc.records.filter((r) => r.kind === "node").map((r) => r.id));
          const doomed = new Set([...action.ids].filter((id) => real.has(id)));
          doc.records = doc.records.filter((r) => !doomed.has(r.id));
          doc.links = doc.links.filter((l) => !doomed.has(l.source) && !doomed.has(l.target));
          selected = selected.filter((id) => !doomed.has(id));
          invalidate("selection");
          return;
        }
        // duplicate
        const copies = doc.records
          .filter((r) => action.ids.includes(r.id) && r.kind === "node")
          .map((r, index) => ({ ...r, id: `${r.id}-copy-${doc.records.length + index}`, x: r.x + 24, y: r.y + 24, data: { ...r.data } }));
        doc.records = [...doc.records, ...copies];
      });
    },

    undo() {
      const previous = undoStack.pop();
      if (!previous) return;
      redoStack.push(clone(doc));
      // The break: the flags move, the document does not come back. A host
      // whose canUndo is merely decorative passes every presence check.
      if (broken !== "undo-does-not-restore") doc = previous;
      invalidate("scene");
      invalidate("history");
      notify();
    },

    redo() {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(clone(doc));
      if (broken !== "undo-does-not-restore") doc = next;
      invalidate("scene");
      invalidate("history");
      notify();
    },

    transact(label, fn, opts) {
      const outermost = transactDepth === 0;
      if (outermost && opts?.undoable !== false) {
        undoStack.push(clone(doc));
        redoStack.length = 0;
      }
      transactDepth += 1;
      try {
        return fn();
      } finally {
        transactDepth -= 1;
        if (transactDepth === 0) {
          invalidate("scene");
          invalidate("history");
          notify();
        }
      }
    },

    setDocumentName(name) {
      doc.name = name;
      notify();
    },

    /* -------------------- document -------------------- */

    // Async to mirror the engine, whose `serializeBoard` returns a promise
    // (apps/systemsketch/src/chrome/fileActions.ts:68).
    async serialize() {
      return JSON.stringify({ format: "bbox-no-host/1", document: doc });
    },

    // Sync to mirror the engine, whose `openBoard` parses without awaiting
    // (apps/systemsketch/src/chrome/fileActions.ts:167).
    load(text): LoadResult {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return { ok: false, reason: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
      }
      const envelope = parsed as { format?: string; document?: FakeDocument };
      if (envelope?.format !== "bbox-no-host/1" || !envelope.document) {
        return { ok: false, reason: `not a bbox-no-host board (format: ${String(envelope?.format)})` };
      }
      doc = clone(envelope.document);
      selected = [];
      // A loaded board is a new beginning, not one undo from the old one —
      // `openBoard` calls `editor.clearHistory()` for exactly this reason
      // (fileActions.ts:185).
      undoStack.length = 0;
      redoStack.length = 0;
      zoom = 1;
      sceneCache = null;
      frozenScene = null;
      invalidate("scene");
      invalidate("selection");
      invalidate("viewport");
      invalidate("history");
      notify();
      return { ok: true };
    },
  };

  return port;
}

/** Drives `interaction()` from the outside, for stories and the no-host app. */
export function setFakeInteraction(_port: HostPort, _phase: InteractionPhase): void {
  // Intentionally inert for now: no window reads `interaction()` until P1
  // lifts `floatingToolbar.tsx`, and a setter nothing calls is a surface to
  // maintain for nothing. Kept as the named seam so P1 has somewhere to put it.
}
