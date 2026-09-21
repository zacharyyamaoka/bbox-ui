/**
 * src/hosts/detach/definitions/index.ts — the one place a new detachable scene-node
 * kind is registered. DONOR precedent: packages/adapter-tldraw/src/detach/
 * index.ts's own `DETACHABLE_KINDS` array + comment ("the registry is the one
 * place a new detachable kind is added; nothing else — not the sweep, not
 * any existing kind — learns about it").
 *
 * Only `block` is registered today. `glyph`, `code` and `value` node types
 * (`../../hosts/hostScene.ts`'s `HostNodeData`) have no `DetachableKind` yet
 * — real, scoped-out follow-up (see the lane report's "outstanding" table),
 * not an oversight: Zach's own instruction was to get fewer components
 * genuinely pixel-accurate rather than many roughly right.
 */
import type { DetachableKind } from "../detachableKind";
import { blockDetachableKind } from "./block";

export const DETACHABLE_KINDS: readonly DetachableKind[] = [blockDetachableKind];

export { blockDetachableKind } from "./block";
export { emitPortPrimitives, type PortPrimitives } from "./port";
