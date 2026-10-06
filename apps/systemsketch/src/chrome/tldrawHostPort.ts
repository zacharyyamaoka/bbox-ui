// src/chrome/tldrawHostPort.ts — the tldraw host's `HostPort`: the ONE place
// the lifted chrome (`@trunk/shell/*`) meets tldraw.
//
// B-SHELL-P1 (docs/lanes/finish-B-SHELL-P1.md, build step 1). The shell's
// windows were lifted out of this app into `apps/storybook-basics/src/shell/`
// and speak only `HostPort` (`@trunk/shell/hostPort`, design note
// `HOST-PORT.md`). This file answers that contract over a live `Editor`, so the
// same windows run here, on the in-memory fake host (`apps/bbox-no-host`), and
// on the React Flow host next (L-RF-HOST). Every verb below is a re-expression
// of a call the app's chrome already made — the reference call site is named
// beside each one; nothing here is a new behaviour.
//
// WHY every getter is a tldraw `computed` (HOST-PORT.md constraint 7, "every
// read getter is referentially stable between notifications"): the shell reads
// through `useSyncExternalStore`, which loops if a getter allocates. A computed
// caches its value until one of the signals it read changes, which is exactly
// "stable between notifications" — and it is what makes `scene()` the CACHED
// derivation the residual asks for (lanes.json B-SHELL-P1 extra 5).
import {
  atom,
  computed,
  GeoShapeGeoStyle,
  react,
  type Editor,
  type TLRecord,
  type TLShape,
  type TLShapeId,
} from "tldraw";

import { arrowPresetToolId } from "@trunk/editor/toolPreferences";
import type {
  HostCapability,
  HostPort,
  InteractionPhase,
  LoadResult,
  NodeAction,
  NodeId,
  Rect,
  ToolDescriptor,
  ViewAction,
} from "@trunk/shell/hostPort";

import { sceneFromRecords, type DocumentScene } from "../document/sceneFromStore";
import { DUPLICATE_OFFSET } from "./ContextualPopupMenu/selectionActions";
import { loadBoardText, serializeBoard } from "./FileMenu/fileActions";
import { arrowPresetOf, getDockPreferences, subscribeDockPreferences } from "./ShareMenu/preferences";
import { DOCK_CATALOGUE, selectDockTool } from "./Toolbar/dock";

/** The studio has undo, a tool dock, Duplicate and real files — it declares
 *  all four, so the shell hides nothing here (tldrawHostPort.smoke: "a skipped
 *  check is a capability the shell would silently HIDE from Zach"). */
const TLDRAW_CAPABILITIES: readonly HostCapability[] = ["history", "tools", "duplicate", "documentIo"];

/** Where a `NodePatch.data` key the projection does not own is kept: the
 *  shape's own `meta`, tldraw's documented place for host data that rides
 *  along inside a saved `.tldr` and through undo. The projection's keys
 *  (`DocNodeData`: kind, name, ports, …) are derived from props and always win
 *  on read, so a shell write can never shadow what the document says. */
const SHELL_DATA_META_KEY = "shellData";

/**
 * The remembered arrow preset, as a signal.
 *
 * WHY: tldraw stores Straight and Curved both as `kind: "arc"` (dock.tsx's
 * `applyArrowPreset`), so the engine alone cannot say which arrow is armed —
 * the dock preferences can. A computed that read `getDockPreferences()`
 * directly would not know when to recompute, and `tools().active` would read
 * a stale preset after `setTool("arrow-curve")` (the contract's "setTool is
 * readable back, including a variant id"). One module-level mirror, because
 * the preferences store it mirrors is module-level too.
 */
const arrowPreset = atom("shell arrow preset", arrowPresetOf(getDockPreferences()));
subscribeDockPreferences(() => arrowPreset.set(arrowPresetOf(getDockPreferences())));

