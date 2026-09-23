// src/hosts/portDotSightings.ts — engine-free port-dot sighting: which port
// dots a node's rendered subtree currently shows, and where, in raw VIEWPORT
// (client) coordinates. No projection, no engine import, no React.
//
// THIS FILE IS THE EXTRACTION REQUEST from the 2026-09-17 React Flow host
// audits, stated as running code instead of prose. `reactFlowHost.tsx:87-134`
// holds a private, React-Flow-flavoured copy of the same reading
// (`dotOwnedBy` + `measurePortDots`): it reads the identical trunk DOM
// contracts but bakes two engine-specific choices into the result — it
// divides by the node's own rect/offset ratio to get node-local px (a
// projection only valid without rotation), and it returns `@xyflow/react`'s
// `Position` enum for the side. It also cannot be imported here: its first
// line is `import "@xyflow/react/dist/style.css"`, so any import drags React
// Flow's runtime and global stylesheet into a non-RF host, which the repo's
// core rule forbids ("never the other engine").
//
// The factoring this module requests instead: the SIGHTING (pure DOM
// contract reading, engine-free) is shared; the PROJECTION is host-owned.
//   - React Flow projects a sighting to node-local px by its scale ratio
//     and maps `side` to `Position` at its own boundary.
//   - tldraw projects through `editor.screenToPage` +
//     `editor.getPointInShapeSpace`, which survives camera zoom, pan, AND
//     shape rotation — none of which the rect-ratio projection does.
// The follow-up extraction lane should repoint `reactFlowHost.tsx` at this
// module and delete its private copy; until then the two copies coexist and
// this header is the record of which one is meant to win.
//
// DOM contracts read here (all stamped by the trunk components, never by a
// host): `[data-port-id]` and `[data-collapsed-ports]` inside
// `[data-block-id]` (blockPort.tsx's rail fill — the same resolution
// wireLayer.tsx:65-77 uses), `[data-slot="port-dot"]` as the visible dot
// inside a labeled port, and the rail's own `data-edge` as the wall name
// (wireLayer.tsx:80-84's "the rail's own `data-edge` attribute IS the face
// normal").
//
// The one non-DOM import is `portKey` (`scene/scene.ts`) — pure string
// joining, no engine, no React. A member's dot needs a name a host can hand
// its edge renderer, and inventing a second spelling of "which port" beside
// the one `wiredPorts` / `sceneWires` / `WireLayer` already share is how two
// vocabularies for one fact start.

import type { BlockSide } from "../components/port.layout";
import { portDotRingRadiusPx } from "../skin/portVariants";
import { portKey } from "../scene/scene";

export interface PortDotSighting {
  portId: string;
  /**
   * The block this dot belongs to — the nearest `[data-block-id]` ancestor.
   * `nodeId` for the node's own dots; a MEMBER's id for a dot sighted under
   * `{ members: true }` (a member is drawn inside its parent by the view
   * kit, so its dots live in the same subtree).
   */
  ownerId: string;
  /**
   * What a host calls this anchor. `portId` when the dot is the node's own
   * (so nothing a host already mounted moves), `portKey(ownerId, portId)`
   * when it belongs to a member — the one shared spelling of "which port"
   * (`scene.ts`'s `portKey`), reused so React Flow handle ids and tldraw
   * anchor keys agree with the scene record without a second convention.
   */
  handleId: string;
  /** Centre of the rendered dot, viewport (client) px — raw, unprojected. */
  clientX: number;
  clientY: number;
  /**
   * The wall the dot's own rail is mounted on, or `null` for a dot outside
   * any rail. `BlockSide` and `TraceDir` are the same four strings
   * (wireLayer.tsx's own note), so this feeds a terminal spec directly.
   */
  side: BlockSide | null;
  /**
   * The dot's painted OUTER radius (box + its rings), in the dot's own
   * layout px — unscaled, like a shape-local anchor — so a host can end a
   * wire ON the ring (`trace.tsx`'s `traceRingGapPx`) rather than a fixed
   * distance short of the centre. `portDotRingRadiusPx` is the one reading.
   */
  ringRadius: number;
}

