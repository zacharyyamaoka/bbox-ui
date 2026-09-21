/**
 * src/detach/detachableKind.ts — the contract one detachable NODE KIND signs
 * with the generic sweep.
 *
 * DONOR: packages/adapter-tldraw/src/detach/detachableKind.ts (read in full,
 * 2026-09-18) — the phased-sweep rationale below is ported near-verbatim
 * (Zach's rule, "higher order primitives don't rewrite their own detach; it
 * propagates down through the tree", and the donor's own citation of
 * SystemSketch's `src/detach/detachableKind.ts` rejecting depth-first
 * recursion once edges/containers exist):
 *
 *   1. an edge must lower while BOTH endpoint shapes still stand, so its
 *      stock arrow binds to live geometry;
 *   2. a container's wrapper reduces only AFTER its contents have lowered
 *      or escaped, because deleting the container removes its whole
 *      remaining subtree.
 *
 * So dispatch is a *phased sweep*: each kind declares which phase it runs
 * in, and `detachSweep.ts` runs `leaf` kinds before `container` kinds.
 *
 * WHAT DIFFERS FROM THE DONOR, and why this file exists separately rather
 * than being a straight copy: the donor's kinds match by SHAPE TYPE
 * (`shape.type === "bbox-block"`) because each bbox-ui concept was its own
 * native tldraw shape. This app's tldraw host renders every scene node
 * through ONE generic shape, `bbox-node` (`../hosts/tldrawHost.tsx`'s file
 * header, rule 1 — persisted props are `{w, h, nodeId}` only, content rides
 * a scene lookup). So a `DetachableKind` here matches by the scene node's
 * OWN `type` field (`"block"`, `"glyph"`, …), read through a `SceneReader`
 * the sweep hands it — not by `shape.type`, which is always `"bbox-node"`.
 * `matches`/`lowerNode` are otherwise the same shape.
 */
import type { Editor, TLShape, TLShapeId } from "tldraw";

import type { HostScene } from "../hosts/hostScene";

/** When a node kind lowers — see this file's header. Every kind registered
 *  today is a leaf (Block's ports are props, not child shapes — the
 *  hierarchy lives in the primitive builders, `definitions/block.ts`
 *  invoking `definitions/port.ts` per port, exactly as the donor's
 *  `blockPrimitives.ts` invokes `portPrimitives.ts`). `container` exists so
 *  a future member/region kind slots in without teaching any existing kind
 *  about it. */
export type DetachNodePhase = "leaf" | "container";

export interface LoweredNode {
  /** What the selection should hold afterwards. */
  selectionId: TLShapeId | null;
  rootIds: readonly TLShapeId[];
}

/** The read surface a kind needs to decide whether it matches a `bbox-node`
 *  shape, and to read the data it will lower. Satisfied by
 *  `TldrawHostContextValue.scene` in practice; a plain object in tests. */
export interface SceneReader {
  scene: HostScene;
}

export interface DetachableKind {
  /** Diagnostic name; also the dedup key for registration sanity checks —
   *  the scene node `type` this kind claims (`"block"`). */
  readonly kind: string;
  readonly nodePhase: DetachNodePhase;

  /** Does this kind claim the scene node this `bbox-node` shape renders? */
  matches(shape: TLShape, reader: SceneReader): boolean;
  /** Replace the shape with grouped stock primitives. */
  lowerNode(editor: Editor, shape: TLShape, reader: SceneReader): LoweredNode | null;
}

/** The kind that matches a shape, or null. */
export function matchDetachableKind(
  kinds: readonly DetachableKind[],
  shape: TLShape,
  reader: SceneReader,
): DetachableKind | null {
  return kinds.find((kind) => kind.matches(shape, reader)) ?? null;
}
