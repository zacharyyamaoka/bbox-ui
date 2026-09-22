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

import type { MenuAction } from "@trunk/editor/chromeBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@trunk/components/dropdown-menu";
import type { PyblocksClient } from "@trunk/backend/pyblocksClient";
import type { HostNodeData } from "@trunk/hosts/hostScene";
import { withPortDeclarationName } from "@trunk/scene/portDeclaration";
import type { SceneNode } from "@trunk/scene/scene";
import {
  loadPyblocksScene,
  type LoadedPyblocksScene,
  type PyblocksHostNodeData,
  type PyblocksSceneDocument,
} from "@trunk/hosts/pyblocksScene";

import type { BlockShape } from "../shapes/block";
import type { RegionShape } from "../shapes/region";
import { applyScene, SCENE_SOURCE_META_KEY } from "../document/applySceneDiff";
import type { DocNodeData, DocumentScene } from "../document/sceneFromStore";
import { BLOCK_SHAPE_TYPE, PORT_SIDES, REGION_SHAPE_TYPE } from "../shapes/types";

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

/**
 * WHICH pyblocks answer a board is — the name `applyScene` records on every
 * shape it mints for it, and the only shapes a later open of the SAME answer
 * is allowed to take off the board (`document/applySceneDiff.ts`'s
 * `ApplyScope`).
 *
 * WHY the VIEW is in the key and not just the file: a second view of one file
 * is a different picture of it, containing different blocks, and the analyzer
 * says nothing about the ones it left out. Keyed by uri alone, picking a
 * second definition out of the same file would delete the first — which is
 * half of the data loss this key exists to stop, and the half that looks most
 * like "it worked" until you notice what is missing.
 *
 * WHY it is derived from the DOCUMENT and not from the picker's arguments:
 * the document is what actually came back, so the key cannot drift from the
 * board it names when a request for `viewId: null` is answered with the
 * server's own choice (`source.selectedViewId`).
 */