function shellDataOf(shape: TLShape | undefined): Record<string, unknown> | undefined {
  const value = shape?.meta?.[SHELL_DATA_META_KEY];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * `HostPort` over one tldraw `Editor`. Cheap to construct (every computed is
 * lazy), so a test may build one per check; the app shares one per editor
 * through `tldrawHostPortFor` below.
 */
export function createTldrawHostPort(editor: Editor): HostPort {
  /**
   * The scene, over SHAPE and BINDING records only.
   *
   * WHY not `editor.store.allRecords()` (what `useDocumentScene` derives over,
   * document/sceneFromStore.ts): the camera, the pointer and the selection are
   * records too, so that derivation rebuilds the whole scene on every pan,
   * every mouse move and every click — completeness-critic #18's residual.
   * `store.query.records(type)` only moves when a record of that type does.
   *
   * WHY the nodes are ordered by (`index`, id): `hostContract.ts` compares
   * JSON snapshots across `serialize()` → `load()`, so the order must survive
   * a round trip byte-for-byte, and store insertion order is not a document
   * fact. `index` is — it is tldraw's own fractional z-order, saved in the
   * file — so the scene lists siblings in the order the board paints them, and
   * the id breaks the tie between different parents deterministically.
   */
  const shapes = editor.store.query.records("shape");
  const bindings = editor.store.query.records("binding");
  const scene = computed<DocumentScene>("shell scene", () => {
    const shapeList = shapes.get();
    const derived = sceneFromRecords([...shapeList, ...bindings.get()] as TLRecord[]);
    const byId = new Map<string, TLShape>(shapeList.map((shape) => [shape.id, shape]));
    const order = (id: string) => byId.get(id)?.index ?? "";
    const nodes = derived.nodes
      .map((node) => {
        const extra = shellDataOf(byId.get(node.id));
        return extra ? { ...node, data: { ...extra, ...node.data } } : node;
      })
      .sort((a, b) => {
        const ia = order(a.id);
        const ib = order(b.id);
        if (ia !== ib) return ia < ib ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    return { nodes, edges: derived.edges };
  });

  /**
   * Every selected record, stock geo and arrows too — `pillGeometry.smoke`
   * selects a geo box and expects the pill. The bounds are the reference
   * conversion at `ContextualPopupMenu/floatingToolbar.tsx`'s "STEP 2":
   * document-space screen bounds minus the container's own offset, i.e.
   * container-relative (constraint 6).
   */
  const selection = computed<{ ids: readonly NodeId[]; screenBounds: Rect | null }>("shell selection", () => {
    const ids = editor.getSelectedShapeIds() as readonly NodeId[];
    const bounds = editor.getSelectionRotatedScreenBounds();
    if (ids.length === 0 || !bounds) return { ids, screenBounds: null };
    const viewport = editor.getViewportScreenBounds();
    return { ids, screenBounds: { x: bounds.x - viewport.x, y: bounds.y - viewport.y, w: bounds.w, h: bounds.h } };
  });

  const viewport = computed<{ zoom: number; screenBounds: Rect }>(
    "shell viewport",
    () => {
      const screen = editor.getViewportScreenBounds();
      return { zoom: editor.getZoomLevel(), screenBounds: { x: 0, y: 0, w: screen.w, h: screen.h } };
    },
    {
      isEqual: (a, b) =>
        a.zoom === b.zoom && a.screenBounds.w === b.screenBounds.w && a.screenBounds.h === b.screenBounds.h,
    },
  );

  /** The reads the pill made at `floatingToolbar.tsx`'s "STEP 4" (the
   *  manipulation gate), named in words every engine can answer. */
  const interaction = computed<InteractionPhase>("shell interaction", () => {
    if (editor.isIn("select.translating")) return "moving";
    if (editor.isIn("select.resizing")) return "resizing";
    if (editor.isIn("select.brushing")) return "selecting";
    return "idle";
  });

  /** `active` is the VARIANT id (HOST-PORT.md "a variant is just a tool id"):
   *  the geo style while `geo` is armed, the remembered preset while `arrow`
   *  is — the inverse of `selectDockTool`'s translation (dock.tsx). */
  const tools = computed<{ catalogue: readonly ToolDescriptor[]; active: string }>(
    "shell tools",
    () => {
      const tool = editor.getCurrentToolId();
      let active = tool;
      if (tool === "geo") active = String(editor.getStyleForNextShape(GeoShapeGeoStyle));
      else if (tool === "arrow") active = arrowPresetToolId(arrowPreset.get());
      return { catalogue: DOCK_CATALOGUE, active };
    },
    { isEqual: (a, b) => a.active === b.active && a.catalogue === b.catalogue },
  );

  const history = computed<{ canUndo: boolean; canRedo: boolean }>(
    "shell history",
    () => ({ canUndo: editor.getCanUndo(), canRedo: editor.getCanRedo() }),
    { isEqual: (a, b) => a.canUndo === b.canUndo && a.canRedo === b.canRedo },
  );

  const documentName = computed<string>("shell document name", () => editor.getDocumentSettings().name);

  /** Inside `transact`, a write joins the gesture; outside it, a write is its
   *  own undo step — one `markHistoryStoppingPoint` per command, the same
   *  thing `selectionActions.ts`'s setters do before each write. */
  let transactDepth = 0;
  function command(name: string, write: () => void): void {
    if (transactDepth === 0) editor.markHistoryStoppingPoint(name);
    write();
  }

  const port: HostPort = {
    capabilities: new Set(TLDRAW_CAPABILITIES),

    /**
     * One synchronous `react` over every getter's signal.
     *
     * WHY `react` and not `editor.store.listen`: `listen` is throttled to the
     * next animation frame, and a window must learn about a selection in the
     * same tick it happened (the contract counts a notification synchronously
     * after `select`). A reaction runs as soon as the transaction that changed
     * one of its signals ends. Its first run is the subscription itself, not
     * a change, so it is skipped.
     */
    subscribe(onChange) {
      let first = true;
      return react("shell port subscription", () => {
        scene.get();
        selection.get();
        viewport.get();
        interaction.get();
        tools.get();
        history.get();
        documentName.get();
        if (first) {
          first = false;
          return;
        }
        onChange();
      });
    },

    scene: () => scene.get(),
    selection: () => selection.get(),
    viewport: () => viewport.get(),
    interaction: () => interaction.get(),
    tools: () => tools.get(),
    history: () => history.get(),
    documentName: () => documentName.get(),

    select(ids) {
      editor.setSelectedShapes(ids as TLShapeId[]);
    },

    setTool(id) {
      selectDockTool(editor, id);
    },

    view(action: ViewAction) {
      if (action.kind === "zoomTo") {
        // Zoom about the viewport's centre — what the strip's zoom rows do.
        const centre = editor.getViewportPageBounds().center;
        const screen = editor.getViewportScreenBounds();
        const z = action.zoom;
        editor.setCamera({ x: screen.w / (2 * z) - centre.x, y: screen.h / (2 * z) - centre.y, z });
        return;
      }
      if (!action.ids) {
        // The bar's Home button did exactly this (TitleBar/chromeBar.tsx at
        // 75991ce, `onReturnToRoot={() => editor.zoomToFit()}`).
        editor.zoomToFit();
        return;
      }
      const bounds = action.ids
        .map((id) => editor.getShapePageBounds(id as TLShapeId))
        .filter((box): box is NonNullable<typeof box> => box !== undefined);
      if (bounds.length === 0) return;
      const union = bounds.slice(1).reduce((acc, box) => acc.union(box), bounds[0].clone());
      // Same framing the Problems panel's reveal uses (problems.ts `reveal`).
      editor.zoomToBounds(union, { inset: 96, animation: { duration: 0 } });
    },

    nodes(action: NodeAction) {
      if (action.kind === "delete") {
        const ids = action.ids.filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (ids.length === 0) return;
        command("delete", () => editor.deleteShapes(ids));
        return;
      }
      if (action.kind === "duplicate") {
        const ids = action.ids.filter((id) => editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (ids.length === 0) return;
        // tldraw's own duplicate, at the pill's own offset
        // (selectionActions.ts `duplicateSelection`).
        command("duplicate", () => editor.duplicateShapes(ids, DUPLICATE_OFFSET));
        return;
      }
      const updates = action.patches.flatMap((patch) => {
        const shape = editor.getShape(patch.id as TLShapeId);
        if (!shape) return [];
        const update: { id: TLShapeId; type: string; x?: number; y?: number; meta?: TLShape["meta"] } = {
          id: shape.id,
          type: shape.type,
        };
        if (patch.position) {
          update.x = patch.position.x;
          update.y = patch.position.y;
        }
        if (patch.data) {
          // Merged, not replaced (`NodePatch.data`'s own contract): the shell
          // only ever knows the keys it set.
          update.meta = { ...shape.meta, [SHELL_DATA_META_KEY]: { ...shellDataOf(shape), ...patch.data } } as TLShape["meta"];
        }
        return [update];
      });
      if (updates.length === 0) return;
      command("update", () => editor.updateShapes(updates as never));
    },

    undo() {
      editor.undo();
    },

    redo() {
      editor.redo();
    },

    /**
     * One gesture = one undo step. `undoable: false` is `editor.run(fn, {
     * history: "ignore" })` — the history-ignoring write
     * `DevMenu/variantSwitch.tsx` already makes (its `ignoreShapeLock` stays
     * there, tldraw-only, HOST-PORT.md "the stop rule working").
     */
    transact(label, fn, opts) {
      const undoable = opts?.undoable !== false;
      if (transactDepth === 0 && undoable) editor.markHistoryStoppingPoint(label);
      let result!: ReturnType<typeof fn>;
      transactDepth += 1;
      try {
        editor.run(
          () => {
            result = fn();
          },
          undoable ? undefined : { history: "ignore" },
        );
      } finally {
        transactDepth -= 1;
      }
      return result;
    },

    setDocumentName(name) {
      editor.updateDocumentSettings({ name });
    },

    // The engine's own `.tldr` bytes, through the app's own reference
    // implementation — constraint 5, "document I/O is host-native".
    serialize: () => serializeBoard(editor),

    load(text): LoadResult {
      return loadBoardText(editor, text);
    },
  };

  return port;
}

/** One port per editor, shared by every window the app mounts (the shell in
 *  `InFrontOfTheCanvas`, the dock in tldraw's `Toolbar` slot), so they all
 *  read the same cached scene. */
const PORTS = new WeakMap<Editor, HostPort>();

export function tldrawHostPortFor(editor: Editor): HostPort {
  let port = PORTS.get(editor);
  if (!port) {
    port = createTldrawHostPort(editor);
    PORTS.set(editor, port);
  }
  return port;
}
