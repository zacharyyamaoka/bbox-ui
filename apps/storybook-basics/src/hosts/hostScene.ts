// src/hosts/hostScene.ts — ONE scene literal shared by every host bench.
//
// H1's contract claim ("one scene, two hosts, no per-host fixture") is only
// falsifiable if both host stories import the SAME record — a copy per host
// would let the fixtures drift apart and each host quietly render its own
// truth. So the literal lives here, beside the hosts, and the story files
// import it; neither host module hardcodes a node.
//
// `HostNodeData` is what THIS host family stores per node — the scene kit
// never knows these fields exist (they are `data` to it, the same licence
// `Scene.stories.tsx`'s `NodeView` already exercises). `node.type` carries
// the HOST-FACING component name (Zach's table, 2026-09-17): `glyph` →
// Glyph, `code` → Code (CodeEditor), `block` → Block (BlockPort), `value` →
// Value (ValueCapsule). Loop and Branch are absent because those presets do
// not exist yet — verified against src/presets/ (only `value/`) before this
// fixture was written.

import type { BlockSide } from "../components/port.layout";
import type { BlockView } from "../components/blockPort.layout";
import type { PortDirection, PortDirectionOf, PortsOf } from "../scene/lint";
import type { BlockScene } from "../scene/scene";
import type { WireStyleData } from "../scene/sceneWires";

export type HostNodeData = {
  /** Display name — data, free to collide; never identity. */
  name?: string;
  /* -- type: "block" ------------------------------------------------ */
  view?: BlockView;
  w?: number;
  h?: number;
  /** Which wall each port sits on — VIEW geometry, host-owned. The scene
   *  only ever names ports; it never places them. */
  ports?: Partial<Record<BlockSide, string[]>>;
  /** Walls whose ports hug the header end instead of centring — the donor
   *  bench's own device (Scene.stories.tsx), kept for the same reason:
   *  proc's own `in` dot stays visually clear of its member's dot. */
  anchorStart?: BlockSide[];
  /* -- type: "glyph" ------------------------------------------------ */
  /** `@bbox-ui/glyph-content` grammar, e.g. `lucide:rocket`. */
  content?: string;
  /* -- type: "code" ------------------------------------------------- */
  code?: string;
  /* -- type: "value" ------------------------------------------------ */
  value?: string;
  writers?: string[];
  readers?: string[];
};

export type HostScene = BlockScene<HostNodeData, WireStyleData>;

/**
 * The bench: all four hosted component kinds, one nesting (`kid` inside
 * `proc` — `parentId` IS the membership), and three edges.
 *
 * Every edge connects TOP-LEVEL, port-bearing nodes on purpose. An edge
 * into a member (like Scene.stories' `e-aux` → `kid/in`) resolves in the
 * DOM host (WireLayer finds any dot by `data-block-id`/`data-port-id`) but
 * has no React Flow rendering — members are drawn INSIDE their parent by
 * the view kit, so they are not React Flow nodes and RF cannot route to
 * them. That asymmetry is a real phase-2 finding, recorded in the lane
 * report; the shared fixture stays inside what BOTH hosts can honor, which
 * is exactly what makes H1's "same literal" claim honest.
 */
export const HOST_SCENE: HostScene = {
  nodes: [
    { id: "logo", type: "glyph", position: { x: 24, y: 18 }, data: { name: "logo", content: "lucide:rocket" } },
    { id: "prog", type: "code", position: { x: 96, y: 12 }, data: { name: "prog", code: "gain = clamp(x * k, 0, 1)" } },
    {
      id: "proc",
      type: "block",
      position: { x: 16, y: 92 },
      data: { name: "proc", view: "expanded", w: 240, h: 180, ports: { left: ["in"], right: ["out", "aux"] }, anchorStart: ["left"] },
    },
    // The nesting: kid renders as a member of proc in BOTH hosts (the view
    // kit draws it; no host treats it as a canvas node of its own).
    { id: "kid", type: "block", parentId: "proc", position: { x: 0, y: 0 }, data: { name: "kid", view: "port", w: 100, h: 60, ports: { left: ["in"] } } },
    { id: "gain", type: "value", position: { x: 330, y: 150 }, data: { name: "gain", value: "0.75", writers: ["set"], readers: ["val"] } },
    { id: "sink", type: "block", position: { x: 470, y: 110 }, data: { name: "sink", view: "port", w: 116, h: 84, ports: { left: ["in", "cfg"] } } },
  ],
  edges: [
    { id: "e-set", source: "proc", sourceHandle: "out", target: "gain", targetHandle: "set" },
    { id: "e-val", source: "gain", sourceHandle: "val", target: "sink", targetHandle: "in" },
    { id: "e-cfg", source: "proc", sourceHandle: "aux", target: "sink", targetHandle: "cfg", data: { variant: "async" } },
  ],
};

