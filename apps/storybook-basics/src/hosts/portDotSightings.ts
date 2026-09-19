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

import type { BlockSide } from "../components/port.layout";

export interface PortDotSighting {
  portId: string;
  /** Centre of the rendered dot, viewport (client) px — raw, unprojected. */
  clientX: number;
  clientY: number;
  /**
   * The wall the dot's own rail is mounted on, or `null` for a dot outside
   * any rail. `BlockSide` and `TraceDir` are the same four strings
   * (wireLayer.tsx's own note), so this feeds a terminal spec directly.
   */
  side: BlockSide | null;
}

/** A dot belongs to THIS node, not to a member rendered inside it — the
 *  nearest `data-block-id` ancestor decides. Same ownership reading as
 *  `WireLayer`'s resolution and reactFlowHost.tsx:87-89's `dotOwnedBy`. */
function dotOwnedBy(el: Element, nodeId: string): boolean {
  return el.closest("[data-block-id]")?.getAttribute("data-block-id") === nodeId;
}

function sideOf(el: Element): BlockSide | null {
  const edge = el.closest('[data-slot="block-port-rail"]')?.getAttribute("data-edge");
  return edge === "top" || edge === "right" || edge === "bottom" || edge === "left" ? edge : null;
}

/**
 * Every port dot the view kit rendered inside `root` that belongs to
 * `nodeId`, as viewport-space sightings. Collapsed stand-in dots resolve
 * every member id they name to the one dot (the same `data-collapsed-ports`
 * reading `WireLayer` uses). First sighting per port id wins: mid-gesture a
 * wall can transiently expose BOTH forms of one port (its direct dot and a
 * collapsed stand-in naming it), and two sightings with one id is an
 * ambiguous anchor — the same dedupe reactFlowHost.tsx:96-101 documents.
 */
export function sightPortDots(root: HTMLElement, nodeId: string): PortDotSighting[] {
  const out: PortDotSighting[] = [];
  const seen = new Set<string>();
  const push = (portId: string, el: Element) => {
    if (seen.has(portId)) return;
    seen.add(portId);
    const dot = el.querySelector('[data-slot="port-dot"]') ?? el;
    const rect = dot.getBoundingClientRect();
    out.push({
      portId,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      side: sideOf(el),
    });
  };
  for (const el of Array.from(root.querySelectorAll("[data-port-id]"))) {
    if (dotOwnedBy(el, nodeId)) push(el.getAttribute("data-port-id")!, el);
  }
  for (const el of Array.from(root.querySelectorAll("[data-collapsed-ports]"))) {
    if (!dotOwnedBy(el, nodeId)) continue;
    for (const portId of (el.getAttribute("data-collapsed-ports") ?? "").split(",")) {
      if (portId.trim()) push(portId.trim(), el);
    }
  }
  return out;
}
