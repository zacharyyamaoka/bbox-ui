// src/backend/OpenPython.tsx — `Open Python file…`, and the projection that
// turns what pyblocks answers into shapes on this board.
//
// The menu item is registered ONLY when the setting is `pyblocks`, health is
// ok, and `/api/health` said `systemsketch.scene`. Everything below that gate
// is ordinary: a file picker, one POST, `loadPyblocksScene`, and the app's own
// mutation seam (`src/document/applySceneDiff.ts`).
//
// EVERYTHING IS A BLOCK, and this file is where that ruling costs something.
// A pyblocks `region` arrives with `ports` on it — the boundary's `raw` in and
// `scaled` out. This app's `ss-region` grows no ports of its own, because "a
// region's interface IS a real block": `RegionShapeProps.cornerBlockId` names
// a CHILD `ss-block` that carries them (`src/shapes/region/index.ts`). So the
// projection mints that corner block and re-points the boundary's own edges at
// it. Without it those two wires would have nowhere to land — and once L5
// lands, `ss-region` refuses a wire binding outright
// (`documentModel.test.ts`'s "a region is frame-like and is never a wire
// target"), so a projection that wired straight to the region would be
// building on a placeholder's default.
//
// NEVER MIX DATA AND CONTROL LINES: `loadPyblocksScene` has already kept
// `controlEdges` out of the scene (they stay whole on the document), so every
// edge reaching this file is a data wire by construction. This file adds no
// second path for them and no `variant: "control"` — there is none.
import { createElement, useCallback, useRef, useState } from "react";
import { FileCode2 } from "lucide-react";
import type { Editor, TLShapeId } from "tldraw";
import { useEditor } from "tldraw";

import type { MenuAction } from "@trunk/components/chromeBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@trunk/components/dropdown-menu";
import type { PyblocksClient } from "@trunk/backend/pyblocksClient";
import type { HostNodeData } from "@trunk/hosts/hostScene";
import type { SceneNode } from "@trunk/scene/scene";
import {
  loadPyblocksScene,
  type LoadedPyblocksScene,
  type PyblocksHostNodeData,
  type PyblocksSceneDocument,
} from "@trunk/scene/pyblocksScene";

import type { BlockShape } from "../shapes/block";
import { applyScene } from "../document/applySceneDiff";
import type { DocNodeData, DocumentScene } from "../document/sceneFromStore";
import { BLOCK_SHAPE_TYPE, PORT_SIDES } from "../shapes/types";

/* ------------------------------------------------------------------ */
/* Ids                                                                 */
/* ------------------------------------------------------------------ */

/**
 * A pyblocks node id, as a tldraw shape id.
 *
 * WHY the semantic id is carried through VERBATIM behind the prefix rather
 * than being replaced by a fresh `createShapeId()`: tldraw's only rule for a
 * shape id is the `shape:` prefix (`@tldraw/tlschema`'s `idValidator` — a
 * `T.string.refine` on `startsWith`, nothing else), and a pyblocks id
 * (`function:run@3:0/transform:call@4:12-4:23`) is the one thing that makes
 * a re-open a DIFF instead of a rebuild: `applyScene` matches by id, so the
 * same file opened twice updates the shapes that survived and keeps every
 * binding, undo entry and selection that names them. It also means the
 * `nodeId` in a published `SceneEvent` is the semantic block with one string
 * operation, which is what the write path (F1) will need.
 */
function toShapeId(pyblocksId: string): string {
  return `shape:${pyblocksId}`;
}

/** The corner block a region's ports live on. Deterministic, for the same
 *  diff-on-re-open reason as above. */
function cornerIdFor(regionShapeId: string): string {
  return `${regionShapeId}#corner`;
}

/* ------------------------------------------------------------------ */
/* The projection: a pyblocks scene → this app's document scene        */
/* ------------------------------------------------------------------ */

/** The analyzer's control vocabulary → the four kinds `ss-region` validates.
 *  Anything else (`function`, `try`, `with`, …) is `plain`: an honest "a
 *  scope, nothing claimed about its shape" rather than a kind invented to
 *  fill the field. */
