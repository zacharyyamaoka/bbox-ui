// src/shapes/wire/createWire.ts — the ONE constructor for a data line.
//
// A wire shape plus its two bindings, created inside ONE `editor.run`. That
// single transaction is load-bearing twice over:
//   - undo: Ctrl+Z removes the whole cable, not a shape with two orphan
//     bindings behind it;
//   - the edit-event seam: `src/document/editEvents.ts` derives one batch per
//     store transaction, so a wire and its bindings arriving together become
//     exactly ONE `wire.added` with both ends resolved — which is what
//     `src/document/editEvents.test.ts` asserts and what stream 3 (pyblocks)
//     will read.
//
// There is no `variant: "control"` and there never will be: control flow is
// containment and arms, never a cable (plan §2).
import { createBindingId, createShapeId, type Editor, type TLShapeId } from "tldraw";

import type { WireEnd } from "../../document/editEvents";
import { WIRE_BINDING_TYPE, WIRE_SHAPE_TYPE } from "../types";
import type { WireBinding } from "./WireBindingUtil";
import type { WireShape } from "./WireShapeUtil";

export interface CreateWireOptions {
  from: WireEnd;
  to: WireEnd;
  variant?: "data" | "async" | "delayed";
}

/**
 * Wire `from` to `to`, or `null` if either end refuses the binding.
 *
 * The refusal is asked of the ENGINE (`editor.canBindShapes`), which routes
 * to each target's own `ShapeUtil.canBind` — the same wall
 * `documentModel.test.ts` interrogates directly (`ss-block` yes, `ss-port`
 * yes, `ss-region` no, `ss-code` no). Asking the engine rather than listing
 * the bindable types here is what keeps "never mix data and control lines"
 * a property of the shape kinds instead of a list this file could forget to
 * update when L5 lands.
 *
 * This is deliberately NOT where the graph rules live. Whether a connection
 * is sensible — self-connection, fan-in, type mismatch — is
 * `@trunk/scene/edgeValidation.ts`'s `validateConnection`, asked by the
 * gesture before it ever calls this (`wireGesture.ts`). One gate, at the
 * gesture; this function is the constructor behind it.
 */
export function createWire(editor: Editor, options: CreateWireOptions): TLShapeId | null {
  const fromShape = editor.getShape(options.from.nodeId as TLShapeId);
  const toShape = editor.getShape(options.to.nodeId as TLShapeId);
  if (!fromShape || !toShape) return null;
  const bindable = (target: typeof fromShape) =>
    editor.canBindShapes({ fromShape: { type: WIRE_SHAPE_TYPE }, toShape: target, binding: WIRE_BINDING_TYPE });
  if (!bindable(fromShape) || !bindable(toShape)) return null;

  const id = createShapeId();
  editor.run(() => {
    editor.createShape<WireShape>({
      id,
      type: WIRE_SHAPE_TYPE,
      // WHY the page is named explicitly rather than left to tldraw's
      // "parent under the point" default: a wire is never a member. An
      // expanded block already refuses one
      // (`BlockShapeUtil.canReceiveNewChildrenOfType`), but a cable created
      // over a frame would otherwise be re-based into that frame's
      // coordinates, and `WireFace`'s whole geometry rests on shape space
      // being page space.
      parentId: editor.getCurrentPageId(),
      x: 0,
      y: 0,
      ...(options.variant ? { props: { variant: options.variant } } : {}),
    });
    editor.createBindings<WireBinding>([
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: id, toId: fromShape.id, props: { terminal: "start", portId: options.from.portId } },
      { id: createBindingId(), type: WIRE_BINDING_TYPE, fromId: id, toId: toShape.id, props: { terminal: "end", portId: options.to.portId } },
    ]);
  });
  return id;
}
