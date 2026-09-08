/**
 * The contract one detachable shape kind signs with the generic sweep.
 *
 * Zach's rule — "higher order primitives don't rewrite their own detach; it
 * propagates down through the tree" — has an obvious implementation and a
 * correct one, and they are not the same. The obvious one is depth-first
 * recursion: each composite calls detach on its children, then lowers
 * itself. SystemSketch tried that and rejected it (see its
 * `src/detach/detachableKind.ts`), because recursion breaks two invariants
 * once edges and containers exist, and breaking either corrupts rebuild
 * fidelity:
 *
 *   1. an edge must lower while BOTH endpoint shapes still stand, so its
 *      stock arrow binds to live geometry;
 *   2. a container's wrapper reduces only AFTER its contents have lowered
 *      or escaped, because deleting the container removes its whole
 *      remaining subtree.
 *
 * So the shape-level dispatch is a *phased sweep* instead: each kind
 * declares how it reduces itself and which phase it runs in, and
 * `detachSweep.ts` runs the phases in the one global order the invariants
 * allow — `leaf` kinds first, `container` kinds after. A composite never
 * enumerates child kinds. bbox-ui's two kinds today (`bbox-port`,
 * `bbox-block`) are both leaves — a Block's ports are props, not child
 * shapes, so the port/block hierarchy lives in the primitive builders
 * (`blockPrimitives.ts` invokes `portPrimitives.ts` per port) — but the
 * sweep is where a region or edge kind will slot in without teaching any
 * existing kind about it.
 */
import type { Editor, TLShape, TLShapeId } from "tldraw";

/**
 * When a node kind lowers. `leaf` kinds run while every other participant
 * still stands; `container` kinds host children, so they reduce last —
 * after contents lowered or escaped.
 */
export type DetachNodePhase = "leaf" | "container";

export interface LoweredNode {
  /**
   * What the selection should hold afterwards — the replacement group, or
   * the single primitive when tldraw refused a one-child group.
   */
  selectionId: TLShapeId | null;
  /** Top-level replacement records, nested primitives not repeated. */
  rootIds: readonly TLShapeId[];
}

export interface DetachableKind {
  /** Diagnostic name; also the dedup key for registration sanity checks. */
  readonly kind: string;
  readonly nodePhase: DetachNodePhase;
  /**
   * Whether the generic planner walks this shape's children looking for
   * more participants. Groups and frames are walked by default; a kind
   * whose children are projection rather than authored work says no.
   */
  readonly discoversChildren?: boolean;

  matches(shape: TLShape): boolean;
  /** Replace the shape with grouped stock primitives. */
  lowerNode(editor: Editor, shape: TLShape): LoweredNode | null;
}

/** The kind that matches a shape, or null. */
export function matchDetachableKind(
  kinds: readonly DetachableKind[],
  shape: TLShape,
): DetachableKind | null {
  return kinds.find((kind) => kind.matches(shape)) ?? null;
}