const REGION_KIND_OF: Record<string, NonNullable<DocNodeData["regionKind"]>> = {
  for: "for",
  while: "while",
  if: "branch",
};

export interface PyblocksBoard {
  scene: DocumentScene;
  /** Shape id → port id → the port's AUTHORED name.
   *
   *  WHY this rides beside the scene instead of in it: `DocNodeData` has no
   *  `portLabels` field (`sceneFromStore.ts` projects port IDS only — "the
   *  scene only ever names ports; it never places them"), so `applyScene`
   *  can only give a brand-new port `name: id`. The labels are real authored
   *  data (`raw`, `frame`, `gain`, `scaled`) and dropping them would rename
   *  every dot to its slug, which `feedback_truthful_property_rendering`
   *  forbids. They are applied in the same transaction, right after. */
  portLabels: Map<string, Record<string, string>>;
  /** Findings the projection itself made, added to the loader's own. */
  problems: string[];
}

/**
 * Everything pyblocks sent, as shapes this app can validate.
 *
 * Pure: takes the loaded scene and the document it came from (the document
 * carries `data.control` and `data.portLabels`, which `HostScene` widens
 * away), returns the board. Nothing here touches an editor.
 */
export function pyblocksBoardFrom(loaded: LoadedPyblocksScene): PyblocksBoard {
  const extras = new Map<string, PyblocksHostNodeData>(
    loaded.document.scene.nodes.map((node) => [node.id, node.data]),
  );
  const nodes: SceneNode<DocNodeData>[] = [];
  const portLabels = new Map<string, Record<string, string>>();
  const problems: string[] = [...loaded.problems];
  /** pyblocks node id → the shape id its EDGES must name. For a region that
   *  is its corner block, not the frame. */
  const endpointOf = new Map<string, string>();

  const rail = (data: HostNodeData) => ({
    left: data.ports?.left ?? [],
    right: data.ports?.right ?? [],
    top: data.ports?.top ?? [],
    bottom: data.ports?.bottom ?? [],
  });

  for (const node of loaded.scene.nodes) {
    const shapeId = toShapeId(node.id);
    const extra = extras.get(node.id);
    const parentId = node.parentId ? toShapeId(node.parentId) : undefined;
    const labels = extra?.portLabels;
    const portTypes = extra?.portTypes;

    if (node.type === "region") {
      const corner = cornerIdFor(shapeId);
      nodes.push({
        id: shapeId,
        type: "region",
        position: node.position,
        ...(parentId ? { parentId } : {}),
        data: {
          kind: "region",
          name: node.data.name ?? "",
          regionKind: REGION_KIND_OF[extra?.control?.kind ?? ""] ?? "plain",
          cornerBlockId: corner,
        },
      });
      // The region's interface, as a real block, at the frame's top-left.
      nodes.push({
        id: corner,
        type: "block",
        parentId: shapeId,
        position: { x: 0, y: 0 },
        data: {
          kind: "block",
          name: node.data.name ?? "",
          view: node.data.view === "expanded" ? "port" : (node.data.view ?? "port"),
          ports: rail(node.data),
          ...(portTypes ? { portTypes } : {}),
        },
      });
      if (labels) portLabels.set(corner, labels);
      endpointOf.set(node.id, corner);
      continue;
    }

    if (node.type === "value") {
      // A literal capsule is a one-or-two-port block: `writers` are the
      // sinks, `readers` the sources (`hostScene.ts`'s `hostPolarityOf` says
      // exactly that). This app's vocabulary has no `value` shape, and
      // minting one from a backend lane is precisely what the document
      // contract exists to prevent — so it lands as the smallest honest
      // block, named by the literal itself.
      nodes.push({
        id: shapeId,
        type: "block",
        position: node.position,
        ...(parentId ? { parentId } : {}),
        data: {
          kind: "block",
          name: node.data.value ?? node.data.name ?? "",
          view: "port",
          ports: { left: node.data.writers ?? [], right: node.data.readers ?? [], top: [], bottom: [] },
          ...(portTypes ? { portTypes } : {}),
        },
      });
      if (labels) portLabels.set(shapeId, labels);
      endpointOf.set(node.id, shapeId);
      continue;
    }

    if (node.type === "block" || node.type === undefined) {
      nodes.push({
        id: shapeId,
        type: "block",
        position: node.position,
        ...(parentId ? { parentId } : {}),
        data: {
          kind: "block",
          name: node.data.name ?? "",
          view: node.data.view ?? "port",
          ports: rail(node.data),
          ...(portTypes ? { portTypes } : {}),
        },
      });
      if (labels) portLabels.set(shapeId, labels);
      endpointOf.set(node.id, shapeId);
      continue;
    }

    if (node.type === "code") {
      nodes.push({
        id: shapeId,
        type: "code",
        position: node.position,
        ...(parentId ? { parentId } : {}),
        data: { kind: "code", name: node.data.name ?? "", code: node.data.code ?? "", language: "python" },
      });
      endpointOf.set(node.id, shapeId);
      continue;
    }

    // Reported, never silently dropped — the same posture as the loader's
    // own `problems`.
    problems.push(`node ${node.id}: this app has no shape for a "${node.type}" node, so it was left off the board`);
  }

  const edges = loaded.scene.edges.flatMap((edge) => {
    const source = endpointOf.get(edge.source);
    const target = endpointOf.get(edge.target);
    if (!source || !target) {
      problems.push(`edge ${edge.id}: one of its ends names a node that is not on the board`);
      return [];
    }
    return [
      {
        id: toShapeId(edge.id),
        source,
        sourceHandle: edge.sourceHandle,
        target,
        targetHandle: edge.targetHandle,
        data: { variant: edge.data?.variant ?? "data", routing: edge.data?.routing ?? "elbow", ...(edge.data?.color ? { color: edge.data.color } : {}) },
      },
    ];
  });

  return { scene: { nodes, edges }, portLabels, problems };
}

