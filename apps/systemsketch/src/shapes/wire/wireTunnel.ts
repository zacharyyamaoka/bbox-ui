// src/shapes/wire/wireTunnel.ts — P-023's HOST half: the two runtime facts
// `tunnelDisplayState` needs, which a pure kit is forbidden to hold.
//
// NOTHING IS DERIVED HERE THAT THE TRUNK ALREADY DERIVES. The state machine is
// `@trunk/components/tunnel`'s `tunnelDisplayState` (four states, branch order
// load-bearing) and the layer set is `@trunk/scene/layers`' `sceneLayers` /
// `canonicalSceneLayer`. Both were built and tested in this repo on 2026-09-19
// and imported by the app ZERO times until this file — the backlog's own proof
// of the gap. This module supplies the two arguments they cannot compute:
//
//   • `focusedLayer` — which layer the VIEW is focused on. Host state by
//     `scene/layers.ts`'s own ruling (its change note 4): the donor kept it in
//     a WeakMap keyed by Editor that "never mutates or dirties the board"
//     (`/home/bam/systemsketch/src/blocks/connections/tunnelLayers.ts:17`), and
//     the port DROPPED that atom rather than smuggle a host store into a kit
//     that may not import one. This is where it comes back, in the WeakMap
//     idiom `./wireGesture.ts` already uses for the in-flight cable.
//
//   • `contextFocused` — "this edge is the one the pointer is about".
//
// WHY `contextFocused` IS NOT SIMPLY "THE CABLE IS HOVERED", which is the
// obvious reading and what the donor's renderer passes: a hidden tunnel HAS NO
// MIDDLE TO HOVER. Its long run is not painted, so the only pixels left to aim
// at are the two stubs at the ports — and the backlog's own sentence for this
// item is "Hovering a state pill reveals its connections", i.e. the reveal is
// meant to be reachable from the NODE, not from the cable that vanished. So a
// cable counts as context-focused when the pointer (or the selection) is on
// the cable OR on either thing it lands on — which makes "hover a block, see
// what it is wired to" the gesture, and is what keeps the feature usable at
// all once a diagnostics node's forty cables are hidden.
//
// The endpoint walk goes through ANCESTORS as well, because a cable's binding
// may name a standalone `ss-port` shape while the thing under the pointer is
// the `ss-block` that owns it. Hovering the parent is hovering the port.
import { atom, type Atom, type Editor, type TLShapeId } from "tldraw";

import { tunnelDisplayState, type TunnelDisplayState } from "@trunk/components/tunnel";
import { canonicalSceneLayer, sceneLayers, type SceneLayerEdge } from "@trunk/scene/layers";

import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import type { WireBinding } from "./WireBindingUtil";
import type { WireShape } from "./WireShapeUtil";

/* ------------------------------------------------------------------ */
/* Focus — view state, never the document                              */
/* ------------------------------------------------------------------ */

const FOCUS_BY_EDITOR = new WeakMap<Editor, Atom<string | null>>();

/** The layer this editor's VIEW is focused on, or `null`. Reactive, so a
 *  `useValue` in `WireFace` repaints every cable on the board when it moves,
 *  with no record write anywhere. */
export function focusedTunnelLayer(editor: Editor): Atom<string | null> {
  let existing = FOCUS_BY_EDITOR.get(editor);
  if (!existing) {
    existing = atom<string | null>("ss-wire focused layer", null);
    FOCUS_BY_EDITOR.set(editor, existing);
  }
  return existing;
}

/**
 * Focus a layer — and focusing the already-focused one CLEARS focus.
 *
 * The toggle is deliberate and is the donor's: `scene/layers.ts`'s change note
 * 4 preserved it in prose precisely because the atom itself could not travel —
 * "which is what makes the picker feel like a filter rather than a mode. A host
 * that reimplements it should keep that." This is that host, keeping it.
 *
 * A blank name is "no layer", never a layer called "". Same rule as
 * `edgeLayer`.
 */
export function setFocusedTunnelLayer(editor: Editor, layer: string | null): void {
  const next = layer?.trim() || null;
  const focus = focusedTunnelLayer(editor);
  focus.set(next !== null && next === focus.get() ? null : next);
}

/* ------------------------------------------------------------------ */
/* Reading the board as a layer-bearing edge set                       */
/* ------------------------------------------------------------------ */

/** Every cable on the current page, shaped as the `SceneLayerEdge`s
 *  `@trunk/scene/layers` speaks — the ONE adapter between this app's props bag
 *  and the kit's `data` vocabulary, so no other file has to know that
 *  `props.layer` is `data.layer`. */
function layerEdges(editor: Editor): { edges: SceneLayerEdge[] } {
  const edges: SceneLayerEdge[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== WIRE_SHAPE_TYPE) continue;
    const wire = shape as WireShape;
    edges.push({ data: { layer: wire.props.layer, tunnel: wire.props.tunnel } });
  }
  return { edges };
}

/** The layer names this board actually uses, case-folded and sorted — the
 *  trunk's `sceneLayers`, handed this app's cables. */
export function boardTunnelLayers(editor: Editor): string[] {
  return sceneLayers(layerEdges(editor));
}

/** A typed name resolved to the board's existing spelling of it, or kept as
 *  typed when it is new. The trunk's `canonicalSceneLayer`, so
 *  `Diagnostics`/`diagnostics` cannot become one layer in the picker and two
 *  in the render. */
export function canonicalBoardLayer(editor: Editor, name: string): string {
  return canonicalSceneLayer(layerEdges(editor), name);
}

/* ------------------------------------------------------------------ */
/* Context focus — is the pointer (or the selection) about this cable?  */
/* ------------------------------------------------------------------ */

/** The shapes each terminal of `wire` is bound to. A loose terminal
 *  contributes nothing, which is correct: there is no node to hover. */
function wireEndpointIds(editor: Editor, wire: WireShape): TLShapeId[] {
  return editor
    .getBindingsFromShape<WireBinding>(wire.id, WIRE_BINDING_TYPE)
    .map((binding) => binding.toId);
}

/**
 * Hovered or selected — the cable itself, or either node it lands on.
 *
 * See this file's header for why the endpoints count. `getShapeAncestors` is
 * what makes hovering a block count as hovering the port inside it.
 */
export function wireContextFocused(editor: Editor, wire: WireShape): boolean {
  const attention = new Set<TLShapeId>(editor.getSelectedShapeIds());
  const hovered = editor.getHoveredShapeId();
  if (hovered) attention.add(hovered);
  if (attention.size === 0) return false;
  if (attention.has(wire.id)) return true;
  for (const endpoint of wireEndpointIds(editor, wire)) {
    if (attention.has(endpoint)) return true;
    for (const ancestor of editor.getShapeAncestors(endpoint)) {
      if (attention.has(ancestor.id)) return true;
    }
  }
  return false;
}

/**
 * The four-state answer for one cable, right now.
 *
 * Every argument is assembled here and the DECISION is the trunk's — including
 * the branch order that lets a focused layer tunnel cables that were never
 * configured as tunnels. Re-spelling that `if` in the app is exactly how the
 * app and its own stories would start to disagree.
 */
export function wireTunnelState(editor: Editor, wire: WireShape): TunnelDisplayState {
  return tunnelDisplayState({
    enabled: wire.props.tunnel,
    layer: wire.props.layer,
    focusedLayer: focusedTunnelLayer(editor).get(),
    contextFocused: wireContextFocused(editor, wire),
  });
}
