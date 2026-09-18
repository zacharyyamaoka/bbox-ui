// src/scene/sceneWires.ts — the host adapter: scene in, view-kit props
// out. This module is ALLOWED to know both vocabularies (the same licence
// the repo's engine adapters have — "an adapter may import the core and
// its own engine"); the two kits it bridges never import each other. The
// view kit's `WireLayer` keeps its own `Wire` prop type and no component
// ever sees a scene; a host calls these functions and passes the result
// down as ordinary props. That one-way flow is the separation working.
import type { PortEdgeItem } from "../components/portEdge";
import type { TraceMarkerEnd, TraceRouting, TraceVariant } from "../components/trace.layout";
import type { Wire } from "../components/wiring";
import { portKey, type SceneEdge } from "./scene";

/**
 * Per-edge view styling, riding in `SceneEdge.data` — a `type` alias so it
 * satisfies `SceneData`'s implicit-index-signature requirement. The SCENE
 * does not know these fields exist (they are `data` to it); only this
 * adapter reads them. A host that styles differently writes its own data
 * type and its own adapter.
 */
export type WireStyleData = {
  /** Default `"data"` — `wiring.ts`'s own rule, unchanged. */
  variant?: TraceVariant;
  routing?: TraceRouting;
  markerEnd?: TraceMarkerEnd;
  color?: string;
};

/**
 * `SceneEdge[]` → `Wire[]`, one to one, order preserved. `source` becomes
 * the `from` block, `sourceHandle` the `from` port (`Wire`'s arrowhead
 * rule — points AT `to` — maps onto React Flow's own source→target
 * direction unchanged). An end with NO handle maps to `portId: ""`, which
 * no rendered dot ever carries — `WireLayer` then reports that wire in
 * `data-unresolved-wires`, its established "skipped, not guessed at"
 * channel, rather than this adapter inventing an anchor.
 */
export function sceneWires(scene: { edges: readonly SceneEdge<WireStyleData>[] }): Wire[] {
  return scene.edges.map((edge) => ({
    id: edge.id,
    from: { blockId: edge.source, portId: edge.sourceHandle ?? "" },
    to: { blockId: edge.target, portId: edge.targetHandle ?? "" },
    variant: edge.data?.variant,
    routing: edge.data?.routing,
    markerEnd: edge.data?.markerEnd,
    color: edge.data?.color,
  }));
}

/**
 * `items`, with `state: "wired"` forced onto every member the scene's
 * edges name, and left alone otherwise — a fixture-authored `valueSet` or
 * `received` survives on an unwired port, but wired always wins when
 * wired. Moved here verbatim from `wiring.ts` (it is scene→view
 * derivation, not paint): `wired` is `wiredPorts(scene)`, whose members
 * are `portKey(nodeId, portId)` — the one shared spelling of "which
 * port".
 */
export function withWiredState(items: readonly PortEdgeItem[], nodeId: string, wired: ReadonlySet<string>): PortEdgeItem[] {
  return items.map((item) => (wired.has(portKey(nodeId, item.id)) ? { ...item, state: "wired" } : item));
}
