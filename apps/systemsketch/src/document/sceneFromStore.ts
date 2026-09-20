// src/document/sceneFromStore.ts — the tldraw store, projected into the
// trunk's own `BlockScene` (docs/SYSTEMSKETCH-REBUILD-PLAN.md §3.1).
//
// WHY a DERIVED scene rather than a second stored one: the scene kit's pure
// functions (`topologicalOrder`, `findCycles`, `lintScene`, `focusSnapshot`,
// `regionOf`) are the app's whole analysis layer, and they are written against
// `BlockScene`. Deriving means they answer questions about the document that
// actually exists — the archive's `diagnosticsModel.ts` read a live editor and
// had to keep its own model in step. A projection cannot drift from its
// source; a copy always eventually does.
//
// The projection is LOSSY ON PURPOSE, and in exactly one direction: the scene
// "only ever names ports; it never places them"
// (@trunk/hosts/hostScene.ts:32-34). Measured anchors stay in the shape, where
// the paint reads them (`shapes/wire/wireGeometry.ts`); `data.ports` carries
// ids alone. A scene that carried geometry would be a second place for the
// same numbers to be wrong.
//
// NEVER MIX DATA AND CONTROL LINES (plan §2) lands here as the third and last
// enforcement: containment is `node.parentId`, never an edge. An expanded
// block's members, a region's contents and a branch's arms are all structure;
// the only edges this function ever emits are `ss-wire` shapes. That is
// asserted by `src/wiring.smoke.test.tsx` ("a member INSIDE an expanded block
// is containment, never an edge").
import { useMemo } from "react";
import { computed, useValue, type Computed, type Editor, type TLBinding, type TLRecord, type TLShape } from "tldraw";

import { producerCounts } from "@trunk/scene/producers";
import type { BlockScene, SceneEdge, SceneNode } from "@trunk/scene/scene";
import type { WireStyleData } from "@trunk/scene/sceneWires";

import type { BlockShape } from "../shapes/block";
import type { WireBinding } from "../shapes/wire/WireBindingUtil";
import type { WireShape } from "../shapes/wire/WireShapeUtil";
import {
  BLOCK_SHAPE_TYPE,
  CODE_SHAPE_TYPE,
  PORT_SHAPE_TYPE,
  PORT_SIDES,
  REGION_SHAPE_TYPE,
  WIRE_BINDING_TYPE,
  WIRE_SHAPE_TYPE,
} from "../shapes/types";

/** Everything a consumer reads off a node, derived from the shape's props.
 *  The scene "only ever names ports; it never places them"
 *  (@trunk/hosts/hostScene.ts:32-34) — so `ports` carries ids, never
 *  geometry, and the measured anchors stay in the shape. */
export type DocNodeData = {
  kind: "block" | "code" | "port" | "region";
  name: string;
  view?: "simple" | "port" | "expanded";
  ports?: Partial<Record<"top" | "right" | "bottom" | "left", string[]>>;
  portTypes?: Record<string, string>;
  code?: string;
  language?: string;
  direction?: "in" | "out";
  type?: string;
  regionKind?: "for" | "while" | "branch" | "plain";
  cornerBlockId?: string;
};

export type DocumentScene = BlockScene<DocNodeData, WireStyleData>;

/** Shape type → the `kind` the scene speaks. A wire is deliberately absent:
 *  a wire is not a node (`shapes/types.ts`'s `NODE_SHAPE_TYPES` says the same
 *  thing from the other side). */
const KIND_OF: Record<string, DocNodeData["kind"]> = {
  [BLOCK_SHAPE_TYPE]: "block",
  [CODE_SHAPE_TYPE]: "code",
  [PORT_SHAPE_TYPE]: "port",
  [REGION_SHAPE_TYPE]: "region",
};

function isShape(record: TLRecord): record is TLShape {
  return record.typeName === "shape";
}

function isWireBinding(record: TLRecord): record is WireBinding {
  return record.typeName === "binding" && (record as TLBinding).type === WIRE_BINDING_TYPE;
}

function blockData(shape: BlockShape): DocNodeData {
  const ports: Partial<Record<"top" | "right" | "bottom" | "left", string[]>> = {};
  const portTypes: Record<string, string> = {};
  for (const side of PORT_SIDES) {
    ports[side] = shape.props.ports[side].map((port) => port.id);
    for (const port of shape.props.ports[side]) {
      // A declared-but-empty type is the honest "no type stated", so it never
      // enters the vocabulary `lintScene`'s `type-mismatch` rule reads — the
      // kit-wide "undefined = unknown, no judgement" convention
      // (@trunk/scene/lint.ts's `PortTypeOf`). Writing `""` in here would
      // turn "unknown" into a type name that matches nothing.
      if (port.type) portTypes[port.id] = port.type;
    }
  }
  return { kind: "block", name: shape.props.name, view: shape.props.view, ports, portTypes };
}

function dataOf(shape: TLShape): DocNodeData | null {
  const kind = KIND_OF[shape.type];
  if (!kind) return null;
  if (kind === "block") return blockData(shape as BlockShape);
  const props = shape.props as Record<string, unknown>;
  if (kind === "code") {
    // A code cell speaks no ports — "an honest empty"
    // (@trunk/hosts/hostScene.ts:181) — and has no name of its own; what it
    // is called is what it says.
    return { kind, name: "", code: String(props.code ?? ""), language: String(props.language ?? "") };
  }
  if (kind === "port") {
    return {
      kind,
      name: String(props.name ?? ""),
      direction: props.direction === "in" ? "in" : "out",
      type: String(props.type ?? ""),
    };
  }
  return {
    kind,
    name: String(props.name ?? ""),
    regionKind: props.kind as DocNodeData["regionKind"],
    cornerBlockId: String(props.cornerBlockId ?? ""),
  };
}