export function pyblocksSourceKey(document: PyblocksSceneDocument): string {
  return `pyblocks:${document.source.uri}#${document.source.selectedViewId ?? ""}`;
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

/**
 * How far the first row of a region's members drops to clear the corner block.
 *
 * WHY the projection has to add this at all: the trunk's layout is older than
 * this file's corner block and knows nothing about it. `layoutUnplaced` places
 * every node pyblocks did not position at `x = 40 + 320·rank, y = 40 + 160·i`
 * IN THE PARENT'S SPACE (`@trunk/scene/pyblocksScene.ts` — `LAYOUT_ORIGIN_PX`,
 * `LAYOUT_COLUMN_PX`, `LAYOUT_ROW_PX`), while the corner block this file mints
 * sits at the frame's own top-left, `{0,0}`, 160×100 (`BlockShapeUtil`'s
 * `getDefaultProps`). Those two rectangles overlap by 120×60, and the loser is
 * the corner block: it is created first, so the first member draws ON TOP of
 * the region's own interface — measured 2026-09-19, `run()`'s `raw` label
 * clipped to `ra` and its `scaled` port and wire hidden under `decode()`.
 *
 * Fixing it HERE rather than in the trunk is deliberate: the corner block is
 * this app's ruling ("a region's interface IS a real block"), no other host
 * mints one, and a trunk layout that reserved room for a shape only this app
 * creates would be geometry paid for by every consumer. Authored positions are
 * never touched — only what the trunk itself placed.
 *
 * 120 = the corner block's own height (100) plus a 20 gutter, which keeps the
 * first row clear of it and every later row on the trunk's own 160 pitch.
 */
const REGION_MEMBER_CLEARANCE_PX = 120;

/** The room a region keeps around its outermost member when this file grows it
 *  to fit — see `fitRegionsToMembers`. */
const REGION_FIT_PADDING_PX = 40;

export interface PyblocksBoard {
  scene: DocumentScene;
  /** `pyblocksSourceKey(loaded.document)` — the provenance every shape this
   *  board mints is stamped with, and the scope of what a re-open may delete. */
  source: string;
  /** Shape id → port id → the port's AUTHORED name (the NAME half of its
   *  declaration line — the backend reports a name and an annotation
   *  separately, and `applyPyblocksBoard` splices each into the one string
   *  the port stores).
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

  /** Which ids are regions, so a member can be recognised by its PARENT. Read
   *  before the loop because a document may list a member ahead of its frame. */
  const regionIds = new Set(loaded.scene.nodes.filter((node) => node.type === "region").map((node) => node.id));

  /** A node's position, dropped clear of the corner block when — and only
   *  when — the trunk placed it inside a region. `authoredPosition === false`
   *  is pyblocks' own word for "I placed nothing here"
   *  (`unplacedByPyblocks`); anything the file itself authored is left exactly
   *  where it was authored. */
  const placedPosition = (node: SceneNode<HostNodeData>) => {
    if (extras.get(node.id)?.pyblocks?.authoredPosition !== false) return node.position;
    if (!node.parentId || !regionIds.has(node.parentId)) return node.position;
    return { x: node.position.x, y: node.position.y + REGION_MEMBER_CLEARANCE_PX };
  };

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
        position: placedPosition(node),
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
        position: placedPosition(node),
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
        position: placedPosition(node),
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
        position: placedPosition(node),
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

  return { scene: { nodes, edges }, source: pyblocksSourceKey(loaded.document), portLabels, problems };
}

/** The gap left between a board already on the canvas and a board arriving
 *  from a file that has never been opened here. */
const NEW_BOARD_GUTTER_PX = 160;

/**
 * Where a board lands: in place when this file+view has been opened here
 * before, clear to the RIGHT of everything else when it has not.
 *
 * WHY this exists beside the scope fix rather than after it: `ApplyScope`
 * stops a second `Open Python file…` from DELETING the first board, which is
 * the data loss. It does not stop the second board being drawn on top of the
 * first — pyblocks lays every unplaced node out from `{40,40}`
 * (`layoutUnplaced`), so two files land in the same rectangle and the person
 * gets one unreadable pile instead of one missing board. Shipping the scope
 * fix alone would have traded a loud bug for a quiet one.
 *
 * WHY only a re-open is exempt: a board already on the canvas under this same
 * source is the one this apply is a DIFF of, and shifting it would drag every
 * node away from where the person left it on every re-open.
 *
 * Top-level nodes only: `position` is parent-relative (`sceneFromStore.ts`),
 * so a member's coordinates are already inside a frame that is itself moving.
 */
function landedClearOfExistingBoards(editor: Editor, board: PyblocksBoard): DocumentScene {
  const alreadyHere = editor
    .getCurrentPageShapes()
    .some((shape) => (shape.meta as Record<string, unknown> | undefined)?.[SCENE_SOURCE_META_KEY] === board.source);
  const bounds = editor.getCurrentPageBounds();
  if (alreadyHere || !bounds) return board.scene;
  const topLevel = board.scene.nodes.filter((node) => !node.parentId);
  if (topLevel.length === 0) return board.scene;
  const dx = Math.round(bounds.maxX + NEW_BOARD_GUTTER_PX - Math.min(...topLevel.map((node) => node.position.x)));
  if (dx <= 0) return board.scene;
  return {
    nodes: board.scene.nodes.map((node) => (node.parentId ? node : { ...node, position: { x: node.position.x + dx, y: node.position.y } })),
    edges: board.scene.edges,
  };
}

/**
 * Put the board on the canvas, in ONE undo step.
 *
 * WHY history is NOT cleared, unlike `chrome/FileMenu/fileActions.ts`'s `openBoard`:
 * that one swaps a whole `.tldr` document and a Ctrl+Z through it would
 * resurrect the previous board's records underneath the new ones. This is a
 * scene DIFF through `applyScene`, which is already a single transaction —
 * so Ctrl+Z is "no, put my board back", which is the behaviour a person
 * wants the first time they open the wrong file.
 *
 * WHY the apply is scoped to this file+view (`board.source`) and not to the
 * document: pyblocks describes ONE Python file. A document-scoped apply
 * treats every shape the projection does not mention as deleted — so
 * re-opening a file silently took every cable the person had drawn on it, and
 * opening a second file wiped the first. Measured, and pinned by
 * `src/openPythonScope.smoke.test.tsx`.
 */
export function applyPyblocksBoard(editor: Editor, board: PyblocksBoard): void {
  editor.run(() => {
    applyScene(editor, landedClearOfExistingBoards(editor, board), { kind: "source", source: board.source });
    fitRegionsToMembers(editor, board);
    for (const [shapeId, labels] of board.portLabels) {
      const shape = editor.getShape(shapeId as TLShapeId);
      if (!shape || shape.type !== BLOCK_SHAPE_TYPE) continue;
      const before = (shape as BlockShape).props.ports;
      let changed = false;
      const ports = { ...before };
      for (const side of PORT_SIDES) {
        ports[side] = before[side].map((port) => {
          const name = labels[port.id];
          if (!name) return port;
          // The NAME half only. A port stores one declaration line (ruling 8)
          // and `applyScene` may already have annotated it from the same
          // backend's `portTypes`, so an authored label has to splice itself
          // in front of the colon rather than overwrite the line —
          // `withPortDeclarationName` keeps the annotation exactly as it was
          // spelled, down to its spacing.
          const declaration = withPortDeclarationName(port.declaration, name);
          if (declaration === port.declaration) return port;
          changed = true;
          return { ...port, declaration };
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

/**
 * Grow each region until its own members are inside it.
 *
 * WHY this cannot go through the scene: `applySceneDiff.ts`'s `propsFromData`
 * deliberately never names `w`/`h` ("a field the scene has no opinion about —
 * a measured `anchors`, a `w` nobody authored — must keep whatever the
 * document already has"), so a region lands at `RegionShapeUtil`'s default
 * 480×320 whatever it contains. With three members on the trunk's 320×160
 * pitch that is already too small: `scale()` at x=360 is 40 units wider than
 * the frame, and it drew OUTSIDE its own dashed boundary before this ran.
 * Dropping the first row clear of the corner block above makes the same thing
 * true downward, so the two fixes ship together or the second one trades a
 * collision for an overflow.
 *
 * WHY measured and not computed: the sizes are the shapes' OWN geometry, read
 * back after `applyScene` created them, so a block that sizes itself to its
 * ports is counted as it really is rather than as a default this file assumed.
 *
 * Owed upstream to L5: `autoFit` is a REGION behaviour (plan §5, and the
 * pyblocks contract carries `membersLayout: "free"` / `autoFit: true` per
 * region). This is a one-shot fit at open — it does not follow a member that
 * is later dragged out. When L5 lands the real thing, delete this.
 */
function fitRegionsToMembers(editor: Editor, board: PyblocksBoard): void {
  for (const node of board.scene.nodes) {
    if (node.data.kind !== "region") continue;
    const region = editor.getShape(node.id as TLShapeId);
    if (!region || region.type !== REGION_SHAPE_TYPE) continue;
    let right = 0;
    let bottom = 0;
    for (const childId of editor.getSortedChildIdsForParent(region.id)) {
      const child = editor.getShape(childId);
      if (!child) continue;
      // Child x/y are PARENT-relative (tldraw's own rule), and the geometry's
      // bounds are the child's own box — so the two add up in region space.
      const bounds = editor.getShapeGeometry(child).bounds;
      right = Math.max(right, child.x + bounds.maxX);
      bottom = Math.max(bottom, child.y + bounds.maxY);
    }
    const props = (region as RegionShape).props;
    const w = Math.max(props.w, Math.round(right + REGION_FIT_PADDING_PX));
    const h = Math.max(props.h, Math.round(bottom + REGION_FIT_PADDING_PX));
    if (w === props.w && h === props.h) continue;
    editor.updateShape({ id: region.id, type: REGION_SHAPE_TYPE, props: { w, h } } as never);
  }
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
      // The board IS this file now, and tldraw's own singleton document record
      // is where a board's name belongs (`TLDocument.name`, written through the
      // stock `editor.updateDocumentSettings` — no minted field, no new
      // contract, and it rides along in a saved `.tldr`).
      //
      // WHY the name is written even though nothing reads it yet: the chrome
      // bar's title is `useState(DEFAULT_BOARD_NAME)`, local to
      // `src/chrome/TitleBar/chromeBar.tsx` (L4's file, outside this lane's write set),
      // so the bar still reads "Untitled board" after a file opens and
      // `File ▸ Save` derives its filename from that. Writing the truth where
      // the engine already keeps it turns that into a ONE-LINE fix in L4's
      // file — `const name = useValue("ss board name", () =>
      // editor.getDocumentSettings().name || DEFAULT_BOARD_NAME, [editor])`,
      // with `setName` becoming `editor.updateDocumentSettings({ name })` —
      // instead of a new context threaded through the app shell. Until that
      // lands, `ss-backend-title` beside the Backend control is the honest
      // title surface, and the smoke measures both.
      editor.updateDocumentSettings({ name: filename });
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
   * (`src/chrome/FileMenu/fileActions.ts` builds the File group the same way).
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
        way `chrome/FileMenu/fileActions.ts`'s `pickTldrawFile` does: the acceptance
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