/** Top-level = a canvas node of the host's own; members are the view
 *  kit's business (`childrenOf`), in every host the same way. */
export function topLevelNodes<S extends { nodes: readonly { parentId?: string }[] }>(scene: S): S["nodes"] {
  return scene.nodes.filter((node) => node.parentId === undefined) as S["nodes"];
}

/* ------------------------------------------------------------------ */
/* Port vocabulary + polarity — READING the host's own records, not     */
/* judging them. Moved here from the now-deleted `batchWire.standIn.ts` */
/* (docs/peps/0002-the-judge-owns-edge-orientation.md): that file's own  */
/* header was explicit that these two functions are "NOT the connection-*/
/* rule engine", only host-geometry readers — `edgeValidation.ts`'s      */
/* `validateConnection` is the engine, and `hostPolarityOf` is what      */
/* supplies its `directionOf` resolver for this host family.            */
/* ------------------------------------------------------------------ */

/** Which wall means which direction. Host-side view geometry decides
 *  polarity here because the SCENE does not carry it — `HostNodeData.ports`
 *  is `Partial<Record<BlockSide, string[]>>` and nothing in it says "in" or
 *  "out" (this file's own note above: "The scene only ever names ports; it
 *  never places them").
 *
 *  WHY this is host-geometry and not a `lint.ts`/`edgeValidation.ts`
 *  finding: in the donor (SystemSketch), polarity is `portPolarity(port.side,
 *  face)` — a function of the port's lane AND which face of the block is
 *  showing, so the same port is a source from outside and a sink from
 *  inside. That second argument has no equivalent here yet, so this reads
 *  walls only. */
const SINK_SIDES: readonly BlockSide[] = ["left", "top"];

/** Every port a host node speaks, in render order. `[]` = speaks none. */
export function hostPortsOf(scene: HostScene): PortsOf {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return (nodeId) => {
    const node = byId.get(nodeId);
    if (!node) return undefined;
    return portIdsOf(node.type, node.data);
  };
}

function portIdsOf(type: string | undefined, data: HostNodeData): string[] {
  if (type === "value") return [...(data.writers ?? []), ...(data.readers ?? [])];
  // glyph and code speak no ports at all — an honest empty, not "unknown".
  if (type === "glyph" || type === "code") return [];
  return (Object.keys(data.ports ?? {}) as BlockSide[]).flatMap((side) => data.ports?.[side] ?? []);
}

/** A port's direction, or `undefined` when the node does not speak it —
 *  this host family's `PortDirectionOf` (`lint.ts`), for `validateConnection`
 *  and `lint.ts`'s own `polarity` rule to consume. */
export function hostPolarityOf(scene: HostScene): PortDirectionOf {
  const byId = new Map(scene.nodes.map((node) => [node.id, node]));
  return ({ nodeId, portId }) => {
    const node = byId.get(nodeId);
    if (!node) return undefined;
    if (node.type === "value") {
      if ((node.data.writers ?? []).includes(portId)) return "sink";
      if ((node.data.readers ?? []).includes(portId)) return "source";
      return undefined;
    }
    for (const side of Object.keys(node.data.ports ?? {}) as BlockSide[]) {
      if ((node.data.ports?.[side] ?? []).includes(portId)) {
        return (SINK_SIDES.includes(side) ? "sink" : "source") satisfies PortDirection;
      }
    }
    return undefined;
  };
}