/**
 * Put the board on the canvas, in ONE undo step.
 *
 * WHY history is NOT cleared, unlike `chrome/fileActions.ts`'s `openBoard`:
 * that one swaps a whole `.tldr` document and a Ctrl+Z through it would
 * resurrect the previous board's records underneath the new ones. This is a
 * scene DIFF through `applyScene`, which is already a single transaction —
 * so Ctrl+Z is "no, put my board back", which is the behaviour a person
 * wants the first time they open the wrong file.
 */
export function applyPyblocksBoard(editor: Editor, board: PyblocksBoard): void {
  editor.run(() => {
    applyScene(editor, board.scene);
    for (const [shapeId, labels] of board.portLabels) {
      const shape = editor.getShape(shapeId as TLShapeId);
      if (!shape || shape.type !== BLOCK_SHAPE_TYPE) continue;
      const before = (shape as BlockShape).props.ports;
      let changed = false;
      const ports = { ...before };
      for (const side of PORT_SIDES) {
        ports[side] = before[side].map((port) => {
          const name = labels[port.id];
          if (!name || name === port.name) return port;
          changed = true;
          return { ...port, name };
        });
      }
      if (changed) editor.updateShape({ id: shape.id, type: BLOCK_SHAPE_TYPE, props: { ports } } as never);
    }
    const bounds = editor.getCurrentPageBounds();
    // `immediate`, for the reason `openBoard` gives: a document swap is not
    // a navigation, and an animated fly-in from the old board means nothing.
    if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, immediate: true });
  });
}

/* ------------------------------------------------------------------ */
/* The menu                                                            */
/* ------------------------------------------------------------------ */

export interface OpenedPyblocksBoard {
  /** The file's own name — what the board is now called. */
  title: string;
  documentUri: string;
  problems: string[];
  diagnostics: PyblocksSceneDocument["diagnostics"];
}