/**
 * Which block owns this dot — the nearest `data-block-id` ancestor decides,
 * the same ownership reading as `WireLayer`'s resolution
 * (wireLayer.tsx:80-92) and reactFlowHost.tsx's `ownHeaderOf`.
 *
 * `null` means "not sightable from here": either no owning block at all, or
 * a member's dot while `members` is off. The member branch is also fenced
 * to `root` — `closest` walks past `root` into whatever the host mounted
 * this subtree inside, and a block ABOVE the node is not a member of it.
 */
function dotOwnerId(el: Element, nodeId: string, root: HTMLElement, members: boolean): string | null {
  const owner = el.closest("[data-block-id]");
  const ownerId = owner?.getAttribute("data-block-id") ?? null;
  if (owner === null || ownerId === null) return null;
  if (ownerId === nodeId) return ownerId;
  return members && root.contains(owner) ? ownerId : null;
}

function sideOf(el: Element): BlockSide | null {
  const edge = el.closest('[data-slot="block-port-rail"]')?.getAttribute("data-edge");
  return edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : null;
}

/** What `sightPortDots` may look at beyond the node's own dots. */
export interface SightPortDotsOptions {
  /**
   * Also sight the dots of blocks NESTED inside `root` at any depth (a
   * member drawn inside its parent by the view kit). Absent or `false`
   * returns exactly the node's own dots, which is what every host mounted
   * before this option existed.
   */
  members?: boolean;
}

/**
 * Every port dot the view kit rendered inside `root` that belongs to
 * `nodeId`, as viewport-space sightings. Collapsed stand-in dots resolve
 * every member id they name to the one dot (the same `data-collapsed-ports`
 * reading `WireLayer` uses). First sighting per `handleId` wins: mid-gesture
 * a wall can transiently expose BOTH forms of one port (its direct dot and a
 * collapsed stand-in naming it), and two sightings with one id is an
 * ambiguous anchor — the same dedupe reactFlowHost.tsx:96-101 documents.
 * (With `members` off, `handleId === portId`, so this is the identical
 * dedupe it always was.)
 *
 * WHY `{ members: true }` is an OPTION and not the new behaviour: a canvas
 * host routes edges to ANCHORS, and a member's dot is an anchor of the
 * top-level node it is drawn inside — `hostScene.ts:75-82` recorded exactly
 * that gap as a finding ("an edge into a member … has no React Flow
 * rendering"), and this closes it. But the DOM host resolves dots itself and
 * every host story predating control flow was written against own-dots-only,
 * so the default stays byte-identical and the two canvas hosts opt in. The
 * ownership rule is unchanged either way; only the fence around it moves.
 */
export function sightPortDots(root: HTMLElement, nodeId: string, options?: SightPortDotsOptions): PortDotSighting[] {
  const members = options?.members === true;
  const out: PortDotSighting[] = [];
  const seen = new Set<string>();
  const push = (portId: string, el: Element, ownerId: string) => {
    const handleId = ownerId === nodeId ? portId : portKey(ownerId, portId);
    if (seen.has(handleId)) return;
    seen.add(handleId);
    const dot = el.querySelector('[data-slot="port-dot"]') ?? el;
    const rect = dot.getBoundingClientRect();
    out.push({
      portId,
      ownerId,
      handleId,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      side: sideOf(el),
      ringRadius: portDotRingRadiusPx(dot),
    });
  };
  for (const el of Array.from(root.querySelectorAll("[data-port-id]"))) {
    const ownerId = dotOwnerId(el, nodeId, root, members);
    if (ownerId !== null) push(el.getAttribute("data-port-id")!, el, ownerId);
  }
  for (const el of Array.from(root.querySelectorAll("[data-collapsed-ports]"))) {
    const ownerId = dotOwnerId(el, nodeId, root, members);
    if (ownerId === null) continue;
    for (const portId of (el.getAttribute("data-collapsed-ports") ?? "").split(",")) {
      if (portId.trim()) push(portId.trim(), el, ownerId);
    }
  }
  return out;
}