/**
 * Pure: node id = shape id, `parentId` = `shape.parentId` when it is a shape,
 * one edge per `ss-wire` carrying BOTH bindings.
 *
 * A HALF-BOUND wire is omitted rather than emitted with a missing end. That
 * is the same "skipped, not guessed at" channel `WireLayer` uses for an
 * unresolved anchor — and it is what makes the in-flight cable of a press-drag
 * invisible to every consumer until it actually lands, without the gesture
 * having to keep its provisional record out of the store.
 */
export function sceneFromRecords(records: Iterable<TLRecord>): DocumentScene {
  const nodes: SceneNode<DocNodeData>[] = [];
  const wires: WireShape[] = [];
  const bindingsByWire = new Map<string, WireBinding[]>();

  for (const record of records) {
    if (isWireBinding(record)) {
      const key = String(record.fromId);
      const bucket = bindingsByWire.get(key);
      if (bucket) bucket.push(record);
      else bindingsByWire.set(key, [record]);
      continue;
    }
    if (!isShape(record)) continue;
    if (record.type === WIRE_SHAPE_TYPE) {
      wires.push(record as WireShape);
      continue;
    }
    const data = dataOf(record);
    if (!data) continue;
    const parentId = String(record.parentId);
    nodes.push({
      id: record.id,
      type: data.kind,
      position: { x: record.x, y: record.y },
      data,
      // Containment, and containment ONLY. `parentId` absent = top level;
      // the page is not a node.
      ...(parentId.startsWith("shape:") ? { parentId } : {}),
    });
  }

  const edges: SceneEdge<WireStyleData>[] = [];
  for (const wire of wires) {
    const bindings = bindingsByWire.get(wire.id) ?? [];
    const start = bindings.find((binding) => binding.props.terminal === "start");
    const end = bindings.find((binding) => binding.props.terminal === "end");
    if (!start || !end) continue;
    edges.push({
      id: wire.id,
      source: String(start.toId),
      sourceHandle: start.props.portId,
      target: String(end.toId),
      targetHandle: end.props.portId,
      data: {
        variant: wire.props.variant,
        routing: wire.props.routing,
        // Same "empty means unset, not a value" rule as `portTypes` above:
        // `""` is the schema's unset colour, and `sceneWires` hands `color`
        // straight to `Trace`, which paints its own default only for an
        // ABSENT one.
        ...(wire.props.color ? { color: wire.props.color } : {}),
      },
    });
  }

  return { nodes, edges };
}

/** `useValue` over `editor.store`, so every consumer of the projection
 *  recomputes exactly when the document changes — and only then. */
export function useDocumentScene(editor: Editor): DocumentScene {
  return useValue("ss document scene", () => sceneFromRecords(editor.store.allRecords()), [editor]);
}

/* ------------------------------------------------------------------ */
/* Producer counts — how many cables meet each port                    */
/* ------------------------------------------------------------------ */

const PRODUCER_COUNTS = new WeakMap<Editor, Computed<ReadonlyMap<string, number>>>();

/**
 * The trunk's `producerCounts` over THIS projection: `portKey(shapeId,
 * portId)` → how many cable ends meet that port (Zach, 2026-09-19: "show the
 * producer circle that has the number for the number of arrows intersecting
 * at that port").
 *
 * WHY off the derived scene and not a per-block count of wire bindings
 * (which is how `BlockFace` reads `wired`): the number has to be the SAME
 * number the trunk's hosts paint — they call the identical function on their
 * scene — and the same one every analysis over this projection sees
 * (`problems.ts`, the wire judge). Counting bindings would be a second
 * definition of "a cable here", free to disagree the first time the two
 * rules differ (a half-bound wire is omitted from the scene on purpose, see
 * `sceneFromRecords`).
 *
 * WHY one `computed` per editor, shared: every block face reads it, and a
 * per-face `useDocumentScene` would rebuild the whole scene once per block
 * on every store change — pointer moves included. One derivation, N cheap
 * reads.
 */
export function documentProducerCounts(editor: Editor): Computed<ReadonlyMap<string, number>> {
  let counts = PRODUCER_COUNTS.get(editor);
  if (!counts) {
    counts = computed("ss producer counts", () => producerCounts(sceneFromRecords(editor.store.allRecords())));
    PRODUCER_COUNTS.set(editor, counts);
  }
  return counts;
}

/**
 * One shape's slice of `documentProducerCounts`: `portId → count`, for the
 * ports of `shapeId` that have any cable at all.
 *
 * The reactive read returns a STRING signature, not the map: `useValue`
 * re-renders on any `Object.is` change, so returning a fresh `Map` would
 * re-render every block on every store change. The string only changes when
 * this shape's own counts do — a wire drawn elsewhere on the board costs
 * this face nothing.
 */
export function usePortProducers(editor: Editor, shapeId: string): ReadonlyMap<string, number> {
  const signature = useValue(
    "ss port producers",
    () => {
      // Shape ids are `shape:<nanoid>` — never a `/` — so the prefix split is
      // exact even for a port id that contains one.
      const prefix = `${shapeId}/`;
      const mine: [string, number][] = [];
      for (const [key, count] of documentProducerCounts(editor).get()) {
        if (key.startsWith(prefix)) mine.push([key.slice(prefix.length), count]);
      }
      mine.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return JSON.stringify(mine);
    },
    [editor, shapeId],
  );
  return useMemo(() => new Map<string, number>(JSON.parse(signature) as [string, number][]), [signature]);
}