export interface OpenPythonMenuProps {
  client: PyblocksClient;
  onOpened(board: OpenedPyblocksBoard): void;
  onError(message: string): void;
  /** Fired the moment the board has landed and BEFORE anything could be
   *  derived from it — the bridge rebases here, because a board pyblocks
   *  just sent is not an edit the person made. */
  onBoardApplied(): void;
}

/** What the picker is holding while the person chooses a view. */
interface PendingPick {
  source: string;
  filename: string;
  document: PyblocksSceneDocument;
}

export function OpenPythonMenu({ client, onOpened, onError, onBoardApplied }: OpenPythonMenuProps) {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPick | null>(null);
  const [busy, setBusy] = useState(false);

  const land = useCallback(
    (doc: PyblocksSceneDocument, filename: string) => {
      let loaded: LoadedPyblocksScene;
      try {
        loaded = loadPyblocksScene(doc);
      } catch (error) {
        // A `PyblocksSceneError` means the reply is not a document. The board
        // is left exactly as it was — never blanked, never half-applied.
        onError(error instanceof Error ? error.message : String(error));
        return;
      }
      const board = pyblocksBoardFrom(loaded);
      applyPyblocksBoard(editor, board);
      onBoardApplied();
      onOpened({ title: filename, documentUri: doc.source.uri, problems: board.problems, diagnostics: doc.diagnostics });
    },
    [editor, onBoardApplied, onError, onOpened],
  );

  const request = useCallback(
    async (source: string, filename: string, viewId: string | null) => {
      setBusy(true);
      try {
        const doc = await client.scene({ source, filename, viewId });
        if (viewId === null && doc.views.length > 1) {
          // More than one definition in the file: ask, rather than guess.
          // §8's reversible default — a plain list tonight, a real picker
          // with signatures is follow-up F6.
          setPending({ source, filename, document: doc });
          return;
        }
        setPending(null);
        land(doc, filename);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [client, land, onError],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const source = await file.text();
        await request(source, file.name, null);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    },
    [onError, request],
  );

  /**
   * The row, as a `MenuAction` — the shape `@trunk/components/chromeBar`
   * takes for every host-supplied menu row in this app
   * (`src/chrome/fileActions.ts` builds the File group the same way).
   */
  const actions: MenuAction[] = [
    {
      id: "open-python",
      label: "Open Python file…",
      icon: createElement(FileCode2),
      disabled: busy,
      run: () => input.current?.click(),
    },
  ];

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      {/*
        WHY the input is rendered and hidden rather than created on demand the
        way `chrome/fileActions.ts`'s `pickTldrawFile` does: the acceptance
        drives it with Playwright's `setInputFiles`, which needs an element
        that is in the document before the click. A real person still reaches
        it through the menu row above, which clicks it — one input, one path,
        no test-only branch in the product.
      */}
      <input
        ref={input}
        data-testid="ss-backend-file"
        type="file"
        accept=".py"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the SAME file twice fires `change` again.
          event.target.value = "";
          void onFile(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          data-testid="ss-backend-menu"
          data-pyblocks="menu"
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground shadow-sm"
        >
          Python
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actions.map((action) => (
            <DropdownMenuItem key={action.id} data-testid={`ss-backend-${action.id}`} disabled={action.disabled} onClick={action.run}>
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {pending ? (
        <div
          data-testid="ss-backend-views"
          data-pyblocks="views"
          className="flex w-64 flex-col gap-0.5 rounded-md border border-border bg-card p-1 text-xs text-card-foreground shadow-md"
        >
          <span className="px-1.5 py-1 text-muted-foreground">{pending.filename} — pick a definition</span>
          {pending.document.views.map((view, index) => (
            <button
              key={view.id}
              type="button"
              data-view-id={view.id}
              data-selected={index === 0 ? "true" : undefined}
              className="rounded px-1.5 py-1 text-left hover:bg-accent data-[selected=true]:bg-accent/60"
              onClick={() => void request(pending.source, pending.filename, view.id)}
            >
              {view.title}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
