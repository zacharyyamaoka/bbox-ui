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
import type { BlockMembersLayout } from "../components/blockMembers";
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
  /**
   * How THIS node's own members are laid out. Absent → `"stack"`, the
   * behaviour every existing story already renders (`BlockNodeView`
   * hardcoded it before this field existed) — so leaving it unset is
   * byte-identical to before this lane. `"free"` opts a node into the
   * `fit-to-content-hosts` lane's wiring: its members carry their own
   * `position`, read as the member's (x, y) inside this node's members
   * region — which is exactly `SceneNode.position`'s own documented
   * contract (scene.ts:60-72, "the node's authored at-rest placement, in
   * the PARENT's coordinate space when `parentId` is set"). That sentence
   * predates this lane; nothing before it ever wrote or read a member's
   * position, so free layout was contractually possible but never wired.
   */
  membersLayout?: BlockMembersLayout;
  /** Fit this node's height to its free-mode members' measured extents
   *  (`fitToContent.ts`'s `blockExpandedFitHeight`) instead of `data.h`.
   *  Ignored unless `membersLayout === "free"`. See `nodeViews.tsx`'s
   *  `BlockNodeView` for the wiring and the reentrancy guard. */
  autoFit?: boolean;
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

/**
 * The `fit-to-content-hosts` lane's own fixture (2026-09-18) — a second,
 * dedicated literal rather than adding free-layout members to `HOST_SCENE`
 * above: `HOST_SCENE` is asserted against by `SceneHosts.stories.tsx`
 * (`expectSceneRendered`'s "kid rendered inside proc" with no fit/drag
 * behaviour), and this lane's write set is `src/hosts/**` only — extending
 * a fixture another lane's assertions already pin is exactly the
 * "same-shared-literal" risk `HOST_SCENE`'s own doc warns H1 about, just
 * inverted: touching it here would make THOSE assertions the ones at risk
 * of drifting out from under a lane that never asked to change them.
 *
 * `sorter` is `membersLayout: "free"` + `autoFit: true` — the two fields
 * this lane added — with two members, `ingest` and `classify`, each an
 * ordinary `type: "block"` node whose `position` is read as its (x, y)
 * inside `sorter`'s own members region (see `HostNodeData.membersLayout`'s
 * doc). `classify` is the one every story below drags.
 */
export const DRAG_MEMBER_SCENE: HostScene = {
  nodes: [
    {
      id: "sorter",
      type: "block",
      position: { x: 24, y: 24 },
      data: { name: "sorter", view: "expanded", w: 300, membersLayout: "free", autoFit: true },
    },
    { id: "ingest", type: "block", parentId: "sorter", position: { x: 16, y: 16 }, data: { name: "ingest", view: "simple", w: 110, h: 44 } },
    { id: "classify", type: "block", parentId: "sorter", position: { x: 150, y: 96 }, data: { name: "classify", view: "simple", w: 110, h: 44 } },
  ],
  edges: [],
};

/** Top-level = a canvas node of the host's own; members are the view
 *  kit's business (`childrenOf`), in every host the same way. */
export function topLevelNodes<S extends { nodes: readonly { parentId?: string }[] }>(scene: S): S["nodes"] {
  return scene.nodes.filter((node) => node.parentId === undefined) as S["nodes"];
}
